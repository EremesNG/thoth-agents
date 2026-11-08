import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { describe, expect, it, onTestFinished } from 'vitest';
import { renderSubagentCancelResult } from '../../src/render/tools/subagent-cancel.js';
import { renderSubagentExtendResult } from '../../src/render/tools/subagent-extend.js';
import { renderSubagentListResult } from '../../src/render/tools/subagent-list-agents.js';
import { renderSubagentListTasksResult } from '../../src/render/tools/subagent-list-tasks.js';
import { renderSubagentReplyResult } from '../../src/render/tools/subagent-reply.js';
import { renderSubagentResult } from '../../src/render/tools/subagent-result.js';
import { renderSubagentRunResult } from '../../src/render/tools/subagent-run.js';
import { renderSubagentSendMessageResult } from '../../src/render/tools/subagent-send-message.js';
import { renderSubagentStatusResult } from '../../src/render/tools/subagent-status.js';

type Mode = 'nerd' | 'unicode' | 'ascii';
type Density = 'line' | 'compact';
type State = 'running' | 'success' | 'error';

const theme = {
  fg: (_role: string, text: string) => `\u001b[36m${text}\u001b[39m`,
  bold: (text: string) => text,
};

async function installKit(density: Density, mode: Mode) {
  const kitModule = new URL(
    '../../../pi-thoth-theme/src/render-kit/index.ts',
    import.meta.url,
  ).href;
  const { createRenderKit } = await import(kitModule);
  const owner = {};
  const token = registerRenderKit(
    createRenderKit(owner, undefined, mode, density),
    owner,
  );
  onTestFinished(() => withdrawRenderKit(token));
}

const ERROR_TEXT = 'MATRIX FAILURE\nstack frame';
const LONG = 'map the whole repository and report every single finding';
const task = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 't1',
  agent: 'explorer',
  task: LONG,
  model: 'gpt-5',
  effort: 'high',
  status,
  output_preview: 'found 3 files',
  ...extra,
});
const failedTask = task('failed', { error: ERROR_TEXT });
const LONG_TASK = `explorer-with-a-long-name ${LONG} ${LONG}`;
const text = (value: string) => [{ type: 'text', text: value }];

interface Tool {
  name: string;
  render: typeof renderSubagentRunResult;
  /** Result for the non-error states. */
  ok: () => Record<string, unknown>;
  /** Result for the terminal error state. */
  fail: () => Record<string, unknown>;
  /** Primary summary text that must stay visible (truncated, not dropped). */
  primary: string;
}

const TOOLS: Tool[] = [
  {
    name: 'run',
    render: renderSubagentRunResult,
    ok: () => ({ details: { task: task('completed') }, content: text('done') }),
    fail: () => ({ details: { task: failedTask }, content: text(ERROR_TEXT) }),
    primary: 'explorer',
  },
  {
    name: 'cancel',
    render: renderSubagentCancelResult,
    ok: () => ({ details: { task: task('stopping') }, content: text('ok') }),
    fail: () => ({ details: {}, content: text(ERROR_TEXT) }),
    primary: 'cancel',
  },
  {
    name: 'extend',
    render: renderSubagentExtendResult,
    ok: () => ({
      details: {
        task_id: 't1',
        added_ms: 60000,
        extensions_remaining: 2,
        extensions_used: 1,
        deadline_at: 'later',
      },
      content: text('extended'),
    }),
    fail: () => ({ details: {}, content: text(ERROR_TEXT) }),
    primary: 'extend',
  },
  {
    name: 'list agents',
    render: renderSubagentListResult,
    ok: () => ({
      details: {
        agents: [
          { name: 'explorer', model: 'gpt-5', effort: 'high', tools: ['read'] },
          { name: 'oracle', model: 'gpt-5', effort: 'high', tools: [] },
        ],
      },
      content: text('agents'),
    }),
    fail: () => ({ details: {}, content: text(ERROR_TEXT) }),
    primary: 'subagents',
  },
  {
    name: 'list tasks',
    render: renderSubagentListTasksResult,
    ok: () => ({
      details: { tasks: [task('completed')] },
      content: text('tasks'),
    }),
    fail: () => ({ details: {}, content: text(ERROR_TEXT) }),
    primary: 'subagent tasks',
  },
  {
    name: 'reply',
    render: renderSubagentReplyResult,
    ok: () => ({
      details: { task_id: 't1' },
      content: text('ANSWER FOR THE WAITING AGENT SENT'),
    }),
    fail: () => ({ details: { task_id: 't1' }, content: text(ERROR_TEXT) }),
    primary: 'reply',
  },
  {
    name: 'result',
    render: renderSubagentResult,
    ok: () => ({ details: { task: task('completed') }, content: text('done') }),
    fail: () => ({ details: { task: failedTask }, content: text(ERROR_TEXT) }),
    primary: 'explorer',
  },
  {
    name: 'send message',
    render: renderSubagentSendMessageResult,
    ok: () => ({
      details: { task_id: 't1', status: 'queued', message: 'STEER THE AGENT' },
      content: text('queued'),
    }),
    fail: () => ({ details: { task_id: 't1' }, content: text(ERROR_TEXT) }),
    primary: 'send message',
  },
  {
    name: 'status',
    render: renderSubagentStatusResult,
    ok: () => ({ details: { task: task('completed') }, content: text('s') }),
    fail: () => ({ details: { task: failedTask }, content: text(ERROR_TEXT) }),
    primary: 'explorer',
  },
];

