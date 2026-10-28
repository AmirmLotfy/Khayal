const escapeText = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export interface PlaybillPage {
  page: number;
  total: number;
  filename: string;
  url: string;
}

type MeasureText = (text: string) => number;
interface PlaybillColumn {
  nameIndex: number;
  column: number;
  lines: string[];
}
interface PlaybillRow {
  /** Line offset within the body; each line gets 31px at a readable 25px font. */
  line: number;
  columns: PlaybillColumn[];
}
export interface PlaybillLayoutPage {
  rows: PlaybillRow[];
}

/** Preserve every character, preferring word boundaries without splitting graphemes. */
export function wrapPlaybillName(
  name: string,
  measure: MeasureText,
  maxWidth = 420,
): string[] {
  const lines: string[] = [];
  let line = "";
  let wordBreak = 0;
  for (const { segment } of new Intl.Segmenter("ar", {
    granularity: "grapheme",
  }).segment(name)) {
    if (measure(segment) > maxWidth)
      throw new Error("A name character exceeds the playbill column width.");
    while (line && measure(line + segment) > maxWidth) {
      const end = wordBreak || line.length;
      lines.push(line.slice(0, end));
      line = line.slice(end);
      wordBreak = 0;
    }
    line += segment;
    if (/^\s+$/u.test(segment)) wordBreak = line.length;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

/** Pack whole two-column rows, continuing exceptionally long names on later pages. */
export function layoutPlaybill(
  names: string[],
  measure: MeasureText,
): PlaybillLayoutPage[] {
  const capacity = 24;
  const pages: PlaybillLayoutPage[] = [{ rows: [] }];
  let used = 0;
  const append = (columns: PlaybillColumn[], height: number) => {
    if (used + height > capacity) {
      pages.push({ rows: [] });
      used = 0;
    }
    pages.at(-1)!.rows.push({ line: used, columns });
    used += height;
  };
  for (let index = 0; index < names.length; index += 2) {
    const columns = names.slice(index, index + 2).map((name, column) => ({
      nameIndex: index + column,
      column,
      lines: wrapPlaybillName(name, measure),
    }));
    const height = Math.max(...columns.map((column) => column.lines.length));
    if (height <= capacity) {
      append(columns, height);
      continue;
    }
    // Never cap a name's line count. Preserve its original column when it spans pages.
    if (used > 0) {
      pages.push({ rows: [] });
      used = 0;
    }
    for (let offset = 0; offset < height; offset += capacity)
      append(
        columns.map((column) => ({
          ...column,
          lines: column.lines.slice(offset, offset + capacity),
        })).filter((column) => column.lines.length > 0),
        Math.min(capacity, height - offset),
      );
  }
  return pages;
}

/** The caller owns these URLs and must revoke them on replacement or teardown. */
export async function exportPlaybill(
  names: string[],
  channel: string,
): Promise<PlaybillPage[]> {
  await document.fonts.ready;
  const measurement = document.createElement("canvas").getContext("2d")!;
  measurement.font = "25px Readex Pro";
  const layout = layoutPlaybill(names, (text) => measurement.measureText(text).width);
  const pages = layout.length;
  const rendered: PlaybillPage[] = [];
  try {
    for (let page = 0; page < pages; page++) {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#07182E";
      c.fillRect(0, 0, 1080, 1350);
      c.strokeStyle = "#8DB5C3";
      c.lineWidth = 3;
      c.strokeRect(45, 45, 990, 1260);
      c.fillStyle = "#8DB5C3";
      c.textAlign = "center";
      c.font = "72px Readex Pro";
      c.fillText("خيال · KHAYAL", 540, 170);
      c.font = "18px IBM Plex Mono";
      c.fillText("THE NIGHT’S COMPANY", 540, 230);
      c.fillStyle = "#DAF0EF";
      c.font = "18px Readex Pro";
      c.fillText(
        channel +
          " · " +
          new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" }),
        540,
        280,
      );
      c.textAlign = "start";
      c.font = "25px Readex Pro";
      for (const row of layout[page].rows)
        for (const column of row.columns) {
          const rtl = /[\u0600-\u06ff]/.test(names[column.nameIndex]);
          c.direction = rtl ? "rtl" : "ltr";
          c.textAlign = rtl ? "right" : "left";
          const x = 85 + column.column * 485;
          column.lines.forEach((line, index) => {
            // No maxWidth argument: that silently squeezed long names horizontally.
            c.fillText(line, rtl ? x + 420 : x, 360 + (row.line + index) * 31);
          });
        }
      c.direction = "ltr";
      c.textAlign = "center";
      c.font = "24px Readex Pro";
      c.fillText("Come back tomorrow. There is more to see.", 540, 1190);
      c.font = "16px IBM Plex Mono";
      c.fillText(
        `${names.length} cast members · Playbill ${page + 1} of ${pages}`,
        540,
        1250,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => blob
          ? resolve(blob)
          : reject(new Error(`Unable to render playbill page ${page + 1}.`)), "image/png"),
      );
      rendered.push({
        page: page + 1,
        total: pages,
        filename: `khayal-playbill-${page + 1}.png`,
        url: URL.createObjectURL(blob),
      });
    }
    return rendered;
  } catch (error) {
    for (const page of rendered) URL.revokeObjectURL(page.url);
    throw error;
  }
}
export { escapeText };
