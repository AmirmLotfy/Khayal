import { test, expect } from "vitest";
import { Director } from "./director";
import { labels, stagePuppets } from "../stage/scene";
test("ordinary puppets respond to a fresh motion hit with a bounded bounce", () => {
  const d = new Director();
  d.raised = true;
  d.input({ id: "viewer", name: "Nour" }, "!cat");
  d.tick(0.016, () => false);
  expect(d.puppets[0].y).toBe(850);
  d.tick(0.016, () => true);
  expect(d.puppets[0].vy).toBeLessThan(0);
  const velocity = d.puppets[0].vy;
  d.tick(0.016, () => true);
  expect(d.puppets[0].vy).toBeGreaterThan(velocity);
});
test("stage bans match Twitch login even when display name is Arabic", () => {
  const d = new Director();
  d.raised = true;
  d.input({ id: "7", name: "سلمى", login: "salma" }, "!cat");
  d.input({ id: "mod", name: "Keeper", mod: true }, "!khayal ban @salma");
  expect(d.puppets).toHaveLength(0);
  d.input({ id: "7", name: "سلمى", login: "salma" }, "!camel");
  expect(d.puppets).toHaveLength(0);
  expect(d.cast.has("7")).toBe(false);
});
test("stage bans preserve another account whose display name matches the banned login", () => {
  const d = new Director();
  d.raised = true;
  d.input({ id: "target", name: "سلمى", login: "salma" }, "!cat");
  d.input({ id: "other", name: "salma", login: "another_account" }, "!camel");
  d.input({ id: "mod", name: "Keeper", login: "keeper", mod: true }, "!ban salma");
  expect(d.puppets.map((p) => p.id)).toEqual(["other"]);
  expect(d.blocked.has("other")).toBe(false);
  expect(d.cast.get("other")).toBe("salma");
  // The stable banned ID stays blocked even if its login changes.
  d.input({ id: "target", name: "New Name", login: "new_login" }, "!boat");
  expect(d.puppets.map((p) => p.id)).toEqual(["other"]);
});

