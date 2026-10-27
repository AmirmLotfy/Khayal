/** Timed editorial review only; no fabricated browser, camera, Twitch or Codex capture. */
import { readFile, writeFile, mkdir, readdir, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url)),
  dir = resolve(root, "submission/video"),
  work = resolve(dir, "work/review");
const disk = await statfs(root);
if (Number(disk.bavail) * Number(disk.bsize) < 2 * 1024 ** 3 + 200 * 1024 ** 2)
  throw new Error("Need2GiB reserve plus200MiB for review render.");
await mkdir(work, { recursive: true });
const run = (binary, args) => {
  const r = spawnSync(binary, args, { encoding: "utf8", maxBuffer: 2 ** 20 });
  if (r.status !== 0) throw new Error(r.stderr || "Command failed");
  return r.stdout;
};
run(process.execPath, [resolve(root, "scripts/render-captions.mjs")]);
process.env.FONTCONFIG_FILE = resolve(root, ".cache/submission/fonts.conf");
const sharp = createRequire(import.meta.url)("sharp");
const esc = (s) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
async function card(name, title, lines, foot) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#07182E"/><path d="M100 150H180" stroke="#E9B96A" stroke-width="3"/><text x="100" y="220" fill="#8DB5C3" font-size="24" font-family="IBM Plex Mono">KHAYAL / EDITORIAL REVIEW</text><text x="100" y="370" fill="#DAF0EF" font-size="77" font-family="Readex Pro">${esc(title)}</text>${lines.map((line, i) => `<text x="100" y="${460 + i * 59}" fill="#8DB5C3" font-size="32" font-family="Readex Pro">${esc(line)}</text>`).join("")}<text x="100" y="890" fill="#E9B96A" font-size="21" font-family="IBM Plex Mono">${esc(foot)}</text></svg>`;
  const output = resolve(work, name + ".png");
  await sharp(Buffer.from(svg)).png().toFile(output);
  return output;
}
const direction = await card(
  "direction",
  "The performance has a keeper.",
  [
    "01  Open the theatre.",
    "02  Guard the five lanterns.",
    "04  Credit the company.",
  ],
  "OPERATOR UI CAPTURE STILL REQUIRED",
);
const code = (
  await readFile(resolve(root, "src/show/director.ts"), "utf8")
).split("\n");
const at = code.findIndex((s) => s.includes("finishHunt() {"));
const excerpt = code
  .slice(at, at + 10)
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 7);
const build = await card(
  "build",
  "Built through conversation.",
  ["TypeScript · PixiJS · MediaPipe · Twitch EventSub", ...excerpt],
  "ACTUAL SOURCE EXCERPT / CODEX RECORDING STILL REQUIRED",
);
const closing = await card(
  "closing",
  "Bring your shadow. Guard the light.",
  [
    "Your body. Chat’s playground.",
    "Come back tomorrow. There is more to see.",
  ],
  "REVIEW ONLY / OWNER VOICE AND LIVE FOOTAGE PENDING",
);
const cover = resolve(root, "submission/artwork/khayal-devpost-3x2.png"),
  preview = (n) => resolve(root, "submission/engine-previews/" + n + ".png");
const shots = [
  [cover, 6],
  [preview("02-freeplay"), 16],
  [preview("01-stage"), 16],
  [preview("03-depth"), 17],
  [preview("04-hunt"), 23],
  [direction, 17],
  [preview("05-company"), 15],
  [build, 25],
  [closing, 15],
];
const overlay = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="0" y="0" width="1920" height="45" fill="#07182E"/><text x="40" y="30" fill="#E9B96A" font-size="18" font-family="IBM Plex Mono">REVIEW CUT / ENGINE REHEARSAL + EDITORIAL ART / NO OWNER VOICE YET</text></svg>',
);
const fragments = [];
for (let i = 0; i < shots.length; i++) {
  const [source, duration] = shots[i];
  const input = resolve(work, `frame-${i}.png`);
  await sharp(source)
    .resize(1920, 1080, { fit: "contain", background: "#07182e" })
    .composite([{ input: overlay }])
    .png()
    .toFile(input);
  const out = resolve(work, `shot-${i}.mp4`);
  console.log(`Encoding review section ${i + 1}/${shots.length}`);
  await new Promise((accept, reject) => {
    const p = spawn(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        input,
        "-t",
        String(duration),
        "-an",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        out,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let error = "";
    p.stderr.on("data", (b) => {
      error += b.toString();
    });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? accept() : reject(new Error(error))));
  });
  fragments.push(out);
}
const list = resolve(work, "concat.txt");
await writeFile(list, fragments.map((p) => `file '${p}'`).join("\n"));
const output = resolve(dir, "khayal-review-150s.mp4");
console.log("Burning timed narration captions into silent review master.");
run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  list,
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  resolve(dir, "work/captions/captions.ffconcat"),
  "-filter_complex",
  "[1:v]fps=30[cap];[0:v][cap]overlay=0:0:eof_action=repeat[v]",
  "-map",
  "[v]",
  "-t",
  "150",
  "-an",
  "-c:v",
  "libx264",
  "-threads",
  "2",
  "-preset",
  "veryfast",
  "-crf",
  "22",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  output,
]);
const probe = JSON.parse(
  run("ffprobe", [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    output,
  ]),
);
await writeFile(
  resolve(dir, "review-receipt.json"),
  JSON.stringify(
    {
      output,
      duration: Number(probe.format.duration),
      width: 1920,
      height: 1080,
      ownerVoice: false,
      realTwitch: false,
      browserCapture: false,
      genuineCodexFootage: false,
      source:
        "synthetic Director engine exports + promotional illustration + actual source still",
      submissionReady: false,
    },
    null,
    2,
  ) + "\n",
);
console.log("Ready " + output);
