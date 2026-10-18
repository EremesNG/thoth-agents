import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { sidebar, source, strip } from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

const sep = ' · ';
const useKit = (kit: boolean) => {
  if (!kit) return;
  const token = registerRenderKit(createTestRenderKit(), {});
  releases.push(() => withdrawRenderKit(token));
};

/** Agents-shaped row whose short summary is one combined or two split segments. */
function agent(summary: string, combined: boolean) {
  return {
    id: '1',
    primary: summary,
    name: 'worker',
    status: 'running',
    state: 'running' as const,
    statusGlyph: 'running' as never,
    sortStartedAt: 1,
    identity: [
      { text: 'worker', role: 'primary' as const },
      ...(combined
        ? [{ text: `${sep}${summary}`, role: 'secondary' as const }]
        : [
            { text: sep, role: 'meta' as const },
            { text: summary, role: 'secondary' as const },
          ]),
    ],
    metrics: [
      {
        key: 'tokens' as const,
        segments: [
          { text: '↑', role: 'meta' as const, direction: 'in' as const },
          { text: '12k', role: 'meta' as const, direction: 'in' as const },
        ],
      },
      {
        key: 'cost' as const,
        segments: [{ text: '$0.42', role: 'meta' as const }],
      },
      {
        key: 'elapsed' as const,
        segments: [{ text: '1m 05s', role: 'meta' as const }],
      },
    ],
  };
}

const lines = (id: string, width: number) =>
  sidebar([{ id: id as never, visible: true }])
    .renderAt(width, 40)
    .map(strip);

it.each([
  false,
  true,
])('combined and split short summaries render identically (kit: %s)', (kit) => {
  useKit(kit);
  for (let width = 50; width <= 100; width++) {
    const render = (combined: boolean) => {
      const release = source(
        'subagents',
        'Agents',
        [agent('ok', combined)] as never,
        { running: 1 },
      );
      try {
        // The running spinner animates; compare everything but its frame.
        return lines('subagents', width).map((line) =>
          line.replace(/[⠀-⣿]/gu, '*'),
        );
      } finally {
        release();
      }
    };
    const split = render(false);
    expect(render(true), `${width}`).toEqual(split);
    // A complete short summary is never hidden once the name column has room for it.
    if (width >= 68)
      expect(split.join('\n'), `${width}`).toContain('worker · ok');
  }
});

/** Mirrors navigator-provider `rowFromMeta` identity, metrics and segments. */
function background(status: string, text: string, glyph: string) {
  const name = 'thoth-worker';
  const elapsed = '2m 10s';
  const done = status === 'running' ? 'running' : 'failed';
  return {
    providerId: 'background-tasks',
    id: status,
    name,
    status,
    statusGlyph: glyph as never,
    state: done as 'running' | 'failed',
    ...(status === 'running' ? {} : { endedAt: Date.now() }),
    elapsed,
    primary: text,
    identity: [
      { text: name, role: 'primary' as const },
      { text: sep, role: 'meta' as const },
      { text, role: 'secondary' as const },
    ],
    metrics: [
      {
        key: 'elapsed' as const,
        segments: [{ text: elapsed, role: 'meta' as const }],
      },
    ],
    segments: [
      { text: name, role: 'primary' as const },
      { text: `${sep}${text}`, role: 'secondary' as const },
      { text: `${sep}${elapsed}`, role: 'meta' as const },
    ],
    sortStartedAt: status === 'running' ? 2 : 1,
  };
}

it.each([
  false,
  true,
])('Background rows never show a summary fragment under four cells (kit: %s)', (kit) => {
  useKit(kit);
  releases.push(
    source(
      'background-tasks',
      'Background',
      [
        background('timed_out', 'timed out', 'timedOut'),
        background('running', 'running', 'running'),
      ] as never,
      { running: 1, failed: 1 },
    ),
  );
  for (let width = 36; width <= 90; width++) {
    const text = lines('background-tasks', width);
    const rows = text.filter((line) => line.includes('thoth-worker'));
    const tag = `${kit}/${width}`;
    expect(rows, tag).toHaveLength(2);
    for (const line of text) expect(panelVisibleWidth(line), tag).toBe(width);
    for (const line of rows) {
      // After the name: nothing, or a separator and a fragment of at least four cells.
      const after = /thoth-worker((?:\s+·\s+\S[^·]*?)?)\s+·\s+\d/.exec(
        line,
      )?.[1];
      const fragment = (after ?? '').replace(/^\s*·\s*/, '').trim();
      expect(line, tag).not.toMatch(/·\s*…/);
      if (fragment)
        expect(
          panelVisibleWidth(fragment),
          `${tag}: ${line}`,
        ).toBeGreaterThanOrEqual(4);
    }
    if (width >= 60) {
      expect(text.join('\n'), tag).toContain('thoth-worker · timed out');
    }
  }
  // 36–40 are the reported widths: the fragment rule held there too (loop above).
});
