/** Native shared-scene vector exports -> PNG previews. These are NOT browser screenshots. */
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, readdir, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const disk = await statfs(root);
if (Number(disk.bavail) * Number(disk.bsize) < 2 * 1024 ** 3 + 32 * 1024 ** 2)
  throw new Error("Need2GiB reserve plus32MiB; no raster job started.");
const cache = resolve(root, ".cache/submission");
await mkdir(cache, { recursive: true });
const config = resolve(cache, "fonts.conf");
await writeFile(
  config,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${resolve(root, "public/assets/fonts")}</dir><dir>/System/Library/Fonts</dir><cachedir>${cache}/font-cache</cachedir></fontconfig>`,
);
process.env.FONTCONFIG_FILE = config;
const sharp = createRequire(import.meta.url)("sharp");
const dir = resolve(root, "submission/engine-previews");
await mkdir(dir, { recursive: true });
const items = [];
for (const file of (await readdir(resolve(root, "submission/renders")))
  .filter((f) => f.endsWith(".svg"))
  .sort()) {
  const svg = await readFile(resolve(root, "submission/renders", file));
  const output = resolve(dir, file.replace(".svg", ".png"));
  await sharp(svg).png().toFile(output);
  items.push({
    file: output.split("/").pop(),
    source:
      "shared SVG scene + synthetic Director fixture; no camera, browser capture or real Twitch",
    sha256: createHash("sha256")
      .update(await readFile(output))
      .digest("hex"),
  });
  console.log("Preview " + output);
}
await writeFile(
  resolve(dir, "manifest.json"),
  JSON.stringify(
    { kind: "engine rehearsal previews", width: 1920, height: 1080, items },
    null,
    2,
  ) + "\n",
);
