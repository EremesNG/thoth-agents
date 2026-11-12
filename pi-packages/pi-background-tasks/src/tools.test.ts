import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { getShellConfig, SettingsManager } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTools } from './tools.js';
import { resolveShell } from './shell.js';
vi.mock('@earendil-works/pi-coding-agent', async original => ({ ...await original<typeof import('@earendil-works/pi-coding-agent')>(), getShellConfig: vi.fn(), SettingsManager: { create: vi.fn() } }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawnSync: vi.fn() }));
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>(), existsSync: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', '/tools/pwsh');
  vi.mocked(existsSync).mockImplementation(path => String(path) === '/tools/pwsh');
  vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => undefined } as SettingsManager);
  vi.mocked(getShellConfig).mockReturnValue({ shell: '/bin/bash', args: ['-c'] });
});
function register() {
  const tools = new Map<string, any>();
  registerTools({ on() {}, registerTool(tool: any) { tools.set(tool.name, tool); } } as any);
  return tools;
}
describe('registration hints', () => {
  it('discloses unverified paths once per command tool without version probes', () => {
    const tools = register();
    for (const name of ['bg_task_spawn', 'bg_task_watch']) {
      const tool = tools.get(name);
      expect(JSON.stringify(tool).match(/Shell candidates at registration/g)).toHaveLength(1);
      expect(tool.description).toContain('Shell candidates at registration (unverified; validated at launch): bash (/bin/bash); PowerShell candidate (/tools/pwsh); none (direct argv).');
      expect(tool.description).toContain('Desktop 5.1 lacks &&/||');
      expect(tool.description).not.toContain('PowerShell Core');
      expect(tool.parameters.properties.shell.description).toContain('Unavailable shells fail without fallback');
    }
    expect(spawnSync).not.toHaveBeenCalled();
  });
  it('reports missing paths as unavailable and refreshes hints on later registrations', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(register().get('bg_task_spawn').description).toContain('powershell unavailable');
    vi.mocked(existsSync).mockReturnValue(true);
    expect(register().get('bg_task_spawn').description).toContain('PowerShell candidate (/tools/pwsh)');
    vi.mocked(getShellConfig).mockReturnValue({ shell: '/custom/bash', args: ['-c'] });
    expect(register().get('bg_task_spawn').description).toContain('bash (/custom/bash)');
  });
  it('still probes each launch and rejects unsupported versions despite a registration hint', () => {
    register();
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"edition":"Core","major":7,"version":"7.6.0"}' } as ReturnType<typeof spawnSync>);
    expect(resolveShell('powershell').version).toBe('7.6.0');
    expect(resolveShell('powershell').version).toBe('7.6.0');
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(vi.mocked(spawnSync).mock.calls.every(([, args]) => args?.includes('-EncodedCommand'))).toBe(true);
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"edition":"Core","major":6}' } as ReturnType<typeof spawnSync>);
    expect(() => resolveShell('powershell')).toThrow(/Requested shell "powershell" is unavailable/);
    expect(spawnSync).toHaveBeenCalledTimes(4);
    expect(register().get('bg_task_spawn').description).toContain('PowerShell candidate (/tools/pwsh)');
    expect(spawnSync).toHaveBeenCalledTimes(4);
  });
});
it('retains watch conditions, first-check reporting, and error-safe structured checks', () => {
  const description = register().get('bg_task_watch').description;
  for (const guidance of ['success_when', 'failure_when', 'timeout', '15s', 'exit/tails', 'reports running', 'Never mask check errors', '`exit 0`', '`|| true`', 'non-zero exits escalate', 'Unknown/unparseable states must fail', 'Prefer structured output'])
    expect(description).toContain(guidance);
});
describe.each(['win32', 'linux'] as const)('registration on %s', platform => {
  it('reports unsupported bash as unavailable without advertising sh/WSL', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    vi.mocked(getShellConfig).mockReturnValue({ shell: 'sh', args: ['-c'] });
    expect(register().get('bg_task_spawn').description).toContain('bash unavailable');
  });
});
