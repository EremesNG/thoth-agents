import type { Theme } from '@earendil-works/pi-coding-agent';
import {
  Box,
  type Component,
  Text,
  truncateToWidth,
} from '@earendil-works/pi-tui';
import {
  createKitRenderMemo,
  type RenderIndicatorContext,
  type RenderStatus,
  renderToolFooter,
  resolveIcon,
  resolveStatusGlyph,
  type ThothRenderKit,
} from '@thoth-agents/pi-core';
import { sanitizeTerminalText } from '../tool/sanitize.js';
import type {
  Task,
  TaskAction,
  TaskDetails,
  TaskMutationParams,
  TaskStatus,
} from '../tool/types.js';

export function formatStatusLabel(status: TaskStatus): string {
  return status === 'in_progress' ? 'in progress' : status;
}

// ---------------------------------------------------------------------------
// Status presentation tables — the single source of truth for glyph/color.
// ---------------------------------------------------------------------------

export const STATUS_GLYPH: Record<TaskStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
  deleted: '⊘',
};

/**
 * Color palette for the renderResult status echo. `deleted` uses `muted` so a
 * successful delete is visually distinct from the error branch (which uses
 * `error` + `✗`)..
 */
export const STATUS_COLOR: Record<
  TaskStatus,
  'dim' | 'warning' | 'success' | 'muted'
> = {
  pending: 'dim',
  in_progress: 'warning',
  completed: 'success',
  deleted: 'muted',
};

/**
 * Per-action prefix glyph for renderCall. `+` create, `→` update, `×` delete,
 * `›` get, `≣` list, `∅` clear..
 */
export const ACTION_GLYPH: Record<TaskAction, string> = {
  create: '+',
  update: '→',
  delete: '×',
  get: '›',
  // ☰ measures two cells in newer Unicode tables but one in older terminals.
  list: '≣',
  clear: '∅',
};

/**
 * Glyph for the persistent overlay's per-task row. Differs from `STATUS_GLYPH`
 * for `completed` (`✓` vs `●`) and `deleted` (`✗` vs `⊘`) because the
 * overlay caller never renders a `deleted` row but uses `✗` in its
 * error-toned palette..
 */
export function overlayStatusGlyph(status: TaskStatus, theme: Theme): string {
  switch (status) {
    case 'pending':
      return theme.fg('dim', resolveStatusGlyph(status, '○'));
    case 'in_progress':
      return theme.fg('warning', resolveStatusGlyph(status, '◐'));
    case 'completed':
      return theme.fg('success', resolveStatusGlyph(status, '✓'));
    case 'deleted':
      return theme.fg('error', resolveStatusGlyph(status, '✗'));
  }
}

/**
 * Format a single task row for the persistent overlay. The subject color
 * reflects task state while IDs and supporting metadata stay visually quiet.
 */
export function formatOverlayTaskLine(
  t: Task,
  theme: Theme,
  showId: boolean,
  kit?: ThothRenderKit,
): string {
  const glyph = kit
    ? kit.statusGlyph(theme, t.status)
    : overlayStatusGlyph(t.status, theme);
  const subjectColor =
    t.status === 'in_progress'
      ? 'accent'
      : t.status === 'completed' || t.status === 'deleted'
        ? 'muted'
        : 'text';
  let subject = theme.fg(subjectColor, sanitizeTerminalText(t.subject));
  if (t.status === 'completed' || t.status === 'deleted') {
    subject = theme.strikethrough(subject);
  }
  let line = `${glyph}`;
  if (showId) line += ` ${theme.fg('dim', `#${t.id}`)}`;
  line += ` ${subject}`;
  if (t.status === 'in_progress' && t.activeForm) {
    line += ` ${theme.fg('muted', `(${sanitizeTerminalText(t.activeForm)})`)}`;
  }
  if (t.blockedBy && t.blockedBy.length > 0) {
    line += ` ${theme.fg('muted', `⛓ ${t.blockedBy.map((id) => `#${id}`).join(',')}`)}`;
  }
  return line;
}

