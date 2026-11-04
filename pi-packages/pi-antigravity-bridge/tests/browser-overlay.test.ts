import { initTheme } from '@earendil-works/pi-coding-agent';
import { settleOwnedOverlays } from '@thoth-agents/pi-core';
import { beforeAll, expect, test, vi } from 'vitest';
import { ownedOverlaySession } from '../../pi-core/test/owned-overlay-fixture.js';
import { showArtifactsBrowser } from '../src/artifacts-ui.js';
import { showTasksBrowser } from '../src/tasks-ui.js';

beforeAll(() => initTheme('dark', false));

test.each(['artifacts', 'tasks'] as const)('%s browser settles once on reload without closing a foreign overlay', async (surface) => {
  vi.useFakeTimers();
  const app = ownedOverlaySession();
  try {
    const result = surface === 'artifacts'
      ? showArtifactsBrowser(app.ctx.ui, [{ name: 'report', kind: 'file', mediaType: 'text/plain', bytes: 10, modifiedMs: 0 } as never])
      : showTasksBrowser(app.ctx.ui, [{ id: 1, bytes: 10, modifiedMs: 0, active: true, livenessKnown: true } as never], true);
    const settled = vi.fn();
    void result.then(settled);
    await Promise.resolve();
    expect(app.tui.hasOverlay()).toBe(true);
    const foreign = { render: () => ['Foreign'], invalidate() {}, handleInput() {} };
    const handle = app.tui.showOverlay(foreign);
    settleOwnedOverlays(app.ctx);
    await vi.waitFor(() => expect(settled).toHaveBeenCalledExactlyOnceWith(undefined));
    settleOwnedOverlays(app.ctx);
    await expect(result).resolves.toBeUndefined();
    expect(app.completions).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(app.tui.getFocusedComponent()).toBe(foreign);
    handle.hide();
    expect(app.tui.hasOverlay()).toBe(false);
  } finally {
    app.tui.stop();
    vi.useRealTimers();
  }
});
