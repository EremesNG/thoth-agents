import { Box } from '@earendil-works/pi-tui';
import {
  getRenderKit,
  type RenderIndicatorContext,
  type RenderStatus,
} from '@thoth-agents/pi-core';
import {
  frameBox,
  themeBg,
  themeFg,
  truncateToWidth,
} from '../completion-message.js';
import { taskFromDetails } from '../result-details.js';
import { wrapLineToWidth } from '../text-width.js';

const TERMINAL_ESCAPE_RE =
  /\u001b\][^\u001b\u0007]*(?:\u001b\\|\u0007)|\u001b\[[0-?]*[ -/]*[@-~]/g;
const TERMINAL_ESCAPE_AT_START_RE =
  /^(?:\u001b\][^\u001b\u0007]*(?:\u001b\\|\u0007)|\u001b\[[0-?]*[ -/]*[@-~])/;

function visibleTextWidth(text: string): number {
  return [...text.replace(TERMINAL_ESCAPE_RE, '')].length;
}

function truncateStyledLine(text: string, width: number): string {
  if (width <= 0) return '';
  if (visibleTextWidth(text) <= width) return text;
  const maxTextWidth = Math.max(0, width - 1);
  let out = '';
  let used = 0;
  let index = 0;
  while (index < text.length && used < maxTextWidth) {
    const rest = text.slice(index);
    const terminalEscape = rest.match(TERMINAL_ESCAPE_AT_START_RE)?.[0];
    if (terminalEscape) {
      out += terminalEscape;
      index += terminalEscape.length;
      continue;
    }
    const char = [...rest][0];
    if (!char) break;
    out += char;
    index += char.length;
    used++;
  }
  return `${out}…\u001b[0m`;
}

export function emptyComponent() {
  return {
    invalidate() {},
    render(_width?: number): string[] {
      return [];
    },
  };
}

export function textComponent(text: string) {
  return {
    invalidate() {},
    render(width: number): string[] {
      if (!text) return [];
      return text.split('\n').map((line) => truncateStyledLine(line, width));
    },
  };
}

export function wrappedTextComponent(text: string) {
  return {
    invalidate() {},
    render(width: number) {
      return text.split('\n').flatMap((line) => wrapLineToWidth(line, width));
    },
  };
}

export interface BoxedComponentOptions {
  title?: string;
  theme?: any;
  wrapped?: boolean;
  onClick?: () => void;
  status?: RenderStatus;
  context?: RenderIndicatorContext;
  message?: boolean;
  /** Index of the generated progress row, never a user response row. */
  workingRow?: number;
}

export function boxedComponent(
  linesOrText: string | string[],
  options?: BoxedComponentOptions,
) {
  return {
    invalidate() {},
    handleMouse(event: any) {
      if (
        options?.onClick &&
        (event?.type === 'click' ||
          (!event?.type &&
            (event?.button === 'left' || event?.button === undefined)))
      ) {
        options.onClick();
        return { handled: true };
      }
      return undefined;
    },
    render(width: number): string[] {
      const theme = options?.theme;
      const kit = getRenderKit();
      const rawLines = Array.isArray(linesOrText)
        ? linesOrText.flatMap((line) => line.split('\n'))
        : linesOrText.split('\n');
      const safeWidth = Math.max(1, Math.floor(width || 1));
      const status =
        options?.status ??
        (options?.context?.isPartial
          ? 'running'
          : options?.context?.isError
            ? 'failed'
            : 'completed');
      const indicator = kit?.indicator(theme, options?.context, { status });
      // Working glyphs are theme-owned whenever a KIT is available.
      const workingGlyph = (text: string) =>
        indicator && status === 'running'
          ? text.replace(
              /^((?:\u001b\[[0-9;]*m)*)[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u,
              (_match, style) => `${style}${indicator.glyph}`,
            )
          : text;
      const title = workingGlyph(options?.title ?? '');
      const rows = (contentWidth: number) =>
        rawLines.flatMap((line, index) => {
          const text =
            index === options?.workingRow ? workingGlyph(line) : line;
          return options?.wrapped
            ? wrapLineToWidth(text, contentWidth)
            : [truncateToWidth(text, contentWidth, '…')];
        });
      if (kit)
        return kit.card(
          theme,
          {
            title,
            body: rows,
            status: options?.message ? undefined : status,
            isError: options?.context?.isError,
            wrap: options?.wrapped,
          },
          safeWidth,
        );
      if (options?.message)
        return frameBox(
          title,
          safeWidth < 10 ? rawLines : rows(safeWidth - 4),
          safeWidth,
          {
            borderFn: (text) => themeFg(theme, 'accent', text),
          },
        );
      const role = options?.context?.isPartial
        ? 'toolPendingBg'
        : options?.context?.isError
          ? 'toolErrorBg'
          : 'toolSuccessBg';
      // Calls are intentionally empty: the result owns the full SDK-equivalent shell.
      const box = new Box(1, 1, (text) => themeBg(theme, role, text));
      box.addChild({
        invalidate() {},
        render(contentWidth: number) {
          return [
            ...(title ? [truncateToWidth(title, contentWidth, '…')] : []),
            ...rows(contentWidth),
          ];
        },
      });
      return box.render(safeWidth);
    },
  };
}

/** The SDK strips result.isError; the render context is authoritative when present. */
export function toolRenderState(result: any, options: any, context?: any) {
  const task = taskFromDetails(result);
  const isError = context?.isError ?? Boolean(result?.isError);
  const isPartial = context?.isPartial ?? Boolean(options?.isPartial);
  return {
    context: { ...context, isError, isPartial },
    status: renderStatus(
      task?.status ??
        (isPartial ? 'running' : isError ? 'failed' : 'completed'),
    ),
  };
}

function renderStatus(status: string): RenderStatus {
  const statuses: RenderStatus[] = [
    'pending',
    'queued',
    'in_progress',
    'running',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
    'stopping',
    'deleted',
    'blocked',
    'unknown',
  ];
  return statuses.includes(status as RenderStatus)
    ? (status as RenderStatus)
    : 'unknown';
}