/**
 * Format a single task line for the `/todos` slash command (no glyph color,
 * indented bullet prefix). Pre-refactor `todo.ts:670-674`.
 */
export function formatCommandTaskLine(t: Task, glyph: string): string {
  const form =
    t.status === 'in_progress' && t.activeForm
      ? ` (${sanitizeTerminalText(t.activeForm)})`
      : '';
  const block = t.blockedBy?.length
    ? `    ⛓ ${t.blockedBy.map((id) => `#${id}`).join(',')}`
    : '';
  return `  ${glyph} #${t.id} ${sanitizeTerminalText(t.subject)}${form}${block}`;
}

// ---------------------------------------------------------------------------
// Tool render hooks — wrapped so `todo.ts` becomes a thin call-site.
// ---------------------------------------------------------------------------

const HAS_RESULT = 'todoHasResult';
const RESULT_ERROR = 'todoResultError';

/** SDK error flag or a tool-reported `details.error` (e.g. missing id). */
function effectiveError(context: RenderIndicatorContext | undefined): boolean {
  return Boolean(context?.isError || context?.state?.[RESULT_ERROR]);
}

function executionStatus(
  context: RenderIndicatorContext | undefined,
  isPartial: boolean,
): RenderStatus {
  if (!(context?.isPartial ?? isPartial)) {
    return effectiveError(context) ? 'failed' : 'completed';
  }
  return context?.executionStarted === false ? 'pending' : 'running';
}

/** Split the SDK's one Box across its stacked call/result renderer slots. */
function renderNative(
  text: string,
  theme: Theme,
  width: number,
  status: RenderStatus,
  part: 'full' | 'start' | 'end',
): string[] {
  const role =
    status === 'pending' || status === 'running'
      ? 'toolPendingBg'
      : status === 'failed'
        ? 'toolErrorBg'
        : 'toolSuccessBg';
  const bg = (line: string) => theme.bg(role, line);
  const box = new Box(1, part === 'full' ? 1 : 0, bg);
  box.addChild(new Text(text, 0, 0));
  const rows = box.render(width);
  if (part === 'full') return rows;
  const padding = bg(' '.repeat(Math.max(0, width)));
  return part === 'start' ? [padding, ...rows] : [...rows, padding];
}

const EXPAND_HINT = 'ctrl+o to expand';
const GLYPH_FALLBACK: Record<TaskStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '✓',
  deleted: '⊘',
};
const CHANGED_FIELDS = [
  'subject',
  'description',
  'activeForm',
  'owner',
  'metadata',
] as const;
const TRANSITION =
  /\((pending|in_progress|completed|deleted) → (pending|in_progress|completed|deleted)\)/;

type ResultLike = {
  content?: Array<{ type?: string; text?: string }>;
  details?: unknown;
};

function statusGlyph(status: TaskStatus, theme: Theme): string {
  return theme.fg(
    STATUS_COLOR[status],
    resolveStatusGlyph(status, GLYPH_FALLBACK[status]),
  );
}

function resultText(result: ResultLike): string {
  return (result.content ?? [])
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('\n')
    .trim();
}

function idLabel(id: number | undefined, theme: Theme): string {
  return id === undefined ? '' : theme.fg('dim', `#${id}`);
}

function join(parts: Array<string | undefined>): string {
  return parts.filter((part) => part).join(' ');
}

function separator(theme: Theme): string {
  return theme.fg('dim', resolveIcon('separator', '·'));
}

