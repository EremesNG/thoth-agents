import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it, onTestFinished, vi } from 'vitest';
import { completionMessage } from '../../src/render/completion-message.js';
import { visibleWidth } from '../../src/render/text-width.js';
import {
  backgroundLaunchContent,
  formatTask,
  formatTaskLabel,
  formatTaskListSummary,
  formatTaskModeContent,
} from '../../src/render/tools/formatting.js';
import { progressText, statusGlyph } from '../../src/render/tools/progress.js';
import type { SubagentTask } from '../../src/types.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';
import { workPanelSession } from '../helpers/work-panel-fixture.js';

const task: SubagentTask = {
  id: 'icons',
  agent: 'worker',
  status: 'completed',
  mode: 'background',
  task: 'inspect · paths … ↑↓',
  created_at: '2026-01-01T00:00:00Z',
  result: 'literal · … ↑↓ response',
  usage: {
    input: 12,
    output: 34,
    turns: 1,
    cost: 0,
    contextTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
};
function asciiKit(separator = '|') {
  const kit = createTestRenderKit({
    icon: (name) => {
      if (name === 'spinnerFrames') return ['|', '/', '-', '\\'];
      return (
        new Map([
          ['separator', separator],
          ['ellipsis', '...'],
          ['tokensIn', '^'],
          ['tokensOut', 'v'],
          ['agent', '@'],
        ]).get(name) ?? ''
      );
    },
  });
  kit.statusGlyph = (_theme, status) => (status === 'completed' ? '+' : '*');
  return kit;
}

function nerdKit() {
  const kit = createTestRenderKit({
    icon: (name) =>
      new Map([
        ['separator', '·'],
        ['ellipsis', '…'],
        ['tokensIn', '\uF062'],
        ['tokensOut', '\uF063'],
        ['agent', '\u{F08C7}'],
      ]).get(name) ?? '',
  });
  kit.statusGlyph = (_theme, status) =>
    status === 'completed' ? '\uF00C' : '\uF00D';
  return kit;
}

it('resolves status and spinner frames while raw progress and tool payloads stay invariant', () => {
  const payloads = () => [
    formatTask(task),
    formatTaskListSummary([task]),
    formatTaskModeContent([task]),
    backgroundLaunchContent([task]),
    completionMessage(task),
    progressText([task]),
    progressText([]),
  ];
  const native = payloads();
  for (const separator of ['|', '·']) {
    const token = registerRenderKit(asciiKit(separator), {});
    onTestFinished(() => withdrawRenderKit(token));
    expect(payloads()).toEqual(native);
    expect(statusGlyph('completed')).toBe('+');
    expect(statusGlyph('running', -1)).toBe('\\');
    expect(statusGlyph('running', 5)).toBe('/');
    expect(progressText([], 1, { ui: true })).toBe('/ Starting subagent...');
    expect(progressText([task], 0, { ui: true })).toContain(
      `worker ${separator} status: completed`,
    );
    expect(formatTaskLabel(task, true)).toBe(
      `worker ${separator} inspect · paths … ↑↓`,
    );
  }
  const token = registerRenderKit(nerdKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(statusGlyph('completed')).toBe('\uF00C');
  expect(payloads()).toEqual(native);
});

it('retained producer rows consult the kit before native glyphs and re-resolve after withdrawal', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const provider = createSubagentsWorkPanelProvider({
    listTasks: () => [{ ...task, ended_at: new Date(0).toISOString() }],
    onTaskUpdate: () => () => {},
    cancel: () => {},
    open: async () => {},
  });
  const row = provider.listRows(0)[0]!;
  expect(row.statusGlyph).toBe('completed');
  const session = workPanelSession(process.cwd());
  onTestFinished(
    registerWorkPanelProvider(session.ctx as never, {
      ...provider,
      listRows: () => [row],
    }),
  );
  onTestFinished(await ensureWorkPanel(session.ctx as never));
  const glyph = () => session.render(200)[1]?.match(/(\S) worker/u)?.[1];
  expect(glyph()).toBe('✓');
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(glyph()).toBe('+');
  withdrawRenderKit(token);
  expect(glyph()).toBe('✓');
});

it.each([
  [
    'status',
    (theme: any) =>
      renderSubagentStatusResult(
        { details: { task } },
        { expanded: true },
        theme,
      ),
  ],
  [
    'result',
    (theme: any) =>
      renderSubagentResult({ details: { task } }, { expanded: true }, theme),
  ],
  [
    'run',
    (theme: any) =>
      renderSubagentRunResult({ details: { task } }, { expanded: true }, theme),
  ],
  [
    'completion',
    (theme: any) =>
      renderSubagentCompletionMessage(
        { details: { task } },
        { expanded: true },
        theme,
      ),
  ],
])('mounted %s titles and metadata re-resolve without rewriting response text', (_name, create) => {
  const theme = {
    fg: (_role: string, text: string) => text,
    bg: (_role: string, text: string) => text,
    bold: (text: string) => text,
  };
  const component = create(theme);
  const native = component.render(200);
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  const themed = component.render(200).join('\n');
  expect(themed).toContain('+');
  expect(themed).toContain('worker |');
  expect(themed).toContain('literal · … ↑↓ response');
  const replacement = registerRenderKit(asciiKit('/'), {});
  onTestFinished(() => withdrawRenderKit(replacement));
  expect(component.render(200).join('\n')).toContain('worker /');
  withdrawRenderKit(replacement);
  expect(component.render(200)).toEqual(native);
});

it('mounted agent titles resolve the agent icon at render time', () => {
  const component = renderSubagentListResult(
    { details: { agents: [] } },
    {},
    { fg: (_role: string, text: string) => text },
  );
  const native = component.render(100);
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(component.render(100)[0]).toBe('╭─ @ subagents');
  withdrawRenderKit(token);
  expect(component.render(100)).toEqual(native);
});

import { renderSubagentCompletionMessage } from '../../src/render/completion-message.js';
import { renderSubagentListResult } from '../../src/render/tools/subagent-list-agents.js';
import { renderSubagentResult } from '../../src/render/tools/subagent-result.js';
import { renderSubagentRunResult } from '../../src/render/tools/subagent-run.js';
import { renderSubagentStatusResult } from '../../src/render/tools/subagent-status.js';

it('agent-list model payload is invariant in both expanded and collapsed forms', () => {
  const agents = [
    { name: 'worker', model: { provider: 'p', id: 'm' }, tools: ['read'] },
  ];
  const native = [
    formatSubagentList(agents, false),
    formatSubagentList(agents, true),
  ];
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect([
    formatSubagentList(agents, false),
    formatSubagentList(agents, true),
  ]).toEqual(native);
});

import { formatSubagentList } from '../../src/render/tools/subagent-list-agents.js';

it('task-list rendering opts into kit icons without changing task-list payload summaries', () => {
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(formatTaskListRender([task], false)).toContain('worker |');
  expect(formatTaskListRender([task], true)).toContain('worker | task:');
  expect(formatTaskListRender([task], true)).toContain('^12 v34');
});

it('background launch titles use themed status with their original native fallback', () => {
  const background = { ...task, status: 'running', display_name: 'Launch' };
  const component = renderSubagentRunResult(
    { details: { task: background } },
    {},
    { fg: (_role: string, text: string) => text },
  );
  expect(component.render(160).join('\n')).toContain('⤓ subagent');
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(component.render(160)[0]).toBe(
    '╭─ + subagent | Launch | launched (background)',
  );
});

it.each([
  task,
  { ...task, result: undefined, output_preview: undefined },
])('status/result tool execution content stays byte-identical across icon modes (%j)', async (snapshot) => {
  const manager = { getTask: () => snapshot } as unknown as SubagentManager;
  const tools = [
    createSubagentStatusTool(manager),
    createSubagentResultTool(manager),
  ];
  const execute = async () =>
    Promise.all(
      tools.map(async (tool) =>
        JSON.stringify(
          await tool.execute(
            'call',
            { task_id: task.id },
            undefined,
            undefined,
            {},
          ),
        ),
      ),
    );
  const native = await execute();
  for (const kit of [asciiKit(), nerdKit()]) {
    const token = registerRenderKit(kit, {});
    onTestFinished(() => withdrawRenderKit(token));
    expect(await execute()).toEqual(native);
  }
});

import type { SubagentManager } from '../../src/manager.js';
import { formatTaskListRender } from '../../src/render/tools/formatting.js';
import { createSubagentResultTool } from '../../src/tools/subagent-result.js';
import { createSubagentStatusTool } from '../../src/tools/subagent-status.js';

it('retained running producer rows use kit indicator frames instead of static in-progress glyphs', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const running: SubagentTask = { ...task, status: 'running' };
  const provider = createSubagentsWorkPanelProvider({
    listTasks: () => [running],
    onTaskUpdate: () => () => {},
    cancel: () => {},
    open: async () => {},
  });
  const row = provider.listRows(0)[0]!;
  expect(row.statusGlyph).toBe('running');
  const session = workPanelSession(process.cwd());
  onTestFinished(
    registerWorkPanelProvider(session.ctx as never, {
      ...provider,
      listRows: () => [row],
    }),
  );
  onTestFinished(await ensureWorkPanel(session.ctx as never));
  const glyph = (at: number) => {
    vi.setSystemTime(at);
    return session.render(200)[1]?.match(/(\S) worker/u)?.[1];
  };
  const kit = asciiKit();
  const indicator = kit.indicator;
  kit.indicator = (theme, context, options) => ({
    ...indicator(theme, context, options),
    glyph: options?.frame === 1 ? '/' : '|',
  });
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(glyph(0)).toBe('|');
  expect(glyph(100)).toBe('/');
  withdrawRenderKit(token);
  expect(glyph(0)).toBe('⠋');
  expect(glyph(100)).toBe('⠙');
});

