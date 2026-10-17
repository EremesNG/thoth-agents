import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { agentRow, sidebar, source, strip, useMode } from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

const metrics = (elapsed: string) => ({
  model: 'gpt-5·high',
  tools: '⚒ 12',
  tokens: '↑12k ↓3.4k',
  context: '◔ 41.0%',
  speed: '↯ 88',
  cost: '$0.42',
  elapsed,
});

/** Mixed Agents rows in launch order, one per status family. */
function agents() {
  const row = (
    id: string,
    name: string,
    status: string,
    summary: string,
    elapsed: string,
    state: 'running' | 'done' | 'failed' = 'done',
  ) => ({
    ...agentRow(id, name, status, metrics(elapsed)),
    state,
    sortStartedAt: Number(id),
    identity: [
      { text: name, role: 'primary' as const },
      { text: ` · ${summary}`, role: 'secondary' as const },
    ],
  });
  return [
    row('1', 'explorer', 'running', 'mapping the repo', '◷ 1m 05s', 'running'),
    row('2', 'worker', 'queued', 'waiting for a slot', '◷ 0s', 'running'),
    row('3', 'reviewer', 'completed', 'review done', '◷ 2m 10s'),
    row('4', 'builder', 'failed', 'compile error', '◷ 9s', 'failed'),
    row('5', 'oracle', 'cancelled', 'cancelled by user', '◷ 3s', 'failed'),
    row('6', 'deploy', 'timedOut', 'timed out', '◷ 5m 00s', 'failed'),
  ];
}

/** Background rows shaped like the provider: name/status identity + elapsed column. */
function background() {
  const row = (
    id: string,
    name: string,
    status: string,
    glyph: string,
    label: string,
    elapsed: string,
    state: 'running' | 'done' | 'failed',
  ) => ({
    id,
    primary: label,
    name,
    status,
    statusGlyph: glyph as never,
    state,
    ...(state === 'running' ? {} : { endedAt: Date.now() }),
    sortStartedAt: Number(id),
    identity: [
      { text: name, role: 'primary' as const },
      { text: ` · ${label}`, role: 'secondary' as const },
    ],
    metrics: [
      {
        key: 'elapsed' as const,
        segments: [{ text: elapsed, role: 'meta' as const }],
      },
    ],
  });
  return [
    row(
      '1',
      'dev server',
      'running',
      'running',
      'running',
      '4m 12s',
      'running',
    ),
    row('2', 'unit tests', 'succeeded', 'completed', 'exit 0', '31s', 'done'),
    row(
      '3',
      'lint',
      'failed',
      'expectedExit',
      'exit 1 expected',
      '12s',
      'failed',
    ),
    row(
      '4',
      'build',
      'failed',
      'resolved',
      'failed, resolved',
      '1m 02s',
      'failed',
    ),
    row(
      '5',
      'deploy',
      'timed_out',
      'timedOut',
      'timed out',
      '10m 00s',
      'failed',
    ),
    row('6', 'e2e', 'cancelled', 'cancelled', 'cancelled', '8s', 'failed'),
  ];
}

const SUMMARY = {
  running: 1,
  queued: 1,
  completed: 1,
  failed: 2,
  cancelled: 1,
};

function render(id: 'subagents' | 'background-tasks', width: number) {
  const styled: Array<[string, string]> = [];
  const panel = sidebar([{ id, visible: true }], {
    theme: {
      fg: (role, text) => {
        styled.push([role, text]);
        return text;
      },
    },
    height: () => 40,
  });
  return { lines: panel.renderAt(width, 40), styled };
}

it.each([
  ['subagents', 'Agents', agents],
  ['background-tasks', 'Background', background],
] as const)('%s panel keeps every mixed-state row on one line at 36 and 50 cells', (id, label, rows) => {
  const data = rows();
  // Every active row plus the three most recently launched finished rows.
  const retained = data.filter((row) => row.state === 'running').length + 3;
  releases.push(source(id, label, data as never, SUMMARY));
  for (const width of [36, 50]) {
    const text = render(id, width).lines.map(strip);
    // top + rows + footer + bottom; the three oldest finished rows are retained.
    expect(text).toHaveLength(retained + 3);
    for (const line of text) expect(panelVisibleWidth(line)).toBe(width);
  }
});

