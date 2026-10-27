/** Native transparent caption frames; works with FFmpeg builds without libass. */
import { readFile, writeFile, mkdir, mkdtemp, link } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url)),
  dir = resolve(root, "submission/video");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1]) throw new Error(`Missing value for ${name}`);
  return args[i + 1];
};
const duration = Number(option("--duration", "150"));
if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid duration");
const work = resolve(dir, option("--output-dir", "work/captions"));
await mkdir(work, { recursive: true });
const cache = resolve(root, ".cache/submission");
await mkdir(cache, { recursive: true });
const config = resolve(cache, "fonts.conf");
await writeFile(
  config,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${resolve(root, "public/assets/fonts")}</dir><dir>/System/Library/Fonts</dir><cachedir>${cache}/font-cache</cachedir></fontconfig>`,
);
process.env.FONTCONFIG_FILE = config;
const sharp = createRequire(import.meta.url)("sharp");
const parse = (s) => {
  const [h, m, t] = s.replace(",", ".").split(":").map(Number);
  return h * 3600 + m * 60 + t;
};
const escape = (s) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const srt = await readFile(resolve(dir, option("--srt", "captions.srt")), "utf8"),
  cues = srt
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/),
        times = lines[1].split(" --> ");
      return {
        start: parse(times[0]),
        end: parse(times[1]),
        lines: lines.slice(2),
      };
    });
async function frame(name, lines) {
  const text = lines
    .map(
      (s, i) =>
        `<text x="960" y="${lines.length === 1 ? 1035 : 1007 + i * 43}" text-anchor="middle" fill="#DAF0EF" font-family="Readex Pro" font-size="34">${escape(s)}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${lines.length ? '<path d="M0 967H1920V1080H0Z" fill="#07182E"/>' : ""}${text}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(resolve(work, name));
}
await frame("blank.png", []);
let cursor = 0,
  concat = "ffconcat version 1.0\n";
const add = (name, duration) => {
  if (duration > 0)
    // image2 otherwise defaults to 25 fps, rounding every packet PTS to40ms.
    // Declare the millisecond time base on every image, including the sentinel.
    concat += `file '${name}'\noption framerate 1000\nduration ${duration.toFixed(3)}\n`;
};
for (let i = 0; i < cues.length; i++) {
  const c = cues[i];
  if (c.start < cursor || c.end <= c.start || c.end > duration)
    throw new Error(`Caption ${i + 1} overlaps or exceeds the timeline`);
  add("blank.png", c.start - cursor);
  const name = `caption-${String(i).padStart(3, "0")}.png`;
  await frame(name, c.lines);
  add(name, c.end - c.start);
  cursor = c.end;
}
add("blank.png", Math.max(0, duration - cursor));
concat += "file 'blank.png'\noption framerate 1000\n";
await writeFile(resolve(work, "captions.ffconcat"), concat);
if (args.includes("--frames")) {
  // Sparse PNG concat timestamps proved insufficient in the encoded overlay.
  // Supply one explicitly indexed PNG for every video frame instead. Hard links
  // reuse the57 source images without multiplying their pixel storage.
  const sequenceDirectory = await mkdtemp(resolve(work, "frames-"));
  const fps = 30, count = Math.round(duration * fps);
  let cue = 0;
  for (let n = 0; n < count; n++) {
    const t = n / fps;
    while (cue < cues.length && cues[cue].end <= t) cue++;
    const active = cue < cues.length && cues[cue].start <= t && t < cues[cue].end;
    const source = active ? `caption-${String(cue).padStart(3,"0")}.png` : "blank.png";
    await link(resolve(work,source),resolve(sequenceDirectory,`${String(n).padStart(6,"0")}.png`));
  }
  await writeFile(resolve(work,"frame-sequence.json"),JSON.stringify({sequenceDirectory,fps,count,duration},null,2)+"\n");
}
console.log(`Prepared ${cues.length} native caption overlays.`);
