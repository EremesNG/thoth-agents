import { spawnSync } from 'node:child_process';
import { getShellConfig, SettingsManager } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTools } from './tools.js';
import { resolveShell } from './shell.js';
vi.mock('@earendil-works/pi-coding-agent', async original => ({ ...await original<typeof import('@earendil-works/pi-coding-agent')>(), getShellConfig: vi.fn(), SettingsManager: { create: vi.fn() } }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawnSync: vi.fn() }));
const detectionCacheKey = Symbol.for('thoth.pi-background-tasks.powershell-detection.v1');
afterEach(() => { Reflect.deleteProperty(globalThis, detectionCacheKey); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
function register(registerExtensionTools = registerTools) {
  const tools = new Map<string, any>();
  registerExtensionTools({ on() {}, registerTool(tool: any) { tools.set(tool.name, tool); } } as any);
  return tools;
}
describe('registration-time PowerShell detection cache', () => {
  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', '/tools/pwsh');
    vi.stubEnv('PATH', '/tools/bin');
    vi.stubEnv('SystemRoot', 'C:/Windows');
    vi.stubEnv('ProgramFiles', 'C:/Program Files');
    vi.stubEnv('LOCALAPPDATA', 'C:/Users/test/Local');
    vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => undefined } as SettingsManager);
    vi.mocked(getShellConfig).mockReturnValue({ shell: '/bin/bash', args: ['-c'] });
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"edition":"Core","major":7,"version":"7.5.2"}' } as ReturnType<typeof spawnSync>);
  });

  it('shares PowerShell detection across extension copies while preserving descriptions', async () => {
    const first = register();
    vi.resetModules();
    const { registerTools: registerReloadedTools } = await import('./tools.js');
    const second = register(registerReloadedTools);

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(SettingsManager.create).toHaveBeenCalledTimes(2);
    expect([...second.values()].map(tool => tool.description)).toEqual([...first.values()].map(tool => tool.description));
    expect(second.get('bg_task_spawn').description).toContain('PowerShell Core 7.5.2 (/tools/pwsh)');
  });

  it('shares unavailable PowerShell detection without changing descriptions', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '' } as ReturnType<typeof spawnSync>);
    const first = register();
    const second = register();

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect([...second.values()].map(tool => tool.description)).toEqual([...first.values()].map(tool => tool.description));
    expect(second.get('bg_task_spawn').description).toContain('powershell unavailable');
  });

  it.each(['PI_BACKGROUND_TASKS_PWSH', 'PATH', 'SystemRoot', 'ProgramFiles', 'LOCALAPPDATA'])('re-probes when %s changes and retains earlier keys', name => {
    const original = process.env[name];
    register();
    vi.stubEnv(name, '/changed');
    register();
    register();
    vi.stubEnv(name, original);
    register();

    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('re-probes when the platform changes', () => {
    register();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    register();
    register();

    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('re-probes when the process working directory changes', () => {
    register();
    vi.spyOn(process, 'cwd').mockReturnValue('/another/project');
    register();
    register();

    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('re-probes a negative result when the environment changes', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 1, stdout: '' } as ReturnType<typeof spawnSync>);
    expect(register().get('bg_task_spawn').description).toContain('powershell unavailable');
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', '/new/pwsh');

    expect(register().get('bg_task_spawn').description).toContain('PowerShell Core 7.5.2 (/new/pwsh)');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('still discovers bash settings separately for each registration', () => {
    const first = register();
    vi.mocked(getShellConfig).mockReturnValue({ shell: '/custom/bash', args: ['-c'] });
    const second = register();

    expect(first.get('bg_task_spawn').description).toContain('bash (/bin/bash)');
    expect(second.get('bg_task_spawn').description).toContain('bash (/custom/bash)');
    expect(SettingsManager.create).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('revalidates every launch and error rediscovery instead of using registration detection', () => {
    register();
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"edition":"Core","major":7,"version":"7.6.0"}' } as ReturnType<typeof spawnSync>);
    expect(resolveShell('powershell').version).toBe('7.6.0');
    expect(resolveShell('powershell').version).toBe('7.6.0');
    expect(spawnSync).toHaveBeenCalledTimes(3);

    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '' } as ReturnType<typeof spawnSync>);
    expect(() => resolveShell('powershell')).toThrow(/Requested shell "powershell" is unavailable/);
    expect(spawnSync).toHaveBeenCalledTimes(5);
    expect(register().get('bg_task_spawn').description).toContain('PowerShell Core 7.5.2 (/tools/pwsh)');
    expect(spawnSync).toHaveBeenCalledTimes(5);
  });

  it.each([
    null,
    { version: 2, entries: new Map() },
    { version: 1, entries: {} },
    { version: 1, entries: new Map([['invalid', {}]]) },
    { version: 1, entries: new Map([[42, 'missing PowerShell']]) },
  ])('falls back to probing with an incompatible global record (%j)', record => {
    Object.defineProperty(globalThis, detectionCacheKey, { configurable: true, value: record });
    register();
    expect(register().get('bg_task_spawn').description).toContain('PowerShell Core 7.5.2 (/tools/pwsh)');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it.each(['get', 'set'])('falls back to probing when the shared map %s method throws', method => {
    const entries = new Map();
    Object.defineProperty(entries, method, { value() { throw new Error('foreign map method'); } });
    Object.defineProperty(globalThis, detectionCacheKey, { configurable: true, value: { version: 1, entries } });
    register();
    expect(register().get('bg_task_spawn').description).toContain('PowerShell Core 7.5.2 (/tools/pwsh)');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('falls back to probing when the global record accessor throws', () => {
    Object.defineProperty(globalThis, detectionCacheKey, { configurable: true, get() { throw new Error('foreign accessor'); } });
    register();
    expect(register().get('bg_task_spawn').description).toContain('PowerShell Core 7.5.2 (/tools/pwsh)');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });
});

describe.each(['win32', 'linux'] as const)('registration-time shell disclosure on %s', platform => {
  it.each(['Core', 'Desktop', 'missing'] as const)('discloses bash path and %s PowerShell once in each command tool description', edition => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => undefined } as SettingsManager);
    vi.mocked(getShellConfig).mockReturnValue({ shell: 'D:/Git/bin/bash.exe', args: ['-c'] });
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', 'test-powershell.exe');
    vi.mocked(spawnSync).mockReturnValue({ status: edition === 'missing' ? 1 : 0, stdout: JSON.stringify({ edition, major: edition === 'Core' ? 7 : 5, minor: 1, version: edition === 'Core' ? '7.5.2' : '5.1.19041' }) } as ReturnType<typeof spawnSync>);
    const tools = register();
    for (const name of ['bg_task_spawn', 'bg_task_watch']) {
      const tool = tools.get(name);
      expect(JSON.stringify(tool).match(/Detected shells at registration:/g)).toHaveLength(1);
      expect(tool.parameters.properties.command.description).not.toContain('D:/Git/bin/bash.exe');
      expect(tool.parameters.properties.shell.description).not.toContain('Detected shells');
      const text = tool.description;
      expect(text).toContain('D:/Git/bin/bash.exe');
      expect(text).toContain('without fallback');
      expect(text).toContain('Revalidated at launch');
      // Desktop 5.1 is Windows-only; a successful probe must not advertise it on POSIX.
      if (edition === 'missing' || (edition === 'Desktop' && platform === 'linux')) {
        expect(text).toContain('powershell unavailable');
        expect(text).not.toContain('PowerShell Desktop 5.1.19041');
        expect(text).not.toContain('5.1 lacks &&/||');
      } else {
        expect(text).toContain(edition === 'Core' ? 'PowerShell Core 7.5.2' : 'PowerShell Desktop 5.1.19041');
        if (edition === 'Desktop') expect(text).toContain('5.1 lacks &&/||');
      }
    }
  });
  it('says bash is unavailable rather than advertising sh/WSL', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => undefined } as SettingsManager);
    vi.mocked(getShellConfig).mockReturnValue({ shell: 'sh', args: ['-c'] });
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '' } as ReturnType<typeof spawnSync>);
    expect(register().get('bg_task_spawn').description).toContain('bash unavailable');
  });
});
