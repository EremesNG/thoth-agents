import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { sidebar, source, strip } from './fixture.js';
import { type Mode, oracleRow, SUMMARY } from './oracle-row.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

type Element =
  | 'context'
  | 'cost'
  | 'speed'
  | 'tokens'
  | 'tools'
  | 'warnings'
  | 'model';

/** Line-2 priority after glyph, name, summary and elapsed (all on line 1). */
const PRIORITY: readonly Element[] = [
  'context',
  'cost',
  'speed',
  'tokens',
  'tools',
  'warnings',
  'model',
];

const detectors: Record<Element, (line: string) => boolean> = {
  context: (line) => line.includes('41.0%'),
  cost: (line) => line.includes('0.42'),
  speed: (line) => line.includes('88'),
  tokens: (line) => line.includes('12k'),
  tools: (line) => /(tools|\*) 7/.test(line),
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

/** Splits a rendered panel into [line 1, line 2] pairs of the three oracle rows. */
function pairs(text: string[]): Array<[string, string]> {
  const body = text.slice(1, -2);
  expect(body).toHaveLength(6);
  return [0, 2, 4].map((index) => [body[index], body[index + 1]]);
}

/** Measured line-2 set per width; each is the highest-priority prefix that fits. */
const MEASURED: Record<Mode, Record<number, readonly Element[]>> = {
  native: {
    36: ['context', 'cost'],
    50: ['context', 'cost', 'speed'],
    64: ['context', 'cost', 'speed', 'tokens'],
    72: ['context', 'cost', 'speed', 'tokens'],
  },
  kit: {
    36: ['context', 'cost'],
    50: ['context', 'cost', 'speed'],
    64: ['context', 'cost', 'speed', 'tokens'],
    72: ['context', 'cost', 'speed', 'tokens', 'tools'],
  },
};

it.each(
  (['native', 'kit'] as const).flatMap((mode) =>
    [36, 50, 64, 72].map((width) => [mode, width] as const),
  ),
)('thoth-oracle rows (%s, %i cells) render two lines with the measured priority prefix', (mode, width) => {
  const text = renderRows(mode, width);
  for (const line of text) expect(panelVisibleWidth(line)).toBe(width);
  // top + two lines for each of the running, completed and failed rows + footer + bottom
  expect(text).toHaveLength(6 + 3);
  for (const [first, second] of pairs(text)) {
    expect(first).toContain('oracle');
    expect(first).not.toContain('thoth-');
    // Line 1: glyph, name, summary in the leftover width and elapsed, never metrics.
    expect(first).toMatch(/(?:\d+m \d\ds|\d+s)/);
    expect(visible(first)).toEqual([]);
    // Line 2 sits under the name and keeps exactly the measured priority prefix.
    expect(second).not.toContain('oracle');
    expect(visible(second)).toEqual(MEASURED[mode][width]);
    const summary = /oracle · (.*?) +· /u.exec(first)?.[1] ?? '';
    if (width >= 50) {
      // Readable: more than a fragment of the task, or all of it.
      expect(summary.startsWith('reviewing'), first).toBe(true);
      expect(panelVisibleWidth(summary)).toBeGreaterThan(12);
    }
  }
});

it.each([
  'native',
  'kit',
] as const)('wide sidebars (%s) add the lower priorities to line 2', (mode) => {
  const text = renderRows(mode, 150, ['⚠ 2 dropped']);
  for (const [first, second] of pairs(text)) {
    expect(first).toContain(SUMMARY);
    expect(visible(second)).toEqual([...PRIORITY]);
  }
});

const WARNINGS = [
  '⚠ 2 dropped',
  'anthropic/five_hour: rate limited · reset 17:30',
];

it.each([
  'native',
  'kit',
] as const)('warned thoth-oracle rows (%s) keep line 2 a priority prefix at every width 36-100', (mode) => {
  for (let width = 36; width <= 100; width++) {
    for (const warnings of [[], WARNINGS.slice(0, 1), WARNINGS]) {
      const text = renderRows(mode, width, warnings);
      const tag = `${mode}/${width}/${warnings.length}`;
      for (const line of text) expect(panelVisibleWidth(line), tag).toBe(width);
      for (const [first, second] of pairs(text)) {
        // Warnings never crowd line 1; they show on line 2 only in their priority slot.
        expect(first, tag).not.toContain('dropped');
        const shown = visible(second);
        const present = PRIORITY.filter(
          (element) => element !== 'warnings' || warnings.length > 0,
        );
        expect(shown, tag).toEqual(present.slice(0, shown.length));
        // A truncated summary is never a fragment below four cells, nor a bare separator.
        const fragment = /oracle · ([^·]*?)\s+·/u.exec(first)?.[1];
        if (fragment && fragment.trim() !== SUMMARY)
          expect(
            panelVisibleWidth(fragment.trim()),
            `${tag}: ${first}`,
          ).toBeGreaterThanOrEqual(4);
        expect(first, tag).not.toMatch(/·\s*…/);
      }
    }
  }
});
