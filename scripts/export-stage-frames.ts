/** Run with: node --experimental-strip-types scripts/export-stage-frames.ts
 * Uses the installed Vite SSR transformer for the application TypeScript imports. Writes small SVGs only; no camera, browser or live-event evidence.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
const { Director } = await server.ssrLoadModule("/src/show/director.ts");
const { stageSceneSvg } = await server.ssrLoadModule("/src/stage/scene.ts");
await server.close();

const out = new URL("../submission/renders/", import.meta.url);
await mkdir(out, { recursive: true });
const d = new Director();
d.steady = true;
async function save(name: string, time = 8) {
  await writeFile(
    new URL(`${name}.svg`, out),
    stageSceneSvg(d, time, `Khayal / ${name} / REHEARSAL engine vector export`),
  );
}
await save("01-stage");
d.raised = true;
const cast = [
  ["s01", "Nour", "!cat", 360],
  ["s02", "ليلى", "!camel", 745],
  ["s03", "Salma", "!goha", 1120],
  ["s04", "يوسف", "!boat", 1510],
  ["s05", "Mariam", "!croc", 1790],
] as const;
for (const [id, name, command, x] of cast) {
  d.input({ id, name }, command);
  d.puppets.at(-1)!.x = x;
  d.puppets.at(-1)!.targetX = x;
}
d.input({ id: "s02", name: "ليلى" }, "!say يا ليل يا عين");
await save("02-freeplay");
d.puppets[0].z = 0.4;
d.puppets[0].x = 420;
d.puppets[1].x = 1120;
d.puppets = d.puppets.slice(0, 2);
await save("03-depth");
d.hunt();
d.tick(4);
d.remaining = 38;
for (const [i, name] of ["Nour", "ليلى", "Youssef"].entries()) {
  d.input({ id: `a${i}`, name }, "!afreet");
  const a = d.afreets.at(-1)!;
  a.x = 430 + i * 500;
  a.y = 680 - i * 60;
}
d.lanterns[3] = false;
d.swats = 8;
await save("04-hunt");
d.finishHunt();
d.curtain = true;
await save("05-company");
console.log(
  "Wrote five SVG engine exports with synthetic rehearsal names; no browser or webcam capture.",
);
