import {
  Application,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { Director } from "../show/director";
import { palette as p } from "./palette";
import { puppetKinds, puppetSvg } from "./vectors";
import {
  backgroundMarkup,
  HEIGHT,
  labels,
  lanternMarkup,
  puppetPose,
  stagePuppets,
  textStyle,
  WIDTH,
} from "./scene";

async function svgTexture(svg: string, width: number, height: number) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
  return Texture.from(canvas);
}
const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${body}</svg>`;

/** The background occupies index zero; the camera layer may be inserted at index one. */
export async function createStage(host: HTMLElement, d: Director) {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('24px "Readex Pro"'),
    document.fonts.load('16px "IBM Plex Mono"'),
  ]);
  const app = new Application();
  await app.init({
    autoStart: false,
    width: WIDTH,
    height: HEIGHT,
    resolution: 1,
    antialias: true,
    background: p.night,
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  const textures = new Map<string, Texture>();
  for (const kind of puppetKinds)
    textures.set(kind, await svgTexture(puppetSvg(kind), 680, 680));
  const backgroundTexture = await svgTexture(
    wrap(backgroundMarkup()),
    WIDTH,
    HEIGHT,
  );
  const background = new Sprite(backgroundTexture);
  app.stage.addChild(background);
  const actors = new Container();
  actors.sortableChildren = true;
  app.stage.addChild(actors);
  const overlay = new Container();
  app.stage.addChild(overlay);
  const lanternNodes: Array<{ on: Sprite; off: Sprite }> = [];
  const lampTextures: Texture[] = [];
  for (let i = 0; i < 5; i++) {
    // Cropped canonical lantern geometry; only ten small textures for the whole stage.
    const x = 270 + i * 345;
    const sprites: Sprite[] = [];
    for (const on of [true, false]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="128" viewBox="${x - 28} 170 56 128">${lanternMarkup(i, on)}</svg>`;
      const tex = await svgTexture(svg, 112, 256);
      lampTextures.push(tex);
      const sprite = new Sprite(tex);
      sprite.position.set(x - 28, 170);
      sprite.width = 56;
      sprite.height = 128;
      overlay.addChild(sprite);
      sprites.push(sprite);
    }
    lanternNodes.push({ on: sprites[0], off: sprites[1] });
  }
  type Node = {
    root: Container;
    art: Sprite;
    name: Text;
    caption: Text;
    kind: string;
    depth: number;
    blur: BlurFilter;
  };
  const nodes = new Map<string, Node>();
  const texts = new Map<string, Text>();
  let elapsed = 0,
    last = performance.now();
  const frames: number[] = [];
  function render() {
    const now = performance.now(),
      frame = now - last;
    frames.push(frame);
    if (frames.length > 600) frames.shift();
    elapsed += Math.min(0.05, frame / 1000);
    last = now;
    background.alpha =
      d.raised && !d.steady ? 0.985 + Math.sin(elapsed * 0.24) * 0.015 : 1;
    const active = new Set<string>();
    for (const a of stagePuppets(d, elapsed)) {
      active.add(a.id);
      let node = nodes.get(a.id);
      if (!node) {
        const root = new Container();
        const rods = new Graphics()
          .moveTo(0, -50)
          .lineTo(0, 180)
          .moveTo(-42, -60)
          .lineTo(-72, 154)
          .stroke({ color: p.mist, alpha: 0.48, width: 1 });
        root.addChild(rods);
        const art = new Sprite(textures.get(a.kind) ?? textures.get("cat")!);
        art.position.set(-170, -240);
        art.width = 340;
        art.height = 340;
        root.addChild(art);
        root.addChild(
          new Graphics().roundRect(-78, 30, 156, 28, 3).fill(p.water),
        );
        const name = new Text({
          text: a.name,
          style: {
            fontFamily: textStyle.fontFamily,
            fontSize: 14,
            fill: p.ice,
          },
        });
        name.anchor.set(0.5);
        name.position.set(0, 44);
        root.addChild(name);
        const caption = new Text({
          text: "",
          style: {
            fontFamily: textStyle.fontFamily,
            fontSize: 18,
            fill: p.ice,
            wordWrap: true,
            wordWrapWidth: 260,
            align: "center",
          },
        });
        caption.anchor.set(0.5, 1);
        caption.position.set(0, -246);
        root.addChild(caption);
        const blur = new BlurFilter({ strength: 0, quality: 2 });
        node = { root, art, name, caption, kind: a.kind, depth: -1, blur };
        nodes.set(a.id, node);
        actors.addChild(root);
      }
      if (node.kind !== a.kind) {
        node.art.texture = textures.get(a.kind) ?? textures.get("cat")!;
        node.kind = a.kind;
      }
      if (node.depth !== a.z) {
        node.blur.strength = a.z * 14;
        node.art.filters = a.z > 0 ? [node.blur] : [];
        node.depth = a.z;
      }
      const pose = puppetPose(a, elapsed, d.steady);
      node.root.position.set(pose.x, pose.y);
      node.root.scale.set(pose.scale);
      node.root.rotation = pose.angle;
      node.root.alpha = pose.alpha;
      node.root.zIndex = a.z;
      node.name.text = a.name;
      node.name.scale.set(1);
      node.name.scale.set(Math.min(1, 140 / Math.max(1, node.name.width)));
      node.caption.text = d.captions ? (a.caption ?? "") : "";
    }
    for (const [id, node] of nodes)
      if (!active.has(id)) {
        node.root.destroy({ children: true });
        node.blur.destroy();
        nodes.delete(id);
      }
    const visibleLabels = new Set<string>();
    for (const l of labels(d, elapsed)) {
      visibleLabels.add(l.id);
      let text = texts.get(l.id);
      if (!text) {
        text = new Text({
          text: l.text,
          style: {
            fontFamily: l.mono ? textStyle.mono : textStyle.fontFamily,
            fontSize: l.size,
            fill: l.color,
            letterSpacing: l.spacing ?? 0,
            align: l.align ?? "left",
          },
        });
        texts.set(l.id, text);
        overlay.addChild(text);
      }
      text.visible = true;
      text.text = l.text;
      text.style.fill = l.color;
      text.anchor.set(
        l.align === "center" ? 0.5 : l.align === "right" ? 1 : 0,
        1,
      );
      text.position.set(l.x, l.y);
      text.scale.set(1);
      if (l.maxWidth)
        text.scale.set(Math.min(1, l.maxWidth / Math.max(1, text.width)));
    }
    for (const [id, text] of texts)
      if (!visibleLabels.has(id)) text.visible = false;
    for (let i = 0; i < 5; i++) {
      const visible = d.phase !== "free" && !d.curtain;
      lanternNodes[i].on.visible = visible && d.lanterns[i];
      lanternNodes[i].off.visible = visible && !d.lanterns[i];
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
    destroy: () => {
      for (const node of nodes.values()) node.blur.destroy();
      app.destroy(true, { children: true });
      backgroundTexture.destroy(true);
      for (const tex of [...textures.values(), ...lampTextures])
        tex.destroy(true);
    },
  };
}
