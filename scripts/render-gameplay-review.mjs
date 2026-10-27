/** Actual browser/canvas captures, with source disclosure. Never uploads or submits. */
import { readFile, writeFile, mkdir, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = resolve(root, "submission/video"), work = resolve(dir, "work/gameplay-review");
const disk = await statfs(root);
if (Number(disk.bavail) * Number(disk.bsize) < 2 * 1024 ** 3 + 512 * 1024 ** 2)
  throw new Error("Need 2 GiB reserve plus 512 MiB working space");
await mkdir(work, { recursive: true });
const run = (bin, args) => {
  const result = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 2 ** 20 });
  if (result.status !== 0) throw new Error(result.stderr || `${bin} failed`);
  return result.stdout;
};
const encode = (args) => new Promise((accept, reject) => {
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let error = "";
  child.stderr.on("data", data => error += data);
  child.on("error", reject);
  child.on("exit", code => code === 0 ? accept() : reject(new Error(error)));
});
const probe = path => JSON.parse(run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", path]));
const esc = s => s.replace(/[&<>]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;"})[c]);
const path = relative => resolve(dir, relative);
const voice = path("voiceover.wav"), timing = JSON.parse(await readFile(path("voice-alignment.json"), "utf8"));
const duration = timing.timelineDuration, offset = timing.voiceStartsAt;
const captionsWork = "work/gameplay-captions";
run(process.execPath, [resolve(root, "scripts/render-captions.mjs"), "--duration", String(duration), "--output-dir", captionsWork, "--frames"]);
const captionSequence = JSON.parse(await readFile(path(captionsWork+"/frame-sequence.json"),"utf8"));
process.env.FONTCONFIG_FILE = resolve(root, ".cache/submission/fonts.conf");

// This is an editorial source explanation, not a fabricated recording of Codex UI.
const source = (await readFile(resolve(root, "src/show/director.ts"), "utf8")).split("\n");
const at = source.findIndex(line => line.includes("finishHunt() {"));
const excerpt = source.slice(at, at+8).map(line => line.trim()).filter(Boolean).slice(0, 5);
const sourceCard = path("work/gameplay-review/source.png");
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#07182E"/><text x="100" y="190" fill="#E9B96A" font-family="IBM Plex Mono" font-size="22">KHAYAL / HOW CODEX WAS USED</text><text x="100" y="330" fill="#DAF0EF" font-family="Readex Pro" font-size="68">A conversation became a theatre.</text><text x="100" y="410" fill="#8DB5C3" font-family="Readex Pro" font-size="30">Command rules · cue book · Twitch EventSub · camera worker</text>${excerpt.map((line,i)=>`<text x="100" y="${520+i*56}" fill="#DAF0EF" font-family="IBM Plex Mono" font-size="27">${esc(line)}</text>`).join("")}<text x="100" y="890" fill="#E9B96A" font-family="IBM Plex Mono" font-size="20">ACTUAL SOURCE EXCERPT / EDITORIAL CARD, NOT CODEX UI FOOTAGE</text></svg>`)).png().toFile(sourceCard);

const starts = timing.takeStarts;
const boundaries = [0, offset, ...starts.slice(1).map(t => Math.round((t-0.1)*1000)/1000), duration];
const slot = i => ({start: boundaries[i], end: boundaries[i+1]});
const free = "captures/twitch-camera-freeplay-20261028.mp4";
const hunt = "captures/twitch-camera-hunt-20261028.mp4";
const liveLabel = "REAL TWITCH + CAMERA / AGENT-OPERATED BROADCASTER TEST / 1x";
const segments = [
  {...slot(0),file:hunt,seek:22,kind:"video",label:liveLabel,note:"Excerpt of actual detected hit; no deliberate-swat accuracy claim"},
  {...slot(1),file:free,seek:14,kind:"video",label:liveLabel},
  {...slot(2),file:free,seek:0,kind:"video",label:liveLabel},
  {start:boundaries[3],end:boundaries[3]+8,file:free,seek:25,kind:"video",label:liveLabel},
  {start:boundaries[3]+8,end:boundaries[4],file:"captures/animated-rehearsal-20261028.mp4",seek:12,kind:"video",label:"ACTUAL APP REHEARSAL / SIMULATED VIEWERS / CAMERA OFF / 1x"},
  {...slot(4),file:hunt,seek:18,kind:"video",label:liveLabel},
  {...slot(5),file:"../screenshots/03-live-cue-book.jpg",kind:"image",label:"ACTUAL CUE-BOOK SCREENSHOT / RECORDED TEST SESSION"},
  {...slot(6),file:"../screenshots/04-real-playbill.png",kind:"image",label:"ACTUAL EXPORTED PLAYBILL / ONE BROADCASTER TEST CAST MEMBER"},
  {...slot(7),file:sourceCard,kind:"image",label:"EDITORIAL SOURCE EXPLANATION / CODEX UI CAPTURE STILL PENDING"},
  {...slot(8),file:hunt,seek:58,kind:"video",label:liveLabel},
];
const fragments = [];
for (let i=0; i<segments.length; i++) {
  const s = segments[i], length = s.end-s.start, input = path(s.file);
  if (s.kind === "video") {
    const info = probe(input), video = info.streams.find(v => v.codec_type === "video");
    if (!video || video.width<1280 || video.height<720 || !Number.isFinite(Number(info.format.duration)) || Number(info.format.duration)+0.01 < s.seek+length)
      throw new Error("Invalid/short actual capture: " + s.file);
  }
  const label = path(`work/gameplay-review/label-${i}.png`);
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="44" fill="#07182E"/><text x="40" y="29" fill="#E9B96A" font-size="17" font-family="IBM Plex Mono">${esc(s.label)}</text><rect x="1640" y="44" width="280" height="28" fill="#07182E"/><text x="1890" y="64" text-anchor="end" fill="#8DB5C3" font-size="15" font-family="IBM Plex Mono">REVIEW / NOT FINAL</text></svg>`)).png().toFile(label);
  const output = path(`work/gameplay-review/part-${i}.mp4`);
  console.log(`Encoding actual review section ${i+1}/${segments.length}`);
  await encode(["-y","-v","error", ...(s.kind==="image" ? ["-loop","1","-framerate","30"] : ["-ss",String(s.seek)]),"-i",input,"-i",label,"-filter_complex","[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x07182e,setsar=1,fps=30[base];[base][1:v]overlay=0:0:eof_action=repeat[v]","-map","[v]","-t",String(length),"-an","-c:v","libx264","-threads","2","-preset","veryfast","-crf","20","-pix_fmt","yuv420p",output]);
  fragments.push(output);
}
const concat = path("work/gameplay-review/concat.txt");
await writeFile(concat,fragments.map(p=>`file '${p.replaceAll("'","'\\''")}'`).join("\n"));
const output = path(`khayal-gameplay-review-${duration}s.mp4`);
console.log("Applying corrected captions and supplied voice to actual gameplay.");
// Encode picture and continuous audio independently. The former combined filter
// path produced sparse AAC packets and lost speech; an explicit PCM bed avoids it.
run(process.execPath, [resolve(root,"scripts/prepare-review-audio.mjs")]);
const picture = path("work/gameplay-review/picture.mp4");
await encode(["-y","-v","error","-f","concat","-safe","0","-i",concat,"-framerate","30","-i",resolve(captionSequence.sequenceDirectory,"%06d.png"),"-filter_complex","[0:v][1:v]overlay=0:0:eof_action=repeat[v]","-map","[v]","-t",String(duration),"-an","-c:v","libx264","-threads","2","-preset","veryfast","-crf","20","-pix_fmt","yuv420p",picture]);
const narration = path("work/gameplay-review/narration.m4a");
await encode(["-y","-v","error","-i",path("work/gameplay-review/voice-bed.wav"),"-af","asetpts=N/SR/TB","-c:a","aac","-b:a","192k","-ar","48000","-t",String(duration),narration]);
run("ffmpeg",["-y","-v","error","-i",picture,"-i",narration,"-map","0:v:0","-map","1:a:0","-c","copy","-t",String(duration),"-movflags","+faststart",output]);
const info = probe(output);
await writeFile(path("gameplay-review-receipt.json"),JSON.stringify({output,duration:Number(info.format.duration),width:1920,height:1080,segments,voiceOffsetSeconds:offset,captionCues:timing.captionCues,continuousPcmAudioBed:true,realTwitchAndCamera:true,agentOperatedBroadcasterTest:true,humanViewerRehearsal:false,followAndRaidVerified:false,genuineCodexUiFootage:false,manualListeningQC:false,submissionReady:false},null,2)+"\n");
console.log("Ready " + output);
