import type { CallbackDisplayDetails, CallbackDisplayEntry } from "../shared-callback-batcher.js";
import { COLLAPSED_LINES, framedBody, framedTop, resolveExpandHint, themed } from "./frame.js";
import type { FrameComponent } from "./frame.js";

export const COMPLETION_BATCH_TYPE = "background-completion-batch";
export const TASK_FAILURE_TYPE = "background-task-failure";

interface MessageLike {
  content?: unknown;
  details?: unknown;
}

const FAILED_STATUS = /(?:fail|orphan|lost|timed_out|timeout|unresolved|incomplete)/i;

/** Framed renderer for background completion and failure notifications. */
export function renderBackgroundMessage(message: MessageLike, options: { expanded?: boolean } = {}, theme?: unknown): FrameComponent {
  const expanded = options.expanded === true;
  const details = readDetails(message.details);
  const text = contentText(message.content);
  const fullLines = text.split(/\r?\n/);
  const isError = details ? details.kind === "failure" || details.entries.some(isFailed) : false;
  const title = details ? titleFor(details) : { name: "background", summary: "" };
  const top = framedTop(title.name, title.summary, theme, isError);

  let lines = fullLines;
  if (details) {
    const rows = details.entries.map((entry) => entryLine(entry, theme));
    const extra = details.omitted + details.unlisted;
    if (extra > 0) rows.push(themed(theme, "dim", `+${extra} more not shown`));
    const room = COLLAPSED_LINES - 1;
    lines = rows.length > room ? [...rows.slice(0, room - 1), themed(theme, "dim", `+${rows.length - room + 1} more`)] : rows;
    lines.push(themed(theme, "dim", `(${resolveExpandHint()})`));
  }
  const body = framedBody({ expanded, theme, isError, lines, fullLines, maxLines: Number.POSITIVE_INFINITY });
  return {
    invalidate() { top.invalidate(); body.invalidate(); },
    render(width) { return [...top.render(width), ...body.render(width)]; },
  };
}

function titleFor(details: CallbackDisplayDetails): { name: string; summary: string } {
  const count = details.entries.length + details.omitted + details.unlisted;
  if (details.kind === "failure") {
    const entry = details.entries[0];
    return { name: "background failure", summary: entry ? entry.label : "" };
  }
  const failed = details.entries.filter(isFailed).length;
  const noun = `${count} completion${count === 1 ? "" : "s"}`;
  return { name: "background", summary: failed > 0 ? `${noun} · ${failed} failed` : `${noun} · done` };
}

function isFailed(entry: CallbackDisplayEntry): boolean {
  return (entry.incidents?.total ?? 0) > 0 || FAILED_STATUS.test(`${entry.status} ${entry.outcome ?? ""}`);
}

function entryLine(entry: CallbackDisplayEntry, theme: unknown): string {
  const parts = [entry.label || entry.id, entry.status, entry.outcome].filter((part): part is string => Boolean(part));
  if (entry.incidents) parts.push(`${entry.incidents.total} incident${entry.incidents.total === 1 ? "" : "s"}`);
  const line = parts.join(" · ");
  return isFailed(entry) ? themed(theme, "error", line) : line;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")).join("\n");
  }
  return "";
}

function readDetails(value: unknown): CallbackDisplayDetails | undefined {
  const d = value as Partial<CallbackDisplayDetails> | undefined;
  if (!d || (d.kind !== "batch" && d.kind !== "failure") || !Array.isArray(d.entries)) return undefined;
  const entries = d.entries.filter((entry): entry is CallbackDisplayEntry => !!entry && typeof entry === "object" && typeof entry.id === "string");
  return { kind: d.kind, entries, omitted: Number(d.omitted) || 0, unlisted: Number(d.unlisted) || 0 };
}
