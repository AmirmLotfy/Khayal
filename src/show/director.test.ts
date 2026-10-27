import { test, expect } from "vitest";
import { Director } from "./director";
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
