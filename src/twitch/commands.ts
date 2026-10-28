export type PuppetKind = "camel" | "cat" | "goha" | "boat" | "croc";
export type MoveDirection =
  | "left"
  | "right"
  | "jump"
  | "closer"
  | "far"
  | "up"
  | "down";
export type Command =
  | { kind: "summon"; puppet: PuppetKind }
  | { kind: "move"; direction: MoveDirection }
  | { kind: "say"; text: string }
  | { kind: "afreet" }
  | { kind: "admin"; action: "pause" | "clear" | "ban"; target?: string };

const puppets: Record<string, PuppetKind> = {
  camel: "camel",
  cat: "cat",
  goha: "goha",
  boat: "boat",
  croc: "croc",
  جمل: "camel",
  قط: "cat",
  قطة: "cat",
  جحا: "goha",
  مركب: "boat",
  تمساح: "croc",
};
const directions: Record<string, MoveDirection> = {
  left: "left",
  right: "right",
  jump: "jump",
  closer: "closer",
  far: "far",
  up: "up",
  down: "down",
  يسار: "left",
  شمال: "left",
  يمين: "right",
  نط: "jump",
  اقفز: "jump",
  قرب: "closer",
  بعيد: "far",
  ابعد: "far",
  فوق: "up",
  تحت: "down",
};
const admins: Record<string, "pause" | "clear" | "ban"> = {
  pause: "pause",
  clear: "clear",
  ban: "ban",
  توقف: "pause",
  امسح: "clear",
  احظر: "ban",
};

function alias<T>(aliases: Record<string, T>, name: string): T | undefined {
  // Audience text must never resolve inherited Object properties as commands.
  return Object.hasOwn(aliases, name) ? aliases[name] : undefined;
}

/** Plain display text only. The UI must still insert it with textContent, never innerHTML. */
export function sanitizeSay(input: string): string {
  const clean = input
    .normalize("NFC")
    .replace(/[\t\n\r]/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, (control) =>
      control === "\u200c" || control === "\u200d" ? control : "",
    )
    .replace(
      /(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|www\.)\S+|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,63}(?:[\/?#]\S*)?/giu,
      "",
    )
    .replace(/\s+/gu, " ")
    .trim();
  const segmenter = new Intl.Segmenter("ar", { granularity: "grapheme" });
  return Array.from(segmenter.segment(clean), (part) => part.segment)
    .slice(0, 60)
    .join("")
    .trim();
}

/** Parsing grants no moderator authority. The caller must check Twitch user IDs/badges. */
export function parseCommand(input: string): Command | null {
  const match = /^!([^\s!]+)(?:\s+([\s\S]*))?$/u.exec(
    input.trim().normalize("NFC"),
  );
  if (!match) return null;
  const name = match[1]!.toLowerCase();
  const argument = (match[2] ?? "").trim();
  if (name === "say" || name === "قول") {
    const text = sanitizeSay(argument);
    return text ? { kind: "say", text } : null;
  }
  if (name === "summon" || name === "هات") {
    const puppet = alias(puppets, argument.toLowerCase());
    return puppet ? { kind: "summon", puppet } : null;
  }
  if (name === "move" || name === "حرك") {
    const direction = alias(directions, argument.toLowerCase());
    return direction ? { kind: "move", direction } : null;
  }
  const puppet = alias(puppets, name);
  if (puppet && !argument) return { kind: "summon", puppet };
  const direction = alias(directions, name);
  if (direction && !argument) return { kind: "move", direction };
  if ((name === "afreet" || name === "عفريت") && !argument)
    return { kind: "afreet" };
  const [adminName, ...rest] =
    name === "admin" || name === "khayal"
      ? argument.split(/\s+/u)
      : [name, argument];
  const action = alias(admins, adminName?.toLowerCase() ?? "");
  if (!action) return null;
  const target = rest.join(" ").trim();
  if (action !== "ban") return target ? null : { kind: "admin", action };
  if (!/^@?[a-zA-Z0-9_]{1,25}$/.test(target)) return null;
  return {
    kind: "admin",
    action,
    target: target.replace(/^@/, "").toLowerCase(),
  };
}

export interface CooldownConfig {
  movement: number;
  summon: number;
  say: number;
  afreet: number;
}
export const DEFAULT_COOLDOWNS: Readonly<CooldownConfig> = Object.freeze({
  movement: 250,
  summon: 3000,
  say: 8000,
  afreet: 5000,
});

/** Per-user, per-command-family cooldowns. Rejected commands do not extend their cooldown. */
export class CommandCooldowns {
  private readonly seen = new Map<string, number>();
  private config: CooldownConfig;
  constructor(
    config: Partial<CooldownConfig> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.config = { ...DEFAULT_COOLDOWNS };
    this.configure(config);
  }
  configure(config: Partial<CooldownConfig>): void {
    for (const key of Object.keys(
      DEFAULT_COOLDOWNS,
    ) as (keyof CooldownConfig)[]) {
      const value = config[key];
      if (value !== undefined && Number.isFinite(value) && value >= 0)
        this.config[key] = value;
    }
  }
  allow(userId: string, command: Command): boolean {
    if (command.kind === "admin") return true;
    const family = command.kind === "move" ? "movement" : command.kind;
    const key = `${userId}:${family}`;
    const time = this.now();
    const previous = this.seen.get(key);
    if (
      previous !== undefined &&
      time >= previous &&
      time - previous < this.config[family]
    )
      return false;
    this.seen.delete(key);
    this.seen.set(key, time);
    // A bounded stage must not retain an unbounded history of audience IDs.
    if (this.seen.size > 5000) this.seen.delete(this.seen.keys().next().value!);
    return true;
  }
  clear(userId?: string): void {
    if (!userId) this.seen.clear();
    else
      for (const key of this.seen.keys())
        if (key.startsWith(`${userId}:`)) this.seen.delete(key);
  }
}
