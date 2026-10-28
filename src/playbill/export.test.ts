import { describe, expect, it } from "vitest";
import { layoutPlaybill, wrapPlaybillName } from "./export";

const graphemes = (text: string) => Array.from(
  new Intl.Segmenter("ar", { granularity: "grapheme" }).segment(text),
  ({ segment }) => segment,
);
// Deterministic width fixture; actual exports measure the loaded 25px canvas font.
const measure = (text: string) => graphemes(text).length * 13;

describe("readable playbill names", () => {
  it("wraps long Arabic at intact grapheme boundaries without losing whitespace or marks", () => {
    const name = "سَلْمَى راويةُ حكاياتِ خيال وحارسةُ القناديلِ في ليلِ القاهرةِ الطويل";
    const lines = wrapPlaybillName(name, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(name);
    expect(lines.every((line) => measure(line) <= 420)).toBe(true);
    // The concatenated line graphemes must match the source, including diacritics.
    expect(lines.flatMap(graphemes)).toEqual(graphemes(name));
    expect(lines[0].endsWith(" ")).toBe(true);
  });

  it("preserves every cast entry across wrapped rows and names longer than a page", () => {
    const names = Array.from({ length: 50 }, (_, index) => `Company ${index}`);
    names[2] = "سَلْمَى ".repeat(220);
    names[3] = "Same name";
    names[4] = "Same name";
    names[49] = "آخرُ الحارساتِ وأطولُ أسماءِ الشركةِ في هذه الليلةِ الجميلة";
    const pages = layoutPlaybill(names, measure);
    expect(pages.length).toBeGreaterThan(2);
    const recovered = names.map(() => "");
    const pagesForLongName = new Set<number>();
    pages.forEach((page, pageIndex) => {
      let previousEnd = 0;
      for (const row of page.rows) {
        expect(row.line).toBeGreaterThanOrEqual(previousEnd);
        const height = Math.max(...row.columns.map((column) => column.lines.length));
        previousEnd = row.line + height;
        expect(previousEnd).toBeLessThanOrEqual(24);
        for (const column of row.columns) {
          recovered[column.nameIndex] += column.lines.join("");
          expect(column.lines.every((line) => measure(line) <= 420)).toBe(true);
          expect(column.column).toBe(column.nameIndex % 2);
          if (column.nameIndex === 2) pagesForLongName.add(pageIndex);
        }
      }
    });
    expect(pagesForLongName.size).toBeGreaterThan(1);
    expect(recovered).toEqual(names);
  });
});