it.each([
  ['cancel', (theme: any) => renderSubagentCancelResult({}, {}, theme)],
  [
    'send message',
    (theme: any) => renderSubagentSendMessageResult({}, {}, theme),
  ],
  ['reply', (theme: any) => renderSubagentReplyResult({}, {}, theme)],
  ['list tasks', (theme: any) => renderSubagentListTasksResult({}, {}, theme)],
  [
    'status without task',
    (theme: any) => renderSubagentStatusResult({}, {}, theme),
  ],
  ['result without task', (theme: any) => renderSubagentResult({}, {}, theme)],
])('mounted %s agent titles use the kit and retain native fallback after withdrawal', (_name, create) => {
  const component = create({ fg: (_role: string, text: string) => text });
  const native = component.render(160);
  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(component.render(160)[0]).toContain('╭─ @ ');
  withdrawRenderKit(token);
  expect(component.render(160)).toEqual(native);
});

import { renderSubagentCancelResult } from '../../src/render/tools/subagent-cancel.js';
import { renderSubagentListTasksResult } from '../../src/render/tools/subagent-list-tasks.js';
import { renderSubagentReplyResult } from '../../src/render/tools/subagent-reply.js';
import { renderSubagentSendMessageResult } from '../../src/render/tools/subagent-send-message.js';

