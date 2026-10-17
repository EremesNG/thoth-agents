import { describe, expect, it, vi } from 'vitest';
import { isCodexDesktopRunning, resolveCodexBinary } from '../src/binary.js';

describe('isCodexDesktopRunning', () => {
  it('bounds even an unresponsive injected process runner', async () => {
    vi.useFakeTimers();
    try {
      const pending = isCodexDesktopRunning({
        platform: 'win32',
        exec: () => new Promise(() => {}),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(await Promise.race([pending, Promise.resolve('unbounded')])).toBe(
        'unknown',
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it('returns unknown for unsupported systems, failed or malformed process listings', async () => {
    const exec = vi.fn(async () => ({ stdout: '[]' }));
    expect(await isCodexDesktopRunning({ platform: 'linux', exec })).toBe(
      'unknown',
    );
    expect(exec).not.toHaveBeenCalled();
    for (const stdout of ['not json', '{}', '[null]']) {
      expect(
        await isCodexDesktopRunning({
          platform: 'win32',
          exec: async () => ({ stdout }),
        }),
      ).toBe('unknown');
    }
    expect(
      await isCodexDesktopRunning({
        platform: 'win32',
        exec: async () => {
          throw new Error('denied');
        },
      }),
    ).toBe('unknown');
    expect(await isCodexDesktopRunning({ platform: 'win32', exec })).toBe(
      false,
    );
  });
  it('recognizes the Store Desktop app named ChatGPT.exe in the Codex package', async () => {
    expect(
      await isCodexDesktopRunning({
        platform: 'win32',
        exec: async () => ({
          stdout: JSON.stringify([
            'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1013.3656.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe',
          ]),
        }),
      }),
    ).toBe(true);
  });
  it.each([
    '',
    '   ',
  ])('returns unknown for an inaccessible app path (%j)', async (hiddenPath) => {
    expect(
      await isCodexDesktopRunning({
        platform: 'win32',
        exec: async () => ({
          stdout: JSON.stringify([
            'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT_1_x64__publisher\\app\\ChatGPT.exe',
            hiddenPath,
          ]),
        }),
      }),
    ).toBe('unknown');
  });
  it('recognizes a verified app even when another candidate path is inaccessible', async () => {
    expect(
      await isCodexDesktopRunning({
        platform: 'win32',
        exec: async () => ({
          stdout:
            '\uFEFF' +
            JSON.stringify([
              '',
              'c:\\program files\\windowsapps\\openai.codex_26_x64__publisher\\app\\chatgpt.exe',
            ]),
        }),
      }),
    ).toBe(true);
  });
  it.each([
    'Codex.exe',
    'ChatGPT.exe',
  ])('keeps non-Store Desktop app detection for %s', async (name) => {
    expect(
      await isCodexDesktopRunning({
        platform: 'win32',
        exec: async () => ({
          stdout: JSON.stringify([
            `C:\\Local\\Programs\\OpenAI\\Codex\\app-1\\${name}`,
          ]),
        }),
      }),
    ).toBe(true);
  });
  it('distinguishes the Desktop app from standalone and bundled CLI processes', async () => {
    const exec = vi.fn(async () => ({
      stdout: JSON.stringify([
        'C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\app-1\\Codex.exe',
      ]),
    }));
    expect(await isCodexDesktopRunning({ platform: 'win32', exec })).toBe(true);
    expect(exec.mock.calls[0]).toEqual([
      'powershell.exe',
      expect.any(Array),
      expect.objectContaining({
        timeout: 2000,
        shell: false,
        windowsHide: true,
      }),
    ]);
    for (const executable of [
      'C:\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe',
      'C:\\Local\\OpenAI\\Codex\\bin\\hash\\codex.exe',
      'C:\\tools\\codex.exe',
      'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT_1_x64__publisher\\app\\ChatGPT.exe',
      'C:\\tools\\ChatGPT.exe',
      'C:\\Program Files\\WindowsApps\\OpenAI.CodexOther_1_x64__publisher\\app\\ChatGPT.exe',
      'C:\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\hash\\bin\\node.exe',
      'C:\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\hash\\bin\\codex-computer-use-swift.exe',
    ]) {
      expect(
        await isCodexDesktopRunning({
          platform: 'win32',
          exec: async () => ({ stdout: JSON.stringify([executable]) }),
        }),
      ).toBe(false);
    }
  });
});

const missing = () => {
  throw Object.assign(new Error('missing'), { code: 'ENOENT' });
};

describe('resolveCodexBinary', () => {
  it('uses config when there is no environment override', () => {
    expect(
      resolveCodexBinary({
        config: { bin: '/opt/codex' },
        env: {},
        platform: 'linux',
        fs: {
          statSync: () => ({ isFile: () => true, mtimeMs: 0 }),
          readdirSync: missing,
        },
      }),
    ).toEqual({ path: '/opt/codex', source: 'config', warnings: [] });
  });
  it('fails clearly on invalid explicit files, without falling back', () => {
    expect(() =>
      resolveCodexBinary({
        env: { ASKCODEX_BIN: '/missing' },
        fs: { statSync: missing, readdirSync: missing },
        pathLookup: () => '/valid/codex',
      }),
    ).toThrow(/configured binary.*ASKCODEX_BIN/);
  });
  it('fails clearly when no executable is available', () => {
    expect(() =>
      resolveCodexBinary({
        env: {},
        platform: 'linux',
        fs: { statSync: missing, readdirSync: missing },
        pathLookup: () => undefined,
      }),
    ).toThrow(/not found.*ASKCODEX_BIN/);
  });
  it.each([
    'linux',
    'win32',
  ] as const)('looks up exact native files on injected PATH for %s', (platform) => {
    const target =
      platform === 'win32' ? 'C:\\tools\\codex.exe' : '/tools/codex';
    const result = resolveCodexBinary({
      platform,
      env:
        platform === 'win32'
          ? { Path: 'C:\\missing;"C:\\tools"' }
          : { PATH: '/missing:/tools' },
      localAppData: 'C:\\Local',
      fs: {
        readdirSync: missing,
        statSync: (name) =>
          name === target ? { isFile: () => true, mtimeMs: 0 } : missing(),
      },
    });
    expect(result.path).toBe(target);
    expect(result.source).toBe('path');
  });
  it('rejects explicit Windows command shims instead of silently falling back', () => {
    expect(() =>
      resolveCodexBinary({
        env: { ASKCODEX_BIN: 'C:\\bin\\codex.cmd' },
        platform: 'win32',
        fs: {
          statSync: () => ({ isFile: () => true, mtimeMs: 0 }),
          readdirSync: missing,
        },
      }),
    ).toThrow(/shell:false.*ASKCODEX_BIN/);
  });
  it('explains a PATH containing only a cmd shim', () => {
    expect(() =>
      resolveCodexBinary({
        env: {},
        platform: 'win32',
        fs: { statSync: missing, readdirSync: missing },
        pathLookup: (name) =>
          name === 'codex.cmd' ? 'C:\\bin\\codex.cmd' : undefined,
      }),
    ).toThrow(/shell:false.*ASKCODEX_BIN/);
  });
  it.each([
    'win32',
    'linux',
    'darwin',
  ] as const)('uses PATH with a capability warning on %s', (platform) => {
    const names: string[] = [];
    const result = resolveCodexBinary({
      platform,
      env: {},
      fs: { readdirSync: missing, statSync: missing },
      pathLookup: (name) => {
        names.push(name);
        return platform === 'win32'
          ? 'C:\\standalone\\codex.exe'
          : '/usr/bin/codex';
      },
    });
    expect(result.source).toBe('path');
    expect(result.warnings.join(' ')).toMatch(
      /native Computer Use and read-only shell may not work/,
    );
    expect(names).toEqual([platform === 'win32' ? 'codex.exe' : 'codex']);
  });
  it('chooses the newest Desktop executable, skipping incomplete updates', () => {
    const mtimes: Record<string, number> = {
      'C:\\Local\\OpenAI\\Codex\\bin\\old\\codex.exe': 10,
      'C:\\Local\\OpenAI\\Codex\\bin\\new\\codex.exe': 20,
    };
    expect(
      resolveCodexBinary({
        platform: 'win32',
        env: {},
        localAppData: 'C:\\Local',
        fs: {
          readdirSync: () => ['incomplete', 'old', 'new'],
          statSync: (name) =>
            name in mtimes
              ? { isFile: () => true, mtimeMs: mtimes[name] }
              : missing(),
        },
        pathLookup: () => 'C:\\standalone\\codex.exe',
      }),
    ).toEqual({
      path: 'C:\\Local\\OpenAI\\Codex\\bin\\new\\codex.exe',
      source: 'desktop',
      warnings: [],
    });
  });
  it('prefers the environment executable over config without discovery', () => {
    expect(
      resolveCodexBinary({
        config: { bin: 'C:\\config\\codex.exe' },
        env: { ASKCODEX_BIN: 'C:\\env\\codex.exe' },
        platform: 'win32',
        fs: {
          statSync: () => ({ isFile: () => true, mtimeMs: 0 }),
          readdirSync: () => {
            throw new Error('not needed');
          },
        },
        pathLookup: () => {
          throw new Error('not needed');
        },
      }),
    ).toEqual({ path: 'C:\\env\\codex.exe', source: 'env', warnings: [] });
  });
});
