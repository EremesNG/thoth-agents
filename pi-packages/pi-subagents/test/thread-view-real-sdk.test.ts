import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Theme, ToolRenderers } from '@earendil-works/pi-coding-agent';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, expect, it, onTestFinished } from 'vitest';
import {
  preloadPiComponentsForSubagentRendering,
  renderThreadBody,
  resetPiComponentCacheForTests,
} from '../src/thread-view.js';
import type { SubagentThreadItem } from '../src/types.js';

// These runtime integrations keep the theme package's TS-extension compiler
// settings. Load its modules once during collection, not inside the first themed
// assertion's 5s deadline (cold import exceeded 5s under Windows contention).
const toolsModule = new URL(
  '../../pi-thoth-theme/src/tools/index.ts',
  import.meta.url,
).href;
const kitModule = new URL(
  '../../pi-thoth-theme/src/render-kit/index.ts',
  import.meta.url,
).href;
const [{ createToolRendererResolver }, { createRenderKit }] = await Promise.all(
  [import(toolsModule), import(kitModule)],
);

let fixtureRoot: string;
let previousAgentDir: string | undefined;

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-native-render-'),
  );
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = path.join(fixtureRoot, 'agent');
  resetPiComponentCacheForTests();
});

afterEach(() => {
  resetPiComponentCacheForTests();
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

function plainText(lines: string[]): string {
  return lines.join('\n').replace(/\u001b\[[0-9;]*m/g, '');
}

it('loads the real Pi components and preserves native markdown and thinking visibility at narrow widths', async () => {
  const { initTheme } = await import('@earendil-works/pi-coding-agent');
  const { visibleWidth, truncateToWidth } = await import(
    '@earendil-works/pi-tui'
  );
  initTheme('dark', false);
  expect(await preloadPiComponentsForSubagentRendering()).toBe(true);
  const snapshot = {
    version: 1,
    source: 'events',
    items: [
      { type: 'user', text: 'Please review the native session.' },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'private reasoning' },
            {
              type: 'text',
              text: '**Native response** with wrapped markdown.',
            },
          ],
        },
      },
    ],
  };
  for (const renderWidth of [32, 80]) {
    const context = {
      cwd: fixtureRoot,
      visibleWidth,
      truncateToWidth,
      renderWidth,
    };
    const hidden = renderThreadBody(snapshot, {
      ...context,
      hideThinkingBlock: true,
    });
    expect(plainText(hidden)).toContain('Native response');
    expect(plainText(hidden)).not.toContain('**Native response**');
    expect(plainText(hidden)).not.toContain('private reasoning');
    expect(hidden.every((line) => visibleWidth(line) <= renderWidth)).toBe(
      true,
    );
    const visible = renderThreadBody(snapshot, {
      ...context,
      hideThinkingBlock: false,
    });
    expect(plainText(visible)).toContain('private reasoning');
  }
}, 30_000);

