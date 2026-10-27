import { Container, Sprite, Texture } from "pixi.js";
type Part = { name: string; image: string; pivot: [number, number] };
type CastAsset = { parts: Array<Part & { texture: Texture }> };
export async function loadCast() {
  const cast = new Map<string, CastAsset>();
  const index = (await fetch("/assets/cast/index.json").then((r) => {
    if (!r.ok) throw new Error("Missing cast index");
    return r.json();
  })) as { cast: string[] };
  for (const kind of index.cast) {
    if (!/^[a-z]+$/.test(kind)) throw new Error("Invalid cast identifier");
    const base = `/assets/cast/${kind}/`;
    const data = (await fetch(base + "manifest.json").then((r) => {
      if (!r.ok) throw new Error("Missing " + kind + " manifest");
      return r.json();
    })) as { parts: Part[] };
    const parts = [];
    for (const part of data.parts) {
      if (
        !/^[a-zA-Z0-9_-]+\.png$/.test(part.image) ||
        part.pivot.length !== 2 ||
        part.pivot.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
      )
        throw new Error("Invalid authored layer");
      const image = new Image();
      image.src = base + part.image;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 1024, 1024);
      const alpha = ctx.getImageData(0, 0, 1024, 1024).data;
      ctx.globalCompositeOperation = "destination-out";
      for (let y = 24; y < 1000; y += 32)
        for (let x = 24; x < 1000; x += 32) {
          const solid = [
            [-6, 0],
            [6, 0],
            [0, -6],
            [0, 6],
            [0, 0],
          ].every(
            ([dx, dy]) => alpha[((y + dy) * 1024 + x + dx) * 4 + 3] > 240,
          );
          if (solid) {
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      parts.push({ ...part, texture: Texture.from(canvas) });
    }
    cast.set(kind, { parts });
  }
  return cast;
}
export function createCastFigure(asset: CastAsset) {
  const figure = new Container();
  for (const part of asset.parts) {
    const sprite = new Sprite(part.texture);
    sprite.label = part.name;
    sprite.anchor.set(...part.pivot);
    sprite.width = 200;
    sprite.height = 200;
    sprite.position.set(
      (part.pivot[0] - 0.5) * 200,
      (part.pivot[1] - 0.5) * 200 - 80,
    );
    figure.addChild(sprite);
  }
  return figure;
}
