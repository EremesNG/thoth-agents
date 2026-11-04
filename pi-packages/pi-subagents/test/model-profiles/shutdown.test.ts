import { initTheme } from '@earendil-works/pi-coding-agent';
import { bindWorkPanelLifecycle } from '@thoth-agents/pi-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  invalidatableContext,
  overlayLifecycle,
  ownedOverlaySession,
} from '../../../pi-core/test/owned-overlay-fixture.js';
import { runSubagentModelsCommand } from '../../src/model-profiles/command.js';
import { useProfileEnv } from './support.js';

beforeAll(() => initTheme('dark'));
describe('model profiles overlay shutdown', () => {
  const env = useProfileEnv();
  it.each([
    'shutdown first',
    'external removal first',
    'normal close',
  ])('returns normally if the originating context is invalidated (%s)', async (order) => {
    vi.useFakeTimers();
    const {
      ctx: originalContext,
      tui,
      completions,
      input,
    } = ownedOverlaySession();
    const { ctx, invalidate } = invalidatableContext(originalContext);
    Object.assign(ctx, env().ctx());
    const lifecycle = overlayLifecycle(ctx);
    const release = bindWorkPanelLifecycle(lifecycle.pi, ctx);
    const notify = vi.fn();
    Object.assign(ctx.ui, { notify });
    try {
      const result = runSubagentModelsCommand(ctx);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(tui.hasOverlay()).toBe(true);
      if (order === 'normal close') input('\x1b');
      else {
        if (order === 'external removal first') tui.hideOverlay();
        lifecycle.shutdown();
      }
      invalidate();
      expect(() => ctx.ui).toThrow('This extension ctx is stale');
      await expect(result).resolves.toBe('Closed model profiles.');
      if (order === 'normal close') {
        expect(completions).toHaveBeenCalledExactlyOnceWith({
          action: 'close',
          discarded: 0,
        });
        expect(notify).toHaveBeenCalledExactlyOnceWith(
          'Closed model profiles.',
          'info',
        );
      } else {
        expect(completions).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(notify).not.toHaveBeenCalled();
      }
      expect(tui.hasOverlay()).toBe(false);
    } finally {
      release();
      tui.stop();
      vi.useRealTimers();
    }
  });
});