it('renders tool definitions through the native TUI with execution context and output expansion', async () => {
  const { initTheme } = await import('@earendil-works/pi-coding-agent');
  const { Text, TuiMainScreen, visibleWidth, truncateToWidth } = await import(
    '@earendil-works/pi-tui'
  );
  initTheme('dark', false);
  expect(await preloadPiComponentsForSubagentRendering()).toBe(true);
  // Only the terminal I/O boundary is inert; Pi's TUI and components are real.
  const tui = new TuiMainScreen({
    columns: 80,
    rows: 24,
    kittyProtocolActive: false,
    start() {},
    stop() {},
    async drainInput() {},
    write() {},
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
  });
  const toolDefinition = {
    name: 'native_fixture',
    renderCall: (args: { path: string }) =>
      new Text(`native call ${args.path}`),
    renderResult: (
      result: { content: { text: string }[] },
      options: { expanded: boolean },
      _theme: unknown,
      context: {
        cwd: string;
        executionStarted: boolean;
        argsComplete: boolean;
      },
    ) =>
      new Text(
        [
          `native result ${options.expanded ? 'expanded' : 'collapsed'}`,
          result.content[0]!.text,
          context.cwd === fixtureRoot &&
          context.executionStarted &&
          context.argsComplete
            ? 'native context ready'
            : 'incorrect native context',
        ].join('\n'),
      ),
  };
  const snapshot = {
    version: 1,
    source: 'events',
    items: [
      {
        type: 'tool',
        name: 'native_fixture',
        tool_call_id: 'native-tool',
        status: 'completed',
        arguments: { path: 'example.ts' },
        result: {
          isError: false,
          content: [{ type: 'text', text: 'native output' }],
        },
      },
    ],
  };
  try {
    for (const toolOutputExpanded of [false, true]) {
      const lines = renderThreadBody(snapshot, {
        cwd: fixtureRoot,
        taskId: 'native-task',
        tui,
        visibleWidth,
        truncateToWidth,
        renderWidth: 32,
        toolOutputExpanded,
        getToolDefinition: () => toolDefinition,
      });
      expect(plainText(lines)).toContain('native call example.ts');
      expect(plainText(lines)).toContain(
        `native result ${toolOutputExpanded ? 'expanded' : 'collapsed'}`,
      );
      expect(plainText(lines)).toContain('native output');
      expect(plainText(lines)).toContain('native context ready');
      expect(lines.every((line) => visibleWidth(line) <= 32)).toBe(true);
    }
  } finally {
    tui.stop();
  }
});

it('propagates tool and bash lifecycle to both host renderer parts through the real Pi SDK', async () => {
  const { initTheme } = await import('@earendil-works/pi-coding-agent');
  const { Text, visibleWidth, truncateToWidth } = await import(
    '@earendil-works/pi-tui'
  );
  initTheme('dark', false);
  expect(await preloadPiComponentsForSubagentRendering()).toBe(true);
  const contexts: Array<{
    part: string;
    isPartial: boolean;
    isError: boolean;
  }> = [];
  const definition = {
    name: 'lifecycle_fixture',
    renderShell: 'self',
    renderCall: (_args: unknown, _theme: unknown, context: any) => {
      contexts.push({
        part: 'call',
        isPartial: context.isPartial,
        isError: context.isError,
      });
      return new Text('lifecycle call');
    },
    renderResult: (
      _result: unknown,
      options: any,
      _theme: unknown,
      context: any,
    ) => {
      expect(options.isPartial).toBe(context.isPartial);
      contexts.push({
        part: 'result',
        isPartial: context.isPartial,
        isError: context.isError,
      });
      return new Text('lifecycle output');
    },
  };
  const render = (
    item: SubagentThreadItem,
    isPartial: boolean,
    isError: boolean,
  ) => {
    contexts.length = 0;
    const lines = renderThreadBody(
      { version: 1, source: 'events', items: [item] },
      {
        cwd: fixtureRoot,
        taskId: 'lifecycle-task',
        tui: { requestRender() {} },
        visibleWidth,
        truncateToWidth,
        getToolDefinition: () => definition,
      },
    );
    expect(plainText(lines)).toContain('lifecycle output');
    for (const part of ['call', 'result']) {
      expect(
        contexts.filter((context) => context.part === part).at(-1),
      ).toEqual({ part, isPartial, isError });
    }
  };
  const tool = {
    type: 'tool' as const,
    name: 'lifecycle_fixture',
    tool_call_id: 'tool-lifecycle',
    result: {
      isError: false,
      content: [{ type: 'text', text: 'live output' }],
    },
  };
  render({ ...tool, status: 'pending' }, true, false);
  render({ ...tool, status: 'running' }, true, false);
  render({ ...tool, status: 'partial' }, true, false);
  render({ ...tool, status: 'completed' }, false, false);
  render(
    { ...tool, status: 'failed', result: { ...tool.result, isError: true } },
    false,
    true,
  );

  const bash = {
    type: 'bash' as const,
    tool_call_id: 'bash-lifecycle',
    command: 'echo live',
    output: 'live output',
  };
  render({ ...bash, status: 'running' }, true, false);
  render({ ...bash, status: 'completed', exitCode: 0 }, false, false);
  render({ ...bash, status: 'running', cancelled: true }, false, true);
  render({ ...bash, status: 'cancelled' }, false, true);
  render({ ...bash, status: 'failed', exitCode: 1 }, false, true);
  render({ ...bash, exitCode: 0 }, false, false);
  render({ ...bash, exitCode: 1 }, false, true);
  // Historical bash snapshots without status/exitCode retain the legacy final inference.
  render(bash, false, false);
});