function render(tool: Tool, state: State, width: number) {
  const running = state === 'running';
  const result = state === 'error' ? tool.fail() : tool.ok();
  if (running && tool.name === 'run') {
    (result.details as { task: unknown }).task = task('running');
  }
  const component = tool.render(
    result,
    { expanded: false, isPartial: running },
    theme,
    {
      executionStarted: true,
      isPartial: running,
      isError: state === 'error',
      state: running ? {} : { completedElapsedMs: 2000 },
      keyText: () => 'ctrl+o',
      invalidate() {},
    },
  );
  return component
    .render(width)
    .map((row: string) => stripTerminalSequences(row).trimEnd());
}

/** Exactly one leading glyph: the second token is the title, not a glyph. */
function expectOneGlyph(row: string) {
  const [glyph, title] = row.split(' ');
  expect(glyph).toBeTruthy();
  expect(title).toMatch(/^[Ss]ubagent/);
}

describe.each([
  'nerd',
  'unicode',
  'ascii',
] as Mode[])('subagent compact matrix (%s icons)', (mode) => {
  describe.each(['line', 'compact'] as Density[])('%s', (density) => {
    describe.each(TOOLS)('$name', (tool) => {
      it.each([80, 42])('running/partial: one row @%i', async (width) => {
        await installKit(density, mode);
        const out = render(tool, 'running', width);
        expect(out).toHaveLength(1);
        expectOneGlyph(out[0]);
        expect(out[0]).toContain(tool.primary.slice(0, 4));
      });

      it.each([80, 42])('success: CRC rows @%i', async (width) => {
        await installKit(density, mode);
        const out = render(tool, 'success', width);
        expect(out.length).toBeGreaterThanOrEqual(1);
        expect(out.length).toBeLessThanOrEqual(density === 'line' ? 1 : 2);
        expectOneGlyph(out[0]);
        expect(out[0]).toContain(tool.primary.slice(0, 4));
      });

      it.each([
        80, 42,
      ])('error: row 2 is the first error line @%i', async (width) => {
        await installKit(density, mode);
        const out = render(tool, 'error', width);
        expect(out).toHaveLength(2);
        expectOneGlyph(out[0]);
        expect(out[1]).toMatch(/^ {2}\S+ MATRIX/);
        expect(out[1]).not.toMatch(/status:|model:|task_id:/);
      });
    });
  });
});

/** Long variable text must truncate before elapsed and the expand key. */
const LONG_CASES: {
  tool: string;
  truncates: boolean;
  ok: () => Record<string, unknown>;
}[] = [
  {
    tool: 'run',
    truncates: true,
    ok: () => ({
      details: { task: task('completed', { task: LONG_TASK }) },
      content: text('done'),
    }),
  },
  {
    tool: 'result',
    truncates: true,
    ok: () => ({
      details: { task: task('completed', { task: LONG_TASK }) },
      content: text('done'),
    }),
  },
  {
    tool: 'status',
    truncates: true,
    ok: () => ({
      details: { task: task('completed', { task: LONG_TASK }) },
      content: text('s'),
    }),
  },
  {
    tool: 'cancel',
    truncates: true,
    ok: () => ({
      details: { task: task('stopping', { task: LONG_TASK }) },
      content: text('ok'),
    }),
  },
  {
    tool: 'send message',
    truncates: false,
    ok: () => ({
      details: { task_id: 't1', status: 'queued', message: LONG_TASK },
      content: text('queued'),
    }),
  },
  {
    tool: 'reply',
    truncates: false,
    ok: () => ({ details: { task_id: 't1' }, content: text(LONG_TASK) }),
  },
  {
    tool: 'list tasks',
    truncates: false,
    ok: () => ({
      details: {
        tasks: Array.from({ length: 12 }, (_, i) =>
          task('completed', { id: `t${i}`, task: LONG_TASK }),
        ),
      },
      content: text('tasks'),
    }),
  },
];

describe.each([
  'nerd',
  'unicode',
  'ascii',
] as Mode[])('subagent long-text truncation priority (%s icons)', (mode) => {
  describe.each(['line', 'compact'] as Density[])('%s', (density) => {
    describe.each(LONG_CASES)('$tool', ({ tool: name, ok, truncates }) => {
      const tool = TOOLS.find((t) => t.name === name) as Tool;
      const longTool: Tool = {
        ...tool,
        ok,
        fail: () => {
          const failed = ok();
          const details = failed.details as { task?: unknown };
          if (details.task)
            details.task = {
              ...(details.task as object),
              status: 'failed',
              error: ERROR_TEXT,
            };
          return { ...failed, content: text(ERROR_TEXT) };
        },
      };
      it.each([
        'success',
        'error',
        'running',
      ] as State[])('%s: elapsed and expand key survive, summary truncates', async (state) => {
        await installKit(density, mode);
        const rows42 = render(longTool, state, 42);
        const row = rows42[0];
        expect(row).toMatch(/\b\d+s\b/);
        if (state === 'success') expect(rows42.join(' ')).toContain('ctrl+o');
        expect(row).not.toContain('report every single finding');
        if (truncates) expect(row).toMatch(/…|\.\.\./);
      });
    });
  });
});
