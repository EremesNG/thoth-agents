import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./checker', () => ({
  extractChannel: vi.fn(() => 'latest'),
  findPluginEntry: vi.fn(() => ({
    entry: 'thoth-agents@1.0.0',
    isPinned: true,
    pinnedVersion: '1.0.0',
    configPath: '/mock/opencode.json',
  })),
  getCachedVersion: vi.fn(() => '1.0.0'),
  getLatestVersion: vi.fn(async () => '2.0.0'),
  getLocalDevVersion: vi.fn(() => null),
  updatePinnedVersion: vi.fn(() => true),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() =>
    JSON.stringify({ dependencies: { 'thoth-agents': '1.0.0' } }),
  ),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({ log: vi.fn() }));

import { createAutoUpdateCheckerHook } from './index';

describe('auto-update-checker notification-only runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('newer release from a non-Node workspace only notifies and never runs the package manager', async () => {
    const showToast = vi.fn(async () => undefined);
    const shell = vi.fn(async () => undefined);
    const context = {
      directory: '/unity-project',
      client: { tui: { showToast } },
      $: shell,
    };
    const hook = Reflect.apply(createAutoUpdateCheckerHook, undefined, [
      context,
      { showStartupToast: false },
      shell,
    ]);

    hook.event({ event: { type: 'session.created' } });
    await vi.runAllTimersAsync();

    expect(showToast).toHaveBeenCalledOnce();
    const notification = showToast.mock.calls[0]?.[0]?.body;
    expect(notification?.message).toContain(
      'npx thoth-agents@latest install --agent=opencode',
    );
    expect(notification?.message).toContain('interactive CLI Update');
    expect(notification?.message).not.toContain('Restart to apply');
    expect(shell).not.toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
