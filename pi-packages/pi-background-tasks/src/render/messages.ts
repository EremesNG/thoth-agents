import type { Component } from '@earendil-works/pi-tui';
import { getRenderKit, type ThothRenderKit } from '@thoth-agents/pi-core';
import {
  AUTOMATED_NOTIFICATION_MARKER,
  type CallbackDisplayDetails,
  type CallbackDisplayEntry,
} from '../shared-callback-batcher.js';
import {
  COLLAPSED_LINES,
  nativeRows,
  renderTheme,
  resolveExpandHint,
  themed,
} from './native.js';

export const COMPLETION_BATCH_TYPE = 'background-completion-batch';
export const TASK_FAILURE_TYPE = 'background-task-failure';

interface MessageLike {
  content?: unknown;
  details?: unknown;
}

const FAILED_STATUS =
  /(?:fail|orphan|lost|timed_out|timeout|unresolved|incomplete)/i;

/** Completion/failure cards with an unframed native summary when KIT is absent. */
export function renderBackgroundMessage(
  message: MessageLike,
  options: { expanded?: boolean } = {},
  theme?: unknown,
): Component {
  const expanded = options.expanded === true;
  const details = readDetails(message.details);
  const fullLines = contentText(message.content).split(/\r?\n/);
  if (fullLines[0] === AUTOMATED_NOTIFICATION_MARKER) fullLines.shift();
  const isError = details
    ? details.kind === 'failure' || details.entries.some(isFailed)
    : false;
  const title = details
    ? titleFor(details)
    : { name: 'background', summary: '' };
  return {
    invalidate() {},
    render(width) {
      const kit = getRenderKit();
      const t = renderTheme(theme);
      let lines = fullLines;
      if (details && !expanded) {
        const rows = details.entries.map((entry) =>
          entryLine(entry, theme, kit),
        );
        const extra = details.omitted + details.unlisted;
        if (extra > 0)
          rows.push(themed(theme, 'dim', `+${extra} more not shown`));
        const room = COLLAPSED_LINES - 1;
        if (kit) {
          lines = kit.collapse(t, rows, {
            budget: room,
            expandHint: resolveExpandHint(),
          });
          if (rows.length <= room)
            lines.push(themed(theme, 'dim', `(${resolveExpandHint()})`));
        } else {
          lines =
            rows.length > room
              ? [
                  ...rows.slice(0, room - 1),
                  themed(theme, 'dim', `+${rows.length - room + 1} more`),
                ]
              : rows;
          lines.push(themed(theme, 'dim', `(${resolveExpandHint()})`));
        }
      }
      const label = [title.name, title.summary].filter(Boolean).join(' ');
      if (kit) {
        const status = isError ? 'failed' : 'completed';
        const indicator = kit.indicator(t, undefined, { status });
        return kit.card(
          t,
          {
            title: label,
            body: lines,
            footer: indicator.text,
            status,
            isError,
            wrap: expanded,
          },
          width,
        );
      }
      return [
        ...nativeRows([label], width),
        ...nativeRows(lines, width, expanded),
      ];
    },
  };
}

function titleFor(details: CallbackDisplayDetails): {
  name: string;
  summary: string;
} {
  const count = details.entries.length + details.omitted + details.unlisted;
  if (details.kind === 'failure') {
    const entry = details.entries[0];
    return { name: 'background failure', summary: entry ? entry.label : '' };
  }
  const failed = details.entries.filter(isFailed).length;
  const noun = `${count} completion${count === 1 ? '' : 's'}`;
  return {
    name: 'background',
    summary: failed > 0 ? `${noun} · ${failed} failed` : `${noun} · done`,
  };
}

function isFailed(entry: CallbackDisplayEntry): boolean {
  return (
    (entry.incidents?.total ?? 0) > 0 ||
    FAILED_STATUS.test(`${entry.status} ${entry.outcome ?? ''}`)
  );
}

function entryLine(
  entry: CallbackDisplayEntry,
  theme: unknown,
  kit?: ThothRenderKit,
): string {
  const status =
    typeof entry.status === 'string'
      ? entry.status.replace(/;\s*\d+ incidents? needs? attention$/, '')
      : entry.status;
  const outcome = entry.outcome !== status ? entry.outcome : undefined;
  const parts = [entry.label || entry.id, status, outcome].filter(
    (part): part is string => Boolean(part),
  );
  if (entry.incidents)
    parts.push(
      `${entry.incidents.total} incident${entry.incidents.total === 1 ? '' : 's'}`,
    );
  const line = parts.join(' · ');
  const failed = isFailed(entry);
  if (kit) {
    const t = renderTheme(theme);
    return `${kit.statusGlyph(t, failed ? 'failed' : 'completed')} ${failed ? kit.fg(t, 'error', line) : line}`;
  }
  return failed ? themed(theme, 'error', line) : line;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part &&
        typeof part === 'object' &&
        typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .join('\n');
  }
  return '';
}

function readDetails(value: unknown): CallbackDisplayDetails | undefined {
  const d = value as Partial<CallbackDisplayDetails> | undefined;
  if (
    !d ||
    (d.kind !== 'batch' && d.kind !== 'failure') ||
    !Array.isArray(d.entries)
  )
    return undefined;
  const entries = d.entries.filter(
    (entry): entry is CallbackDisplayEntry =>
      !!entry && typeof entry === 'object' && typeof entry.id === 'string',
  );
  return {
    kind: d.kind,
    entries,
    omitted: Number(d.omitted) || 0,
    unlisted: Number(d.unlisted) || 0,
  };
}
