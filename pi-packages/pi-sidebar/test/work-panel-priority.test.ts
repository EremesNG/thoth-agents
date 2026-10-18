import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { sidebar, source, strip } from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

type Mode = 'native' | 'kit';
type Element =
  | 'elapsed'
  | 'context'
  | 'cost'
  | 'summary'
  | 'speed'
  | 'tokens'
  | 'tools'
  | 'warnings'
  | 'model';

/** Priority order of the optional elements; the glyph and name are always shown. */
const PRIORITY: readonly Element[] = [
  'elapsed',
  'context',
  'cost',
  'summary',
  'speed',
  'tokens',
  'tools',
  'warnings',
  'model',
];

const SUMMARY = 'reviewing the migration plan';
const sep = ' · ';

/**
 * Mirrors the subagents provider `taskRow` for a `thoth-oracle` task: label text per render
 * mode, the `thoth-` prefix supplied as compact name text, and the identity warning.
 */
function oracleRow(
  mode: Mode,
  status: 'running' | 'completed' | 'failed',
  elapsed: string,
  warnings: readonly string[] = [],
) {
  const kit = mode === 'kit';
  const label = (icon: string, text: string) => (kit ? icon : text);
  const add = (key: string, prefix: string, value: string) => ({
    key: key as never,
    segments: [
      { text: prefix, role: 'meta' as const },
      { text: value, role: 'meta' as const },
    ],
  });
  const tokens = [
    ['in ', '↑', '12k', 'in'],
    ['out ', '↓', '3.4k', 'out'],
  ] as const;
  const live = status === 'running';
  return {
    id: `${status}-oracle`,
    name: 'thoth-oracle',
    primary: SUMMARY,
    status,
    state: live ? ('running' as const) : ('done' as const),
    ...(live ? {} : { endedAt: Date.now() }),
    sortStartedAt: 1,
    statusGlyph: status as never,
    identity: [
      { text: 'thoth-oracle', compact: 'oracle', role: 'primary' as const },
      { text: sep, role: 'meta' as const },
      { text: SUMMARY, role: 'secondary' as const },
      ...warnings.flatMap((text) => [
        { text: sep, role: 'meta' as const },
        { text, role: 'warning' as const },
      ]),
    ],
    metrics: [
      {
        key: 'model' as const,
        columnsOnly: true,
        segments: [{ text: 'gpt-5·hi', role: 'meta' as const }],
      },
      add('tools', `${label('*', 'tools')} `, '7'),
      {
        key: 'tokens' as const,
        segments: tokens.flatMap(([word, arrow, value, direction], index) => [
          ...(index ? [{ text: ' ', role: 'meta' as const }] : []),
          {
            text: kit ? arrow : word,
            role: 'meta' as const,
            direction: direction as 'in' | 'out',
          },
          {
            text: value,
            role: 'meta' as const,
            direction: direction as 'in' | 'out',
          },
        ]),
      },
      add('context', 'ctx ', '41.0%'),
      kit
        ? add('speed', 'tok/s ', '88')
        : {
            key: 'speed' as const,
            segments: [{ text: '88 tok/s', role: 'meta' as const }],
          },
      add('cost', '$', '0.42'),
      add('elapsed', `${label('◷', 'elapsed')} `, elapsed),
    ],
  };
}

const detectors: Record<Element, (line: string) => boolean> = {
  elapsed: (line) => /\d+m \d\ds|\b\d+s\b/.test(line),
  context: (line) => line.includes('41.0%'),
  cost: (line) => line.includes('0.42'),
  summary: (line) => line.includes('revi'),
  speed: (line) => line.includes('88'),
  tokens: (line) => line.includes('12k'),
  tools: (line) => /(tools|\*) 7\b/.test(line),
  warnings: (line) => line.includes('dropped'),
  model: (line) => line.includes('gpt-5'),
};

const visible = (line: string) =>
  PRIORITY.filter((element) => detectors[element](line));

function renderRows(
  mode: Mode,
  width: number,
  warnings: readonly string[] = [],
) {
  if (mode === 'kit') {
    const token = registerRenderKit(createTestRenderKit(), {});
    releases.push(() => withdrawRenderKit(token));
  }
  releases.push(
    source(
      'subagents',
      'Agents',
      [
        oracleRow(mode, 'running', '1m 05s', warnings),
        oracleRow(mode, 'completed', '2m 10s', warnings),
        oracleRow(mode, 'failed', '9s', warnings),
      ] as never,
      { running: 1, completed: 1, failed: 1 },
    ),
  );
  return sidebar([{ id: 'subagents', visible: true }])
    .renderAt(width, 40)
    .map(strip);
}

