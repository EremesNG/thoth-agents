import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WindowsJobClient, type JobLaunch, type PendingWindowsJob } from './windows-job-client.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
import { readMeta } from './registry.js';
import { processExists } from './process.js';

const helperKey=Symbol.for('thoth-agents.background-tasks.windows-job-helper.v1');
const global=globalThis as typeof globalThis & {[helperKey]?:WindowsJobClient};
// Inject faults at the real helper's existing private test protocol seam.
class FaultClient extends WindowsJobClient {
  ownedJobs:PendingWindowsJob[]=[];
  override createJob(spec:JobLaunch):PendingWindowsJob {
    const job=super.createJob({...spec,...(spec.env.BG_TEST_ACK ? {
      responseFaults:{launch:'timeout' as const},terminationFault:'protocol-error' as const,
    } : {})});
    this.ownedJobs.push(job);return job;
  }
}
describe.skipIf(process.platform!=='win32')('lost launch acknowledgment real lifecycle cleanup',()=>{
  it.each(['job','watch'].flatMap(kind=>['stop','quit','reload then quit'].map(action=>({kind,action}))))('$action retries a $kind by owned key, verifies zero and preserves the other origin',async({kind,action})=>{
    const previous=global[helperKey];
    const client=new FaultClient({testFaults:true,requestTimeoutMs:500});global[helperKey]=client;
    const dir=mkdtempSync(join(tmpdir(),'bg-ack-lifecycle-'));
    const pidFile=join(dir,'child.pid'),script=join(dir,'leader.cjs');
    writeFileSync(script,`const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000);`);
    const root=lifecycleHost('ack-root-'+kind+action),child=lifecycleHost('ack-child-'+kind+action);
    let adopted:ReturnType<typeof lifecycleHost>|undefined;
    await root.emit('session_start');await child.emit('session_start');
    try {
      const rootId=await root.spawn({shell: "none" as const,argv:[process.execPath,'-e','setInterval(()=>{},1000)']});
      await expect.poll(()=>readMeta(rootId)?.pid,{timeout:10000}).toBeTruthy();
      const abort=new AbortController();abort.abort();
      const params={shell: "none" as const,argv:[process.execPath,script],env:{BG_TEST_ACK:'1'},callback:false};
      const text=kind==='job'?await child.spawn(params):await child.execute('bg_task_watch',{...params,success_when:{type:'exit_code',equals:0},timeout_seconds:0},abort.signal);
      const id=text.match(/bg_[a-z0-9_]+/)![0];
      await expect.poll(()=>readMeta(id)?.error,{timeout:10000}).toMatch(/invalid protocol/);
      expect(readMeta(id)?.status).toBe('running');expect(readMeta(id)?.pid).toBeUndefined();
      const job=client.ownedJobs[1]!;
      expect((await job.query()).activeProcesses).toBeGreaterThanOrEqual(2);
      expect(existsSync(pidFile)).toBe(true);
      const descendant=Number(readFileSync(pidFile,'utf8'));expect(processExists(descendant)).toBe(true);
      if(action==='stop')await child.execute('bg_task_stop',{id});
      else if(action==='quit')await child.emit('session_shutdown','quit');
      else {
        await child.emit('session_shutdown','reload');
        adopted=lifecycleHost('ack-child-'+kind+action);await adopted.emit('session_start');
        await adopted.emit('session_shutdown','quit');
      }
      expect(readMeta(id)?.status).toBe('cancelled');
      expect((await job.query()).activeProcesses).toBe(0);expect(processExists(descendant)).toBe(false);
      expect((await client.ownedJobs[0]!.query()).activeProcesses).toBeGreaterThan(0);
      expect(readMeta(rootId)?.status).toBe('running');expect(processExists(client.helperPid!)).toBe(true);
    }finally {
      await (adopted??child).emit('session_shutdown','quit');await root.emit('session_shutdown','quit');
      await client.close();global[helperKey]=previous;rmSync(dir,{recursive:true,force:true});
    }
  },20000);
  it.each(['job','watch'])('shutdown cleans a %s while its launch acknowledgment is still pending',async kind=>{
    const previous=global[helperKey];
    class PendingAckClient extends WindowsJobClient {
      launchSettled=false;
      override createJob(spec:JobLaunch){
        const job=super.createJob({...spec,responseFaults:{launch:'timeout'}});
        void job.ready.then(()=>{this.launchSettled=true;},()=>{this.launchSettled=true;});
        return job;
      }
    }
    const client=new PendingAckClient({testFaults:true,requestTimeoutMs:3000});global[helperKey]=client;
    const host=lifecycleHost('ack-pending-'+kind);await host.emit('session_start');
    try {
      const params={shell: "none" as const,argv:[process.execPath,'-e','setInterval(()=>{},1000)'],callback:false};
      const abort=new AbortController();abort.abort();
      const text=kind==='job'?await host.spawn(params):await host.execute('bg_task_watch',{...params,success_when:{type:'exit_code',equals:0},timeout_seconds:0},abort.signal);
      const id=text.match(/bg_[a-z0-9_]+/)![0];
      await expect.poll(()=>client.helperPid).toBeTruthy();
      await host.emit('session_shutdown','quit');
      expect(client.launchSettled).toBe(false);
      expect(readMeta(id)?.status).toBe('cancelled');
    }finally{await host.emit('session_shutdown','quit');await client.close();global[helperKey]=previous;}
  },10000);
  it.each(['job','watch'])('records a failed %s when launch was rejected before a container existed',async kind=>{
    const previous=global[helperKey];const client=new WindowsJobClient({testFaults:true,requestTimeoutMs:500});global[helperKey]=client;
    const dir=mkdtempSync(join(tmpdir(),'bg-ack-lifecycle-'));const host=lifecycleHost('ack-rejected-'+kind);await host.emit('session_start');
    try {
      const params={shell: "none" as const,argv:[join(dir,'does-not-exist.exe')],callback:false};
      const abort=new AbortController();abort.abort();
      const text=kind==='job'?await host.spawn(params):await host.execute('bg_task_watch',{...params,success_when:{type:'exit_code',equals:0},timeout_seconds:0},abort.signal);
      const id=text.match(/bg_[a-z0-9_]+/)![0];
      await expect.poll(()=>readMeta(id)?.status,{timeout:10000}).toBe('failed');
      expect(readMeta(id)?.pid).toBeUndefined();
      const failure=kind==='job'?readFileSync(readMeta(id)!.logPath,'utf8'):JSON.stringify(readMeta(id));
      expect(failure).toMatch(/CreateProcessW|Could not launch/);
      await host.emit('session_shutdown','quit');expect(readMeta(id)?.status).toBe('failed');
    }finally{await host.emit('session_shutdown','quit');await client.close();global[helperKey]=previous;rmSync(dir,{recursive:true,force:true});}
  });
});
