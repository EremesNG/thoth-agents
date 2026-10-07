import { spawnSync } from 'node:child_process';
import { getShellConfig, SettingsManager } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerTools } from './tools.js';
vi.mock('@earendil-works/pi-coding-agent', async original => ({ ...await original<typeof import('@earendil-works/pi-coding-agent')>(), getShellConfig: vi.fn(), SettingsManager: { create: vi.fn() } }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawnSync: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
function register() {
  const tools = new Map<string, any>();
  registerTools({ on() {}, registerTool(tool: any) { tools.set(tool.name, tool); } } as any);
  return tools;
}
describe.each(['win32', 'linux'] as const)('registration-time shell disclosure on %s', platform => {
  it.each(['Core', 'Desktop', 'missing'] as const)('discloses bash path and %s PowerShell in all command tools and parameter docs', edition => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => undefined } as SettingsManager);
    vi.mocked(getShellConfig).mockReturnValue({ shell: 'D:/Git/bin/bash.exe', args: ['-c'] });
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', 'test-powershell.exe');
    vi.mocked(spawnSync).mockReturnValue({ status: edition === 'missing' ? 1 : 0, stdout: JSON.stringify({ edition, major: edition === 'Core' ? 7 : 5, minor: 1, version: edition === 'Core' ? '7.5.2' : '5.1.19041' }) } as ReturnType<typeof spawnSync>);
    const tools = register();
    for (const name of ['bg_task_spawn', 'bg_task_watch', 'bg_task']) {
      const tool = tools.get(name);
      for (const text of [tool.description, tool.parameters.properties.command.description, tool.parameters.properties.shell.description]) {
        expect(text).toContain('D:/Git/bin/bash.exe');
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
