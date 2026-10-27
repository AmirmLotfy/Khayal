import { loadCast, createCastFigure } from "./assets";
import { Application, Container, Graphics, Text, BlurFilter } from "pixi.js";
import { Director, Puppet } from "../show/director";
import { palette as p } from "./palette";
export async function createStage(host: HTMLElement, d: Director) {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load("24px Readex Pro"),
    document.fonts.load("82px Aref Ruqaa"),
    document.fonts.load("44px Young Serif"),
    document.fonts.load("16px IBM Plex Mono"),
  ]);
  const cast = await loadCast();
  const app = new Application();
  await app.init({
    autoStart: false,
    width: 1920,
    height: 1080,
    resolution: 1,
    antialias: true,
    background: p.linen,
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  const bg = new Graphics();
  app.stage.addChild(bg);
  bg.rect(0, 0, 1920, 1080).fill(p.linen);
  for (let i = 0; i < 32; i++) {
    const a = (32 - i) / 32;
    bg.rect(i * 6, i * 3, 1920 - i * 12, 1080 - i * 6).stroke({
      color: p.linenEdge,
      alpha: 0.028,
      width: 12,
    });
  }
  for (let i = 0; i < 1400; i++) {
    const x = (i * 137.51) % 1920,
      y = (i * 53.19) % 1080;
    bg.moveTo(x, y)
      .lineTo(x + 6, y + 1)
      .stroke({ color: p.linenEdge, alpha: 0.07, width: 1 });
  }
  bg.rect(0, 0, 1920, 42).fill(p.madder);
  bg.rect(0, 1038, 1920, 42).fill(p.madder);
  for (let x = 0; x < 1920; x += 65) {
    bg.poly([x, 21, x + 32, 0, x + 64, 21, x + 32, 42]).fill(p.linenEdge);
    bg.poly([x, 1059, x + 32, 1038, x + 64, 1059, x + 32, 1080]).fill(
      p.linenEdge,
    );
  }
  const actors = new Container();
  app.stage.addChild(actors);
  const overlay = new Container();
  app.stage.addChild(overlay);
  function label(
    text: string,
    x: number,
    y: number,
    size = 24,
    color = p.soot,
  ) {
    const t = new Text({
      text,
      style: {
        fontFamily: "Readex Pro, sans-serif",
        fontSize: size,
        fill: color,
        align: "center",
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    overlay.addChild(t);
    return t;
  }
  const title = label("خيال", 1640, 145, 82);
  title.style.fontFamily = "Aref Ruqaa, Georgia";
  label("THE SHADOW THEATRE", 1640, 202, 16);
  const card = label("", 350, 984, 22);
  const status = label("", 960, 145, 30);
  const result = label("", 960, 440, 44);
  result.style.fontFamily = "Young Serif, Georgia";
  const ceremony = label("", 960, 720, 30);
  const mode = label("REHEARSAL", 160, 100, 18, p.madder);
  const lanterns = new Graphics();
  overlay.addChild(lanterns);
  const nodes = new Map<string, Container>();
  let elapsed = 0;
  let frames: number[] = [];
  let last = performance.now();
  function puppet(a: Puppet, t: number) {
    const key = JSON.stringify([
      a.id,
      a.kind,
      a.z,
      a.name,
      d.captions ? a.caption : null,
    ]);
    const cached = nodes.get(key);
    if (cached) {
      cached.visible = true;
      cached.position.set(a.x, a.y);
      cached.rotation = Math.sin(t * 2 + a.born) * 0.035;
      return;
    }
    const c = new Container();
    nodes.set(key, c);
    c.position.set(a.x, a.y);
    c.scale.set(1 + 2.2 * a.z);
    c.rotation = Math.sin(t * 2 + a.born) * 0.035;
    const g = new Graphics();
    g.moveTo(0, 10)
      .lineTo(0, 220)
      .stroke({ color: p.soot, width: 3, alpha: 0.6 });
    const k = a.kind;
    const authored = cast.get(k);
    if (authored) {
      const art = createCastFigure(authored);
      if (a.z > 0)
        art.filters = [new BlurFilter({ strength: a.z * 14, quality: 2 })];
      c.addChild(art);
    } else if (k === "boat") {
      g.poly([-95, -15, 95, -15, 65, 12, -65, 12]).fill(p.soot);
      g.poly([-4, -25, -4, -170, 85, -25]).fill(p.soot);
      g.moveTo(-10, 0).lineTo(-10, -180).stroke({ color: p.soot, width: 5 });
    } else if (k === "afreet") {
      g.poly([
        -42, 10, -25, -70, -42, -100, -12, -92, 0, -112, 12, -92, 42, -100, 25,
        -70, 42, 10, 20, -3, 0, 22, -20, -3,
      ]).fill(p.soot);
      g.circle(-10, -65, 5).circle(10, -65, 5).fill(p.linen);
    } else {
      g.ellipse(0, -45, k === "croc" ? 95 : 58, k === "croc" ? 22 : 35).fill(
        p.soot,
      );
      for (const x of [-40, -16, 20, 40]) g.rect(x, -25, 8, 50).fill(p.soot);
      if (k === "camel") {
        g.ellipse(-8, -78, 30, 30).fill(p.soot);
        g.poly([
          35, -50, 48, -135, 62, -150, 82, -146, 85, -130, 65, -125, 60, -40,
        ]).fill(p.soot);
      } else if (k === "cat") {
        g.circle(43, -88, 26).fill(p.soot);
        g.poly([
          20, -100, 23, -132, 40, -111, 55, -113, 65, -135, 68, -95,
        ]).fill(p.soot);
        g.moveTo(-50, -45)
          .bezierCurveTo(-110, -110, -80, -128, -75, -70)
          .stroke({ color: p.soot, width: 12 });
      } else if (k === "croc") {
        g.poly([55, -65, 135, -55, 60, -27]).fill(p.soot);
        g.poly([-75, -50, -155, -65, -80, -25]).fill(p.soot);
        for (let x = -70; x < 55; x += 16)
          g.poly([x, -60, x + 8, -80, x + 16, -60]).fill(p.soot);
      } else {
        g.poly([
          35, -50, 40, -100, 50, -125, 55, -102, 66, -125, 72, -85, 62, -30,
        ]).fill(p.soot);
        if (k === "goha" || k === "mesaharati") {
          g.circle(0, -145, 20).fill(p.soot);
          g.poly([-20, -124, 20, -124, 27, -65, -25, -65]).fill(p.soot);
          g.moveTo(-12, -82)
            .lineTo(-45, -43)
            .moveTo(12, -82)
            .lineTo(42, -40)
            .stroke({ color: p.soot, width: 9 });
        }
      }
      for (let x = -30; x <= 24; x += 18) g.circle(x, -45, 3).fill(p.linen);
    }
    c.addChild(g);
    if (a.z > 0)
      g.filters = [new BlurFilter({ strength: a.z * 14, quality: 2 })];
    const tag = new Graphics().rect(-68, 52, 136, 28).fill(p.linenEdge);
    c.addChild(tag);
    const name = new Text({
      text: a.name,
      style: {
        fontFamily: "Readex Pro, sans-serif",
        fontSize: 14,
        fill: p.soot,
      },
    });
    name.anchor.set(0.5);
    name.position.set(0, 66);
    name.scale.set(Math.min(1, 125 / Math.max(1, name.width)));
    c.addChild(name);
    if (a.caption && d.captions) {
      const text = new Text({
        text: a.caption,
        style: {
          fontFamily: "Readex Pro, sans-serif",
          fontSize: 19,
          fill: p.soot,
          wordWrap: true,
          wordWrapWidth: 250,
          align: "center",
        },
      });
      text.anchor.set(0.5, 1);
      text.position.set(0, -190);
      c.addChild(text);
    }
    actors.addChild(c);
  }
  function render() {
    const now = performance.now(),
      dt = Math.min(0.05, (now - last) / 1000);
    frames.push(now - last);
    if (frames.length > 600) frames.shift();
    last = now;
    elapsed += dt;
    for (const c of nodes.values()) c.visible = false;
    bg.alpha = d.raised ? 1 : 0.28;
    if (d.raised && !d.steady) bg.alpha = 0.98 + Math.sin(elapsed * 0.6) * 0.02;
    const hunt = d.phase === "hunt" || d.phase === "countdown";
    for (const a of hunt ? d.afreets : d.puppets) puppet(a, elapsed);
    mode.text = d.source === "sim" ? "REHEARSAL" : "LIVE THEATRE";
    card.text = [
      "!camel  ·  !cat  ·  !goha",
      "!left  ·  !right  ·  !jump",
      "!closer  ·  !far  ·  !say hello",
    ][Math.floor(elapsed / 30) % 3];
    status.text = d.paused
      ? "The show is paused"
      : d.phase === "countdown"
        ? `Guard the lanterns · ${Math.ceil(d.countdown)}`
        : d.phase === "hunt"
          ? `${Math.ceil(d.remaining)} seconds of light`
          : "";
    result.text = d.curtain
      ? "Come back tomorrow. There is more to see."
      : d.phase === "result"
        ? d.result
        : !d.raised
          ? "Raise the lamp. The company is waiting."
          : "";
    ceremony.text = d.curtain
      ? [...d.cast.values()].slice(0, 12).join(" · ") +
        (d.cast.size > 12
          ? ` · and ${d.cast.size - 12} more in the playbill`
          : "")
      : d.ceremony
        ? d.ceremony.kind === "follow"
          ? `The Mesaharati welcomes ${d.ceremony.name}`
          : `${d.ceremony.name} arrives · ${d.ceremony.count} in the caravan`
        : "";
    if (d.ceremony) {
      for (
        let i = 0;
        i <
        Math.min(
          8,
          d.ceremony.kind === "raid" ? Math.ceil(d.ceremony.count / 3) : 1,
        );
        i++
      )
        puppet(
          {
            id: "event-" + i,
            name: d.ceremony.name,
            kind: d.ceremony.kind === "raid" ? "camel" : "mesaharati",
            x: 150 + ((elapsed * 80 + i * 180) % 1600),
            y: 630,
            z: 0,
            born: i,
            activeAt: 0,
            vy: 0,
            target: 0,
          },
          elapsed,
        );
    }
    lanterns.clear();
    if (hunt || d.phase === "result")
      for (let i = 0; i < 5; i++) {
        const x = 270 + i * 345;
        lanterns
          .moveTo(x, 42)
          .lineTo(x, 210)
          .stroke({ color: p.soot, width: 3 });
        lanterns
          .poly([x - 28, 218, x, 196, x + 28, 218, x + 23, 275, x - 23, 275])
          .fill(d.lanterns[i] ? p.saffron : p.soot)
          .stroke({ color: p.soot, width: 4 });
      }
    for (const [key, c] of nodes)
      if (!c.visible) {
        actors.removeChild(c);
        c.destroy({ children: true });
        nodes.delete(key);
      }
    app.render();
  }
  return {
    app,
    render,
    metrics: () => ({
      fps: frames.length
        ? 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)
        : 0,
      p95:
        [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)] ??
        0,
    }),
    destroy: () => app.destroy(true, { children: true }),
  };
}
