import { keyText } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Collapsed result preview height, matching the pi-subagents tool frame. */
export const COLLAPSED_LINES = 8;

/** Minimum width that still fits `│ x │`; narrower widths drop the borders. */
const MIN_FRAME_WIDTH = 6;
const RESET = "\x1b[0m";

type ThemeLike = { fg?: (color: string, text: string) => string; bold?: (text: string) => string } | undefined;

export interface FrameComponent {
  render(width: number): string[];
  invalidate(): void;
}

export interface FramedBodyOptions {
  lines: string[];
  /** Full-detail lines shown when expanded; defaults to `lines`. */
  fullLines?: string[];
  expanded: boolean;
  theme?: unknown;
  isError?: boolean;
  /** Lines kept when collapsed; Infinity for bodies that are already a preview. */
  maxLines?: number;
  /** Render context, used to resolve the user's expand key. */
  context?: unknown;
}

export function resolveExpandHint(context?: unknown, action = "to expand"): string {
  const keys = (context as { keybindings?: { getKeys?: (id: string) => unknown } } | undefined)?.keybindings?.getKeys?.("app.tools.expand");
  const fromContext = Array.isArray(keys) ? keys.find((key) => typeof key === "string" && key.trim()) : keys;
  if (typeof fromContext === "string" && fromContext.trim()) return `${fromContext.trim()} ${action}`;
  try {
    const text = keyText("app.tools.expand");
    if (text.trim()) return `${text.trim()} ${action}`;
  } catch { /* keybindings are not initialized outside the TUI */ }
  return `ctrl+o ${action}`;
}

/** Top of a framed block: tool name plus a one-line argument summary. */
export function framedTop(title: string, summary: string, theme?: unknown, isError = false): FrameComponent {
  return {
    invalidate() { /* stateless */ },
    render(width) {
      const cells = Math.floor(width);
      if (!(cells > 0)) return [];
      const label = joinTitle(theme, title, oneLine(summary));
      if (cells < MIN_FRAME_WIDTH) return [truncateToWidth(label, cells, "…")];
      const border = painter(theme, isError);
      const inner = cells - 2;
      const text = ` ${truncateToWidth(label, Math.max(1, inner - 4), "…")} `;
      const rest = Math.max(0, inner - visibleWidth(text) - 1);
      return [`${border("╭─")}${text}${RESET}${border("─".repeat(rest))}${border("╮")}`];
    },
  };
}

/** Body rows and bottom border of a framed block, collapsed unless expanded. */
export function framedBody(options: FramedBodyOptions): FrameComponent {
  return {
    invalidate() { /* stateless */ },
    render(width) {
      const cells = Math.floor(width);
      if (!(cells > 0)) return [];
      const { lines, hidden } = visibleLines(options);
      const rows = hidden > 0 ? [...lines, hintLine(options, hidden)] : lines;
      if (cells < MIN_FRAME_WIDTH) return rows.map((row) => truncateToWidth(row, cells, "…"));
      const border = painter(options.theme, options.isError === true);
      const inner = cells - 4;
      const body = rows.flatMap((row) => (options.expanded ? wrapTextWithAnsi(row, inner) : [row]));
      return [
        ...body.map((row) => `${border("│")} ${pad(row, inner)}${RESET} ${border("│")}`),
        `${border("╰")}${border("─".repeat(cells - 2))}${border("╯")}`,
      ];
    },
  };
}

function visibleLines(options: FramedBodyOptions): { lines: string[]; hidden: number } {
  if (options.expanded) return { lines: options.fullLines ?? options.lines, hidden: 0 };
  const max = options.maxLines ?? COLLAPSED_LINES;
  const hidden = Math.max(0, options.lines.length - max);
  return { lines: hidden > 0 ? options.lines.slice(0, max) : options.lines, hidden };
}

function hintLine(options: FramedBodyOptions, hidden: number): string {
  const text = `… ${hidden} more line${hidden === 1 ? "" : "s"} (${resolveExpandHint(options.context)})`;
  return themed(options.theme, "dim", text);
}

function painter(theme: unknown, isError: boolean): (text: string) => string {
  return (text) => themed(theme, isError ? "error" : "accent", text);
}

function joinTitle(theme: unknown, title: string, summary: string): string {
  const t = theme as ThemeLike;
  const name = themed(theme, "toolTitle", typeof t?.bold === "function" ? t.bold(title) : title);
  return summary ? `${name} ${themed(theme, "muted", summary)}` : name;
}

export function themed(theme: unknown, color: string, text: string): string {
  const t = theme as ThemeLike;
  return typeof t?.fg === "function" ? t.fg(color, text) : text;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function pad(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "…");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
