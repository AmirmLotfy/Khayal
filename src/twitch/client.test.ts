import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwitchClient, TWITCH_SCOPES, scrubOAuthCallbackUrl, type TwitchChatRaw } from "./client";

const STATE_KEY = "khayal:twitch:oauth-state";
const ROOT = "http://localhost:5173/";
const TEST_TOKEN = "synthetic-test-token";

class MockSocket {
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockSocket[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockSocket.CLOSED;
  });
  constructor(readonly url: string) {
    MockSocket.instances.push(this);
  }
  receive(type: string, id: string, payload: object): void {
    this.onmessage?.({
      data: JSON.stringify({
        metadata: {
          message_type: type,
          message_id: id,
          message_timestamp: "2026-10-27T12:00:00Z",
        },
        payload,
      }),
    });
  }
  welcome(id = "session-1"): void {
    this.receive("session_welcome", `welcome-${id}`, {
      session: { id, keepalive_timeout_seconds: 10, reconnect_url: null },
    });
  }
  notification(id: string, event: object, type = "channel.chat.message"): void {
    this.receive("notification", id, {
      subscription: { type, status: "enabled" },
      event,
    });
  }
  loseConnection(): void {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.();
  }
}

let location: URL & { assign: ReturnType<typeof vi.fn> };
let stored: Map<string, string>;
let replaceState: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof makeFetch>;
let clients: TwitchClient[];

