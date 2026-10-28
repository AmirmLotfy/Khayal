/** Reproducible source-level rehearsal. No browser, Twitch, camera or OBS access. */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, statfs } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "docs/rehearsals/agent-operated");
const disk = await statfs(root);
assert(Number(disk.bavail) * Number(disk.bsize) >= 2 * 1024 ** 3 + 32 * 1024 ** 2,
  "Need2GiB reserve plus32MiB; rehearsal not started.");
await mkdir(output, { recursive: true });
const server = await createServer({ root, configFile: false,
  server: { middlewareMode: true }, appType: "custom" });
let modules;
try {
  modules = await Promise.all([
    server.ssrLoadModule("/src/show/director.ts"),
    server.ssrLoadModule("/src/stage/scene.ts"),
    server.ssrLoadModule("/src/vision/masks.ts"),
  ]);
} finally { await server.close(); }
const [{ Director }, { stageSceneSvg, stagePuppets, labels },
  { MaskProcessor, circleIntersectsMask }] = modules;
const originalRandom = Math.random, originalNow = Date.now;
let seed = 20261028, seconds = 0, frames = 0, commands = 0;
Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
Date.now = () => 1793145600000 + Math.round(seconds * 1000);
const report = {
  kind: "agent-operated source-level rehearsal",
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceHeadScope: "Git parent at execution; sourceFiles records exact source bytes, including pending changes",
  sourceFiles: Object.fromEntries(await Promise.all([
    "src/show/director.ts", "src/twitch/commands.ts", "src/vision/masks.ts",
    "src/vision/types.ts", "src/stage/scene.ts", "src/stage/vectors.ts", "src/stage/palette.ts",
  ].map(async file => [file, createHash("sha256").update(await readFile(resolve(root, file))).digest("hex")]))),
  runnerSha256: createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex"),
  inputSeed: 20261028, timeMode: "virtual;60Hz director steps, accelerated wall time",
  evidenceScope: "Actual parser/Director/mask-processing/shared-scene source with synthetic inputs. Frames are engine exports, not browser screenshots or camera footage.",
  realTwitchEvents: false, realParticipants: false, cameraInference: false,
  physicalSwatQualification: false, humanFairnessQualification: false,
  obsRecording: false, checks: [], snapshots: [], status: "running",
};
let d;
function check(name, condition, observed) {
  report.checks.push({ name, passed: Boolean(condition), observed });
  assert(condition, name);
}
function input(viewer, command, id = "") { commands++; d.input(viewer, command, id); }
function advance(duration, swat, before) {
  const steps = Math.ceil(duration * 60);
  for (let i = 0; i < steps; i++) {
    const dt = Math.min(1 / 60, duration - i / 60);
    seconds += dt; before?.(i); d.tick(dt, swat); frames++;
    const ordinary = d.puppets.concat(d.queue), attacks = d.afreets.concat(d.attackQueue);
    assert(d.puppets.length <= 24 && d.queue.length <= 300 && d.afreets.length <= 24 && d.attackQueue.length <= 300, "Actor bounds exceeded");
    assert.equal(new Set(ordinary.map(p => p.id)).size, ordinary.length, "Duplicate puppet owner");
    assert.equal(new Set(attacks.map(p => p.id)).size, attacks.length, "Duplicate afreet owner");
    for (const p of d.puppets) admitted.add(p.id);
  }
}
const admitted = new Set();
async function snapshot(name) {
  let svg = stageSceneSvg(d, seconds, "AUTOMATED ENGINE REHEARSAL / " + name);
  svg = svg.replace("</svg>", '<text x="960" y="1064" text-anchor="middle" fill="#8DB5C3" font-size="13" font-family="IBM Plex Mono">AUTOMATED ENGINE REHEARSAL / SYNTHETIC INPUT / NO CAMERA OR LIVE TWITCH</text></svg>');
  await writeFile(resolve(output, name + ".svg"), svg);
  report.snapshots.push({ file: name + ".svg", virtualSeconds: +seconds.toFixed(3),
    phase: d.phase, active: d.puppets.length, waiting: d.queue.length,
    afreets: d.afreets.length, attackQueue: d.attackQueue.length,
    lights: d.lanterns.filter(Boolean).length, swats: d.swats,
    sha256: createHash("sha256").update(svg).digest("hex") });
}
try {
  d = new Director(); d.raised = true; d.steady = true;
  const viewers = Array.from({ length: 50 }, (_, i) => ({ id: `rehearsal-${i}`,
    login: `rehearsal_${i}`, name: i % 2 ? `تجربة ${i + 1}` : `Rehearsal ${i + 1}` }));
  const kinds = ["!cat", "!camel", "!goha", "!boat", "!croc"];
  viewers.forEach((v, i) => input(v, kinds[i % 5]));
  check("50 synthetic viewers enter bounded FIFO", d.puppets.length === 24 && d.queue.length === 26, { active: d.puppets.length, waiting: d.queue.length });
  input(viewers[0], "!khayal pause");
  check("Viewer cannot issue moderator pause", !d.paused);
  input(viewers[0], "!closer"); input(viewers[0], "!jump");
  check("Movement family cooldown rejects immediate second move", d.puppets[0].z === 0.2 && d.puppets[0].vy === 0);
  advance(0.3); input(viewers[0], "!jump");
  check("Jump accepted after movement cooldown", d.puppets[0].vy < 0);
  input(viewers[0], "!say يا ليل https://example.com/hidden\u0007 hello", "visible-caption");
  input(viewers[48], "!say queued caption", "queued-delete");
  d.deleteCaption("queued-delete");
  check("Queued caption moderation removes before promotion", !d.queue.find(p => p.id === viewers[48].id).caption);
  check("Mixed caption sanitized by actual parser", d.puppets[0].caption === "يا ليل hello", d.puppets[0].caption);
  advance(2); await snapshot("01-freeplay");
  d.captions = false;
  check("Immediate hide-captions setting applied", !stageSceneSvg(d, seconds).includes("يا ليل hello"));
  d.captions = true; d.deleteCaption("visible-caption");
  advance(63);
  check("Every one of50 waiting actors receives a turn", viewers.every(v => admitted.has(v.id)), { admitted: admitted.size, virtualSeconds: seconds });
  viewers.forEach((v, i) => input(v, kinds[i % 5]));
  d.event("follow", "Rehearsal follower"); advance(0.1);
  check("Simulated follow activates Mesaharati", stagePuppets(d, seconds).some(p => p.kind === "mesaharati"));
  d.hunt(); d.event("follow", "Queued rehearsal follower"); d.event("raid", "Rehearsal caravan", 999);
  const parked = JSON.stringify(d.puppets);
  advance(3.02);
  check("Countdown advances into Hunt", d.phase === "hunt");
  check("Ordinary actors park throughout countdown", JSON.stringify(d.puppets) === parked);
  viewers.forEach(v => input(v, "!afreet"));
  check("Afreet active/queue caps and ownership", d.afreets.length === 24 && d.attackQueue.length === 26);
  const dodge = d.afreets[0], oldY = dodge.y;
  input(viewers.find(v => v.id === dodge.id), "!up");
  check("Viewer dodges their own afreet", dodge.y === Math.max(120, oldY - 100));
  input({ id: "rehearsal-mod", name: "Rehearsal moderator", mod: true }, "!khayal pause");
  const remaining = d.remaining; advance(3);
  check("Moderator pause freezes Hunt", d.remaining === remaining && d.paused);
  input({ id: "rehearsal-mod", name: "Rehearsal moderator", mod: true }, "!khayal pause");
  advance(8); await snapshot("02-hunt-no-defense");
  check("Ceremonies do not obscure Hunt", !d.ceremony && !labels(d, seconds).some(l => l.id === "ceremony"));
  advance(52.1);
  check("Undefended full round resolves as chat win", d.phase === "result" && d.lanterns.filter(Boolean).length < 3, { result: d.result, lights: d.lanterns.filter(Boolean).length });
  advance(10.1);
  check("Queued follow resumes after Hunt", d.ceremony?.name === "Queued rehearsal follower");
  advance(9.1);
  check("Queued raid resumes with bounded caravan", d.ceremony?.kind === "raid" && stagePuppets(d, seconds).filter(p => p.id.startsWith("event-")).length === 8);
  await snapshot("03-simulated-caravan");
  const processor = new MaskProcessor(256, 144, 64, 36);
  const confidence = new Float32Array(64 * 36), rgba = new Uint8ClampedArray(256 * 144 * 4);
  const occupancy = new Uint8Array(64 * 36), motion = new Uint8Array(64 * 36);
  let maskTimestamp = seconds * 1000;
  const mask = () => ({ timestamp: maskTimestamp, gridWidth: 64, gridHeight: 36, occupancy, motion });
  confidence.fill(1); processor.process(confidence, 64, 36, rgba, occupancy, motion, maskTimestamp);
  let stationaryMotionCells = 0;
  for (let i = 1; i <= 450; i++) {
    maskTimestamp += 1000 / 15;
    processor.process(confidence, 64, 36, rgba, occupancy, motion, maskTimestamp);
    stationaryMotionCells += motion.reduce((n, v) => n + v, 0);
  }
  check("30virtual seconds of constant synthetic mask emits no motion", stationaryMotionCells === 0, { stationaryMotionCells, physicalCamera: false });
  processor.reset(); d.hunt(); advance(3.02); viewers.forEach(v => input(v, "!afreet"));
  let syntheticFrames = 0;
  const updateMask = i => {
    if (i % 4) return;
    confidence.fill(0);
    if (syntheticFrames++ % 2) for (const a of d.afreets) {
      const x = Math.floor(a.x / 1920 * 64), y = Math.floor((a.y - 100) / 1080 * 36);
      if (x >= 0 && x < 64 && y >= 0 && y < 36) confidence[y * 64 + x] = 1;
    }
    maskTimestamp = seconds * 1000;
    processor.process(confidence, 64, 36, rgba, occupancy, motion, maskTimestamp);
  };
  const syntheticDefense = (x, y, radius = 45) => circleIntersectsMask(mask(), {
    x: x / 1920, y: y / 1080, radiusX: radius / 1920, radiusY: radius / 1080,
  }, seconds * 1000);
  advance(8, syntheticDefense, updateMask); await snapshot("04-synthetic-mask-defense");
  advance(52.1, syntheticDefense, updateMask);
  check("Synthetic changing-mask full round resolves keeper win", d.phase === "result" && d.swats > 0 && d.lanterns.filter(Boolean).length >= 3,
    { result: d.result, lights: d.lanterns.filter(Boolean).length, syntheticHits: d.swats, syntheticFrames });
  check("Expired synthetic mask cannot hit", !circleIntersectsMask(mask(), { x: 0.5, y: 0.5, radiusX: 1, radiusY: 1 }, maskTimestamp + 251));
  await snapshot("05-keeper-result");
  check("Cast ledger retains every synthetic participant", d.cast.size === 50);
  d.clear(); d.curtain = true; d.raised = false;
  check("Curtain clears actors but retains complete cast", !d.puppets.length && !d.queue.length && d.cast.size === 50);
  await snapshot("06-curtain");
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = String(error); process.exitCode = 1;
} finally {
  Math.random = originalRandom; Date.now = originalNow;
  report.virtualSeconds = +seconds.toFixed(3); report.directorSteps = frames; report.commands = commands;
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
if (report.status === "passed") {
  try {
    const cache = resolve(root, ".cache/rehearsal"); await mkdir(cache, { recursive: true });
    const config = resolve(cache, "fonts.conf");
    await writeFile(config, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${resolve(root, "public/assets/fonts")}</dir><dir>/System/Library/Fonts</dir><cachedir>${cache}/font-cache</cachedir></fontconfig>`);
    process.env.FONTCONFIG_FILE = config;
    const sharp = createRequire(import.meta.url)("sharp");
    for (const item of report.snapshots) {
      item.png = item.file.replace(/\.svg$/, ".png");
      await sharp(await readFile(resolve(output, item.file))).png().toFile(resolve(output, item.png));
      item.pngSha256 = createHash("sha256").update(await readFile(resolve(output, item.png))).digest("hex");
    }
  } catch (error) {
    report.status = "failed"; report.artifactError = String(error); process.exitCode = 1;
  }
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length,
  virtualSeconds: report.virtualSeconds, output: "docs/rehearsals/agent-operated/report.json",
  evidence: "source-level synthetic rehearsal; no live Twitch, browser, camera or OBS claim" }));
