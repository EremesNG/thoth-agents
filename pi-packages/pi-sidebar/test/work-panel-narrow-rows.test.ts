import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { agentRow, sidebar, source, strip } from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

type Glyph = 'timedOut' | 'cancelled' | 'resolved' | 'failed' | 'completed';
const GLYPHS: Record<Glyph, string> = {
  timedOut: '◷',
  cancelled: '■',
  resolved: '↻',
  failed: '✗',
  completed: '✓',
};

/** Provider-shaped terminal rows: name, separate meta separator, summary, elapsed column. */
function rows(name: string, summaries: Record<Glyph, string>) {
  return (Object.keys(GLYPHS) as Glyph[]).map((glyph, index) => ({
    ...agentRow(String(index), name, glyph, {}),
    statusGlyph: glyph as never,
    state: glyph === 'completed' ? ('done' as const) : ('failed' as const),
    sortStartedAt: index,
    endedAt: index,
    identity: [
      { text: name, role: 'primary' as const },
      { text: ' · ', role: 'meta' as const },
      { text: summaries[glyph], role: 'secondary' as const },
    ],
    metrics: [
      {
        key: 'elapsed' as const,
        segments: [{ text: '1m 00s', role: 'meta' as const }],
      },
    ],
  }));
}

const agents = {
  timedOut: 'inspect the repository layout',
  cancelled: 'inspect the repository layout',
  resolved: 'inspect the repository layout',
  failed: 'inspect the repository layout',
  completed: 'inspect the repository layout',
};
const background = {
  timedOut: 'timed out',
  cancelled: 'cancelled',
  resolved: 'failed, resolved',
  failed: 'failed, inspect log',
  completed: 'exit 0',
};

it.each([
  [false, 'thoth-worker'],
  [false, 'worker'],
  [true, 'thoth-worker'],
  [true, 'worker'],
])('Agents and Background rows keep glyph, name and elapsed on one line at 36 and 50 cells (kit: %s, %s)', (kit, name) => {
  if (kit) {
    const token = registerRenderKit(createTestRenderKit(), {});
    releases.push(() => withdrawRenderKit(token));
  }
  for (const [id, label, summaries] of [
    ['subagents', 'Agents', agents],
    ['background-tasks', 'Background', background],
  ] as const) {
    const data = rows(name, summaries).slice(0, 3);
    releases.push(source(id, label, data as never));
    for (const width of [36, 50]) {
      const text = sidebar([{ id, visible: true }])
        .renderAt(width, 40)
        .map(strip);
      const lines = text.filter((line) => line.includes(name.slice(0, 2)));
      expect(lines, `${id}/${width}`).toHaveLength(data.length);
      // Elapsed is the only metric: one line each, most recently finished first.
      for (const [index, line] of lines.entries()) {
        expect(line).toContain(
          GLYPHS[[...data].reverse()[index].status as Glyph],
        );
        expect(line).toContain('1m 00s');
      }
    }
    releases.pop()?.();
  }
});
