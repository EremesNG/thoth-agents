import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMeta, writeMeta, taskDir } from './registry.js';
import { resumeRunningTask, stopTask } from './runtime.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
import type { BackgroundTaskMeta } from './types.js';
const hosts:ReturnType<typeof lifecycleHost>[]=[];
afterEach(async()=>{for(const host of hosts.splice(0))await host.emit('session_shutdown','reload');vi.restoreAllMocks();});
describe('container host reconciliation',()=>{
  it.each(['process','command_watch'] as const)('a dead previous host records its %s lost, not adopted or cancelled',async kind=>{
    const host=lifecycleHost('previous-host-'+kind);hosts.push(host);
    const id='bg_previous_host_'+kind;
    const meta:BackgroundTaskMeta={id,kind,status:'running',startedAt:Date.now(),cwd:process.cwd(),logPath:taskDir(id)+'/log',callback:false,callbackOrigin:{cwd:process.cwd(),sessionId:'previous-host-'+kind},spawnPid:940001,pid:940002,command:'exit 0',successWhen:{type:'exit_code',equals:0}};
    writeMeta(meta);
    const kill=vi.spyOn(process,'kill').mockImplementation((pid,signal)=>{if(pid===940001&&signal===0)throw Object.assign(new Error('gone'),{code:'ESRCH'});throw new Error('must not inspect or signal a persisted job PID');});
    resumeRunningTask(host.pi,meta);
    expect(readMeta(id)).toMatchObject({status:'failed',spawnPid:940001,result:{reason:expect.stringContaining('owning Pi process exited')}});
    expect(readMeta(id)?.endedAt).toBeDefined();
    expect(kill.mock.calls.every(([pid,signal])=>pid===940001&&signal===0)).toBe(true);
    expect((await stopTask(host.pi,id))?.status).toBe('failed');
  });
  it('a recycled Pi PID with a different host instance does not recreate ownership',()=>{
    const host=lifecycleHost('recycled-host-pid');hosts.push(host);const id='bg_recycled_host_pid';
    const meta:BackgroundTaskMeta={id,kind:'command_watch',status:'running',startedAt:Date.now(),cwd:process.cwd(),logPath:taskDir(id)+'/log',callback:false,spawnPid:process.pid,ownerInstanceId:'previous-Pi-instance',command:'exit 0',successWhen:{type:'exit_code',equals:0}};
    writeMeta(meta);const kill=vi.spyOn(process,'kill');resumeRunningTask(host.pi,meta);
    expect(readMeta(id)).toMatchObject({status:'failed',result:{reason:expect.stringContaining('owning Pi process exited')}});expect(kill).not.toHaveBeenCalled();
  });
  it('never adopts or terminalizes another live Pi process work',()=>{
    const host=lifecycleHost('other-live-host');hosts.push(host);const id='bg_other_live_host';
    const meta:BackgroundTaskMeta={id,kind:'command_watch',status:'running',startedAt:Date.now(),cwd:process.cwd(),logPath:taskDir(id)+'/log',callback:false,spawnPid:940010,command:'exit 0',successWhen:{type:'exit_code',equals:0}};
    writeMeta(meta);vi.spyOn(process,'kill').mockReturnValue(true);resumeRunningTask(host.pi,meta);
    expect(readMeta(id)).toMatchObject({status:'running',spawnPid:940010,stopError:expect.stringContaining('another Pi process')});
  });
});