function makeFetch() {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    if (String(input).endsWith("/validate"))
      return new Response(
        JSON.stringify({
          client_id: "public-client-id",
          user_id: "broadcaster-1",
          login: "theater",
          scopes: [...TWITCH_SCOPES],
          expires_in: 7200,
        }),
        { status: 200 },
      );
    return new Response(null, { status: 202 });
  });
}
function callback(
  state = "expected-state",
  savedState = "expected-state",
  createdAt = Date.now(),
): void {
  stored.set(STATE_KEY, JSON.stringify({ state: savedState, createdAt }));
  location.href = `${ROOT}?stage=main#access_token=${TEST_TOKEN}&token_type=bearer&state=${state}`;
}
function makeClient() {
  const onEvent = vi.fn();
  const onStatus = vi.fn();
  const onIdentity = vi.fn();
  const client = new TwitchClient({
    clientId: "public-client-id",
    onEvent,
    onStatus,
    onIdentity,
  });
  clients.push(client);
  return { client, onEvent, onStatus, onIdentity };
}
function chat(overrides: Partial<TwitchChatRaw> = {}): TwitchChatRaw {
  return {
    broadcaster_user_id: "broadcaster-1",
    chatter_user_id: "viewer-1",
    chatter_user_login: "viewer",
    chatter_user_name: "Viewer",
    message_id: "chat-1",
    message: { text: "!camel" },
    badges: [],
    ...overrides,
  };
}
async function connected() {
  callback();
  const harness = makeClient();
  await harness.client.connect();
  const socket = MockSocket.instances[0]!;
  socket.welcome();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(7); // Identity validation plus six event subscriptions.
  expect(harness.onStatus).toHaveBeenLastCalledWith({
    state: "connected",
    message: "Twitch connected.",
  });
  return { ...harness, socket };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  clients = [];
  stored = new Map();
  MockSocket.instances = [];
  location = Object.assign(new URL(ROOT), { assign: vi.fn() });
  replaceState = vi.fn((_state: unknown, _title: string, relative: string) => {
    location.href = new URL(relative, location.href).href;
  });
  vi.stubGlobal("window", { location, history: { replaceState } });
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
    removeItem: (key: string) => {
      stored.delete(key);
    },
  });
  vi.stubGlobal("WebSocket", MockSocket);
  fetchMock = makeFetch();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const client of clients) client.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Twitch OAuth callback", () => {
  it.each([
    `#access_token=${TEST_TOKEN}&token_type=bearer&state=expected-state`,
    "#error=access_denied&error_description=declined&state=expected-state",
    "&error=access_denied&error_description=declined&state=expected-state",
    `&access_token=${TEST_TOKEN}&token_type=bearer&expires_in=7200&scope=user%3Aread%3Achat&state=expected-state`,
  ])("scrubs a duplicate-owner callback URL without consuming pending state: case %#", (response) => {
    callback();
    const saved = stored.get(STATE_KEY);
    location.href = `${ROOT}?stage=main&show=show-a${response}`;
    expect(scrubOAuthCallbackUrl()).toBe(true);
    expect(location.href).toBe(`${ROOT}?stage=main&show=show-a`);
    expect(stored.get(STATE_KEY)).toBe(saved);
    expect(stored.size).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(MockSocket.instances).toHaveLength(0);
    expect(clients).toHaveLength(0);
  });
  it("preserves an ordinary show URL and its pending state", () => {
    callback();
    const saved = stored.get(STATE_KEY);
    location.href = `${ROOT}?show=show-a#ordinary-stage-anchor`;
    expect(scrubOAuthCallbackUrl()).toBe(false);
    expect(location.href).toBe(`${ROOT}?show=show-a#ordinary-stage-anchor`);
    expect(stored.get(STATE_KEY)).toBe(saved);
    expect(replaceState).not.toHaveBeenCalled();
  });
  it("scrubs the fragment synchronously before fetching and keeps the token out of session storage", async () => {
    callback();
    const { client } = makeClient();
    expect(location.href).toBe(`${ROOT}?stage=main`);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?stage=main");
    expect(stored.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.hasToken).toBe(true);
    expect(await client.connect()).toMatchObject({
      broadcasterId: "broadcaster-1",
      userId: "broadcaster-1",
      login: "theater",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: `OAuth ${TEST_TOKEN}`,
    });
    client.disconnect();
    expect(client.hasToken).toBe(false);
    expect(client.identity).toBeNull();
  });
  it.each(["wrong-state", "missing-state", "expired-state", "future-state"])(
    "rejects %s without sending the token",
    async (scenario) => {
      callback(scenario === "wrong-state" ? "different" : "expected-state");
      if (scenario === "missing-state") stored.clear();
      if (scenario === "expired-state")
        stored.set(
          STATE_KEY,
          JSON.stringify({
            state: "expected-state",
            createdAt: Date.now() - 600_001,
          }),
        );
      if (scenario === "future-state")
        stored.set(
          STATE_KEY,
          JSON.stringify({
            state: "expected-state",
            createdAt: Date.now() + 1,
          }),
        );
      const { client, onStatus } = makeClient();
      expect(location.hash).toBe("");
      expect(client.hasToken).toBe(false);
      expect(await client.connect()).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stored.has(STATE_KEY)).toBe(false);
      expect(onStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: "error" }),
      );
    },
  );
  it("clears a declined authorization query while preserving unrelated stage parameters", async () => {
    stored.set(
      STATE_KEY,
      JSON.stringify({ state: "expected-state", createdAt: Date.now() }),
    );
    location.href = `${ROOT}?stage=main&error=access_denied&error_description=declined&state=expected-state`;
    const { client, onStatus } = makeClient();
    await client.connect();
    expect(location.href).toBe(`${ROOT}?stage=main`);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "error",
        message: expect.stringContaining("declined"),
      }),
    );
  });
});

