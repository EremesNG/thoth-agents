import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeJobHelper } from './test-support/job-helper-fixture.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
import { readMeta } from './registry.js';
vi.mock('./powershell.js', async original => ({...await original<typeof import('./powershell.js')>(), resolvePowerShell: () => 'pwsh.exe'}));
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),spawn:vi.fn()}));
const platform=process.platform;
afterEach(()=>{Object.defineProperty(process,'platform',{value:platform,configurable:true});vi.restoreAllMocks();vi.clearAllMocks();});
describe('launch acknowledgment ownership through lifecycle tools',()=>{
  it.each(['job','watch'])('stop retries a %s with no launch acknowledgment without releasing live descendants',async kind=>{
    const fixture=fakeJobHelper(985001);fixture.failLaunch();
    const host=lifecycleHost('lost-launch-'+kind);await host.emit('session_start');
    const abort=new AbortController();abort.abort();
    const text=kind==='job'?await host.spawn({shell: "none" as const,argv:['node','long-running']}):await host.execute('bg_task_watch',{shell: "none" as const,argv:['node','long-running'],success_when:{type:'exit_code',equals:0},timeout_seconds:0},abort.signal);
    const id=text.match(/bg_[a-z0-9_]+/)![0];
    try {
      await expect.poll(()=>readMeta(id)?.error).toBeTruthy();
      expect(readMeta(id)?.status).toBe('running');
      expect(fixture.live.size).toBeGreaterThan(0);
      fixture.allowCleanup();
      await host.execute('bg_task_stop',{id});
      expect(readMeta(id)?.status).toBe('cancelled');
      expect(fixture.live.size).toBe(0);
      const key=fixture.requests.find(r=>r.op==='launch')!.key;
      expect(fixture.requests.filter(r=>r.op==='terminate').length).toBeGreaterThan(0);
      expect(fixture.requests.filter(r=>r.op!=='launch').every(r=>r.key===key)).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);
    }finally{fixture.allowCleanup();await host.emit('session_shutdown','quit');fixture.helper.kill();}
  });
});