/** Call-phase body: the action plus the id/subject the caller supplied. */
function callSummary(
  args: TaskMutationParams & { action: TaskAction },
  theme: Theme,
): string {
  const action = theme.fg('muted', args.action);
  switch (args.action) {
    case 'create':
      return join([
        action,
        args.subject
          ? theme.fg('accent', sanitizeTerminalText(args.subject))
          : undefined,
      ]);
    case 'list':
      return join([
        action,
        args.status ? statusGlyph(args.status, theme) : undefined,
      ]);
    case 'clear':
      return action;
    default:
      return join([action, idLabel(args.id, theme)]);
  }
}

interface ResultView {
  summary: string;
  rows: string[];
}

function changedFields(params: TaskMutationParams): string[] {
  const fields: string[] = CHANGED_FIELDS.filter(
    (f) => params[f] !== undefined,
  );
  if (
    params.blockedBy !== undefined ||
    params.addBlockedBy !== undefined ||
    params.removeBlockedBy !== undefined
  )
    fields.push('blockedBy');
  return fields;
}

function listView(
  details: TaskDetails,
  params: TaskMutationParams,
  theme: Theme,
): ResultView {
  const tasks = details.tasks.filter(
    (t) =>
      (params.includeDeleted === true || t.status !== 'deleted') &&
      (params.status === undefined || t.status === params.status),
  );
  const action = theme.fg('muted', 'list');
  const rows = tasks.map((t) =>
    join([
      statusGlyph(t.status, theme),
      idLabel(t.id, theme),
      theme.fg('text', sanitizeTerminalText(t.subject)),
    ]),
  );
  if (params.status !== undefined) {
    return {
      summary: join([
        action,
        statusGlyph(params.status, theme),
        separator(theme),
        String(tasks.length),
      ]),
      rows,
    };
  }
  const order: TaskStatus[] = [
    'pending',
    'in_progress',
    'completed',
    'deleted',
  ];
  const counts = order
    .map((s) => [s, tasks.filter((t) => t.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${statusGlyph(s, theme)} ${n}`);
  return {
    summary: join([
      action,
      separator(theme),
      counts.length > 0 ? counts.join('  ') : theme.fg('muted', 'no tasks'),
    ]),
    rows,
  };
}

function resultView(
  result: ResultLike,
  details: TaskDetails,
  theme: Theme,
): ResultView {
  const params = (details.params ?? {}) as TaskMutationParams;
  const action = theme.fg('muted', details.action);
  const text = resultText(result);
  const task =
    details.action === 'create'
      ? (details.tasks.find((t) => t.id === details.nextId - 1) ??
        details.tasks[details.tasks.length - 1])
      : details.tasks.find((t) => t.id === params.id);
  const id = idLabel(task?.id ?? params.id, theme);
  const subject = task
    ? theme.fg('accent', sanitizeTerminalText(task.subject))
    : undefined;
  const glyph = task ? statusGlyph(task.status, theme) : undefined;
  switch (details.action) {
    case 'create':
    case 'get':
      return { summary: join([action, id, glyph, subject]), rows: [] };
    case 'delete':
      return { summary: join([action, id, subject]), rows: [] };
    case 'update': {
      const move = TRANSITION.exec(text);
      if (move) {
        return {
          summary: join([
            action,
            id,
            statusGlyph(move[1] as TaskStatus, theme),
            theme.fg('muted', resolveIcon('arrowRight', '→')),
            statusGlyph(move[2] as TaskStatus, theme),
            subject,
          ]),
          rows: [],
        };
      }
      const fields = changedFields(params);
      const note = text.startsWith('No change')
        ? theme.fg('muted', 'no change')
        : fields.length > 0
          ? theme.fg('muted', fields.join(', '))
          : undefined;
      return {
        summary: join([
          action,
          id,
          note ? undefined : glyph,
          subject,
          note ? separator(theme) : undefined,
          note,
        ]),
        rows: [],
      };
    }
    case 'list':
      return listView(details, params, theme);
    case 'clear': {
      const count = /^Cleared (\d+)/.exec(text)?.[1];
      return {
        summary: join([
          action,
          separator(theme),
          count === undefined ? undefined : `${count} removed`,
        ]),
        rows: [],
      };
    }
  }
}

/** Read kit availability inside render(), including for an already mounted row. */
export function renderTodoCall(
  args: TaskMutationParams & { action: TaskAction },
  theme: Theme,
  context?: RenderIndicatorContext,
): Component {
  const memo = createKitRenderMemo();
  return {
    render(width) {
      return memo.render(width, (kit) => {
        const hasResult = Boolean(context?.state?.[HAS_RESULT]);
        // Once the result slot owns the summary, the call slot keeps only the
        // title so the action is not printed twice.
        const text = hasResult ? '' : callSummary(args, theme);
        const status = executionStatus(context, true);
        // SDK constructs both slots before rendering either; renderResult marks
        // the shared state, so the first completed render has no duplicate padding.
        const part = hasResult ? 'start' : 'full';
        if (kit) {
          return kit.card(
            theme,
            {
              title: 'todo',
              body: (bodyWidth) =>
                text ? new Text(text, 0, 0).render(bodyWidth) : [],
              status,
              isSuccess:
                hasResult &&
                status === 'completed' &&
                context?.executionStarted !== false,
              context,
              footer: renderToolFooter(kit, theme, { status, context }),
              isError: effectiveError(context),
              part,
            },
            width,
          );
        }
        return renderNative(
          theme.fg('toolTitle', theme.bold('todo ')) + text,
          theme,
          width,
          status,
          part,
        );
      });
    },
    invalidate() {
      memo.invalidate();
    },
  };
}

/** One summary line; per-task rows (list) appear on expansion. */
export function renderTodoResult(
  result: ResultLike,
  theme: Theme,
  options: { isPartial?: boolean; expanded?: boolean } = {},
  context?: RenderIndicatorContext & { expanded?: boolean },
): Component {
  const details = result.details as TaskDetails | undefined;
  if (context?.state) {
    context.state[HAS_RESULT] = true;
    context.state[RESULT_ERROR] = Boolean(details?.error);
  }
  const memo = createKitRenderMemo();
  return {
    render(width) {
      return memo.render(width, (kit) => {
        const toolStatus = executionStatus(context, options.isPartial ?? false);
        const expanded = options.expanded ?? context?.expanded ?? false;
        const failed = toolStatus === 'failed' || Boolean(details?.error);
        const view: ResultView = failed
          ? {
              summary: theme.fg(
                'error',
                sanitizeTerminalText(
                  (details?.error ?? resultText(result)).split('\n')[0] ||
                    'error',
                ),
              ),
              rows: [],
            }
          : details
            ? resultView(result, details, theme)
            : {
                summary: theme.fg(
                  'success',
                  resolveStatusGlyph('completed', '✓'),
                ),
                rows: [],
              };
        const bodyRows = (bodyWidth: number): string[] => {
          const clip = (line: string) => truncateToWidth(line, bodyWidth, '…');
          const lines = [view.summary, ...view.rows].map(clip);
          if (kit) {
            return kit.collapse(theme, lines, {
              expanded,
              budget: 1,
              expandHint: EXPAND_HINT,
            });
          }
          if (expanded || view.rows.length === 0) return lines;
          return [lines[0], clip(theme.fg('muted', EXPAND_HINT))];
        };
        if (kit) {
          return kit.card(
            theme,
            {
              body: bodyRows,
              status: toolStatus,
              isSuccess:
                toolStatus === 'completed' &&
                context?.executionStarted !== false,
              context,
              footer: renderToolFooter(kit, theme, {
                status: toolStatus,
                context,
              }),
              isError: effectiveError(context),
              part: 'end',
            },
            width,
          );
        }
        return renderNative(
          bodyRows(Math.max(1, width - 2)).join('\n'),
          theme,
          width,
          toolStatus,
          'end',
        );
      });
    },
    invalidate() {
      memo.invalidate();
    },
  };
}
