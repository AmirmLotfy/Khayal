import { readFile, writeFile } from "node:fs/promises";
const script = await readFile(
  new URL("../submission/voiceover-script.md", import.meta.url),
  "utf8",
);
const takes = [...script.matchAll(/^> (.+)$/gm)].map((m) => m[1]);
const windows = [
  [6, 22],
  [22, 38],
  [38, 55],
  [55, 78],
  [78, 95],
  [95, 110],
  [110, 135],
  [135, 150],
];
if (takes.length !== 8) throw new Error("Expected eight narrated takes");
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
let index = 0,
  output = "";
for (let i = 0; i < takes.length; i++) {
  const words = takes[i].split(/\s+/),
    chunks = [];
  for (let j = 0; j < words.length; j += 10)
    chunks.push(words.slice(j, j + 10).join(" "));
  const [start, end] = windows[i];
  for (let j = 0; j < chunks.length; j++) {
    const text = chunks[j],
      middle = text.lastIndexOf(" ", Math.ceil(text.length / 2));
    const lines =
      text.length > 45
        ? text.slice(0, middle) + "\n" + text.slice(middle + 1)
        : text;
    output += `${++index}\n${stamp(start + ((end - start) * j) / chunks.length)} --> ${stamp(start + ((end - start) * (j + 1)) / chunks.length)}\n${lines}\n\n`;
  }
}
await writeFile(
  new URL("../submission/video/captions.srt", import.meta.url),
  output.trimEnd()+"\n",
);
console.log(
  "Draft captions prepared. Align to the actual owner voice before final rendering.",
);
