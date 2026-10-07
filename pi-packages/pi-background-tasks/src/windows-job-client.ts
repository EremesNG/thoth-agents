import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolvePowerShell } from './powershell.js';

export type ResponseFault = 'timeout' | 'malformed' | 'schema' | 'protocol-error';
export interface JobLaunch { executable: string; argv: string[]; cwd: string; env: NodeJS.ProcessEnv; log: string; stderrLog?: string; denyAssignment?: boolean; terminationFault?: 'timeout' | 'malformed' | 'protocol-error'; responseFaults?: Partial<Record<'launch' | 'terminate' | 'query' | 'release', ResponseFault>> }
export interface JobState { pid: number; activeProcesses: number; exitCode: number | null; creationTime: string }
interface Response extends Partial<JobState> { id?: number; event?: string; error?: string; errorCode?: string; released?: boolean; failedPid?: number; neverResumed?: boolean }
export interface PendingWindowsJob extends Omit<WindowsJob, 'pid'> {
  readonly pid: number | undefined;
  readonly ready: Promise<WindowsJob>;
}
const unknownKey = (error: unknown) => (error as {code?: string})?.code === 'UNKNOWN_KEY';
function validateResponse(op:string, value:Response):void {
  const integer=(n:unknown)=>typeof n==='number' && Number.isSafeInteger(n) && n>=0;
  const state=integer(value.pid) && value.pid!>0 && integer(value.activeProcesses) &&
    (value.exitCode===null || integer(value.exitCode)) && typeof value.creationTime==='string' && Boolean(value.creationTime);
  if (op==='launch' ? !integer(value.pid) || value.pid!<1 : op==='release' ? value.released!==true : !state)
    throw new Error(`Windows job helper ${op} returned a malformed response`);
}
export interface WindowsJob {
  readonly pid: number;
  query(): Promise<JobState>;
  terminate(): Promise<void>;
  waitForExit(): Promise<number>;
  release(): Promise<void>;
}
const pause = () => new Promise<void>(resolve => { const timer=setTimeout(resolve,25);timer.unref(); });

function executablePath(executable:string, env:NodeJS.ProcessEnv, cwd:string):string {
  if(isAbsolute(executable))return executable;
  const extensions=/\.[^\\/]+$/.test(executable)?['']:['','.exe','.com'];
  for(const directory of [cwd,...(env.PATH || env.Path || '').split(';')]) for(const extension of extensions) {
    const candidate=join(directory,executable+extension);if(existsSync(candidate))return candidate;
  }
  return executable;
}

