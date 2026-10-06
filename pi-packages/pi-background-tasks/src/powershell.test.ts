import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePowerShell, resolvePowerShellConfig } from './powershell.js';
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),spawnSync:vi.fn()}));
vi.mock('node:fs',async original=>({...await original<typeof import('node:fs')>(),existsSync:vi.fn()}));
beforeEach(()=>{vi.mocked(existsSync).mockReturnValue(false);vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','');vi.spyOn(process,'platform','get').mockReturnValue('win32');});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.resetAllMocks();});
const result=(stdout:string,status=0)=>({stdout,stderr:'',status} as ReturnType<typeof spawnSync>);
describe('PowerShell discovery',()=>{
  it('validates an explicit override at each launch without using where',()=>{
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','D:/Tools/pwsh.exe');
    vi.mocked(spawnSync).mockReturnValue(result('{"edition":"Core","major":7,"version":"7.5.2"}'));
    expect(resolvePowerShellConfig()).toMatchObject({executable:'D:/Tools/pwsh.exe',edition:'Core',version:'7.5.2'});
    expect(resolvePowerShell()).toBe('D:/Tools/pwsh.exe');expect(spawnSync).toHaveBeenCalledTimes(2);
  });
  it('prefers PATH pwsh over Windows PowerShell',()=>{
    vi.mocked(spawnSync).mockImplementation(file=>result(String(file).toLowerCase().endsWith('where.exe')?'D:/PATH/pwsh.exe\r\n':'{"edition":"Core","major":8,"version":"8.0"}'));
    expect(resolvePowerShell()).toBe('D:/PATH/pwsh.exe');
    expect(spawnSync).toHaveBeenNthCalledWith(1,expect.stringMatching(/where\.exe$/i),['pwsh.exe'],expect.objectContaining({windowsHide:true}));
  });
  it('uses Windows PowerShell 5.1 when no pwsh is usable',()=>{
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','missing-pwsh.exe');
    vi.mocked(spawnSync).mockImplementation(file=>String(file)==='missing-pwsh.exe'?result('',1):result('{"edition":"Desktop","major":5,"minor":1,"version":"5.1.19041"}'));
    expect(resolvePowerShellConfig()).toMatchObject({executable:expect.stringMatching(/WindowsPowerShell[\\/]v1.0[\\/]powershell\.exe$/),edition:'Desktop',version:'5.1.19041'});
  });
  it('tries standard pwsh paths before 5.1',()=>{
    vi.stubEnv('ProgramFiles','C:/Program Files');vi.stubEnv('LOCALAPPDATA','C:/Users/probe/AppData/Local');
    vi.mocked(existsSync).mockImplementation(file=>String(file).replaceAll('\\','/').endsWith('/Microsoft/WindowsApps/pwsh.exe'));
    vi.mocked(spawnSync).mockImplementation(file=>String(file).endsWith('where.exe')?result('',1):result('{"edition":"Core","major":7}'));
    expect(resolvePowerShell().replaceAll('\\','/')).toBe('C:/Users/probe/AppData/Local/Microsoft/WindowsApps/pwsh.exe');
  });
  it('POSIX accepts pwsh only, without Windows-only flags',()=>{
    vi.spyOn(process,'platform','get').mockReturnValue('linux');
    vi.mocked(spawnSync).mockImplementation(file=>String(file)==='which'?result('/usr/bin/pwsh\n'):result('{"edition":"Core","major":7,"version":"7.5"}'));
    expect(resolvePowerShellConfig()).toMatchObject({executable:'/usr/bin/pwsh',args:['-NoProfile','-NonInteractive']});
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','powershell');
    vi.mocked(spawnSync).mockReturnValue(result('{"edition":"Desktop","major":5,"minor":1}'));
    expect(()=>resolvePowerShell()).toThrow(/PowerShell is unavailable/);
  });
  it.each([{edition:'Core',major:6},{edition:'Desktop',major:5,minor:0}])('rejects unsupported versions and never invokes bash (%j)',version=>{
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','invalid.exe');
    vi.mocked(spawnSync).mockReturnValue(result(JSON.stringify(version)));
    expect(()=>resolvePowerShell()).toThrow(/Install PowerShell 7.*PI_BACKGROUND_TASKS_PWSH/);
    expect(vi.mocked(spawnSync).mock.calls.every(([file])=>!String(file).includes('bash'))).toBe(true);
  });
});
