import { framedBody, framedTop, resolveExpandHint, themed } from "./frame.js";

interface LogDisplayDetails {
  kind: string;
  head: string;
  fullLineCount: number;
  compactLines: string[];
  foldedLineCount: number;
}

interface RenderContext {
  args?: Record<string, unknown>;
  isError?: boolean;
}

const SUMMARY_COMMAND_CELLS = 60;

/** Framed renderers shared by every background-task tool. */
export function framedToolRenderers(toolName: string) {
  return {
    renderShell: "self" as const,
    renderCall(args: unknown, theme: unknown, context?: RenderContext) {
      return framedTop(toolName, summarizeArgs(args), theme, context?.isError === true);
    },
    renderResult(result: unknown, options: unknown, theme: unknown, context?: RenderContext) {
      return renderBackgroundTaskLogDisplay(result, options, theme, context);
    },
  };
}

/** Call summary: action, id, name or command on one line. */
export function summarizeArgs(args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const command = typeof a.command === "string" ? a.command.replace(/\s+/g, " ").trim() : "";
  const parts = [a.action, a.id, a.name, command.length > SUMMARY_COMMAND_CELLS ? `${command.slice(0, SUMMARY_COMMAND_CELLS)}…` : command, a.all === true ? "all" : ""];
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" · ");
}

/** Framed result body: the compact log preview for log results, the text otherwise. */
export function renderBackgroundTaskLogDisplay(result: unknown, options: unknown = {}, theme: unknown = {}, context?: RenderContext) {
  const fullText = resultTextContent(result).split(/\r?\n/);
  const details = (result as { details?: LogDisplayDetails } | undefined)?.details;
  const expanded = (options as { expanded?: boolean } | undefined)?.expanded === true;
  const base = { expanded, theme, isError: context?.isError === true, context };
  if (details?.kind !== "background-task-log-display") {
    return framedBody({ ...base, lines: trimTrailingBlank(fullText) });
  }

  const meta = themed(theme, "dim", `${details.fullLineCount} lines`);
  const hint = resolveExpandHint(context);
  const folded = details.foldedLineCount > 0
    ? themed(theme, "dim", `Folded ${details.foldedLineCount} display lines (${hint}).`)
    : themed(theme, "dim", `Compact log (${hint} for full display).`);
  return framedBody({
    ...base,
    lines: [meta, details.head, "", themed(theme, "dim", "preview"), ...details.compactLines, folded],
    fullLines: [meta, themed(theme, "dim", "Full displayed log."), "", ...fullText],
    maxLines: Number.POSITIVE_INFINITY,
  });
}

function resultTextContent(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("\n");
  return String(result ?? "");
}

function trimTrailingBlank(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  return lines.slice(0, end);
}
