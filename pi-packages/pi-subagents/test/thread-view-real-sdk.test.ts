import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  preloadPiComponentsForSubagentRendering,
  renderThreadBody,
  resetPiComponentCacheForTests,
} from '../src/thread-view.js';

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
