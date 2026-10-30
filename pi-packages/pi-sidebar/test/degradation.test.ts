import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it } from 'vitest';
import type { BarStyle } from '../src/panels/meter.js';
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

it('reserves content for later panels before growing Agents', () => {
  releases.push(
    source('subagents', 'Agents', agents(7), SUMMARY),
    source('todos', 'Todos', agents(2)),
  );
  const panel = sidebar([
    { id: 'subagents', visible: true },
    { id: 'todos', visible: true },
    { id: 'session', visible: true },
  ]);
  const lines = render(panel, 14);
  expect(lines).toHaveLength(14);
  expect(lines.join('\n')).toContain('AGENTS');
  expect(lines.join('\n')).toContain('TODOS');
  expect(lines.join('\n')).toContain('SESSION');
  expect(lines.join('\n')).toContain('Model');
});

it('shows the newest active rows in launch order and +N more when a work panel does not fit', () => {
  releases.push(source('subagents', 'Agents', agents(5), SUMMARY));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const lines = render(panel, 6);
  expect(lines).toHaveLength(6);
  expect(lines[1]).toContain('agent 2');
  expect(lines[2]).toContain('agent 3');
  expect(lines[3]).toContain('agent 4');
  expect(lines[4]).toMatch(/\+2 more +\/subagents ▸ detail │$/);
  const narrow = render(panel, 6, 28);
  expect(narrow[4]).toContain('+2 more');
  expect(narrow[4]).not.toContain('detail');
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
  expect(cut.join('\n')).toContain('agent 1');
  expect(cut.join('\n')).not.toContain('agent 0');
});

