import type {
  CodemodeToolDetails,
  ToolRenderers,
} from '@earendil-works/pi-coding-agent';
import {
  createKitRenderMemo,
  formatDuration,
  type RenderStatus,
  renderToolFooter,
} from '@thoth-agents/pi-core';
import { createRenderKit } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { escapeControlCharacters, getResultText } from './box.ts';

const COLLAPSED_CALLS = 8;
const RESULT_PRESENT = 'codemodeResultPresent';
const RESULT_BORDER = 'codemodeResultBorder';
const CALL_COMPONENT = 'codemodeCallComponent';
const CALL_STATUS: Record<
  CodemodeToolDetails['calls'][number]['status'],
  RenderStatus
> = {
  running: 'running',
  ok: 'completed',
  error: 'failed',
  cancelled: 'cancelled',
};
type DisplayCall = Pick<
  CodemodeToolDetails['calls'][number],
  'name' | 'status' | 'durationMs' | 'error'
>;

function displayLines(text: string): string[] {
  return text.split('\n').map(escapeControlCharacters);
}

function scriptText(args: unknown): string {
  return args &&
    typeof args === 'object' &&
    'code' in args &&
    typeof args.code === 'string'
    ? args.code
    : '(script unavailable)';
}

/** Details are optional on old transcripts and can come from foreign tools. */
function displayCalls(details: unknown): DisplayCall[] {
  if (
    !details ||
    typeof details !== 'object' ||
    !('calls' in details) ||
    !Array.isArray(details.calls)
  )
    return [];
  return details.calls.flatMap((call: unknown) => {
    if (
      !call ||
      typeof call !== 'object' ||
      !('name' in call) ||
      typeof call.name !== 'string' ||
      !('status' in call) ||
      (call.status !== 'running' &&
        call.status !== 'ok' &&
        call.status !== 'error' &&
        call.status !== 'cancelled')
    )
      return [];
    return [
      {
        name: call.name,
        status: call.status,
        durationMs:
          'durationMs' in call &&
          typeof call.durationMs === 'number' &&
          Number.isFinite(call.durationMs) &&
          call.durationMs >= 0
            ? call.durationMs
            : undefined,
        error:
          'error' in call && typeof call.error === 'string'
            ? call.error
            : undefined,
      },
    ];
  });
}

/** Presentation only: Pi retains codemode's execution, schema and exposure. */
export function createCodemodeRenderer(config: ThemeConfig): ToolRenderers {
  // Replay can render before session_start has published the shared kit.
  const fallbackKit = createRenderKit({}, undefined, config.icons);
  return {
    renderShell: 'self',
    renderCall(_args, theme, context) {
      if (context?.state) {
        context.state[RESULT_PRESENT] = false;
        context.state[RESULT_BORDER] = undefined;
      }
      const memo = createKitRenderMemo();
      const component = {
        invalidate: () => memo.invalidate(),
        render(width: number) {
          return memo.render(width, (registeredKit) => {
            const kit = registeredKit ?? fallbackKit;
            const hasResult = context?.state?.[RESULT_PRESENT] === true;
            const status = context?.executionStarted ? 'running' : 'pending';
            return kit.card(
              theme,
              {
                title: theme.fg('toolTitle', 'codemode'),
                footer: hasResult
                  ? ''
                  : renderToolFooter(kit, theme, { status, context }),
                part: hasResult ? 'start' : 'full',
                ...context?.state?.[RESULT_BORDER],
              },
              width,
            );
          });
        },
      };
      if (context?.state) context.state[CALL_COMPONENT] = component;
      return component;
    },
    renderResult(result, options, theme, context) {
      const status = options.isPartial
        ? 'running'
        : context?.isError
          ? 'failed'
          : 'completed';
      const border = {
        isError: status === 'failed',
        isSuccess:
          status === 'completed' && context?.executionStarted !== false,
      };
      if (context?.state) {
        context.state[RESULT_PRESENT] = true;
        // Result contexts can be new snapshots; share the tone with the header.
        context.state[RESULT_BORDER] = border;
        context.state[CALL_COMPONENT]?.invalidate?.();
      }
      const calls = displayCalls(result.details);
      const visibleCalls = options.expanded
        ? calls
        : calls.slice(0, COLLAPSED_CALLS);
      const output = displayLines(getResultText(result) || '(no output)');
      const errors = calls.flatMap((call) =>
        call.error
          ? displayLines(`${call.name}: ${call.error}`).map((line) =>
              theme.fg('error', line),
            )
          : [],
      );
      const memo = createKitRenderMemo();
      return {
        invalidate: () => memo.invalidate(),
        render(width) {
          return memo.render(width, (registeredKit) => {
            const kit = registeredKit ?? fallbackKit;
            return kit.card(
              theme,
              {
                part: context?.state?.[CALL_COMPONENT] ? 'end' : 'full',
                title: theme.fg('toolTitle', 'codemode'),
                body: (bodyWidth) => {
                  if (calls.length === 0) {
                    return options.expanded
                      ? []
                      : kit.collapse(theme, output, options);
                  }
                  const rows = visibleCalls.map((call, i) => {
                    const duration =
                      call.durationMs === undefined
                        ? ''
                        : ` · ${formatDuration(call.durationMs)}`;
                    return kit.treeRow(
                      theme,
                      {
                        text: `${kit.statusGlyph(theme, CALL_STATUS[call.status])} ${escapeControlCharacters(call.name)}${duration}`,
                        last: i === visibleCalls.length - 1,
                      },
                      bodyWidth,
                    );
                  });
                  if (!options.expanded && calls.length > COLLAPSED_CALLS) {
                    rows.push(
                      theme.fg(
                        'dim',
                        `+${calls.length - COLLAPSED_CALLS} more · ctrl+o to expand`,
                      ),
                    );
                  }
                  return rows;
                },
                sections: options.expanded
                  ? [
                      {
                        title: 'Script',
                        rows: displayLines(scriptText(context?.args)),
                      },
                      { title: 'Output', rows: output },
                      ...(errors.length
                        ? [{ title: 'Errors', rows: errors }]
                        : []),
                    ]
                  : undefined,
                wrap: options.expanded,
                footer: renderToolFooter(kit, theme, { status, context }),
                ...border,
              },
              width,
            );
          });
        },
      };
    },
  };
}
