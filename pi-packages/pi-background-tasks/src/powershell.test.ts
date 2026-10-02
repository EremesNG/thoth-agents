import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePowerShell } from './powershell.js';
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),spawnSync:vi.fn()}));
vi.mock('node:fs',async original=>({...await original<typeof import('node:fs')>(),existsSync:vi.fn()}));
beforeEach(()=>{Reflect.deleteProperty(globalThis,Symbol.for('thoth-agents.background-tasks.pwsh-discovery.v1'));vi.mocked(existsSync).mockReturnValue(false);vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','');});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
const result=(stdout:string,status=0)=>({stdout,stderr:'',status} as ReturnType<typeof spawnSync>);
describe('PowerShell 7 discovery',()=>{
  it('validates an explicit override once and caches it without using where',()=>{
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','D:/Tools/pwsh.exe');
    vi.mocked(spawnSync).mockReturnValue(result('{"edition":"Core","major":7}'));
    expect(resolvePowerShell()).toBe('D:/Tools/pwsh.exe');expect(resolvePowerShell()).toBe('D:/Tools/pwsh.exe');
    expect(spawnSync).toHaveBeenCalledTimes(1);expect(spawnSync).toHaveBeenCalledWith('D:/Tools/pwsh.exe',expect.arrayContaining(['-NoProfile','-NonInteractive','-WindowStyle','Hidden']),expect.objectContaining({windowsHide:true,timeout:5000}));
  });
  it('uses where.exe pwsh.exe and validates the discovered executable',()=>{
    vi.mocked(spawnSync).mockImplementation((file)=>result(String(file).toLowerCase().endsWith('where.exe')?'D:/PATH/pwsh.exe\r\n':'{"edition":"Core","major":8}'));
    expect(resolvePowerShell()).toBe('D:/PATH/pwsh.exe');expect(spawnSync).toHaveBeenNthCalledWith(1,expect.stringMatching(/where\.exe$/i),['pwsh.exe'],expect.objectContaining({windowsHide:true}));
  });
  it.each(['Desktop','Core6'])('rejects an incompatible override (%s) without falling back',edition=>{
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','bad-pwsh.exe');vi.mocked(spawnSync).mockReturnValue(result(JSON.stringify({edition:edition==='Core6'?'Core':edition,major:edition==='Core6'?6:7})));
    expect(()=>resolvePowerShell()).toThrow(/PowerShell Core 7\+/);expect(spawnSync).toHaveBeenCalledTimes(1);
  });
  it('tries Program Files and WindowsApps standard paths after where fails',()=>{
    vi.stubEnv('ProgramFiles','C:/Program Files');vi.stubEnv('LOCALAPPDATA','C:/Users/probe/AppData/Local');
    vi.mocked(spawnSync).mockImplementation(file=>String(file).toLowerCase().endsWith('where.exe')?result('',1):result('{"edition":"Core","major":7}'));
    vi.mocked(existsSync).mockImplementation(file=>String(file).replaceAll('\\','/').endsWith('/Microsoft/WindowsApps/pwsh.exe'));
    expect(resolvePowerShell().replaceAll('\\','/')).toBe('C:/Users/probe/AppData/Local/Microsoft/WindowsApps/pwsh.exe');
  });
  it('missing PowerShell fails actionably and never invokes bash',()=>{
    vi.mocked(spawnSync).mockReturnValue(result('',1));expect(()=>resolvePowerShell()).toThrow(/Install PowerShell 7.*PI_BACKGROUND_TASKS_PWSH/);
    expect(vi.mocked(spawnSync).mock.calls.every(([file])=>!String(file).includes('bash'))).toBe(true);
  });
});
