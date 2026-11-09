import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { getPowerShellConfig } from '@earendil-works/pi-coding-agent';
import { getPublishedToolDefinition } from '@thoth-agents/pi-core';
import { JobLauncherUnavailable } from '@thoth-agents/pi-core/windows-job';
import { afterEach, describe, expect, it, vi } from 'vitest';
import extension, { createContainedOperations } from '../src/index.ts';

const launcher = vi.hoisted(() => ({ launchInJob: vi.fn() }));
vi.mock('@thoth-agents/pi-core/windows-job', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  launchInJob: launcher.launchInJob,
}));
afterEach(() => {
  vi.restoreAllMocks();
  launcher.launchInJob.mockReset();
});
function host() {
  const handlers = new Map<string, Function>();
  const pi = {
    registerTool: vi.fn(),
    on: vi.fn((name, handler) => handlers.set(name, handler)),
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: process.cwd(),
    ui: { notify: vi.fn() },
    hasUI: true,
    sessionManager: {
      getSessionId: () => 'test',
      getSessionFile: () => undefined,
    },
  };
  return { pi, ctx, handlers };
}
describe('extension', () => {
  it('is a complete no-op on linux', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const { pi } = host();
    extension(pi);
    expect(pi.registerTool).not.toHaveBeenCalled();
    expect(pi.on).not.toHaveBeenCalled();
  });
  it.skipIf(process.platform !== 'win32')(
    'does not warn through a stale session context when warm-up fails after shutdown',
    async () => {
      let reject!: (error: Error) => void;
      launcher.launchInJob.mockReturnValue(
        new Promise((_, no) => {
          reject = no;
        }),
      );
      const { pi, handlers, ctx } = host();
      extension(pi);
      await handlers.get('session_start')!({}, ctx);
      await handlers.get('session_shutdown')!({}, ctx);
      reject(new JobLauncherUnavailable('late warm-up failure'));
      await new Promise((resolve) => setImmediate(resolve));
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'registers both tools and warms the launcher without publishing in headless sessions',
    async () => {
      const { pi, handlers, ctx } = host();
      ctx.hasUI = false;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      launcher.launchInJob.mockRejectedValue(
        new JobLauncherUnavailable('no helper'),
      );
      extension(pi);
      try {
        expect(
          vi.mocked(pi.registerTool).mock.calls.map(([tool]) => tool.name),
        ).toEqual(['bash', 'powershell']);
        await handlers.get('session_start')!({}, ctx);
        await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
        expect(launcher.launchInJob).toHaveBeenCalledOnce();
        expect(ctx.ui.notify).not.toHaveBeenCalled();
        expect(getPublishedToolDefinition('bash')).toBeUndefined();
        expect(getPublishedToolDefinition('powershell')).toBeUndefined();
      } finally {
        await handlers.get('session_shutdown')!({}, ctx);
      }
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'registers and publishes both SDK definitions and warms once in UI sessions',
    async () => {
      const { pi, handlers, ctx } = host();
      launcher.launchInJob.mockRejectedValue(
        new JobLauncherUnavailable('no helper'),
      );
      extension(pi);
      expect(
        vi.mocked(pi.registerTool).mock.calls.map(([tool]) => tool.name),
      ).toEqual(['bash', 'powershell']);
      await handlers.get('session_start')!({}, ctx);
      await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledOnce());
      expect(launcher.launchInJob).toHaveBeenCalledOnce();
      expect(getPublishedToolDefinition('bash')).toBe(
        vi.mocked(pi.registerTool).mock.calls[0][0],
      );
      expect(getPublishedToolDefinition('powershell')).toBe(
        vi.mocked(pi.registerTool).mock.calls[1][0],
      );
      // Multiple unavailable commands, across both tools, warn only once.
      const bash = vi.mocked(pi.registerTool).mock.calls[0][0];
      const ps = vi.mocked(pi.registerTool).mock.calls[1][0];
      await bash.execute(
        'a',
        { command: 'echo fallback' },
        undefined,
        undefined,
        ctx as never,
      );
      await ps.execute(
        'b',
        { command: 'Write-Output fallback' },
        undefined,
        undefined,
        ctx as never,
      );
      expect(ctx.ui.notify).toHaveBeenCalledOnce();
      await handlers.get('session_shutdown')!({}, ctx);
      expect(getPublishedToolDefinition('bash')).toBeUndefined();
      expect(getPublishedToolDefinition('powershell')).toBeUndefined();
      await handlers.get('session_start')!({}, ctx);
      await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledTimes(2));
      await handlers.get('session_shutdown')!({}, ctx);
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'pins PowerShell UTF-8 prefix, public resolver and exact SDK arguments',
    async () => {
      const calls: unknown[] = [];
      const operations = createContainedOperations(
        'powershell',
        () => {},
        async (options) => {
          calls.push(options);
          throw new Error('capture');
        },
      );
      await expect(
        operations.exec('Write-Output café', process.cwd(), {
          onData: vi.fn(),
          env: { TEST: 'utf8' },
        }),
      ).rejects.toThrow('capture');
      expect(calls).toEqual([
        {
          file: getPowerShellConfig().shell,
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}\nWrite-Output café',
          ],
          cwd: process.cwd(),
          env: { TEST: 'utf8' },
        },
      ]);
    },
  );
});