describe("Twitch EventSub lifecycle", () => {
  it("delivers a duplicated notification once and rejects other-channel and shared-chat control", async () => {
    const { socket, onEvent } = await connected();
    socket.notification("notification-1", chat());
    socket.notification("notification-1", chat());
    socket.notification(
      "foreign-1",
      chat({ broadcaster_user_id: "other-channel" }),
    );
    socket.notification(
      "shared-1",
      chat({ source_broadcaster_user_id: "other-channel" }),
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "chat",
        notificationId: "notification-1",
        messageId: "chat-1",
        userId: "viewer-1",
        text: "!camel",
        isModerator: false,
        isBroadcaster: false,
      }),
    );
    socket.notification(
      "own-source",
      chat({
        source_broadcaster_user_id: "broadcaster-1",
        chatter_user_id: "broadcaster-1",
      }),
    );
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ isBroadcaster: true }),
    );
  });
  it("derives moderator authority from IDs and moderator badges, never display names or VIP badges", async () => {
    const { socket, onEvent } = await connected();
    socket.notification(
      "name-spoof",
      chat({
        chatter_user_login: "theater",
        chatter_user_name: "theater",
        badges: [{ set_id: "vip", id: "1", info: "" }],
      }),
    );
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ isBroadcaster: false, isModerator: false }),
    );
    socket.notification(
      "moderator",
      chat({ badges: [{ set_id: "moderator", id: "1", info: "" }] }),
    );
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ isBroadcaster: false, isModerator: true }),
    );
    socket.notification(
      "broadcaster",
      chat({ chatter_user_id: "broadcaster-1", chatter_user_name: "Other Name" }),
    );
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ isBroadcaster: true, isModerator: false }),
    );
  });
  it("normalizes channel-scoped moderation deletions and ignores another channel", async () => {
    const { socket, onEvent } = await connected();
    for (const broadcaster_user_id of ["other-channel", "broadcaster-1"]) {
      socket.notification(
        `delete-${broadcaster_user_id}`,
        { broadcaster_user_id, target_user_id: "viewer-1", message_id: "chat-1" },
        "channel.chat.message_delete",
      );
      socket.notification(
        `clear-user-${broadcaster_user_id}`,
        { broadcaster_user_id, target_user_id: "viewer-1" },
        "channel.chat.clear_user_messages",
      );
      socket.notification(
        `clear-chat-${broadcaster_user_id}`,
        { broadcaster_user_id },
        "channel.chat.clear",
      );
    }
    expect(onEvent.mock.calls.map(([event]) => event.kind)).toEqual([
      "delete",
      "user-clear",
      "chat-clear",
    ]);
    expect(onEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ messageId: "chat-1", userId: "viewer-1" }),
    );
    expect(onEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId: "viewer-1" }),
    );
  });
  it("preserves subscriptions through Twitch handover and closes the old socket only after welcome", async () => {
    const { socket, onEvent, onStatus } = await connected();
    const reconnectUrl =
      "wss://eventsub.wss.twitch.tv/ws?reconnect=opaque-session";
    socket.receive("session_reconnect", "reconnect-1", {
      session: {
        id: "session-1",
        keepalive_timeout_seconds: null,
        reconnect_url: reconnectUrl,
      },
    });
    const replacement = MockSocket.instances[1]!;
    expect(replacement.url).toBe(reconnectUrl);
    expect(socket.close).not.toHaveBeenCalled();
    socket.notification("during-handover", chat());
    replacement.welcome("session-2");
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    replacement.notification("during-handover", chat());
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith({
      state: "connected",
      message: "Twitch connected.",
    });
  });
  it("creates fresh subscriptions after an ordinary connection loss", async () => {
    const { socket } = await connected();
    socket.loseConnection();
    await vi.advanceTimersByTimeAsync(1000);
    const replacement = MockSocket.instances[1]!;
    expect(replacement.url).toBe("wss://eventsub.wss.twitch.tv/ws");
    replacement.welcome("fresh-session");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(13);
    const request = fetchMock.mock.calls[7]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      transport: { method: "websocket", session_id: "fresh-session" },
    });
  });
  it("tears down authorization on revocation and leaves no reconnect timer after disposal", async () => {
    const { client, socket, onEvent, onStatus } = await connected();
    socket.receive("revocation", "revoked-1", {
      subscription: {
        type: "channel.chat.message",
        status: "authorization_revoked",
      },
    });
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "revocation",
        status: "authorization_revoked",
      }),
    );
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "revoked" }),
    );
    expect(client.hasToken).toBe(false);
    expect(client.identity).toBeNull();
    expect(socket.close).toHaveBeenCalledTimes(1);
    client.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