function queuedCaption() {
  const d = new Director();
  d.raised = true;
  for (let i = 0; i < 24; i++)
    d.input({ id: `active-${i}`, name: `Active ${i}` }, "!cat");
  const viewer = { id: "waiting", name: "Waiting Viewer" };
  d.input(viewer, "!camel");
  d.input(viewer, "!say أهلاً", "queued-message");
  return d;
}
test("queued captions retain a full six visible seconds after FIFO promotion", () => {
  const d = queuedCaption();
  expect(d.queue[0].caption).toBe("أهلاً");
  d.tick(31);
  const promoted = d.puppets.find((p) => p.id === "waiting")!;
  expect(promoted.caption).toBe("أهلاً");
  expect(promoted.messageId).toBe("queued-message");
  expect(promoted.captionUntil).toBe(37);
  d.tick(5);
  expect(promoted.caption).toBe("أهلاً");
  d.tick(1);
  expect(promoted.caption).toBeUndefined();
});
test("moderation clears queued captions before promotion", () => {
  for (const moderate of [
    (d: Director) => d.deleteCaption("queued-message"),
    (d: Director) => d.clearCaptions("waiting"),
    (d: Director) => d.clearCaptions(),
  ]) {
    const d = queuedCaption();
    moderate(d);
    d.tick(31);
    const promoted = d.puppets.find((p) => p.id === "waiting")!;
    expect(promoted.caption).toBeUndefined();
    expect(promoted.messageId).toBeUndefined();
    expect(promoted.captionUntil).toBeUndefined();
  }
  const d = queuedCaption();
  d.removeUser("waiting");
  d.tick(31);
  expect(d.puppets.some((p) => p.id === "waiting")).toBe(false);
});
test("capacity is bounded, one puppet per viewer and queued turns rotate", () => {
  const d = new Director();
  d.raised = true;
  for (let i = 0; i < 30; i++)
    d.input({ id: String(i), name: "viewer" + i }, "!cat");
  expect(d.puppets).toHaveLength(24);
  expect(d.queue).toHaveLength(6);
  d.tick(31);
  expect(d.queue).toHaveLength(0);
  expect(d.puppets).toHaveLength(6);
});
test("parked puppets retain physics, caption time and the rest of their visible turn through Hunt", () => {
  const d = queuedCaption();
  d.tick(20);
  d.input({ id: "active-0", name: "Active 0" }, "!say Still here", "active-message");
  const actor = d.puppets[0];
  actor.y = 700;
  actor.vy = -200;
  const position = { x: actor.x, y: actor.y, vy: actor.vy };
  d.hunt();
  d.tick(3);
  expect(d.phase).toBe("hunt");
  expect(d.remaining).toBe(60);
  d.tick(60);
  expect(d.phase).toBe("result");
  expect({ x: actor.x, y: actor.y, vy: actor.vy }).toEqual(position);
  expect(actor.caption).toBe("Still here");
  expect(d.queue[0].caption).toBe("أهلاً");
  d.paused = true;
  d.tick(100);
  d.paused = false;
  d.tick(5);
  expect(actor.caption).toBe("Still here");
  expect(d.puppets).toContain(actor);
  d.tick(1);
  expect(actor.caption).toBeUndefined();
  d.tick(3);
  expect(d.puppets).toContain(actor);
  d.tick(1);
  expect(d.puppets).not.toContain(actor);
  const promoted = d.puppets.find((p) => p.id === "waiting")!;
  expect(promoted.caption).toBe("أهلاً");
  d.tick(6);
  expect(promoted.caption).toBeUndefined();
});
test("only the part of a tick beyond countdown and Hunt ages ordinary actors", () => {
  const d = queuedCaption();
  d.tick(20);
  d.hunt();
  d.tick(65); // Three seconds of countdown, sixty of Hunt, two visible seconds.
  expect(d.phase).toBe("result");
  expect(d.remaining).toBe(0);
  expect(d.queue).toHaveLength(1);
  d.tick(7);
  expect(d.queue).toHaveLength(1);
  d.tick(1);
  expect(d.queue).toHaveLength(0);
  expect(d.puppets[0].id).toBe("waiting");
  expect(d.puppets[0].caption).toBe("أهلاً");
});
test("unprivileged moderator commands are ignored", () => {
  const d = new Director();
  d.raised = true;
  d.input({ id: "1", name: "a" }, "!cat");
  d.input({ id: "2", name: "b" }, "!khayal clear");
  expect(d.puppets).toHaveLength(1);
  d.input({ id: "2", name: "b", mod: true }, "!khayal clear");
  expect(d.puppets).toHaveLength(0);
});
test("hunt clock freezes during pause and resolves majority", () => {
  const d = new Director();
  d.hunt();
  d.tick(3);
  d.paused = true;
  d.tick(50);
  expect(d.remaining).toBe(60);
  d.paused = false;
  d.lanterns = [true, true, false, false, false];
  d.tick(60);
  expect(d.phase).toBe("result");
  expect(d.result).toContain("Chat");
});
test("Hunt suspends an active ceremony and resumes its remaining time before queued events", () => {
  const d = new Director();
  d.raised = true;
  d.event("follow", "First");
  d.tick(0);
  d.tick(2);
  d.event("raid", "Second", 12);
  d.hunt();
  expect(d.ceremony).toBeNull();
  d.tick(3);
  expect(d.phase).toBe("hunt");
  expect(d.ceremony).toBeNull();
  d.tick(60);
  expect(d.phase).toBe("result");
  expect(d.ceremony?.name).toBe("First");
  d.tick(6);
  expect(d.ceremony?.name).toBe("First");
  d.tick(1);
  expect(d.ceremony?.name).toBe("Second");
});
test("suspended ceremony storage stays bounded and clear discards it", () => {
  const d = new Director();
  d.event("follow", "First");
  d.tick(0);
  d.hunt();
  d.hunt();
  for (let i = 0; i < 100; i++) d.event("follow", String(i));
  expect(d.ceremonies).toHaveLength(30);
  d.clear();
  d.tick(0);
  expect(d.ceremonies).toHaveLength(0);
  expect(d.ceremony).toBeNull();
});
test("stage geometry suppresses ceremony labels and actors throughout countdown and Hunt", () => {
  const d = new Director();
  d.hunt();
  // Defend rendering even if a fixture or stale state contains an active ceremony.
  d.ceremony = { kind: "raid", name: "Caravan", count: 12, until: 100 };
  for (const phase of ["countdown", "hunt"] as const) {
    d.phase = phase;
    expect(labels(d, 0).some((label) => label.id === "ceremony")).toBe(false);
    expect(stagePuppets(d, 0)).toHaveLength(0);
  }
});