it.each([
  false,
  true,
])('keeps active tool error results running through the real SDK (render kit: %s)', async (withKit) => {
  const { initTheme } = await import('@earendil-works/pi-coding-agent');
  const { Text, stripTerminalSequences, visibleWidth, truncateToWidth } =
    await import('@earendil-works/pi-tui');
  initTheme('dark', false);
  expect(await preloadPiComponentsForSubagentRendering()).toBe(true);
  let hostTheme: Theme;
  const definition = {
    name: 'partial_error_fixture',
    renderCall: (_args: unknown, theme: Theme) => {
      hostTheme = theme;
      return new Text('partial error call');
    },
    renderResult: () => new Text('error output'),
  };
  if (withKit) {
    const resolve = createToolRendererResolver(
      { getAllTools: () => [] },
      { icons: 'ascii', tools: { enabled: true } },
      fixtureRoot,
    );
    const token = registerRenderKit(
      createRenderKit(
        {},
        (name: string, next: () => ToolRenderers | undefined) => {
          const renderers: ToolRenderers = resolve(name, next);
          const { renderCall } = renderers;
          if (!renderCall) throw new Error(`No themed renderer for ${name}`);
          return {
            ...renderers,
            renderCall(args, theme, context) {
              hostTheme = theme;
              return renderCall(args, theme, context);
            },
          } satisfies ToolRenderers;
        },
        'ascii',
      ),
      {},
    );
    onTestFinished(() => withdrawRenderKit(token));
  }
  const render = (status: 'pending' | 'running' | 'partial' | 'failed') => {
    const lines = renderThreadBody(
      {
        version: 1,
        source: 'events',
        items: [
          {
            type: 'tool',
            name: definition.name,
            tool_call_id: 'partial-error-tool',
            status,
            result: {
              isError: true,
              content: [{ type: 'text', text: 'error output' }],
            },
          },
        ],
      },
      {
        cwd: fixtureRoot,
        taskId: 'partial-error-task',
        tui: { requestRender() {} },
        visibleWidth,
        truncateToWidth,
        renderWidth: 100,
        getToolDefinition: withKit ? undefined : () => definition,
      },
    ).filter((line) => stripTerminalSequences(line) !== '');
    expect(plainText(lines)).toContain('error output');
    if (withKit) {
      const tone = status === 'failed' ? 'error' : 'accent';
      for (const line of lines) {
        const plain = stripTerminalSequences(line);
        const left = plain.match(/^(?:[╭├╰]──|│ )/)?.[0] ?? '';
        const right = plain.match(/(?: │|─*[╮┤╯])$/)?.[0] ?? '';
        expect(left, plain).not.toBe('');
        expect(right, plain).not.toBe('');
        expect(line.startsWith(hostTheme.fg(tone, left)), plain).toBe(true);
        expect(line.endsWith(hostTheme.fg(tone, right)), plain).toBe(true);
      }
      const footer = stripTerminalSequences(lines.at(-1) ?? '');
      if (status === 'failed') expect(footer).toMatch(/╰── x/);
      else expect(footer).toMatch(/╰── [.oO0]/);
    } else {
      const text = lines.join('\n');
      expect(text).toContain(
        hostTheme.getBgAnsi(
          status === 'failed' ? 'toolErrorBg' : 'toolPendingBg',
        ),
      );
      if (status !== 'failed')
        expect(text).not.toContain(hostTheme.getBgAnsi('toolErrorBg'));
    }
  };
  for (const status of ['pending', 'running', 'partial', 'failed'] as const)
    render(status);
});

