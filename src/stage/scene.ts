import type { Director, Puppet } from "../show/director";
import { ink, palette as p } from "./palette";
import { puppetMarkup } from "./vectors";

export const WIDTH = 1920,
  HEIGHT = 1080;
export const escapeXml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export const textStyle = {
  fontFamily: "Readex Pro, sans-serif",
  mono: "IBM Plex Mono, monospace",
};
export type StageLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: number;
  align?: "left" | "center" | "right";
  mono?: boolean;
  spacing?: number;
  maxWidth?: number;
};

/** Canonical geometry shared by the live Pixi stage and vector rehearsal exports. */
export function backgroundMarkup() {
  const waves = Array.from({ length: 15 }, (_, i) => {
    const y = 758 + i * 17;
    return `<path d="M${80 + (i % 3) * 30} ${y}C510 ${y - 10} 920 ${y + 10} ${1830 - (i % 4) * 37} ${y - 2}" stroke="${ink(p.mist)}" stroke-opacity="${0.04 + (i % 4) * 0.012}" fill="none" stroke-width="1"/>`;
  }).join("");
  const stars = Array.from(
    { length: 45 },
    (_, i) =>
      `<circle cx="${120 + ((i * 431) % 1690)}" cy="${180 + ((i * 137) % 460)}" r="${i % 5 === 0 ? 1.6 : 0.8}" fill="${ink(p.mist)}" opacity="${i % 3 === 0 ? 0.44 : 0.2}"/>`,
  ).join("");
  const reeds = [42, 61, 88, 1810, 1836, 1861]
    .map(
      (x, i) =>
        `<path d="M${x} 972Q${x + (i % 2 ? 17 : -18)} 865 ${x + 8} ${795 + (i % 3) * 25}M${x + 1} 909Q${x - 27} 878 ${x - 16} 856M${x + 2} 934Q${x + 33} 887 ${x + 28} 862" stroke="${ink(p.water)}" stroke-width="2" fill="none"/>`,
    )
    .join("");
  return `<rect width="1920" height="1080" fill="${ink(p.night)}"/><path d="M0 784Q650 741 1920 779V1080H0Z" fill="${ink(p.deep)}"/><circle cx="1297" cy="405" r="254" fill="${ink(p.water)}" opacity=".35"/><circle cx="1297" cy="405" r="253" fill="none" stroke="${ink(p.mist)}" stroke-opacity=".17"/><circle cx="1297" cy="405" r="226" fill="none" stroke="${ink(p.mist)}" stroke-opacity=".035"/>${stars}${waves}${reeds}<path d="M72 988H1848" stroke="${ink(p.water)}" stroke-width="1"/><path d="M72 74H124" stroke="${ink(p.amber)}" stroke-width="2"/>`;
}
export function labels(d: Director, elapsed: number): StageLabel[] {
  const hunt = d.phase === "hunt" || d.phase === "countdown";
  const list: StageLabel[] = [
    {
      id: "mark",
      text: "KHAYAL / خيال",
      x: 72,
      y: 117,
      size: 36,
      color: p.ice,
      spacing: 3,
    },
    {
      id: "subtitle",
      text: "A SHADOW THEATRE, MADE TOGETHER",
      x: 75,
      y: 151,
      size: 12,
      color: p.mist,
      mono: true,
      spacing: 1.5,
    },
    {
      id: "source",
      text:
        d.source === "sim"
          ? "REHEARSAL / SIMULATED CHAT"
          : d.connection === "connected"
            ? "TWITCH CHAT / CONNECTED"
            : "TWITCH INPUT / UNAVAILABLE",
      x: 1848,
      y: 96,
      size: 14,
      color: d.source === "sim" ? p.amber : p.ice,
      mono: true,
      align: "right",
    },
    {
      id: "chapter",
      text: hunt
        ? "02 / GUARD THE LIGHT"
        : d.curtain
          ? "03 / THE COMPANY"
          : "01 / THE OPEN WATER",
      x: 1848,
      y: 128,
      size: 12,
      color: p.mist,
      mono: true,
      align: "right",
    },
    {
      id: "prompt",
      text: hunt
        ? "!afreet  /  !up  /  !down"
        : [
            "!cat  /  !camel  /  !goha  /  !boat  /  !croc",
            "!left  /  !right  /  !jump",
            "!closer  /  !far  /  !say hello",
          ][Math.floor(elapsed / 20) % 3],
      x: 72,
      y: 1026,
      size: 15,
      color: p.mist,
      mono: true,
    },
    {
      id: "company",
      text: `${String(hunt ? d.afreets.length : d.puppets.length).padStart(2, "0")} ON STAGE   /   ${String(hunt ? d.attackQueue.length : d.queue.length).padStart(2, "0")} WAITING`,
      x: 1848,
      y: 1026,
      size: 13,
      color: p.mist,
      mono: true,
      align: "right",
    },
  ];
  if (d.paused)
    list.push({
      id: "status",
      text: "THE SHOW IS PAUSED",
      x: 960,
      y: 194,
      size: 22,
      color: p.amber,
      align: "center",
      mono: true,
    });
  else if (hunt) {
    list.push({
      id: "timer",
      text:
        d.phase === "countdown"
          ? String(Math.max(0, Math.ceil(d.countdown)))
          : `00:${String(Math.ceil(d.remaining)).padStart(2, "0")}`,
      x: 960,
      y: 380,
      size: 72,
      color: p.ice,
      align: "center",
      mono: true,
    });
    list.push({
      id: "objective",
      text:
        d.phase === "countdown"
          ? "Guard the five lanterns."
          : `${d.lanterns.filter(Boolean).length} lights remain  ·  ${d.swats} shadows caught`,
      x: 960,
      y: 431,
      size: 21,
      color: p.mist,
      align: "center",
    });
  }
  const headline = d.curtain
    ? "Every shadow has a name."
    : d.phase === "result"
      ? d.result
      : !d.raised
        ? "The water is still. The company is waiting."
        : "";
  if (headline)
    list.push({
      id: "headline",
      text: headline,
      x: 960,
      y: d.curtain ? 448 : 472,
      size: d.curtain ? 52 : 36,
      color: p.ice,
      align: "center",
      maxWidth: 1420,
    });
  if (!d.raised && !d.curtain)
    list.push({
      id: "invitation",
      text: "Raise the lamp from the cue book to begin.",
      x: 960,
      y: 526,
      size: 19,
      color: p.mist,
      align: "center",
    });
  if (d.curtain) {
    list.push({
      id: "credits",
      text: [...d.cast.values()].slice(0, 9).join("   /   "),
      x: 960,
      y: 520,
      size: 22,
      color: p.mist,
      align: "center",
      maxWidth: 1500,
    });
    list.push({
      id: "farewell",
      text: `${d.cast.size} in the company. The full cast lives in the playbill.`,
      x: 960,
      y: 568,
      size: 16,
      color: p.amber,
      align: "center",
      mono: true,
    });
  }
  if (d.ceremony && !d.curtain)
    list.push({
      id: "ceremony",
      text:
        d.ceremony.kind === "follow"
          ? `The Mesaharati welcomes ${d.ceremony.name}`
          : `${d.ceremony.name} arrives with ${d.ceremony.count} in the caravan`,
      x: 960,
      y: 578,
      size: 25,
      color: p.amber,
      align: "center",
      maxWidth: 1500,
    });
  return list;
}
export function stagePuppets(d: Director, elapsed: number): Puppet[] {
  if (!d.raised || d.curtain) return [];
  const items = [
    ...(d.phase === "hunt" || d.phase === "countdown" ? d.afreets : d.puppets),
  ];
  if (d.ceremony)
    for (
      let i = 0;
      i <
      Math.min(
        8,
        d.ceremony.kind === "raid" ? Math.ceil(d.ceremony.count / 3) : 1,
      );
      i++
    )
      items.push({
        id: `event-${i}`,
        name: d.ceremony.name,
        kind: d.ceremony.kind === "raid" ? "camel" : "mesaharati",
        x: 100 + ((elapsed * 65 + i * 200) % 1720),
        y: 784,
        z: 0,
        born: i,
        activeAt: 0,
        vy: 0,
        target: 0,
      });
  return items.sort((a, b) => a.z - b.z);
}
export function puppetPose(a: Puppet, elapsed: number, steady = false) {
  const phase = a.id.split("").reduce((v, c) => v + c.charCodeAt(0), 0) * 0.37;
  return {
    x: a.x,
    y: a.y + (steady ? 0 : Math.sin(elapsed * 0.8 + phase) * 3),
    scale: 1 + 2.2 * a.z,
    angle: steady ? 0 : Math.sin(elapsed * 0.7 + phase) * 0.018,
    alpha: 1 - a.z * 0.2,
  };
}
export function lanternMarkup(i: number, on: boolean) {
  const x = 270 + i * 345,
    color = ink(on ? p.amber : p.water);
  return `<g><path d="M${x} 174V215" stroke="${ink(p.mist)}" stroke-width="1"/><path d="M${x - 21} 224L${x} 211L${x + 21} 224L${x + 15} 270L${x} 280L${x - 15} 270Z" fill="${color}"/><path d="M${x - 19} 225H${x + 19}M${x - 15} 267H${x + 15}M${x - 6} 226L${x - 4} 266M${x + 6} 226L${x + 4} 266M${x} 281V292" stroke="${ink(p.night)}" stroke-width="2"/><circle cx="${x}" cy="244" r="3" fill="${ink(p.ice)}" opacity="${on ? 0.8 : 0.1}"/></g>`;
}
export function stageSceneSvg(
  d: Director,
  elapsed = 0,
  exportTitle = "Khayal stage engine export",
) {
  const figures = stagePuppets(d, elapsed)
    .map((a) => {
      const pose = puppetPose(a, elapsed, d.steady);
      const name = escapeXml(a.name);
      return `<g transform="translate(${pose.x} ${pose.y}) rotate(${(pose.angle * 180) / Math.PI}) scale(${pose.scale})" opacity="${pose.alpha}"><path d="M0-50V180M-42-60L-72 154" stroke="${ink(p.mist)}" stroke-width="1" stroke-opacity=".48"/>${puppetMarkup(a.kind)}<rect x="-78" y="30" width="156" height="28" rx="3" fill="${ink(p.water)}"/><text x="0" y="49" text-anchor="middle" fill="${ink(p.ice)}" font-family="Readex Pro, sans-serif" font-size="14" textLength="${Math.min(140, Math.max(20, [...a.name].length * 8))}" lengthAdjust="spacingAndGlyphs">${name}</text>${d.captions && a.caption ? `<text x="0" y="-246" text-anchor="middle" font-family="Readex Pro, sans-serif" fill="${ink(p.ice)}" font-size="18">${escapeXml(a.caption)}</text>` : ""}</g>`;
    })
    .join("");
  const lamps =
    d.phase !== "free" && !d.curtain
      ? d.lanterns.map((on, i) => lanternMarkup(i, on)).join("")
      : "";
  const type = labels(d, elapsed)
    .map(
      (l) =>
        `<text x="${l.x}" y="${l.y}" fill="${ink(l.color)}" font-family="${l.mono ? textStyle.mono : textStyle.fontFamily}" font-size="${l.size}" letter-spacing="${l.spacing ?? 0}" text-anchor="${l.align === "center" ? "middle" : l.align === "right" ? "end" : "start"}">${escapeXml(l.text)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img"><title>${escapeXml(exportTitle)}</title><desc>Vector export of the Khayal stage engine using synthetic rehearsal participants. This is not a browser screenshot, camera capture, or live Twitch evidence. Original SVG cut-paper artwork, not generated or Meshy art.</desc>${backgroundMarkup()}${figures}${lamps}${type}</svg>`;
}
