/** node scripts/prepare-video.mjs --check | --render --voice path/to/voice.wav
 * Real media only. Missing clips are reported; nothing is fabricated or published.
 */
import { readFile, writeFile, mkdir, stat, statfs } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = resolve(root, "submission/video");
const plan = JSON.parse(await readFile(resolve(dir, "edit-plan.json"), "utf8"));
const args = process.argv.slice(2);
const flag = args.indexOf("--voice");
const voice =
  flag >= 0 ? resolve(args[flag + 1] ?? "") : resolve(dir, plan.voiceFile);
const run = (binary, argv) => {
  const p = spawnSync(binary, argv, { encoding: "utf8", maxBuffer: 2 ** 20 });
  if (p.status !== 0) throw new Error(p.stderr || `${binary} failed`);
  return p.stdout;
};
const exists = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};
const missing = [];
for (const s of plan.segments) {
  if (!(await exists(resolve(dir, s.file)))) missing.push(s.file);
}
if (!(await exists(voice))) missing.push(voice);
const disk = await statfs(dir);
const available = Number(disk.bavail) * Number(disk.bsize);
const ready =
  missing.length === 0 && available >= 2 * 1024 ** 3 + 512 * 1024 ** 2;
console.log(
  JSON.stringify(
    {
      ready,
      availableBytes: available,
      missing,
      durationSeconds: plan.duration,
      publication: "never performed by this script",
    },
    null,
    2,
  ),
);
if (args.includes("--check") || !args.includes("--render"))
  process.exit(ready ? 0 : 2);
if (!ready)
  throw new Error(
    "Video inputs or working-space admission are incomplete. No render started.",
  );
const probe = (path) =>
  JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      path,
    ]),
  );
const voicedata = probe(voice);
if (!voicedata.streams.some((s) => s.codec_type === "audio"))
  throw new Error("Voice file has no audio stream");
if (Number(voicedata.format.duration) > plan.duration - plan.voiceStartsAt)
  throw new Error(
    "Voice exceeds the available timeline; align/re-edit takes before rendering.",
  );
const work = resolve(dir, "work");
await mkdir(work, { recursive: true });
const fragments = [];
for (let i = 0; i < plan.segments.length; i++) {
  const segment = plan.segments[i],
    input = resolve(dir, segment.file),
    info = probe(input),
    video = info.streams.find((s) => s.codec_type === "video"),
    duration = segment.end - segment.start;
  if (!video || video.width < 1280 || video.height < 720)
    throw new Error("Capture must be at least1280×720: " + segment.file);
  if (!Number.isFinite(Number(info.format.duration)) || Number(info.format.duration) < duration)
    throw new Error("Capture is shorter than its edit slot: " + segment.file);
  const out = resolve(work, `${String(i).padStart(2, "0")}.mp4`);
  console.log("Normalizing actual source " + segment.file);
  run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    "-t",
    String(duration),
    "-an",
    "-vf",
    "scale=1920:940:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:32:color=0x07182e,setsar=1,fps=30",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "veryfast",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    out,
  ]);
  fragments.push(out);
}
const list = resolve(work, "concat.txt");
await writeFile(
  list,
  fragments.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join("\n"),
);
const output = resolve(dir, plan.output);
const picture = resolve(work, "final-picture.mp4");
const narration = resolve(work, "final-narration.m4a");
// Subtitles are aligned by align-voice.py and reviewed before this final render.
const subtitles = resolve(dir, "captions.srt");
if (!(await exists(subtitles)))
  throw new Error("Prepare and review captions.srt before rendering.");
run(process.execPath, [resolve(root, "scripts/render-captions.mjs"), "--duration", String(plan.duration), "--frames"]);
const captionSequence = JSON.parse(await readFile(resolve(work,"captions/frame-sequence.json"),"utf8"));
run(process.execPath, [resolve(root, "scripts/prepare-review-audio.mjs"), "--voice", voice]);
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
  "-framerate",
  "30",
  "-i",
  resolve(captionSequence.sequenceDirectory,"%06d.png"),
  "-filter_complex",
  "[0:v][1:v]overlay=0:0:eof_action=repeat[v]",
  "-map",
  "[v]",
  "-an",
  "-t",
  String(plan.duration),
  "-c:v",
  "libx264",
  "-threads",
  "2",
  "-preset",
  "veryfast",
  "-crf",
  "19",
  "-pix_fmt",
  "yuv420p",
  picture,
]);
run("ffmpeg", ["-y","-v","error","-i",resolve(work,"gameplay-review/voice-bed.wav"),"-af","asetpts=N/SR/TB","-c:a","aac","-b:a","192k","-ar","48000","-t",String(plan.duration),narration]);
run("ffmpeg", ["-y","-v","error","-i",picture,"-i",narration,"-map","0:v:0","-map","1:a:0","-c","copy","-t",String(plan.duration),"-movflags","+faststart",output]);
const final = probe(output);
await writeFile(
  resolve(dir, "render-receipt.json"),
  JSON.stringify(
    {
      output,
      duration: Number(final.format.duration),
      source: plan.segments,
      voice,
      reviewRequired: true,
      submissionReady: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Rendered " +
    output +
    "; review actual content and readiness before publication.",
);
