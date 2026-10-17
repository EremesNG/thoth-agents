import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { agentRow, sidebar, source, strip } from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

/** Same identity shape the subagents provider emits with a provider-limit warning. */
function warned(name: string) {
  return {
    ...agentRow('1', name, 'running', {}),
    identity: [
      { text: name, role: 'primary' as const },
      { text: ' · ', role: 'meta' as const },
      { text: 'inspect the repository', role: 'secondary' as const },
      {
        text: ' · anthropic/five_hour: rate limited · reset 17:30',
        role: 'warning' as const,
      },
    ],
    metrics: [
      {
        key: 'elapsed' as const,
        segments: [{ text: '1m 00s', role: 'meta' as const }],
      },
    ],
  };
}

it.each([
  [false, 'thoth-worker'],
  [true, 'thoth-worker'],
  [false, 'worker'],
  [true, 'worker'],
])('warning rows keep name and elapsed at 36 and 50 cells (kit: %s, %s)', (kit, name) => {
  if (kit) {
    const token = registerRenderKit(createTestRenderKit(), {});
    releases.push(() => withdrawRenderKit(token));
  }
  releases.push(source('subagents', 'Agents', [warned(name)] as never));
  for (const width of [36, 50]) {
    const text = sidebar([{ id: 'subagents', visible: true }])
      .renderAt(width, 40)
      .map(strip);
    const lines = text.filter((line) => line.includes('1m 00s'));
    expect(lines, `${width}`).toHaveLength(1);
    expect(lines[0]).toContain(name.slice(0, 5));
    if (width === 50) expect(lines[0]).toContain(name);
  }
});
