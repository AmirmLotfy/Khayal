import { parseCommand, CommandCooldowns } from "../twitch/commands";
export type Viewer = {
  id: string;
  name: string;
  login?: string;
  mod?: boolean;
};
export type Puppet = {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  born: number;
  activeAt: number;
  caption?: string;
  messageId?: string;
  captionUntil?: number;
  vy: number;
  target: number;
  targetX?: number;
  lastSwat?: number;
};
export type Ceremony = {
  kind: "follow" | "raid";
  name: string;
  count: number;
  until: number;
};
export class Director {
  source: "sim" | "live" = "sim";
  connection: "offline" | "connecting" | "connected" = "offline";
  raised = false;
  curtain = false;
  paused = false;
  captions = true;
  steady = false;
  camera = false;
  puppets: Puppet[] = [];
  queue: Puppet[] = [];
  afreets: Puppet[] = [];
  attackQueue: Puppet[] = [];
  cast = new Map<string, string>();
  blocked = new Set<string>();
  private blockedLogins = new Set<string>();
  private knownLogins = new Map<string, string>();
  phase: "free" | "countdown" | "hunt" | "result" = "free";
  remaining = 60;
  countdown = 3;
  lanterns = [true, true, true, true, true];
  result = "";
  swats = 0;
  ceremonies: Ceremony[] = [];
  ceremony: Ceremony | null = null;
  private suspendedCeremony: { ceremony: Ceremony; remaining: number } | null = null;
  private cooldown = new CommandCooldowns();
  private time = 0;
  private ordinaryTime = 0;
  input(v: Viewer, text: string, messageId = "") {
    const login = (v.login ?? v.name).toLowerCase();
    if (this.blocked.has(v.id) || this.blockedLogins.has(login)) return;
    this.knownLogins.set(login, v.id);
    const c = parseCommand(text);
    if (!c) return;
    if (c.kind === "admin") {
      if (!v.mod) return;
      if (c.action === "pause") this.paused = !this.paused;
      if (c.action === "clear") this.clear();
      if (c.action === "ban" && c.target) {
        const target = c.target.replace(/^@/, "").toLowerCase();
        this.blockedLogins.add(target);
        const known = this.knownLogins.get(target);
        if (known) {
          this.blocked.add(known);
          this.removeUser(known);
          this.cast.delete(known);
        }
      }
      return;
    }
    if (this.paused || !this.raised || !this.cooldown.allow(v.id, c)) return;
    this.cast.set(v.id, v.name);
    if (c.kind === "summon") {
      let p = [...this.puppets, ...this.queue].find((p) => p.id === v.id);
      if (p) {
        p.kind = c.puppet;
        p.activeAt = this.ordinaryTime;
        return;
      }
      p = this.make(v, c.puppet);
      if (this.puppets.length < 24) this.puppets.push(p);
      else if (this.queue.length < 300) this.queue.push(p);
    }
    const p = this.puppets.find((p) => p.id === v.id);
    if (c.kind === "say") {
      const speaker = p ?? this.queue.find((waiting) => waiting.id === v.id);
      if (speaker) {
        speaker.caption = c.text;
        speaker.messageId = messageId;
        // A waiting viewer receives the full visible lifetime on promotion.
        speaker.captionUntil = p ? this.ordinaryTime + 6 : undefined;
      }
    }
    if (c.kind === "move" && p) {
      p.activeAt = this.ordinaryTime;
      const d = c.direction;
      if (d === "left") p.targetX = Math.max(100, (p.targetX ?? p.x) - 75);
      if (d === "right") p.targetX = Math.min(1820, (p.targetX ?? p.x) + 75);
      if (d === "closer") p.z = Math.min(1, p.z + 0.2);
      if (d === "far") p.z = Math.max(0, p.z - 0.2);
      if (d === "jump" && p.y >= 845) p.vy = -450;
    }
    if (
      c.kind === "afreet" &&
      this.phase === "hunt" &&
      !this.afreets.concat(this.attackQueue).some((p) => p.id === v.id)
    ) {
      const a = this.make(v, "afreet");
      a.x = Math.random() < 0.5 ? -70 : 1990;
      a.y = 350 + Math.random() * 350;
      a.target = this.pickLantern();
      if (this.afreets.length < 24) this.afreets.push(a);
      else if (this.attackQueue.length < 300) this.attackQueue.push(a);
    }
    if (c.kind === "move" && (c.direction === "up" || c.direction === "down")) {
      const a = this.afreets.find((p) => p.id === v.id);
      if (a)
        a.y = Math.max(
          120,
          Math.min(850, a.y + (c.direction === "up" ? -100 : 100)),
        );
    }
  }
  private make(v: Viewer, kind: string): Puppet {
    return {
      id: v.id,
      name: v.name,
      kind,
      x: -140,
      targetX: 140 + Math.random() * 1640,
      y: 850,
      z: 0,
      born: this.ordinaryTime,
      activeAt: this.ordinaryTime,
      vy: 0,
      target: 0,
    };
  }
  private pickLantern() {
    const lit = this.lanterns.flatMap((on, i) => (on ? [i] : []));
    return lit[Math.floor(Math.random() * lit.length)] ?? 0;
  }
  tick(dt: number, swat?: (x: number, y: number, radius?: number) => boolean) {
    if (this.paused) return;
    this.time += dt;
    // Ordinary actors are parked for the entire countdown and Hunt. Only a
    // tick's overflow beyond the Hunt advances their visible time and physics.
    const parkedRemaining =
      this.phase === "countdown"
        ? Math.max(0, this.countdown) + this.remaining
        : this.phase === "hunt"
          ? this.remaining
          : 0;
    const ordinaryDt = Math.max(0, dt - parkedRemaining);
    this.ordinaryTime += ordinaryDt;
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = "hunt";
        dt = Math.max(0, -this.countdown);
      }
    }
    if (this.phase === "hunt") {
      const huntDt = Math.min(dt, this.remaining);
      this.remaining = Math.max(0, this.remaining - dt);
      const speed = Math.max(
        80,
        180 / Math.sqrt(Math.max(1, this.afreets.length / 5)),
      );
      this.afreets = this.afreets.filter((a) => {
        if (!this.lanterns[a.target]) a.target = this.pickLantern();
        if (swat?.(a.x, a.y - 100, 45)) {
          this.swats++;
          return false;
        }
        const tx = 270 + a.target * 345,
          ty = 255,
          dx = tx - a.x,
          dy = ty - a.y,
          d = Math.hypot(dx, dy);
        if (d < 35) {
          this.lanterns[a.target] = false;
          return false;
        }
        a.x += (dx / d) * speed * huntDt;
        a.y += (dy / d) * speed * huntDt;
        return true;
      });
      while (this.afreets.length < 24 && this.attackQueue.length)
        this.afreets.push(this.attackQueue.shift()!);
      if (this.remaining === 0) this.finishHunt();
    }
    if (ordinaryDt > 0) {
      for (const p of this.puppets) {
        p.x += ((p.targetX ?? p.x) - p.x) * Math.min(1, ordinaryDt * 6);
        if (
          this.raised &&
          this.phase !== "hunt" &&
          this.phase !== "countdown" &&
          this.ordinaryTime - (p.lastSwat ?? -10) > 0.6 &&
          swat?.(p.x, p.y - 90 * (1 + 2.2 * p.z), 35 * (1 + 2.2 * p.z))
        ) {
          p.vy = -320;
          p.lastSwat = this.ordinaryTime;
        }
        p.vy += 1000 * ordinaryDt;
        p.y = Math.min(850, p.y + p.vy * ordinaryDt);
        if (p.y === 850) p.vy = 0;
        if ((p.captionUntil ?? 0) <= this.ordinaryTime) p.caption = undefined;
      }
    }
    if (this.phase === "free" || this.phase === "result") {
      this.puppets = this.puppets.filter(
        (p) =>
          !(this.queue.length && this.ordinaryTime - p.born >= 30) &&
          this.ordinaryTime - p.activeAt < 90,
      );
      while (this.puppets.length < 24 && this.queue.length) {
        const p = this.queue.shift()!;
        p.born = this.ordinaryTime;
        p.activeAt = this.ordinaryTime;
        if (p.caption) p.captionUntil = this.ordinaryTime + 6;
        this.puppets.push(p);
      }
      if (this.ceremony && this.ceremony.until <= this.time)
        this.ceremony = null;
      if (!this.ceremony) {
        if (this.suspendedCeremony) {
          this.ceremony = this.suspendedCeremony.ceremony;
          this.ceremony.until = this.time + this.suspendedCeremony.remaining;
          this.suspendedCeremony = null;
        } else if (this.ceremonies.length) {
          this.ceremony = this.ceremonies.shift()!;
          this.ceremony.until = this.time + 9;
        }
      }
    }
  }
  hunt() {
    if (this.ceremony) {
      const remaining = this.ceremony.until - this.time;
      if (remaining > 0)
        this.suspendedCeremony = { ceremony: this.ceremony, remaining };
      this.ceremony = null;
    }
    this.raised = true;
    this.paused = false;
    this.phase = "countdown";
    this.countdown = 3;
    this.remaining = 60;
    this.swats = 0;
    this.lanterns.fill(true);
    this.afreets = [];
    this.attackQueue = [];
    this.result = "";
  }
  finishHunt() {
    this.phase = "result";
    const saved = this.lanterns.filter(Boolean).length;
    this.result =
      saved >= 3 ? "The keeper saved the light." : "Chat stole the light.";
    this.afreets = [];
    this.attackQueue = [];
  }
  event(kind: "follow" | "raid", name: string, count = 1) {
    if (this.ceremonies.length < 30)
      this.ceremonies.push({ kind, name, count, until: 0 });
  }
  clear() {
    this.puppets = [];
    this.queue = [];
    this.afreets = [];
    this.attackQueue = [];
    this.ceremonies = [];
    this.ceremony = null;
    this.suspendedCeremony = null;
    this.phase = "free";
  }
  removeUser(id: string) {
    for (const k of ["puppets", "queue", "afreets", "attackQueue"] as const)
      this[k] = this[k].filter((p) => p.id !== id);
  }
  deleteCaption(id: string) {
    for (const p of this.puppets.concat(this.queue))
      if (p.messageId === id) {
        p.caption = undefined;
        p.messageId = undefined;
        p.captionUntil = undefined;
      }
  }
  clearCaptions(id?: string) {
    for (const p of this.puppets.concat(this.queue))
      if (!id || p.id === id) {
        p.caption = undefined;
        p.messageId = undefined;
        p.captionUntil = undefined;
      }
  }
}
