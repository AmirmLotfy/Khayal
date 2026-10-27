/** Twitch browser-only integration. Never supply a client secret to this module. */
export const TWITCH_REDIRECT_URI = "http://localhost:5173/";
export const TWITCH_SCOPES = [
  "user:read:chat",
  "moderator:read:followers",
] as const;
const SOCKET_URL = "wss://eventsub.wss.twitch.tv/ws";
const STATE_KEY = "khayal:twitch:oauth-state";

export interface TwitchIdentity {
  broadcasterId: string;
  userId: string;
  login: string;
  scopes: string[];
}
export type TwitchStatusState =
  | "idle"
  | "authenticating"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error"
  | "revoked";
export interface TwitchStatus {
  state: TwitchStatusState;
  message: string;
}
export interface TwitchUserRaw {
  user_id: string;
  user_login: string;
  user_name: string;
  broadcaster_user_id: string;
}
export interface TwitchChatRaw {
  broadcaster_user_id: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: { text: string; fragments?: unknown[] };
  badges: { set_id: string; id: string; info: string }[];
  source_broadcaster_user_id?: string | null;
}
export interface TwitchDeleteRaw {
  broadcaster_user_id: string;
  target_user_id: string;
  message_id: string;
}
export interface TwitchUserClearRaw {
  broadcaster_user_id: string;
  target_user_id: string;
}
export interface TwitchRaidRaw {
  from_broadcaster_user_id: string;
  from_broadcaster_user_login: string;
  from_broadcaster_user_name: string;
  to_broadcaster_user_id: string;
  viewers: number;
}
interface EventEnvelope {
  notificationId: string;
  timestamp: string;
}
export type TwitchEvent = EventEnvelope &
  (
    | {
        kind: "chat";
        messageId: string;
        userId: string;
        login: string;
        displayName: string;
        text: string;
        isBroadcaster: boolean;
        isModerator: boolean;
        raw: TwitchChatRaw;
      }
    | {
        kind: "delete";
        messageId: string;
        userId: string;
        raw: TwitchDeleteRaw;
      }
    | { kind: "user-clear"; userId: string; raw: TwitchUserClearRaw }
    | { kind: "chat-clear"; raw: { broadcaster_user_id: string } }
    | {
        kind: "follow";
        userId: string;
        login: string;
        displayName: string;
        raw: TwitchUserRaw & { followed_at: string };
      }
    | {
        kind: "raid";
        userId: string;
        login: string;
        displayName: string;
        viewers: number;
        raw: TwitchRaidRaw;
      }
    | {
        kind: "revocation";
        subscriptionType: string;
        status: string;
        raw: Record<string, unknown>;
      }
  );
export interface TwitchClientOptions {
  clientId: string;
  onStatus: (status: TwitchStatus) => void;
  onEvent: (event: TwitchEvent) => void;
  onIdentity?: (identity: TwitchIdentity | null) => void;
}
interface SocketContext {
  socket: WebSocket;
  handover: boolean;
  welcomed: boolean;
  keepaliveMs: number;
  timer?: ReturnType<typeof setTimeout>;
}
interface WireMessage {
  metadata: {
    message_id: string;
    message_type: string;
    message_timestamp: string;
    subscription_type?: string;
  };
  payload: {
    session?: {
      id: string;
      keepalive_timeout_seconds: number | null;
      reconnect_url?: string | null;
    };
    subscription?: { type: string; status: string; [key: string]: unknown };
    event?: unknown;
  };
}
class AuthenticationError extends Error {}

export class TwitchClient {
  private token: string | null = null;
  private authenticated: TwitchIdentity | null = null;
  private active?: SocketContext;
  private candidate?: SocketContext;
  private readonly sockets = new Set<SocketContext>();
  private readonly requests = new Set<AbortController>();
  private readonly seen = new Map<string, number>();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private validationTimer?: ReturnType<typeof setInterval>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private disposed = false;
  private epoch = 0;
  private attempts = 0;
  private validating = false;
  private callbackError: string | null = null;

  constructor(private readonly options: TwitchClientOptions) {
    // Capture and erase the OAuth fragment before starting any network operation.
    this.consumeOAuthCallback();
  }
  get identity(): TwitchIdentity | null {
    return this.authenticated
      ? { ...this.authenticated, scopes: [...this.authenticated.scopes] }
      : null;
  }
  get hasToken(): boolean {
    return this.token !== null;
  }