/** Retention keeps three finished rows, so each role check renders a subset. */
function rolesFor(
  id: 'subagents' | 'background-tasks',
  label: string,
  rows: Array<{ id: string }>,
  keep: string[],
  width = 130,
) {
  const release = source(
    id,
    label,
    rows.filter((row) => keep.includes(row.id)) as never,
    SUMMARY,
  );
  try {
    const { styled } = render(id, width);
    return (role: string, part: string) =>
      styled.some(([r, text]) => r === role && text.includes(part));
  } finally {
    release();
  }
}

it('applies per-element theme roles to Agents rows', () => {
  const first = rolesFor('subagents', 'Agents', agents(), [
    '1',
    '2',
    '3',
    '4',
    '5',
  ]);
  expect(first('toolTitle', 'explorer')).toBe(true);
  expect(first('accent', '↑12k')).toBe(true);
  expect(first('success', '↓3.4k')).toBe(true);
  expect(first('warning', '$0.42')).toBe(true);
  expect(first('muted', 'gpt-5')).toBe(true);
  expect(first('dim', '⚒ 12')).toBe(true);
  expect(first('dim', ' · ')).toBe(true);
  // Active summary is normal text; finished summaries are muted.
  expect(first('text', 'mapping the repo')).toBe(true);
  expect(first('muted', 'review done')).toBe(true);
  // Elapsed follows the state: running accent, done dim, failure error, cancelled muted.
  expect(first('accent', '1m 05s')).toBe(true);
  expect(first('dim', '2m 10s')).toBe(true);
  expect(first('error', '9s')).toBe(true);
  expect(first('muted', '3s')).toBe(true);
  const timedOut = rolesFor('subagents', 'Agents', agents(), ['6']);
  expect(timedOut('warning', '5m 00s')).toBe(true);
});

it('applies status-driven roles to Background rows', () => {
  const rows = background();
  const first = rolesFor('background-tasks', 'Background', rows, [
    '1',
    '2',
    '3',
    '4',
  ]);
  expect(first('toolTitle', 'dev server')).toBe(true);
  expect(first('accent', '4m 12s')).toBe(true);
  expect(first('dim', '31s')).toBe(true);
  expect(first('dim', '12s')).toBe(true);
  expect(first('muted', '1m 02s')).toBe(true);
  expect(first('muted', 'exit 1 expected')).toBe(true);
  expect(first('muted', 'failed, resolved')).toBe(true);
  expect(first('dim', ' · ')).toBe(true);
  const rest = rolesFor('background-tasks', 'Background', rows, ['5']);
  expect(rest('warning', '10m 00s')).toBe(true);
  const cancelled = rolesFor('background-tasks', 'Background', rows, ['6']);
  expect(cancelled('muted', '8s')).toBe(true);
});

it('keeps one line in ascii and unicode kit modes', () => {
  releases.push(useMode('ascii'));
  releases.push(source('subagents', 'Agents', agents() as never, SUMMARY));
  const text = sidebar([{ id: 'subagents', visible: true }]).renderAt(36, 40);
  expect(text).toHaveLength(5 + 3);
  const kit = registerRenderKit(createTestRenderKit(), {});
  releases.push(() => withdrawRenderKit(kit));
  const unicode = sidebar([{ id: 'subagents', visible: true }]).renderAt(
    36,
    40,
  );
  expect(unicode).toHaveLength(5 + 3);
});

it('shows a timed-out row with exactly one clock glyph (the status), no elapsed icon', () => {
  releases.push(source('subagents', 'Agents', [agents()[5]] as never, SUMMARY));
  const row = strip(
    sidebar([{ id: 'subagents', visible: true }]).renderAt(50, 40)[1],
  );
  expect(row.match(/◷/g)).toHaveLength(1);
  expect(row).toContain('5m 00s');
});