it('keeps trailing title summaries when minimum bodies cannot fit, dropping gaps first', () => {
  releases.push(source('subagents', 'Agents', agents(3), SUMMARY));
  const panel = sidebar([
    { id: 'subagents', visible: true },
    { id: 'session', visible: true },
  ]);
  expect(render(panel, 1)[0]).toContain('AGENTS');
  const titles = render(panel, 2);
  expect(titles).toHaveLength(2);
  expect(titles[0]).toContain('◐3');
  expect(titles[1]).toContain('SESSION');
  for (const height of [7, 8])
    expect(render(panel, height).join('\n')).toContain('SESSION');
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

it('keeps Cost content visible under metric-heavy Agent growth, measuring only rendered lines', () => {
  releases.push(
    source(
      'subagents',
      'Agents',
      Array.from({ length: 7 }, (_, i) =>
        agentRow(`a${i}`, `agent ${i}`, 'running', {
          tools: 'tools 100',
          tokens: 'in 10k out 100',
          context: 'ctx 10.0%',
          speed: 'tok/s 100',
          cost: '$1.00',
          elapsed: 'elapsed 10s',
        }),
      ),
      SUMMARY,
    ),
  );
  const panel = sidebar(
    [
      { id: 'subagents', visible: true },
      { id: 'cost', visible: true },
    ],
    {
      cost: () => tracker([task('costly', 2, { displayName: 'costly task' })]),
    },
  );
  const minimum = render(panel, 9);
  // Two-line rows: the smallest budget keeps one whole row and Cost's content.
  expect(minimum.join('\n')).toContain('ctx 10.0%');
  const roomy = render(panel, 12).join('\n');
  expect(roomy).toMatch(/\+\d+ more/);
  expect(roomy).toContain('/subagents ▸ detail');
  expect(minimum.join('\n')).toContain('costly task');
  expect(minimum.filter((line) => line.includes('│')).length).toBeGreaterThan(
    0,
  );
  for (let height = 9; height < 35; height++) {
    const rendered = render(panel, height);
    expect(rendered.join('\n')).toContain('COST');
    expect(rendered.join('\n')).toContain('costly task');
    expect(rendered.length).toBeLessThanOrEqual(height);
    expect(rendered.at(-1)).toContain('╰');
  }
});

const costOnly = (
  data: ReturnType<typeof tracker>,
  extra = [],
  bars?: BarStyle,
) =>
  sidebar(
    [{ id: 'cost', visible: true }, ...extra],
    { cost: () => data },
    bars,
  );
/** Bar glyphs per style: segment fill and cap, remainder track and marker. */
const BARS = {
  thin: { fill: '━', cap: '╸', track: '─', remainder: '○' },
  classic: { fill: '█', cap: '▌', track: '░', remainder: '░' },
} as const;
const STYLES = ['thin', 'classic'] as const;
const threeTasks = () =>
  tracker([
    task('a', 3, { displayName: 'Alpha' }),
    task('b', 2, { displayName: 'Beta' }),
    task('c', 1, { displayName: 'Gamma' }),
  ]);

it.each(
  STYLES,
)('collapses Cost to its title with the total until the bar and its first entry fit together (%s)', (bars) => {
  const { fill, cap } = BARS[bars];
  const panel = costOnly(threeTasks(), [], bars);
  for (const height of [1, 2, 3]) {
    const lines = render(panel, height);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('COST');
    expect(lines[0]).toContain('$6.00');
    // No bar and no bare overflow count in the intermediate state.
    expect(lines[0]).not.toMatch(/more|[█▌░━╸╾○]/);
  }
  const head = render(panel, 4);
  expect(head).toHaveLength(4);
  expect(head[1]).toMatch(
    new RegExp(`^│ ${fill}+${cap}${fill}+${cap}${fill}+ │$`),
  );
  expect(head[2]).toMatch(/^│ ● Alpha +50% \$3\.00 {2}│$/);
  expect(head[3]).toMatch(/^╰/);
});

it('folds Cost entries from the bottom into a +N more line and drops the footer first', () => {
  const panel = costOnly(threeTasks());
  const folded = render(panel, 5);
  expect(folded).toHaveLength(5);
  expect(folded[2]).toContain('Alpha');
  expect(folded[3]).toMatch(/^│ \+2 more +\/sidebar cost ▸ curves │$/);
  const all = render(panel, 6);
  expect(all.join('\n')).toContain('Gamma');
  expect(all.join('\n')).not.toContain('more');
  expect(all.join('\n')).not.toContain('/sidebar cost ▸ curves');
  const full = render(panel, 7);
  expect(full.at(-2)).toContain('/sidebar cost ▸ curves');
});

it('counts hidden tasks, including those inside a folded remainder entry, in the fold text', () => {
  const many = tracker([
    task('a', 4, { displayName: 'A' }),
    task('b', 3, { displayName: 'B' }),
    task('c', 2, { displayName: 'C' }),
    task('d', 1, { displayName: 'D' }),
    ...Array.from({ length: 19 }, (_, i) => task(`s${i}`, 0.01)),
  ]);
  const panel = costOnly(many);
  // Heights 5-7 hide the remainder entry (19 tasks) and then whole tasks above it.
  expect(render(panel, 5)[3]).toMatch(/\+22 more/);
  expect(render(panel, 6)[4]).toMatch(/\+21 more/);
  expect(render(panel, 7)[5]).toMatch(/\+20 more/);
  const room = render(panel, 8);
  expect(room.filter((line) => /^│ \+\d+ more +\S/.test(line))).toEqual([]);
  expect(room.join('\n')).toContain('+19 more tasks');
});

it.each(
  STYLES,
)('never renders the Cost bar without its first entry, nor a bare count, at any height or width (%s)', (bars) => {
  const { fill, cap, track, remainder } = BARS[bars];
  const barRow = new RegExp(`^│ [${fill}${cap}${track}]+ │$`);
  const legend = new RegExp(`^│ [●${remainder}] `);
  let seen = 0;
  const data = tracker(
    Array.from({ length: 9 }, (_, i) =>
      task(`t${i}`, 9 - i, { displayName: `Task ${i}` }),
    ),
  );
  const orders = [
    ['session', 'cost'],
    ['cost', 'session'],
  ];
  for (const [width, order] of [24, 28, 36, 50].flatMap((w) =>
    orders.map((o) => [w, o] as const),
  )) {
    const panel = sidebar(
      order.map((id) => ({ id, visible: true })),
      { cost: () => data },
      bars,
    );
    for (let height = 0; height <= 40; height++) {
      const lines = render(panel, height, width);
      lines.forEach((line, index) => {
        if (barRow.test(line)) {
          seen++;
          expect(lines[index + 1]).toMatch(legend);
        }
        if (/^│ \+\d+ more/.test(line))
          expect(lines[index - 1]).toMatch(
            new RegExp(`^│ (?:[●${remainder}] |[${fill}${cap}${track}]+ │)`),
          );
      });
    }
  }
  // The shape checks above must have run against real bars.
  expect(seen).toBeGreaterThan(0);
});

it('keeps the fold text of other panels while Cost counts tasks', () => {
  releases.push(source('subagents', 'Agents', agents(5), SUMMARY));
  const panel = sidebar(
    [
      { id: 'subagents', visible: true },
      { id: 'cost', visible: true },
    ],
    { cost: () => threeTasks() },
  );
  const text = render(panel, 10).join('\n');
  expect(text).toMatch(/\+3 more +\/subagents ▸ detail/);
  expect(text).toContain('● Alpha');
  expect(render(panel, 14).join('\n')).toMatch(
    /\+2 more +\/sidebar cost ▸ curves/,
  );
});
