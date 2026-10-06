import { visibleWidth } from '@earendil-works/pi-tui';
import type { RenderKitTheme } from '@thoth-agents/pi-core';
import { expect, it, vi } from 'vitest';
import { createRenderKit } from '../src/render-kit/index.ts';

const theme: RenderKitTheme = { fg: (_role, text) => text };

it.each([
  46, 50,
])('composes widget rows with caller-owned braille frames and metric text at width %i', (width) => {
  vi.useFakeTimers();
  try {
    const kit = createRenderKit({});
    // Producers own metric formatting and row layout; the kit owns glyphs and rails.
    const metricRows = [
      'tools 5 · ↑1.0k ↓100 · $?',
      'context 62.0% · 25 tok/s · elapsed 2s',
    ];
    const render = (frame: number) => {
      const indicator = kit.indicator(theme, undefined, {
        status: 'running',
        elapsedMs: 2000,
        frame,
      });
      expect(indicator.elapsed).toBe('2s');
      return [
        kit.widgetHeading(
          theme,
          { title: 'Tasks', counts: { completed: 0, total: 2 } },
          width,
        ),
        kit.treeRow(
          theme,
          { text: `${indicator.glyph} first · work`, depth: 1 },
          width,
        ),
        ...metricRows.map((text) =>
          kit.treeRow(theme, { text, depth: 1 }, width),
        ),
        kit.treeRow(
          theme,
          { text: 'second · work', depth: 1, last: true, status: 'queued' },
          width,
        ),
      ];
    };

    const lines = render(0);
    const next = render(1);
    expect(lines[0]).toBe('▲ Tasks 0/2');
    expect(lines[1]).toBe('    ├─ ⠋ first · work');
    expect(next[1]).toBe('    ├─ ⠙ first · work');
    expect(next.slice(2)).toEqual(lines.slice(2));
    expect(lines.slice(2, -1)).toEqual(
      metricRows.map((text) => `    ├─ ${text}`),
    );
    expect(lines.at(-1)).toBe('    └─ ○ second · work');
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      kit.indicator(theme, undefined, { status: 'completed', frame: 1 }).glyph,
    ).toBe('✓');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
