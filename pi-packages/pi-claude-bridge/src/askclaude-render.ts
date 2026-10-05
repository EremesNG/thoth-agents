import {
  keyHint,
  type Theme,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  Box,
  type Component,
  Text,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import {
  formatDuration,
  getRenderKit,
  type ThothRenderKit,
} from '@thoth-agents/pi-core';
import {
  type AskClaudeDefaults,
  askClaudeCallTags,
  type buildAskClaudeParams,
} from './askclaude-schema.js';

const PREVIEW_MAX_CHARS = 1000;
const PREVIEW_MAX_LINES = 6;

type AskClaudeRenderers = Pick<
  ToolDefinition<ReturnType<typeof buildAskClaudeParams>>,
  'renderShell' | 'renderCall' | 'renderResult'
>;
type AskClaudeRenderContext = Parameters<
  NonNullable<AskClaudeRenderers['renderCall']>
>[2];
interface RenderState {
  hasResult: boolean;
  isPartial: boolean;
  isError: boolean;
}

function previewText(text: string): { text: string; truncated: boolean } {
  return {
    text: text
      .slice(0, PREVIEW_MAX_CHARS)
      .split('\n')
      .slice(0, PREVIEW_MAX_LINES)
      .join('\n'),
    truncated:
      text.length > PREVIEW_MAX_CHARS ||
      text.split('\n').length > PREVIEW_MAX_LINES,
  };
}

function renderState(context: AskClaudeRenderContext | undefined): RenderState {
  const state = context?.state ?? {};
  state.askClaudeRendering ??= {
    hasResult: false,
    isPartial: context?.isPartial ?? true,
    isError: context?.isError ?? false,
  };
  return state.askClaudeRendering;
}

function renderComponent(
  text: string,
  theme: Theme,
  state: RenderState,
  call: boolean,
  renderCard: (kit: ThothRenderKit, width: number) => string[],
): Component {
  return {
    render(width) {
      if (width <= 0) return [];
      const kit = getRenderKit();
      if (kit) return renderCard(kit, width);
      const role = state.isPartial
        ? 'toolPendingBg'
        : state.isError
          ? 'toolErrorBg'
          : 'toolSuccessBg';
      const bg = (line: string) => theme.bg(role, line);
      const box = new Box(1, 0, bg);
      box.addChild(new Text(text, 0, 0));
      const padding = bg(' '.repeat(width));
      return [
        ...(call ? [padding] : []),
        ...box.render(width),
        ...(!call || !state.hasResult ? [padding] : []),
      ];
    },
    invalidate() {},
  };
}

export function createAskClaudeRenderers(
  defaults: AskClaudeDefaults,
): AskClaudeRenderers {
  return {
    renderShell: 'self',
    renderCall(args, theme, context) {
      const state = renderState(context);
      state.isPartial = context?.isPartial ?? true;
      state.isError = context?.isError ?? false;
      let text = theme.fg('mdLink', theme.bold('AskClaude '));
      const tags = askClaudeCallTags(args, defaults);
      if (tags.length) text += `${theme.fg('accent', `[${tags.join(', ')}]`)} `;
      const preview = previewText(args.prompt);
      const promptPreview = `"${preview.text}"`;
      text += theme.fg('muted', promptPreview);
      if (preview.truncated) text += theme.fg('dim', ' …');
      return renderComponent(text, theme, state, true, (kit, width) => {
        const status = state.isError
          ? 'failed'
          : !state.isPartial
            ? 'completed'
            : context?.executionStarted
              ? 'running'
              : 'pending';
        return kit.card(
          theme,
          {
            title: 'AskClaude',
            body: [
              ...(tags.length
                ? [kit.fg(theme, 'accent', `[${tags.join(', ')}]`)]
                : []),
              ...(promptPreview + (preview.truncated ? ' …' : ''))
                .split('\n')
                .map((line) => kit.fg(theme, 'muted', line)),
            ],
            part: state.hasResult ? 'start' : 'full',
            isError: state.isError,
            status: state.hasResult ? undefined : status,
            footer: state.hasResult
              ? undefined
              : kit.indicator(theme, context, { status, label: 'Claude Code' })
                  .text,
          },
          width,
        );
      });
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const details = result.details as
        | {
            prompt?: string;
            executionTime?: number;
            actions?: string;
            error?: boolean;
          }
        | undefined;
      const state = renderState(context);
      // Both SDK slots are constructed before either renders; the call owns the top,
      // and the result owns the only bottom padding/border once it exists.
      state.hasResult = true;
      state.isPartial = isPartial;
      state.isError = Boolean(context?.isError || details?.error);
      const body =
        result.content[0]?.type === 'text'
          ? result.content[0].text
          : isPartial
            ? 'working...'
            : '';
      const renderCard = (kit: ThothRenderKit, width: number) => {
        const status = isPartial
          ? 'running'
          : state.isError
            ? 'failed'
            : 'completed';
        const indicator = kit.indicator(theme, context, {
          status,
          elapsedMs: details?.executionTime,
          label: 'Claude Code',
        });
        const rows = (bodyWidth: number) =>
          kit.collapse(
            theme,
            wrapTextWithAnsi(body, bodyWidth).map((line) =>
              kit.fg(theme, isPartial ? 'muted' : 'toolOutput', line),
            ),
            { expanded, budget: 8 },
          );
        const showPrompt = expanded && !isPartial && Boolean(details?.prompt);
        return kit.card(
          theme,
          {
            part: 'end',
            body: showPrompt ? undefined : rows,
            sections: showPrompt
              ? [
                  {
                    title: 'Prompt',
                    rows: (bodyWidth) =>
                      wrapTextWithAnsi(details.prompt, bodyWidth).map((line) =>
                        kit.fg(theme, 'dim', line),
                      ),
                  },
                  { title: 'Output', rows },
                ]
              : undefined,
            status,
            isError: state.isError,
            footer: [indicator.text, details?.actions]
              .filter(Boolean)
              .join(' · '),
          },
          width,
        );
      };
      if (isPartial) {
        return renderComponent(
          theme.fg('mdLink', '◉ Claude Code ') + theme.fg('muted', body),
          theme,
          state,
          false,
          renderCard,
        );
      }
      let text = state.isError
        ? theme.fg('error', '✗ Claude Code error')
        : theme.fg('mdLink', '✓ Claude Code');

      if (details?.executionTime)
        text += ` ${theme.fg('dim', formatDuration(details.executionTime))}`;
      if (details?.actions) text += ` ${theme.fg('muted', details.actions)}`;

      if (expanded) {
        if (details?.prompt)
          text += `\n${theme.fg('dim', `Prompt: ${details.prompt}`)}`;
        if (details?.prompt && body)
          text += `\n${theme.fg('dim', '─'.repeat(40))}`;
        if (body) text += `\n${theme.fg('toolOutput', body)}`;
      } else {
        const preview = previewText(body);
        text += `\n${theme.fg('toolOutput', preview.text)}`;
        if (preview.truncated)
          text += `\n${theme.fg('dim', `… (${keyHint('app.tools.expand', 'to expand')})`)}`;
      }
      return renderComponent(text, theme, state, false, renderCard);
    },
  };
}
