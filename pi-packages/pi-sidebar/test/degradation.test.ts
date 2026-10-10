import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it } from 'vitest';
import { WIDEN_HINT } from '../src/panels/sidebar.js';
import {
  agentRow,
  context,
  sidebar,
  source,
  strip,
  task,
  tracker,
} from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

const agents = (count: number) =>
  Array.from({ length: count }, (_, i) => agentRow(`a${i}`, `agent ${i}`));
const SUMMARY = { running: 3, completed: 0, failed: 0, total: 3 };

const render = (
  panel: ReturnType<typeof sidebar>,
  height: number,
  width = 44,
) => panel.renderAt(width, height).map(strip);

it('fills panels in configured order until the height runs out', () => {
  releases.push(
    source('subagents', 'Agents', agents(2), SUMMARY),
    source('todos', 'Todos', agents(2)),
  );
  const panel = sidebar([
    { id: 'subagents', visible: true },
    { id: 'todos', visible: true },
    { id: 'session', visible: true },
  ]);
  // Agents 5 lines (2 rows + footer + borders), blank, Todos 5 lines.
  const lines = render(panel, 11);
  expect(lines).toHaveLength(11);
  expect(lines.join('\n')).toContain('AGENTS');
  expect(lines.join('\n')).toContain('TODOS');
  expect(lines.join('\n')).not.toContain('SESSION');
  expect(lines.join('\n')).toContain('/todos ▸ detail');
});

it('shows the first rows and +N more when a work panel does not fit', () => {
  releases.push(source('subagents', 'Agents', agents(5), SUMMARY));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const lines = render(panel, 6);
  expect(lines).toHaveLength(6);
  expect(lines[1]).toContain('agent 0');
  expect(lines[2]).toContain('agent 1');
  expect(lines[3]).toContain('agent 2');
  expect(lines[4]).toMatch(/\+2 more/);
  expect(lines.join('\n')).not.toContain('detail');
});

it('drops the footer before any row', () => {
  releases.push(source('subagents', 'Agents', agents(2), SUMMARY));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const full = render(panel, 5);
  expect(full.at(-2)).toContain('/subagents ▸ detail');
  const noFooter = render(panel, 4);
  expect(noFooter).toHaveLength(4);
  expect(noFooter.join('\n')).toContain('agent 0');
  expect(noFooter.join('\n')).toContain('agent 1');
  expect(noFooter.join('\n')).not.toContain('detail');
  // Only now do rows go.
  const cut = render(panel, 3);
  expect(cut.join('\n')).toContain('agent 0');
  expect(cut.join('\n')).not.toContain('agent 1');
});

it('turns a panel that cannot fit its title and one row into a title-only line', () => {
  releases.push(source('subagents', 'Agents', agents(3), SUMMARY));
  const panel = sidebar([
    { id: 'subagents', visible: true },
    { id: 'session', visible: true },
  ]);
  for (const height of [1, 2]) {
    const lines = render(panel, height);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('AGENTS');
    expect(lines[0]).toContain('3·0·0');
  }
  // Agents take 6 lines and a gap; one line is left for Session's title.
  const lines = render(panel, 8);
  expect(lines[0]).toContain('AGENTS');
  expect(lines.slice(6)).toEqual(['', expect.stringContaining('SESSION')]);
  expect(render(panel, 7).join('\n')).not.toContain('SESSION');
});

it('never exceeds the available height at any size', () => {
  releases.push(
    source('subagents', 'Agents', agents(4), SUMMARY),
    source('todos', 'Todos', []),
  );
  const panel = sidebar(
    [
      { id: 'session', visible: true },
      { id: 'workspace', visible: true },
      { id: 'subagents', visible: true },
      { id: 'todos', visible: true },
      { id: 'cost', visible: true },
    ],
    { cost: () => tracker([task('a', 1), task('b', 2)]) },
  );
  for (const width of [28, 36, 44, 72])
    for (let height = 0; height <= 45; height++) {
      const lines = panel.renderAt(width, height);
      expect(lines.length).toBeLessThanOrEqual(height);
      for (const line of lines)
        expect(panelVisibleWidth(line)).toBeLessThanOrEqual(width);
    }
});

it('gives the label column back to the value below 28 columns', () => {
  const provider = 'a-very-long-provider-name';
  const panel = sidebar([{ id: 'session', visible: true }], {
    context: () => {
      const ctx = context();
      return { ...ctx, model: { id: 'm', provider } } as typeof ctx;
    },
  });
  const value = (width: number) => {
    const row = render(panel, 20, width).find((l) => l.includes('Provider'));
    return (row ?? '').slice(2, -2).replace(/^Provider\s*/, '');
  };
  // 28 columns: 24 inner - 12 label = 12 for the value; 27: 23 - 9 = 14.
  expect(value(28)).toHaveLength(12);
  expect(value(27)).toHaveLength(14);
  expect(value(24)).toHaveLength(11);
});

it('shows only a widen hint below 24 columns and nothing is absorbed', () => {
  releases.push(source('subagents', 'Agents', agents(2), SUMMARY));
  const panel = sidebar([
    { id: 'subagents', visible: true },
    { id: 'session', visible: true },
  ]);
  for (const width of [23, 10]) {
    const lines = render(panel, 30, width);
    expect(lines).toHaveLength(1);
    expect(panelVisibleWidth(lines[0])).toBeLessThanOrEqual(width);
    expect(lines[0].startsWith('widen:')).toBe(true);
    expect(panel.sourceIds(width)).toEqual([]);
    expect(panel.hasAnimation(width)).toBe(false);
  }
  expect(render(panel, 30, 23)).toEqual([WIDEN_HINT]);
  expect(WIDEN_HINT).toBe('widen: /sidebar resize');
  // 24 is the narrowest width that still draws panels.
  expect(render(panel, 30, 24)[0]).toContain('AGENTS');
  expect(panel.sourceIds(24)).toEqual(['subagents']);
});
