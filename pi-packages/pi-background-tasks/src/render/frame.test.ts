import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { framedBody, framedTop, resolveExpandHint } from "./frame.js";

const CODES: Record<string, number> = { error: 31, accent: 36 };
const theme = { fg: (color: string, text: string) => `[${CODES[color] ?? 90}m${text}[0m`, bold: (text: string) => text };

function widths(lines: string[]): number[] {
  return lines.map((line) => visibleWidth(line));
}

describe("frame helpers", () => {
  it("renders nothing at width 0", () => {
    expect(framedTop("bg_task", "list", theme).render(0)).toEqual([]);
    expect(framedBody({ lines: ["a"], expanded: false, theme }).render(0)).toEqual([]);
  });

  it("keeps every line within the width, including ANSI and CJK content", () => {
    const body = framedBody({ lines: ["\x1b[31mred\x1b[0m ".repeat(20), "日本語日本語日本語日本語日本語"], expanded: false, theme });
    for (const width of [1, 2, 3, 4, 10, 40, 80]) {
      for (const line of [...framedTop("bg_task", "status · bg_x", theme).render(width), ...body.render(width)]) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("draws equal-width rows with top and bottom borders", () => {
    const top = framedTop("bg_task_list", "all", theme).render(40);
    const body = framedBody({ lines: ["日本語", "plain"], expanded: false, theme }).render(40);
    expect(top).toHaveLength(1);
    expect(top[0]).toContain("╭");
    expect(body.at(-1)).toContain("╰");
    expect(new Set(widths([...top, ...body]))).toEqual(new Set([40]));
  });

  it("collapses to eight lines with the expand hint and shows all when expanded", () => {
    const lines = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`);
    const collapsed = framedBody({ lines, expanded: false, theme }).render(60).join("\n");
    expect(collapsed).toContain("line-8");
    expect(collapsed).not.toContain("line-9");
    expect(collapsed).toContain("4 more lines");
    expect(collapsed).toContain("ctrl+o to expand");
    const expanded = framedBody({ lines, expanded: true, theme }).render(60).join("\n");
    expect(expanded).toContain("line-12");
    expect(expanded).not.toContain("to expand");
  });

  it("wraps long lines when expanded instead of truncating", () => {
    const rendered = framedBody({ lines: ["word ".repeat(30)], expanded: true, theme }).render(30);
    expect(rendered.length).toBeGreaterThan(3);
    for (const line of rendered) expect(visibleWidth(line)).toBe(30);
  });

  it("colors borders with error styling", () => {
    expect(framedTop("bg_task", "", theme, true).render(40)[0]).toContain("[31m");
    expect(framedBody({ lines: ["x"], expanded: false, theme, isError: true }).render(40).join("")).toContain("[31m");
  });

  it("resolves the expand key from the context, then falls back to ctrl+o", () => {
    expect(resolveExpandHint({ keybindings: { getKeys: () => ["ctrl+e"] } })).toBe("ctrl+e to expand");
    expect(resolveExpandHint({})).toMatch(/ to expand$/);
  });
});
