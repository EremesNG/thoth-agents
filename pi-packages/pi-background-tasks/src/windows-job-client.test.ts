import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WindowsJobClient, getWindowsJobClient } from './windows-job-client.js';
const dirs: string[] = [];
const clients: WindowsJobClient[] = [];
const live = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
afterEach(async () => { for (const c of clients.splice(0)) await c.close(); for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true}); });
describe.skipIf(process.platform !== 'win32')('Windows Job Object protocol', () => {
  function setup(testFaults = false) { const dir=mkdtempSync(join(tmpdir(),'bg-job-object-'));dirs.push(dir);const client=new WindowsJobClient({testFaults});clients.push(client);return {dir,client}; }
  it('launches separate containers and verifies only the requested container empty', async () => {
    const {dir,client}=setup();
    const launch=(key:string)=>client.launch({executable:process.execPath,argv:['-e','setInterval(()=>{},1000)'],cwd:dir,env:process.env,log:join(dir,key+'.log')});
    const a=await launch('a'), b=await launch('b');
    try { expect((await a.query()).activeProcesses).toBeGreaterThan(0);await a.terminate();expect((await a.query()).activeProcesses).toBe(0);expect(live(a.pid)).toBe(false);expect(live(b.pid)).toBe(true);await b.terminate(); } finally {await a.terminate();await b.terminate();}
  });
  it('fails assignment closed without ever resuming the suspended child', async () => {
    const {dir,client}=setup(true);const marker=join(dir,'resumed');const script=join(dir,'child.cjs');writeFileSync(script,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`);
    const error=await client.launch({executable:process.execPath,argv:[script],cwd:dir,env:process.env,log:join(dir,'log'),denyAssignment:true}).catch(e=>e);
    expect(error.message).toMatch(/AssignProcessToJobObject/);expect(error.neverResumed).toBe(true);expect(error.failedPid).toBeGreaterThan(0);expect(live(error.failedPid)).toBe(false);expect(existsSync(marker)).toBe(false);
  });
  it('helper death kills its jobs, and does not authorize PID-based fallback cleanup', async () => {
    const {dir,client}=setup();const job=await client.launch({executable:process.execPath,argv:['-e','setInterval(()=>{},1000)'],cwd:dir,env:process.env,log:join(dir,'log')});
    await client.close();await expect.poll(()=>live(job.pid)).toBe(false);await expect(job.terminate()).rejects.toThrow(/helper/i);
  });
  it('reattaches the same singleton across module reload', async () => {
    const before=getWindowsJobClient();vi.resetModules();const fresh=await import('./windows-job-client.js');expect(fresh.getWindowsJobClient()).toBe(before);
  });
});
