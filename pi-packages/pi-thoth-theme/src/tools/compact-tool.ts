import type { Theme } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import type { ThemeConfig, ToolDensity } from '../shared/config.ts';
import { resolveExpandHint } from '../shared/expand-hint.ts';
import { createComponent } from './box.ts';
import { buildCompactRows, compactElapsed } from './compact-row.ts';
import { hasToolResult } from './frame.ts';
import type { ElapsedRenderContext } from './ticker.ts';

type CompactDensity = Exclude<ToolDensity, 'frame'>;

interface CompactContext extends ElapsedRenderContext {
  expanded?: boolean;
  state?: ElapsedRenderContext['state'] & {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
  };
}

export interface CompactParts {
  title: string;
  summary?: string;
  /** Dim tail parts after the elapsed time; omitted while running. */
  counts?: readonly (string | undefined)[];
  continuation?: string;
  errorLine?: string;
}

/** The collapsed density in effect, or undefined for frame and expanded cards. */
export function collapsedDensity(
  config: ThemeConfig,
  expanded: boolean | undefined,
): CompactDensity | undefined {
  const density = config.tools.collapsed ?? 'frame';
  return density !== 'frame' && !expanded ? density : undefined;
}

/** Call slot: the running row, empty once a result row replaces it. */
export function compactCall(
  density: CompactDensity,
  theme: Theme,
  context: CompactContext,
  config: ThemeConfig,
  parts: Pick<CompactParts, 'title' | 'summary'>,
): Component {
  const collapsed = createComponent((width: number) =>
    hasToolResult(context)
      ? []
      : buildCompactRows(
          theme,
          {
            density,
            state: 'running',
            mode: config.icons,
            ...parts,
            tail: [compactElapsed(context, 'running')],
            frame: context?.state?.animationFrame,
          },
          width,
        ),
  );
  if (context?.state) context.state.callComponent = collapsed;
  return collapsed;
}

/** Result slot rows; a partial result is running even with an error flag. */
export function compactResult(
  density: CompactDensity,
  theme: Theme,
  context: CompactContext & { isError?: boolean },
  config: ThemeConfig,
  isPartial: boolean,
  parts: CompactParts,
): Component {
  const state = isPartial ? 'running' : context?.isError ? 'error' : 'success';
  const { counts, ...rest } = parts;
  return createComponent((width: number) =>
    buildCompactRows(
      theme,
      {
        density,
        state,
        mode: config.icons,
        ...rest,
        tail: [
          compactElapsed({ ...context, isPartial }, state),
          ...(isPartial ? [] : (counts ?? [])),
        ],
        frame: context?.state?.animationFrame,
        expandHint: isPartial ? '' : resolveExpandHint(context),
      },
      width,
    ),
  );
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  );
}
