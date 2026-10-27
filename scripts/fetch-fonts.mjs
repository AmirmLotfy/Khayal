import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const dir = new URL("../public/assets/fonts/", import.meta.url);
await mkdir(dir, { recursive: true });
const url =
  "https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=IBM+Plex+Mono&family=Readex+Pro&family=Young+Serif&display=swap";
async function fetchBytes(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
let css = (await fetchBytes(url)).toString();
const records = [];
for (const source of new Set(
  [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]),
)) {
  const data = await fetchBytes(source);
  const hash = createHash("sha256").update(data).digest("hex");
  const ext = new URL(source).pathname.split(".").pop();
  const file = `${hash}.${ext}`;
  await writeFile(new URL(file, dir), data);
  css = css.replaceAll(source, "/assets/fonts/" + file);
  records.push({ source, file, sha256: hash });
}
for (const name of ["arefruqaa", "ibmplexmono", "readexpro", "youngserif"]) {
  const source = `https://raw.githubusercontent.com/google/fonts/main/ofl/${name}/OFL.txt`;
  const data = await fetchBytes(source);
  await writeFile(new URL(name + "-OFL.txt", dir), data);
}
await writeFile(new URL("fonts.css", dir), css);
await writeFile(
  new URL("manifest.json", dir),
  JSON.stringify({ stylesheetSource: url, files: records }, null, 2) + "\n",
);
console.log(
  `Saved ${records.length} local font files and four license notices.`,
);
