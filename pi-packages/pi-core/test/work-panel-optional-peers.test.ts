import { expect, it, vi } from 'vitest';
import { ensureWorkPanel, registerWorkPanelProvider } from '../src/index.js';
import { provider, uiSession } from './work-panel-fixture.js';

vi.mock('@earendil-works/pi-coding-agent', () => {
  throw new Error('optional SDK absent');
});
vi.mock('@earendil-works/pi-tui', () => {
  throw new Error('optional TUI absent');
});

it('keeps the public entry importable and uses native output without optional runtime peers', async () => {
  const session = uiSession();
  const unregister = registerWorkPanelProvider(session.ctx, provider());
  const release = await ensureWorkPanel(session.ctx);
  try {
    expect(session.render()).toEqual([
      '◆ Agents · 1 items',
      '  ◐ Agents item',
      '← interact',
    ]);
    expect(session.key('\x1b[D')).toEqual({ consume: true });
    expect(session.key('\x1b')).toEqual({ consume: true });
  } finally {
    release();
    unregister();
  }
  expect(session.listenerCount()).toBe(0);
});
