import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShellConfig, SettingsManager } from '@earendil-works/pi-coding-agent';
import { resolvePowerShellConfig } from './powershell.js';
import { detectShells, resolveShell, ShellUnavailableError } from './shell.js';
vi.mock('@earendil-works/pi-coding-agent', () => ({ getShellConfig: vi.fn(), SettingsManager: { create: vi.fn() } }));
vi.mock('./powershell.js', () => ({ resolvePowerShellConfig: vi.fn() }));
beforeEach(() => {
  vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => undefined } as SettingsManager);
  vi.mocked(getShellConfig).mockReturnValue({ shell: 'C:/Program Files/Git/bin/bash.exe', args: ['-c'] });
  vi.mocked(resolvePowerShellConfig).mockReturnValue({ executable: 'powershell.exe', edition: 'Desktop', version: '5.1', args: [] });
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe('declared shell resolution', () => {
  it('uses Pi public settings and exact launch arguments', () => {
    vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => 'D:/Tools/bash.exe' } as SettingsManager);
    vi.mocked(getShellConfig).mockReturnValue({ shell: 'D:/Tools/bash.exe', args: ['-c'] });
    expect(resolveShell('bash', 'D:/project')).toMatchObject({ kind: 'bash', executable: 'D:/Tools/bash.exe', args: ['-c'] });
    expect(SettingsManager.create).toHaveBeenCalledWith('D:/project');
    expect(getShellConfig).toHaveBeenCalledWith('D:/Tools/bash.exe');
  });
  it.each(['sh', '/bin/sh', 'C:/Windows/System32/bash.exe', 'D:/Windows/Sysnative/bash.exe', '/bin/zsh'])('rejects unsupported Pi shell %s without substituting PowerShell', path => {
    vi.mocked(getShellConfig).mockReturnValue({ shell: path, args: ['-c'] });
    expect(() => resolveShell('bash')).toThrow(ShellUnavailableError);
    expect(() => resolveShell('bash')).toThrow(/Requested shell "bash".*Available shells: PowerShell Desktop 5.1.*shell:"powershell"/);
  });
  it('keeps POSIX override below Pi shellPath and never uses it on Windows', () => {
    vi.stubEnv('PI_BETTER_BACKGROUND_TASKS_SHELL', '/custom/bash');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    resolveShell('bash');
    expect(getShellConfig).toHaveBeenLastCalledWith('/custom/bash');
    vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => '/setting/bash' } as SettingsManager);
    resolveShell('bash');
    expect(getShellConfig).toHaveBeenLastCalledWith('/setting/bash');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.mocked(SettingsManager.create).mockReturnValue({ getShellPath: () => undefined } as SettingsManager);
    resolveShell('bash');
    expect(getShellConfig).toHaveBeenLastCalledWith(undefined);
  });
  it('reports missing PowerShell with available bash, never launching bash instead', () => {
    vi.mocked(resolvePowerShellConfig).mockImplementation(() => { throw new Error('missing pwsh'); });
    expect(() => resolveShell('powershell')).toThrow(/Requested shell "powershell".*Available shells: bash.*shell:"bash"/);
    expect(detectShells().available.map(shell => shell.kind)).toEqual(['bash', 'none']);
  });
  it('none does not need any shell discovery', () => {
    expect(resolveShell('none').kind).toBe('none');
    expect(getShellConfig).not.toHaveBeenCalled();
    expect(resolvePowerShellConfig).not.toHaveBeenCalled();
  });
});
