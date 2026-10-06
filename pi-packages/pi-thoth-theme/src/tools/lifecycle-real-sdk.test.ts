import type {
  AgentToolResult,
  Theme,
  ToolRenderers,
} from '@earendil-works/pi-coding-agent';
import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, type TUI } from '@earendil-works/pi-tui';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { createToolRendererResolver } from './index.ts';

const config: ThemeConfig = {
  icons: 'ascii',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  welcome: { enabled: true },
};

beforeAll(() => initTheme('dark', false));

function expectBorderTone(
  lines: string[],
  theme: Theme,
  tone: 'accent' | 'success' | 'error',
) {
  const framed = lines.filter((line) => stripTerminalSequences(line) !== '');
  expect(framed.length).toBeGreaterThan(2);
  for (const line of framed) {
    const plain = stripTerminalSequences(line);
    const left = plain.match(/^(?:[╭├╰]──|│ )/)?.[0] ?? '';
    const right = plain.match(/(?: │|─*[╮┤╯])$/)?.[0] ?? '';
    expect(left, plain).not.toBe('');
    expect(right, plain).not.toBe('');
    expect(line.startsWith(theme.fg(tone, left)), plain).toBe(true);
    expect(line.endsWith(theme.fg(tone, right)), plain).toBe(true);
  }
}

function createHostComponent(name: string) {
  const resolved = createToolRendererResolver(
    { getAllTools: () => [] },
    config,
  )(name, () => undefined);
  if (!resolved?.renderCall || !resolved.renderResult) {
    throw new Error(`No framed renderer for ${name}`);
  }
  const { renderCall, renderResult } = resolved;
  let hostTheme: Theme;
  const lifecycle = new Map<string, { isPartial: boolean; isError: boolean }>();
  const renderers: ToolRenderers = {
    ...resolved,
    renderCall(args, theme, context) {
      hostTheme = theme;
      lifecycle.set('call', {
        isPartial: context.isPartial,
        isError: context.isError,
      });
      return renderCall(args, theme, context);
    },
    renderResult(result, options, theme, context) {
      hostTheme = theme;
      expect(options.isPartial).toBe(context.isPartial);
      lifecycle.set('result', {
        isPartial: context.isPartial,
        isError: context.isError,
      });
      return renderResult(result, options, theme, context);
    },
  };
  const component = new ToolExecutionComponent(
    name,
    'lifecycle-call',
    { command: 'echo live', query: 'live' },
    { showImages: false },
    renderers,
    { requestRender() {} } as TUI,
    process.cwd(),
  );
  component.markExecutionStarted();
  component.setArgsComplete();
  return {
    component,
    update(
      result: AgentToolResult<unknown> & { isError: boolean },
      isPartial: boolean,
      tone: 'accent' | 'success' | 'error',
    ) {
      component.updateResult(result, isPartial);
      const lines = component.render(120);
      for (const part of ['call', 'result']) {
        expect(lifecycle.get(part)).toEqual({
          isPartial,
          isError: result.isError,
        });
      }
      expectBorderTone(lines, hostTheme, tone);
      return stripTerminalSequences(lines.at(-1) ?? '');
    },
  };
}

describe.each([
  { name: 'bash', successFooter: 'Exit 0', errorFooter: 'Exit 7' },
  { name: 'powershell', successFooter: 'Exit 0', errorFooter: 'Exit 7' },
  { name: 'custom_tool', successFooter: '✓', errorFooter: '✗' },
])('$name host lifecycle', ({ name, successFooter, errorFooter }) => {
  it('keeps an error-marked partial update gold until the host finishes execution', () => {
    const host = createHostComponent(name);
    const result = {
      content: [
        {
          type: 'text' as const,
          text: 'live output\nCommand exited with code 7',
        },
      ],
      details: { exitCode: 7 },
      isError: true,
    };
    const runningFooter = host.update(result, true, 'accent');
    expect(runningFooter).toMatch(/╰── [△◭▲◮]/);
    expect(runningFooter).not.toMatch(/Exit \d+|Done|Error/);
    const footer = host.update(result, false, 'error');
    expect(footer).toContain(errorFooter);
    expect(footer).not.toMatch(/╰── [△◭▲◮]/);
  });

  it.each([
    undefined,
    { exitCode: 0 },
    { exitCode: 7 },
  ])('keeps partial output running regardless of details=%j, then shows the terminal footer and border', (details) => {
    for (const expanded of [false, true]) {
      for (const failed of [false, true]) {
        const host = createHostComponent(name);
        host.component.setExpanded(expanded);
        const partial = {
          content: [{ type: 'text' as const, text: 'live output' }],
          details,
          isError: false,
        };
        const runningFooter = host.update(partial, true, 'accent');
        expect(runningFooter).toMatch(/╰── [△◭▲◮]/);
        expect(runningFooter).not.toMatch(/Exit \d+|Done|Error/);

        const footer = host.update(
          {
            ...partial,
            content: [
              {
                type: 'text',
                text: failed
                  ? 'live output\nCommand exited with code 7'
                  : 'live output',
              },
            ],
            isError: failed,
          },
          false,
          failed ? 'error' : 'success',
        );
        expect(footer).toContain(failed ? errorFooter : successFooter);
        expect(footer).not.toMatch(/╰── [△◭▲◮]/);
      }
    }
  });
});
