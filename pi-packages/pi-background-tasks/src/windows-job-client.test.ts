import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePowerShell } from './powershell.js';
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
  it.each(['timeout', 'malformed', 'protocol-error'] as const)('a child-origin termination %s leaves the shared helper and root container alive and cleanup retriable', async (fault) => {
    const {dir,client}=setup(true);
    const launch=(origin:string,terminationFault?:'timeout'|'malformed'|'protocol-error')=>client.launch({executable:process.execPath,
      argv:['-e','setInterval(()=>{},1000)'],cwd:dir,env:process.env,log:join(dir,origin+'.log'),terminationFault});
    const root=await launch('root'), child=await launch('child',fault);
    const helper=client.helperPid!;
    const rejected=expect(child.terminate()).rejects.toThrow(/timed out|invalid protocol/);
    // The helper must still serve an unrelated container while this request is pending.
    expect((await root.query()).activeProcesses).toBeGreaterThan(0);
    await rejected;
    expect(client.helperPid).toBe(helper);
    expect(live(helper)).toBe(true);
    expect(live(root.pid)).toBe(true);
    expect(live(child.pid)).toBe(true);
    await expect(child.release()).rejects.toThrow(/unverified/);
    expect((await root.query()).activeProcesses).toBeGreaterThan(0);
    await child.terminate();
    expect((await child.query()).activeProcesses).toBe(0);
    expect(live(child.pid)).toBe(false);
    await child.release();
    expect((await root.query()).activeProcesses).toBeGreaterThan(0);
    await root.terminate();await root.release();
  }, 30000);
  it('fails assignment closed without ever resuming the suspended child', async () => {
    const {dir,client}=setup(true);const marker=join(dir,'resumed');const script=join(dir,'child.cjs');writeFileSync(script,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`);
    const error=await client.launch({executable:process.execPath,argv:[script],cwd:dir,env:process.env,log:join(dir,'log'),denyAssignment:true}).catch(e=>e);
    expect(error.message).toMatch(/AssignProcessToJobObject/);expect(error.neverResumed).toBe(true);expect(error.failedPid).toBeGreaterThan(0);expect(live(error.failedPid)).toBe(false);expect(existsSync(marker)).toBe(false);
  });
  it('denies a real CREATE_BREAKAWAY_FROM_JOB attempt inside a job and verifies no survivor after cleanup', async () => {
    const {dir,client}=setup();
    const marker=join(dir,'breakaway.json');
    const quote=(text:string)=>`'${text.replaceAll("'", "''")}'`;
    const source=fileURLToPath(new URL('./test-support/windows-breakaway-probe.cs',import.meta.url));
    const script=`$ErrorActionPreference='Stop'; Add-Type -Path ${quote(source)}; `+
      `[BreakawayProbe]::Attempt(${quote(process.execPath)}) | ConvertTo-Json -Compress | Set-Content -LiteralPath ${quote(marker)}; `+
      `Start-Sleep -Seconds 60`;
    const job=await client.launch({executable:resolvePowerShell(),
      argv:['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
      cwd:dir,env:process.env,log:join(dir,'log')});
    await expect.poll(()=>existsSync(marker),{timeout:10000}).toBe(true);
    const attempt=JSON.parse(readFileSync(marker,'utf8').replace(/^\uFEFF/,''));
    expect(attempt).toMatchObject({created:false,error:5,flags:0x09000000,pid:0,cleaned:true});
    expect((await job.query()).activeProcesses).toBeGreaterThan(0);
    await job.terminate();
    expect((await job.query()).activeProcesses).toBe(0);
    expect(live(job.pid)).toBe(false);
    await job.release();
  });
  it('helper death kills its jobs, and does not authorize PID-based fallback cleanup', async () => {
    const {dir,client}=setup();const job=await client.launch({executable:process.execPath,argv:['-e','setInterval(()=>{},1000)'],cwd:dir,env:process.env,log:join(dir,'log')});
    await client.close();await expect.poll(()=>live(job.pid)).toBe(false);await expect(job.terminate()).rejects.toThrow(/helper/i);
  });
  it('reattaches the same singleton across module reload', async () => {
    const before=getWindowsJobClient();vi.resetModules();const fresh=await import('./windows-job-client.js');expect(fresh.getWindowsJobClient()).toBe(before);
  });
});
