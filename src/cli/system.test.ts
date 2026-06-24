import { describe, expect, test, vi } from 'vitest';

// Mock process spawning before importing the module under test so the
// host-independent assertions (isOpenCodeInstalled / isTmuxInstalled /
// getOpenCodeVersion) never spawn real processes. The fake reports a clean
// exit (exitCode 0) and an empty stdout stream that `new Response(...)` can read.
vi.mock('../utils/subprocess', () => ({
  spawn: vi.fn(() => ({
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }),
    stderr: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }),
    exited: Promise.resolve(0),
    exitCode: 0,
    kill: vi.fn(),
  })),
}));

import {
  fetchLatestVersion,
  getOpenCodeVersion,
  getOpenCodeVersionInvocation,
  isOpenCodeInstalled,
  isTmuxInstalled,
} from './system';

describe('system', () => {
  test('isOpenCodeInstalled returns boolean', async () => {
    // We don't necessarily want to depend on the host system
    // but for a basic test we can just check it returns a boolean
    const result = await isOpenCodeInstalled();
    expect(typeof result).toBe('boolean');
  });

  test('isTmuxInstalled returns boolean', async () => {
    const result = await isTmuxInstalled();
    expect(typeof result).toBe('boolean');
  });

  test('fetchLatestVersion returns version string or null', async () => {
    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ version: '1.2.3' }),
      };
    }) as any;

    try {
      const version = await fetchLatestVersion('any-package');
      expect(version).toBe('1.2.3');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('fetchLatestVersion returns null on error', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn(async () => {
        return {
          ok: false,
        };
      }) as any;

      const version = await fetchLatestVersion('any-package');
      expect(version).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('getOpenCodeVersion returns string or null', async () => {
    const version = await getOpenCodeVersion();
    if (version !== null) {
      expect(typeof version).toBe('string');
    } else {
      expect(version).toBeNull();
    }
  });

  test('OpenCode version invocation uses shell on Windows so command shims resolve', () => {
    expect(getOpenCodeVersionInvocation('opencode', 'win32')).toEqual({
      command: ['opencode --version'],
      options: {
        shell: true,
        stderr: 'pipe',
        stdout: 'pipe',
      },
    });
  });
});