/** One helper owns OS handles, never sessions. Only private test clients are explicitly closed. */
export class WindowsJobClient {
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private failure?: Error;
  private sequence=0;
  private pending=new Map<number,{resolve:(value:Response)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private stderr='';
  // Retain opaque authority even when launch's public promise rejects.
  private jobs=new Map<string,PendingWindowsJob>();
  constructor(private options:{testFaults?:boolean;requestTimeoutMs?:number}={}) {}
  get helperPid():number|undefined {return this.child?.pid;}
  private start():Promise<void> {
    if(this.ready)return this.ready;
    this.ready=new Promise<void>((resolve,reject)=>{
      const args=['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./windows-job-helper.ps1',import.meta.url)),'-ParentPid',String(process.pid)];
      if(this.options.testFaults)args.push('-TestFaults');
      const child=this.child=spawn(resolvePowerShell(),args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
      const timeout=setTimeout(()=>{const error=new Error('Windows job helper readiness timed out');this.fail(error);reject(error);child.kill();},15000);
      const lines=createInterface({input:child.stdout});
      child.stderr.on('data',chunk=>{this.stderr=(this.stderr+String(chunk)).slice(-8192);});
      child.stdin.on('error',error=>this.fail(error));
      lines.on('line',line=>{
        try {
          const value=JSON.parse(line) as Response;
          if(value.event==='ready'){clearTimeout(timeout);resolve();return;}
          const pending=value.id===undefined?undefined:this.pending.get(value.id);
          if(!pending)return;
          this.pending.delete(value.id!);clearTimeout(pending.timer);
          if(value.error)pending.reject(Object.assign(new Error(value.error),{code:value.errorCode,failedPid:value.failedPid,neverResumed:value.neverResumed}));else pending.resolve(value);
        } catch {
          // An unparseable line cannot safely be attributed to a request. Leave
          // requests pending for their own response/deadline; never close shared
          // Job Object handles because one response was malformed.
        }
      });
      const failed=(error:Error)=>{clearTimeout(timeout);this.fail(error);reject(error);};
      child.on('error',error=>failed(new Error(`Windows job helper requires PowerShell 7+ or Windows PowerShell 5.1: ${error.message}`)));
      child.on('exit',(code,signal)=>{lines.close();failed(new Error(`Windows job helper exited (${code ?? signal}): ${this.stderr}`));});
      child.unref();
      for(const stream of [child.stdin,child.stdout,child.stderr]) (stream as unknown as {unref?:()=>void}).unref?.();
    });
    return this.ready;
  }
  private fail(error:Error):void {
    this.failure ??= error;
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(this.failure);}this.pending.clear();
  }
  private async request(op:string,extra:Record<string,unknown>={},onSend?:()=>void):Promise<Response> {
    await this.start();if(this.failure)throw this.failure;
    return new Promise<Response>((resolve,reject)=>{
      const id=++this.sequence;
      // A missing response says nothing about the helper or other jobs. Keep the
      // container's handle owned and let its caller retry through the same helper.
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Windows job helper ${op} timed out`));},this.options.requestTimeoutMs ?? 10000);timer.unref();
      this.pending.set(id,{resolve,reject,timer});
      try {
        const line=JSON.stringify({id,op,...extra})+'\n';
        onSend?.();
        this.child!.stdin.write(line,error=>{if(error){this.pending.delete(id);clearTimeout(timer);reject(error);}});
      } catch(error) {this.pending.delete(id);clearTimeout(timer);reject(error);}
    }).then(value=>{validateResponse(op,value);return value;});
  }
  /** Reserve ownership synchronously, before any launch I/O or acknowledgment. */
  createJob(spec:JobLaunch):PendingWindowsJob {
    const key=randomUUID();
    let sent=false, acknowledged=false, absent=false, verified=false, releaseStarted=false, released=false;
    let pid:number|undefined, last:JobState|undefined, stopping:Promise<void>|undefined;
    let submitted!:()=>void;
    const submission=new Promise<void>(resolve=>{submitted=resolve;});
    let operationTail=Promise.resolve();
    const serialize=<T>(operation:()=>Promise<T>):Promise<T>=>{
      const result=operationTail.then(operation);
      // A failed acknowledgment must not poison this job's cleanup retries.
      operationTail=result.then(()=>{},()=>{});
      return result;
    };
    const query=()=>{
      if(releaseStarted){
        if(last)return Promise.resolve(last);
        // A rejected launch can be released without ever having a job state.
        return Promise.reject(Object.assign(new Error('Unknown job key'),{code:'UNKNOWN_KEY'}));
      }
      return serialize(async()=>{
        await submission;
        last=await this.request('query',{key}) as JobState;pid=last.pid;return last;
      });
    };
    const job:PendingWindowsJob={get pid(){return pid;},get ready(){return ready;},query,
      terminate:()=>{
        if(verified)return Promise.resolve();if(stopping)return stopping;
        stopping=(async()=>{
          // Order after the launch write, not its acknowledgment: teardown must
          // also work while that response is still pending or permanently lost.
          await submission;
          if(!sent){absent=verified=true;return;}
          try {await this.request('terminate',{key});}
          catch(error){if(!acknowledged && unknownKey(error)){absent=verified=true;return;}throw error;}
          const until=performance.now()+3000;
          for(;;){const state=await query();if(state.activeProcesses===0&&state.exitCode!==null)break;if(performance.now()>=until)throw new Error('Windows job still has active processes');await pause();}
          verified=true;
        })().catch(error=>{stopping=undefined;throw error;});return stopping;
      },
      waitForExit:async()=>{await ready;for(;;){const value=await query();if(value.exitCode!==null)return value.exitCode;await pause();}},
      release:async()=>{
        if(released)return;if(!verified)throw new Error('Cannot release an unverified Windows job');
        // The helper can remove the key even when its acknowledgment is lost.
        // Stop new queries now; drain previously issued queries before release.
        releaseStarted=true;
        await serialize(async()=>{
          if(released)return;
          if(!absent)try{await this.request('release',{key});}catch(error){if(!unknownKey(error))throw error;}
          released=true;this.jobs.delete(key);
        });
      },
    };
    this.jobs.set(key,job);
    const ready=Promise.resolve().then(()=>this.request('launch',{...spec,key,executable:executablePath(spec.executable,spec.env,spec.cwd)},()=>{sent=true;submitted();})).then(result=>{
      acknowledged=true;pid=result.pid!;return job as WindowsJob;
    }).catch(error=>{
      error.message = `Could not launch executable ${spec.executable} in ${spec.cwd}. Check the executable path and working directory. ${error.message}`;
      // Startup/serialization may fail before any write: unblock truthful cleanup.
      submitted();
      // Compatibility launch callers can also recover the reserved handle.
      throw Object.assign(error,{job});
    });
    return job;
  }
  async launch(spec:JobLaunch):Promise<WindowsJob> {return this.createJob(spec).ready;}
  /** Explicit private-client teardown for probes/tests; runtime sessions never call this. */
  async close():Promise<void> {
    const child=this.child;if(!child||child.exitCode!==null||child.signalCode!==null)return;
    await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill();});
  }
}
const KEY=Symbol.for('thoth-agents.background-tasks.windows-job-helper.v1');
const global=globalThis as typeof globalThis & {[KEY]?:WindowsJobClient};
export function getWindowsJobClient():WindowsJobClient {return global[KEY] ??= new WindowsJobClient();}