it.each([
  'details',
  'content',
])('collapsed send-message previews use the UI ellipsis within the width budget (%s)', (source) => {
  const message = `${'a'.repeat(100)} · … ↑↓`;
  const result = {
    content: [{ type: 'text', text: message }],
    details: source === 'details' ? { message } : {},
  };
  const payload = JSON.stringify(result);
  const theme = { fg: (_role: string, text: string) => text };
  const component = renderSubagentSendMessageResult(
    result,
    { expanded: false },
    theme,
  );
  const native = component.render(80);
  expect(native.map((line) => line.trim())).toContain(
    `message: ${'a'.repeat(59)}…`,
  );

  const token = registerRenderKit(asciiKit(), {});
  onTestFinished(() => withdrawRenderKit(token));
  for (const width of [73, 80, 120]) {
    const lines = component.render(width);
    expect(lines).toContain(`message: ${'a'.repeat(57)}...`);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
  }
  for (const width of [1, 8, 24, 68]) {
    expect(
      component.render(width).every((line) => visibleWidth(line) <= width),
    ).toBe(true);
  }
  expect(
    renderSubagentSendMessageResult(result, { expanded: true }, theme)
      .render(160)
      .join('\n'),
  ).toContain(message);
  expect(JSON.stringify(result)).toBe(payload);

  withdrawRenderKit(token);
  expect(component.render(80)).toEqual(native);
});

it('partial background titles use the running indicator instead of a static status glyph', () => {
  const component = renderSubagentRunResult(
    {
      details: {
        task: { ...task, status: 'running', display_name: 'Live' },
        frame: 1,
      },
    },
    { isPartial: true },
    { fg: (_role: string, text: string) => text },
  );
  const native = component.render(160);
  expect(native.join('\n')).toContain(
    '⤓ subagent · Live · running (background)',
  );
  const kit = asciiKit();
  const indicator = kit.indicator;
  kit.indicator = (theme, context, options) => ({
    ...indicator(theme, context, options),
    glyph: options?.frame === 1 ? '/' : '|',
  });
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(component.render(160)[0]).toBe(
    '╭─ / subagent | Live | running (background)',
  );
  withdrawRenderKit(token);
  expect(component.render(160)).toEqual(native);
});
