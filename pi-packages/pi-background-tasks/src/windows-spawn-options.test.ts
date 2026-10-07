vi.mock('./powershell.js', async original => ({...await original<typeof import('./powershell.js')>(), resolvePowerShell: () => 'pwsh.exe'}));
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCommandOnce, spawnCommand } from './process.js';
import { WindowsJobClient } from './windows-job-client.js';
import { fakeJobHelper } from './test-support/job-helper-fixture.js';
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),spawn:vi.fn()}));
const platform=process.platform;const dirs:string[]=[];
afterEach(()=>{Object.defineProperty(process,'platform',{value:platform,configurable:true});vi.restoreAllMocks();vi.clearAllMocks();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
describe('hidden Windows container launches',()=>{
  it('jobs and watches share one hidden helper and request separate containers',async()=>{
    const fixture=fakeJobHelper(980001);fixture.allowCleanup();
    const dir=mkdtempSync(join(tmpdir(),'bg-hidden-'));dirs.push(dir);
    const job=spawnCommand({shell: "none" as const,argv:[process.execPath,'-e','process.exit(0)']},join(dir,'log'),true);
    await expect.poll(()=>fixture.launchCount).toBe(1);
    const result=runCommandOnce({shell: "none" as const,argv:[process.execPath,'-e','process.exit(0)']},1024,25);
    await result;await job.terminate();
    expect(spawn).toHaveBeenCalledExactlyOnceWith(expect.any(String),expect.arrayContaining(['-NoProfile','-NonInteractive','-WindowStyle','Hidden']),expect.objectContaining({windowsHide:true,stdio:['pipe','pipe','pipe']}));
    const launches=fixture.requests.filter(r=>r.op==='launch');expect(launches).toHaveLength(2);expect(launches[0]!.key).not.toBe(launches[1]!.key);
    expect(fixture.requests.filter(r=>r.op==='release')).toHaveLength(2);
  });
  it('a missing helper fails the launch actionably without PID fallback',async()=>{
    const helper=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),unref(){},kill(){(this as unknown as EventEmitter).emit('exit',1,null);}});
    vi.mocked(spawn).mockImplementation(()=>{queueMicrotask(()=>helper.emit('error',Object.assign(new Error('spawn pwsh ENOENT'),{code:'ENOENT'})));return helper as any;});
    const kill=vi.spyOn(process,'kill');
    const client=new WindowsJobClient();
    await expect(client.launch({executable:'node.exe',argv:[],cwd:process.cwd(),env:process.env,log:'not-created'})).rejects.toThrow(/PowerShell 7.*5.1.*ENOENT/);
    expect(kill).not.toHaveBeenCalled();
  });
  it('Node descendant fixtures explicitly hide consoles, including embedded scripts',()=>{
    for(const file of ['lifecycle.test.ts','process.test.ts']){
      const source=readFileSync(new URL(file,import.meta.url),'utf8');
      const launches=[...source.matchAll(/require\('node:child_process'\)\.spawn\([\s\S]*?\{(stdio:[^}]+)\}/g)];
      expect(launches.length).toBeGreaterThan(0);for(const launch of launches)expect(launch[1],file).toMatch(/windowsHide:\s*true/);
    }
  });
});
