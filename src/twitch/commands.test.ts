import { describe, expect, it } from "vitest";
import { CommandCooldowns, parseCommand, sanitizeSay } from "./commands";

describe("chat command parsing", () => {
  it("accepts English and Arabic puppet and movement commands", () => {
    expect(parseCommand(" !CAMEL ")).toEqual({
      kind: "summon",
      puppet: "camel",
    });
    expect(parseCommand("!summon cat")).toEqual({
      kind: "summon",
      puppet: "cat",
    });
    expect(parseCommand("!جحا")).toEqual({ kind: "summon", puppet: "goha" });
    expect(parseCommand("!حرك يمين")).toEqual({
      kind: "move",
      direction: "right",
    });
    expect(parseCommand("!jump")).toEqual({ kind: "move", direction: "jump" });
    expect(parseCommand("!عفريت")).toEqual({ kind: "afreet" });
  });
  it("rejects ambiguous commands and invalid admin targets", () => {
    for (const input of [
      "camel",
      "!!cat",
      "!cat extra",
      "!jump extra",
      "!afreet now",
      "!summon dog",
      "!ban",
      "!ban user other",
      "!ban <script>",
      "!clear all",
    ]) {
      expect(parseCommand(input)).toBeNull();
    }
    expect(parseCommand("!pause")).toEqual({ kind: "admin", action: "pause" });
    expect(parseCommand("!khayal clear")).toEqual({
      kind: "admin",
      action: "clear",
    });
    expect(parseCommand("!khayal ban @Viewer_7")).toEqual({
      kind: "admin",
      action: "ban",
      target: "viewer_7",
    });
    expect(parseCommand("!admin ban @Viewer_7")).toEqual({
      kind: "admin",
      action: "ban",
      target: "viewer_7",
    });
    expect(parseCommand("!احظر user")).toEqual({
      kind: "admin",
      action: "ban",
      target: "user",
    });
  });
  it("rejects inherited object properties in every command alias lookup", () => {
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      for (const input of [
        `!${name}`,
        `!summon ${name}`,
        `!هات ${name}`,
        `!move ${name}`,
        `!حرك ${name}`,
        `!admin ${name}`,
        `!khayal ${name}`,
      ]) {
        expect(parseCommand(input), input).toBeNull();
      }
    }
  });
  it("preserves Arabic and removes links and direction controls", () => {
    expect(
      parseCommand(
        "!say أهلاً يا عالم https://evil.test/a www.test.com example.org/path \u202eمرحبا\u0000",
      ),
    ).toEqual({ kind: "say", text: "أهلاً يا عالم مرحبا" });
    expect(parseCommand("!say https://example.com")).toBeNull();
    expect(sanitizeSay("أهلا\u061c\u00ad mailto:someone@example.com")).toBe(
      "أهلا",
    );
    expect(sanitizeSay("a\nb\tc")).toBe("a b c");
  });
  it("limits text to 60 whole graphemes, preserving combining marks and emoji families", () => {
    expect(sanitizeSay("سَ".repeat(61))).toBe("سَ".repeat(60));
    expect(sanitizeSay("👨‍👩‍👧‍👦".repeat(61))).toBe("👨‍👩‍👧‍👦".repeat(60));
    expect(sanitizeSay("ا".repeat(59) + "🇪🇬" + "x")).toBe(
      "ا".repeat(59) + "🇪🇬",
    );
  });
});

describe("audience cooldowns", () => {
  it("shares movement cooldown across directions but separates users and command families", () => {
    let time = 1000;
    const cooldowns = new CommandCooldowns({}, () => time);
    expect(cooldowns.allow("a", { kind: "move", direction: "left" })).toBe(
      true,
    );
    expect(cooldowns.allow("a", { kind: "move", direction: "right" })).toBe(
      false,
    );
    expect(cooldowns.allow("b", { kind: "move", direction: "left" })).toBe(
      true,
    );
    expect(cooldowns.allow("a", { kind: "say", text: "مرحبا" })).toBe(true);
    time += 249;
    expect(cooldowns.allow("a", { kind: "move", direction: "up" })).toBe(false);
    time += 1;
    expect(cooldowns.allow("a", { kind: "move", direction: "jump" })).toBe(
      true,
    );
    expect(cooldowns.allow("a", { kind: "say", text: "again" })).toBe(false);
  });
  it("supports configuration, exact boundaries, and user clearing", () => {
    let time = 0;
    const cooldowns = new CommandCooldowns({ summon: 10 }, () => time);
    const command = { kind: "summon", puppet: "cat" } as const;
    expect(cooldowns.allow("a", command)).toBe(true);
    time = 9;
    expect(cooldowns.allow("a", command)).toBe(false);
    time = 10;
    expect(cooldowns.allow("a", command)).toBe(true);
    cooldowns.clear("a");
    expect(cooldowns.allow("a", command)).toBe(true);
    cooldowns.configure({ summon: 0 });
    expect(cooldowns.allow("a", command)).toBe(true);
  });
});