/** Measured visible elements per width; each is the highest-priority prefix that fits. */
const MEASURED: Record<Mode, Record<number, readonly Element[]>> = {
  native: {
    // Context does not fit, so the summary only takes the leftover cells (truncated).
    36: ['elapsed', 'summary'],
    50: ['elapsed', 'context', 'cost'],
    64: ['elapsed', 'context', 'cost', 'summary'],
    72: ['elapsed', 'context', 'cost', 'summary'],
  },
  kit: {
    // Context does not fit, so the summary only takes the leftover cells (truncated).
    36: ['elapsed', 'summary'],
    50: ['elapsed', 'context', 'cost'],
    64: ['elapsed', 'context', 'cost', 'summary'],
    72: ['elapsed', 'context', 'cost', 'summary'],
  },
};

it.each(
  (['native', 'kit'] as const).flatMap((mode) =>
    [36, 50, 64, 72].map((width) => [mode, width] as const),
  ),
)('thoth-oracle rows (%s, %i cells) show the exact priority prefix', (mode, width) => {
  const text = renderRows(mode, width);
  const lines = text.filter((line) => line.includes('oracle'));
  // One line per row: running, completed and failed.
  expect(lines).toHaveLength(3);
  for (const line of text) expect(panelVisibleWidth(line)).toBe(width);
  for (const line of lines) {
    expect(line).not.toContain('thoth-');
    const shown = visible(line);
    expect(shown).toEqual(MEASURED[mode][width]);
    // Nothing lower shows without everything higher; a leftover-width summary is exempt.
    const ranked = PRIORITY.filter((element) => element !== 'summary');
    const metrics = shown.filter((element) => element !== 'summary');
    expect(metrics).toEqual(ranked.slice(0, metrics.length));
    if (shown.includes('speed')) expect(shown).toContain('summary');
  }
});

it.each([
  'native',
  'kit',
] as const)('wide sidebars (%s) add the lower priorities once the summary keeps its space', (mode) => {
  const text = renderRows(mode, 150, ['⚠ 2 dropped']);
  const lines = text.filter((line) => line.includes('oracle'));
  expect(lines).toHaveLength(3);
  for (const line of lines) expect(visible(line)).toEqual([...PRIORITY]);
});

const WARNINGS = [
  '⚠ 2 dropped',
  'anthropic/five_hour: rate limited · reset 17:30',
];

it.each([
  'native',
  'kit',
] as const)('warned thoth-oracle rows (%s) honour admission at every width 36-100', (mode) => {
  for (let width = 36; width <= 100; width++) {
    for (const warnings of [[], WARNINGS.slice(0, 1), WARNINGS]) {
      const text = renderRows(mode, width, warnings);
      const lines = text.filter((line) => line.includes('oracle'));
      const tag = `${mode}/${width}/${warnings.length}`;
      expect(lines, tag).toHaveLength(3);
      for (const line of lines) {
        const shown = visible(line);
        // Warnings need tools (and everything above) to be visible first.
        if (shown.includes('warnings')) expect(shown, tag).toContain('tools');
        // Anything below the summary requires its 12-cell reservation (or full text).
        const lower = shown.some((e) =>
          ['speed', 'tokens', 'tools', 'warnings', 'model'].includes(e),
        );
        const fragment = /oracle · ([^·]*?)\s+·/.exec(line)?.[1] ?? '';
        if (lower) {
          expect(shown, tag).toContain('summary');
          expect(
            fragment.trim() === SUMMARY ||
              panelVisibleWidth(fragment.trim()) >= 12,
            `${tag}: ${line}`,
          ).toBe(true);
        }
        // A truncated summary is never a fragment below four cells, nor a bare separator.
        if (fragment && fragment.trim() !== SUMMARY)
          expect(
            panelVisibleWidth(fragment.trim()),
            `${tag}: ${line}`,
          ).toBeGreaterThanOrEqual(4);
        expect(line, tag).not.toMatch(/·\s*…/);
      }
    }
  }
});