it.each([
  'completed',
  'failed',
  'cancelled',
] as const)('keeps a running bash item with output gold/running until %s through the real SDK and theme', async (status) => {
  const { initTheme } = await import('@earendil-works/pi-coding-agent');
  const { stripTerminalSequences, visibleWidth, truncateToWidth } =
    await import('@earendil-works/pi-tui');
  initTheme('dark', false);
  expect(await preloadPiComponentsForSubagentRendering()).toBe(true);
  const resolve = createToolRendererResolver(
    { getAllTools: () => [] },
    { icons: 'ascii', tools: { enabled: true } },
    fixtureRoot,
  );
  let hostTheme: Theme;
  const token = registerRenderKit(
    createRenderKit(
      {},
      (name: string, next: () => ToolRenderers | undefined) => {
        const renderers: ToolRenderers = resolve(name, next);
        if (!renderers.renderCall || !renderers.renderResult) {
          throw new Error(`No themed renderer for ${name}`);
        }
        const { renderCall, renderResult } = renderers;
        return {
          ...renderers,
          renderCall(args, theme, context) {
            hostTheme = theme;
            return renderCall(args, theme, context);
          },
          renderResult(result, options, theme, context) {
            expect(options.isPartial).toBe(context.isPartial);
            return renderResult(result, options, theme, context);
          },
        } satisfies ToolRenderers;
      },
      'ascii',
    ),
    {},
  );
  onTestFinished(() => withdrawRenderKit(token));
  const bash = {
    type: 'bash' as const,
    tool_call_id: `bash-${status}`,
    command: 'echo live',
    output: 'live output',
  };
  const render = (
    item: SubagentThreadItem,
    tone: 'accent' | 'success' | 'error',
  ) => {
    const lines = renderThreadBody(
      { version: 1, source: 'events', items: [item] },
      {
        cwd: fixtureRoot,
        taskId: `bash-${status}-task`,
        tui: { requestRender() {} },
        visibleWidth,
        truncateToWidth,
        renderWidth: 100,
      },
    ).filter((line) => stripTerminalSequences(line) !== '');
    expect(plainText(lines)).toContain('live output');
    expect(stripTerminalSequences(lines[0] ?? '')).toMatch(/^╭.*Bash.*╮$/);
    const footer = stripTerminalSequences(lines.at(-1) ?? '');
    expect(footer).toMatch(/^╰.*╯$/);
    for (const line of lines) {
      const plain = stripTerminalSequences(line);
      const left = plain.match(/^(?:[╭├╰]──|│ )/)?.[0] ?? '';
      const right = plain.match(/(?: │|─*[╮┤╯])$/)?.[0] ?? '';
      expect(left, plain).not.toBe('');
      expect(right, plain).not.toBe('');
      expect(line.startsWith(hostTheme.fg(tone, left)), plain).toBe(true);
      expect(line.endsWith(hostTheme.fg(tone, right)), plain).toBe(true);
    }
    return footer;
  };
  for (const exitCode of [undefined, 0, 7]) {
    const footer = render({ ...bash, status: 'running', exitCode }, 'accent');
    expect(footer).toMatch(/╰── [.oO0]/);
    expect(footer).not.toMatch(/Exit \d+/);
  }
  const footer = render(
    {
      ...bash,
      status,
      exitCode:
        status === 'completed' ? 0 : status === 'failed' ? 7 : undefined,
      cancelled: status === 'cancelled',
    },
    status === 'completed' ? 'success' : 'error',
  );
  expect(footer).not.toMatch(/╰── [.oO0]/);
  expect(footer).toContain(status === 'completed' ? 'Exit 0' : 'Exit ');
});
