import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { expect, it, onTestFinished } from 'vitest';
import { boxedComponent } from '../../src/render/tools/components.js';
import { renderSubagentListTasksResult } from '../../src/render/tools/subagent-list-tasks.js';
import { renderSubagentResult } from '../../src/render/tools/subagent-result.js';
import { renderSubagentRunResult } from '../../src/render/tools/subagent-run.js';
import { renderSubagentStatusResult } from '../../src/render/tools/subagent-status.js';

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};

async function installKit(density: 'frame' | 'line' | 'compact') {
  const kitModule = new URL(
    '../../../pi-thoth-theme/src/render-kit/index.ts',
    import.meta.url,
  ).href;
  const { createRenderKit } = await import(kitModule);
  const owner = {};
  const token = registerRenderKit(
    createRenderKit(owner, undefined, 'unicode', density),
    owner,
  );
  onTestFinished(() => withdrawRenderKit(token));
}

const rows = (component: { render(width: number): string[] }, width = 100) =>
  component.render(width).map((row) => stripTerminalSequences(row));

const context = (isError = false, isPartial = false) => ({
  executionStarted: true,
  isPartial,
  isError,
  state: {},
  keyText: () => 'ctrl+o',
  invalidate() {},
});

const baseTask = {
  id: 't1',
  agent: 'explorer',
  task: 'map the repo',
  model: 'gpt-5',
  effort: 'high',
  usage: { cost: 0.5 },
};

function run(
  task: Record<string, unknown>,
  opts: { isError?: boolean; partial?: boolean; expanded?: boolean } = {},
) {
  return renderSubagentRunResult(
    {
      details: { task, mode: task.mode },
      content: [{ type: 'text', text: 'boom' }],
    },
    { expanded: opts.expanded ?? false, isPartial: opts.partial ?? false },
    theme,
    context(opts.isError, opts.partial),
  );
}

it('run completed: compact renders title+summary then first detail and hint', async () => {
  await installKit('compact');
  const out = rows(
    run({ ...baseTask, status: 'completed', output_preview: 'found 3 files' }),
  );
  expect(out).toHaveLength(2);
  expect(out[0]).toMatch(/✓ subagent {1,2}explorer: map the repo/);
  expect(out[0]).toContain('completed · gpt-5 · high · $0.50');
  expect(out[1]).toContain('found 3 files');
  expect(out[1]).toContain('ctrl+o to expand');
});

it('run completed: line renders a single row', async () => {
  await installKit('line');
  expect(
    rows(run({ ...baseTask, status: 'completed', output_preview: 'x' })),
  ).toHaveLength(1);
});

it('run launched: background launch is a collapsed completed row', async () => {
  await installKit('line');
  const out = rows(run({ ...baseTask, status: 'running', mode: 'background' }));
  expect(out).toHaveLength(1);
  expect(out[0]).toMatch(/✓ subagent {1,2}explorer: map the repo/);
  expect(out[0]).toContain('launched');
});

it('run running: partial renders the running form without summary', async () => {
  await installKit('compact');
  const out = rows(run({ ...baseTask, status: 'running' }, { partial: true }));
  expect(out[0]).toMatch(/subagent {1,2}explorer: map the repo/);
  expect(out[0]).not.toContain('gpt-5');
});

it('run failed: second row carries the first error line', async () => {
  await installKit('compact');
  const out = rows(
    run(
      { ...baseTask, status: 'failed', error: 'model exploded\nstack' },
      { isError: true },
    ),
  );
  expect(out).toHaveLength(2);
  expect(out[0]).toContain('✗');
  expect(out[1]).toContain('model exploded');
});

it('status and list tasks collapse to compact rows', async () => {
  await installKit('compact');
  const task = { ...baseTask, status: 'completed' };
  const status = rows(
    renderSubagentStatusResult(
      { details: { task } },
      { expanded: false },
      theme,
      context(),
    ),
  );
  expect(status).toHaveLength(1);
  expect(status[0]).toContain('subagent status');
  expect(status[0]).toContain('gpt-5 · high');
  expect(status[0]).toContain('ctrl+o to expand');
  const list = rows(
    renderSubagentListTasksResult(
      { details: { tasks: [task] } },
      { expanded: false },
      theme,
      context(),
    ),
  );
  expect(list).toHaveLength(2);
  expect(list[0]).toContain('subagent tasks 1 listed');
  expect(list[1]).toContain('most recent');
});

it('expanded and frame density keep the framed card', async () => {
  const task = { ...baseTask, status: 'completed' };
  await installKit('compact');
  expect(rows(run(task, { expanded: true })).length).toBeGreaterThan(3);
  await installKit('frame');
  const frame = rows(run(task));
  expect(frame[0]).toMatch(/^╭/);
});

it('message mode never opts in', async () => {
  await installKit('compact');
  const out = rows(
    boxedComponent('hello', { title: 'done', theme, message: true }),
  );
  expect(out[0]).toMatch(/^╭/);
});

const ansiTheme = {
  fg: (_role: string, text: string) => `\u001b[31m${text}\u001b[39m`,
  bold: (text: string) => text,
};

const failedTask = {
  ...baseTask,
  status: 'failed',
  error: 'MODEL EXPLODED\nstack',
};

it('result error: collapsed row shows the first error line, not metadata', async () => {
  await installKit('compact');
  for (const t of [theme, ansiTheme]) {
    const out = rows(
      renderSubagentResult(
        { details: { task: failedTask } },
        { expanded: false },
        t,
        context(true),
      ),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).not.toMatch(/✗ ✗/);
    expect(out[0]).toContain('✗ Subagent');
    expect(out[1]).toContain('MODEL EXPLODED');
    expect(out[1]).not.toContain('model:');
  }
});

it('status error: collapsed row shows the first error line, not metadata', async () => {
  await installKit('compact');
  for (const t of [theme, ansiTheme]) {
    const out = rows(
      renderSubagentStatusResult(
        { details: { task: failedTask } },
        { expanded: false },
        t,
        context(true),
      ),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).not.toMatch(/✗ ✗/);
    expect(out[1]).toContain('MODEL EXPLODED');
    expect(out[1]).not.toContain('model:');
  }
});