  /** Call only from a user's Connect action. A public client ID is the only configuration. */
  authorize(): void {
    if (this.disposed) return;
    if (!this.options.clientId.trim()) {
      this.status("error", "Set VITE_TWITCH_CLIENT_ID before connecting.");
      return;
    }
    if (
      window.location.origin !== "http://localhost:5173" ||
      window.location.pathname !== "/"
    ) {
      this.status(
        "error",
        "Twitch connection requires http://localhost:5173/.",
      );
      return;
    }
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const state = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({ state, createdAt: Date.now() }),
      );
      const url = new URL("https://id.twitch.tv/oauth2/authorize");
      url.search = new URLSearchParams({
        client_id: this.options.clientId.trim(),
        redirect_uri: TWITCH_REDIRECT_URI,
        response_type: "token",
        scope: TWITCH_SCOPES.join(" "),
        state,
        force_verify: "true",
      }).toString();
      this.status("authenticating", "Opening Twitch authorization…");
      window.location.assign(url.href);
    } catch {
      this.status(
        "error",
        "This browser must allow session storage to verify Twitch authorization.",
      );
    }
  }

  /** Returns true when an OAuth response was present; the access token is never persisted. */
  consumeOAuthCallback(): boolean {
    if (typeof window === "undefined") return false;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (
      !fragment.has("access_token") &&
      !fragment.has("error") &&
      !query.has("error")
    )
      return false;
    const response =
      fragment.has("access_token") || fragment.has("error") ? fragment : query;
    const accessToken = response.get("access_token");
    const returnedState = response.get("state");
    // Remove both successful credentials and error callback parameters from browser history.
    const clean = new URL(window.location.href);
    clean.hash = "";
    for (const key of ["error", "error_description", "state"])
      clean.searchParams.delete(key);
    window.history.replaceState(null, "", clean.pathname + clean.search);
    try {
      const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "null") as {
        state?: string;
        createdAt?: number;
      } | null;
      sessionStorage.removeItem(STATE_KEY);
      if (
        !saved?.state ||
        saved.state !== returnedState ||
        typeof saved.createdAt !== "number" ||
        Date.now() - saved.createdAt > 600_000 ||
        Date.now() < saved.createdAt
      ) {
        throw new Error("state");
      }
      if (
        window.location.origin !== "http://localhost:5173" ||
        window.location.pathname !== "/"
      )
        throw new Error("origin");
      if (
        !accessToken ||
        response.get("token_type")?.toLowerCase() !== "bearer" ||
        response.has("error")
      ) {
        this.callbackError =
          "Twitch authorization was declined. Choose Connect to try again.";
      } else {
        this.token = accessToken;
        this.callbackError = null;
      }
    } catch {
      this.token = null;
      this.callbackError =
        "Twitch authorization could not be verified. Choose Connect to try again.";
    }
    return true;
  }

  /** Validate the broadcaster's identity, then open EventSub. No token means a local-only stage. */
  async connect(): Promise<TwitchIdentity | null> {
    if (this.disposed) return null;
    this.stopTransport();
    if (!this.token) {
      this.status(
        this.callbackError ? "error" : "disconnected",
        this.callbackError ?? "Twitch is disconnected.",
      );
      return null;
    }
    this.stopped = false;
    const epoch = this.epoch;
    this.status("connecting", "Validating Twitch identity…");
    try {
      await this.validate(epoch);
      if (!this.live(epoch)) return null;
      this.validationTimer = setInterval(() => {
        void this.validateHourly(epoch);
      }, 3_600_000);
      this.openSocket(SOCKET_URL, false, epoch);
      return this.identity;
    } catch (error) {
      if (this.live(epoch))
        this.fail(
          error instanceof AuthenticationError ? "revoked" : "error",
          error instanceof AuthenticationError
            ? error.message
            : "Twitch validation failed. Check your connection and reconnect.",
          true,
        );
      return null;
    }
  }

  /** Disconnect locally and forget the in-memory token. Reconnection requires authorization. */
  disconnect(): void {
    this.stopTransport();
    this.token = null;
    this.authenticated = null;
    this.options.onIdentity?.(null);
    this.status("disconnected", "Twitch is disconnected.");
  }
  dispose(): void {
    if (this.disposed) return;
    this.disconnect();
    this.disposed = true;
    this.seen.clear();
  }
  private live(epoch: number): boolean {
    return !this.stopped && !this.disposed && epoch === this.epoch;
  }
  private status(state: TwitchStatusState, message: string): void {
    this.options.onStatus({ state, message });
  }
  private stopTransport(): void {
    this.stopped = true;
    this.epoch++;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.validationTimer);
    clearTimeout(this.expiryTimer);
    this.reconnectTimer = undefined;
    this.validationTimer = undefined;
    this.expiryTimer = undefined;
    this.validating = false;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    for (const context of this.sockets) this.closeSocket(context);
    this.active = undefined;
    this.candidate = undefined;
    this.attempts = 0;
  }
  private fail(
    state: "error" | "revoked",
    message: string,
    forgetToken = false,
  ): void {
    this.stopTransport();
    if (forgetToken) this.token = null;
    this.authenticated = null;
    this.options.onIdentity?.(null);
    this.status(state, message);
  }
  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } finally {
      clearTimeout(timeout);
      this.requests.delete(controller);
    }
  }
  private async validate(epoch: number): Promise<void> {
    const response = await this.request(
      "https://id.twitch.tv/oauth2/validate",
      { headers: { Authorization: `OAuth ${this.token}` } },
    );
    if (!this.live(epoch)) return;
    if (response.status === 401)
      throw new AuthenticationError(
        "Twitch authorization expired or was revoked. Connect again.",
      );
    if (!response.ok) throw new Error("validation");
    const data = (await response.json()) as {
      client_id?: string;
      user_id?: string;
      login?: string;
      scopes?: string[];
      expires_in?: number;
    };
    if (!this.live(epoch)) return;
    if (
      data.client_id !== this.options.clientId.trim() ||
      !data.user_id ||
      !data.login ||
      !Array.isArray(data.scopes) ||
      !TWITCH_SCOPES.every((scope) => data.scopes!.includes(scope)) ||
      !data.expires_in ||
      data.expires_in <= 0 ||
      (this.authenticated && this.authenticated.userId !== data.user_id)
    ) {
      throw new AuthenticationError(
        "Twitch identity or required permissions did not match. Connect with the broadcaster account.",
      );
    }
    this.authenticated = {
      broadcasterId: data.user_id,
      userId: data.user_id,
      login: data.login,
      scopes: [...data.scopes],
    };
    this.options.onIdentity?.(this.identity);
    clearTimeout(this.expiryTimer);
    // Implicit tokens cannot be refreshed. End the session when this one expires.
    this.expiryTimer = setTimeout(
      () => {
        if (this.live(epoch))
          this.fail(
            "revoked",
            "Twitch authorization expired. Connect again.",
            true,
          );
      },
      Math.min(data.expires_in * 1000, 2_147_483_647),
    );
  }
  private async validateHourly(epoch: number): Promise<void> {
    if (!this.live(epoch) || this.validating) return;
    this.validating = true;
    try {
      await this.validate(epoch);
    } catch (error) {
      if (this.live(epoch))
        this.fail(
          error instanceof AuthenticationError ? "revoked" : "error",
          error instanceof AuthenticationError
            ? error.message
            : "Hourly Twitch validation failed. Reconnect to resume.",
          true,
        );
    } finally {
      if (epoch === this.epoch) this.validating = false;
    }
  }
  private closeSocket(context: SocketContext): void {
    clearTimeout(context.timer);
    context.socket.onmessage = null;
    context.socket.onclose = null;
    context.socket.onerror = null;
    if (context.socket.readyState < WebSocket.CLOSING)
      context.socket.close(1000, "Khayal connection closed");
    this.sockets.delete(context);
  }
  private watch(
    context: SocketContext,
    epoch: number,
    timeout = context.keepaliveMs,
  ): void {
    clearTimeout(context.timer);
    context.timer = setTimeout(() => {
      if (this.live(epoch))
        this.reconnectFresh(epoch, "Twitch keepalive timed out; reconnecting…");
    }, timeout);
  }
  private openSocket(url: string, handover: boolean, epoch: number): void {
    if (!this.live(epoch)) return;
    try {
      const context: SocketContext = {
        socket: new WebSocket(url),
        handover,
        welcomed: false,
        keepaliveMs: 15_000,
      };
      this.sockets.add(context);
      if (handover) this.candidate = context;
      else this.active = context;
      this.watch(context, epoch, 15_000);
      context.socket.onmessage = (event) => {
        if (
          !this.live(epoch) ||
          typeof event.data !== "string" ||
          event.data.length > 1_000_000
        )
          return;
        try {
          const message = JSON.parse(event.data) as WireMessage;
          if (!message.metadata?.message_id || !message.payload) return;
          this.handleMessage(context, message, epoch);
        } catch {
          /* Ignore malformed frames; the keepalive watchdog still runs. */
        }
      };
      context.socket.onerror = () => {
        /* onclose and the welcome watchdog own recovery. */
      };
      context.socket.onclose = () => {
        clearTimeout(context.timer);
        this.sockets.delete(context);
        if (!this.live(epoch)) return;
        // During Twitch's handover the old socket can close before the replacement welcomes.
        if (context === this.active && this.candidate) {
          this.active = undefined;
          return;
        }
        if (context !== this.active && context !== this.candidate) return;
        this.reconnectFresh(
          epoch,
          "Twitch connection interrupted; reconnecting…",
        );
      };
    } catch {
      this.reconnectFresh(epoch, "Twitch connection failed; reconnecting…");
    }
  }
  private reconnectFresh(epoch: number, message: string): void {
    if (!this.live(epoch) || this.reconnectTimer) return;
    for (const context of this.sockets) this.closeSocket(context);
    this.active = undefined;
    this.candidate = undefined;
    this.status("reconnecting", message);
    const delay = Math.min(1000 * 2 ** this.attempts++, 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket(SOCKET_URL, false, epoch);
    }, delay);
  }
  private handleMessage(
    context: SocketContext,
    message: WireMessage,
    epoch: number,
  ): void {
    const { metadata, payload } = message;
    const type = metadata.message_type;
    if (type === "session_welcome" && payload.session?.id) {
      if (context.welcomed) return;
      context.welcomed = true;
      context.keepaliveMs =
        Math.max(
          1000,
          (payload.session.keepalive_timeout_seconds ?? 10) * 1000,
        ) + 1000;
      this.watch(context, epoch);
      if (context.handover) {
        const previous = this.active;
        this.active = context;
        this.candidate = undefined;
        if (previous && previous !== context) this.closeSocket(previous);
        this.attempts = 0;
        this.status("connected", "Twitch connected.");
      } else {
        void this.subscribe(payload.session.id, context, epoch);
      }
      return;
    }
    if (!context.welcomed) return;
    if (
      (type === "session_keepalive" || type === "notification") &&
      !(this.candidate && context === this.active)
    )
      this.watch(context, epoch);
    if (
      type === "session_reconnect" &&
      payload.session?.reconnect_url &&
      context === this.active &&
      !this.candidate
    ) {
      const reconnectUrl = payload.session.reconnect_url;
      // Follow Twitch's exact URL, but refuse any non-Twitch WebSocket destination.
      try {
        const parsed = new URL(reconnectUrl);
        if (
          parsed.protocol !== "wss:" ||
          parsed.hostname !== "eventsub.wss.twitch.tv"
        )
          throw new Error("destination");
        clearTimeout(context.timer);
        this.status("reconnecting", "Twitch is moving the connection…");
        this.openSocket(reconnectUrl, true, epoch);
      } catch {
        this.reconnectFresh(
          epoch,
          "Twitch connection handover failed; reconnecting…",
        );
      }
      return;
    }
    if (type !== "notification" && type !== "revocation") return;
    const id = metadata.message_id;
    if (this.seen.has(id)) return;
    this.seen.set(id, Date.now());
    for (const [key, timestamp] of this.seen) {
      if (this.seen.size > 5000 || Date.now() - timestamp > 600_000)
        this.seen.delete(key);
      else break;
    }
    const envelope = {
      notificationId: id,
      timestamp: metadata.message_timestamp,
    };
    if (type === "revocation") {
      this.options.onEvent({
        ...envelope,
        kind: "revocation",
        subscriptionType: payload.subscription?.type ?? "",
        status: payload.subscription?.status ?? "unknown",
        raw: payload.subscription ?? {},
      });
      this.fail(
        "revoked",
        "Twitch revoked an event subscription. Connect again to restore permissions.",
        true,
      );
      return;
    }
    const raw = payload.event;
    if (!raw || typeof raw !== "object" || !this.authenticated) return;
    const event = raw as Record<string, unknown>;
    const broadcasterId = this.authenticated.broadcasterId;
    const subscriptionType =
      payload.subscription?.type ?? metadata.subscription_type;
    if (
      subscriptionType !== "channel.raid" &&
      event.broadcaster_user_id !== broadcasterId
    )
      return;
    switch (subscriptionType) {
      case "channel.chat.message": {
        const chat = raw as TwitchChatRaw;
        if (
          !chat.message_id ||
          !chat.chatter_user_id ||
          typeof chat.message?.text !== "string"
        )
          return;
        // Shared-chat viewers from another broadcaster do not control this stage.
        if (
          chat.source_broadcaster_user_id &&
          chat.source_broadcaster_user_id !== broadcasterId
        )
          return;
        this.options.onEvent({
          ...envelope,
          kind: "chat",
          messageId: chat.message_id,
          userId: chat.chatter_user_id,
          login: chat.chatter_user_login,
          displayName: chat.chatter_user_name,
          text: chat.message.text,
          isBroadcaster: chat.chatter_user_id === broadcasterId,
          isModerator:
            Array.isArray(chat.badges) &&
            chat.badges.some((badge) => badge.set_id === "moderator"),
          raw: chat,
        });
        break;
      }
      case "channel.chat.message_delete": {
        const deleted = raw as TwitchDeleteRaw;
        if (deleted.message_id && deleted.target_user_id)
          this.options.onEvent({
            ...envelope,
            kind: "delete",
            messageId: deleted.message_id,
            userId: deleted.target_user_id,
            raw: deleted,
          });
        break;
      }
      case "channel.chat.clear_user_messages": {
        const cleared = raw as TwitchUserClearRaw;
        if (cleared.target_user_id)
          this.options.onEvent({
            ...envelope,
            kind: "user-clear",
            userId: cleared.target_user_id,
            raw: cleared,
          });
        break;
      }
      case "channel.chat.clear":
        this.options.onEvent({
          ...envelope,
          kind: "chat-clear",
          raw: raw as { broadcaster_user_id: string },
        });
        break;
      case "channel.follow": {
        const follow = raw as TwitchUserRaw & { followed_at: string };
        if (follow.user_id)
          this.options.onEvent({
            ...envelope,
            kind: "follow",
            userId: follow.user_id,
            login: follow.user_login,
            displayName: follow.user_name,
            raw: follow,
          });
        break;
      }
      case "channel.raid": {
        const raid = raw as TwitchRaidRaw;
        if (
          raid.to_broadcaster_user_id === broadcasterId &&
          raid.from_broadcaster_user_id
        )
          this.options.onEvent({
            ...envelope,
            kind: "raid",
            userId: raid.from_broadcaster_user_id,
            login: raid.from_broadcaster_user_login,
            displayName: raid.from_broadcaster_user_name,
            viewers: Number.isFinite(raid.viewers)
              ? Math.max(0, raid.viewers)
              : 0,
            raw: raid,
          });
        break;
      }
    }
  }
  private async subscribe(
    sessionId: string,
    context: SocketContext,
    epoch: number,
  ): Promise<void> {
    const identity = this.authenticated;
    if (!identity) return;
    const broadcaster = { broadcaster_user_id: identity.broadcasterId };
    const chat = { ...broadcaster, user_id: identity.userId };
    const subscriptions = [
      { type: "channel.chat.message", version: "1", condition: chat },
      { type: "channel.chat.message_delete", version: "1", condition: chat },
      {
        type: "channel.chat.clear_user_messages",
        version: "1",
        condition: chat,
      },
      { type: "channel.chat.clear", version: "1", condition: chat },
      {
        type: "channel.follow",
        version: "2",
        condition: { ...broadcaster, moderator_user_id: identity.userId },
      },
      {
        type: "channel.raid",
        version: "1",
        condition: { to_broadcaster_user_id: identity.broadcasterId },
      },
    ];
    try {
      // All six subscriptions start immediately, within Twitch's welcome deadline.
      const results = await Promise.all(
        subscriptions.map((subscription) =>
          this.request("https://api.twitch.tv/helix/eventsub/subscriptions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.token}`,
              "Client-Id": this.options.clientId.trim(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...subscription,
              transport: { method: "websocket", session_id: sessionId },
            }),
          }),
        ),
      );
      if (!this.live(epoch) || this.active !== context) return;
      if (results.some((response) => response.status === 401))
        throw new AuthenticationError(
          "Twitch authorization expired or was revoked. Connect again.",
        );
      if (results.some((response) => !response.ok)) {
        this.fail(
          "error",
          "Twitch could not enable all chat and audience events. Check app permissions and connect again.",
        );
        return;
      }
      this.attempts = 0;
      this.status("connected", "Twitch connected.");
    } catch (error) {
      if (!this.live(epoch) || this.active !== context) return;
      if (error instanceof AuthenticationError)
        this.fail("revoked", error.message, true);
      else
        this.reconnectFresh(epoch, "Twitch event setup failed; reconnecting…");
    }
  }
}
