import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolvePowerShell } from './powershell.js';

export interface JobLaunch { executable: string; argv: string[]; cwd: string; env: NodeJS.ProcessEnv; log: string; stderrLog?: string; denyAssignment?: boolean }
export interface JobState { pid: number; activeProcesses: number; exitCode: number | null; creationTime: string }
interface Response extends Partial<JobState> { id?: number; event?: string; error?: string; failedPid?: number; neverResumed?: boolean }
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
  constructor(private options:{testFaults?:boolean}={}) {}
  get helperPid():number|undefined {return this.child?.pid;}
  private start():Promise<void> {
    if(this.ready)return this.ready;
    this.ready=new Promise<void>((resolve,reject)=>{
      const args=['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',fileURLToPath(new URL('./windows-job-helper.ps1',import.meta.url)),'-ParentPid',String(process.pid)];
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
          if(value.error)pending.reject(Object.assign(new Error(value.error),{failedPid:value.failedPid,neverResumed:value.neverResumed,launchFailed:true}));else pending.resolve(value);
        } catch(error){this.fail(new Error(`Windows job helper invalid protocol: ${String(error)}`));child.kill();}
      });
      const failed=(error:Error)=>{clearTimeout(timeout);this.fail(error);reject(error);};
      child.on('error',error=>failed(new Error(`Windows job helper requires PowerShell Core 7+: ${error.message}`)));
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
  private async request(op:string,extra:Record<string,unknown>={}):Promise<Response> {
    try { await this.start();if(this.failure)throw this.failure; }
    catch(error) { if(op==='launch')Object.assign(error as Error,{launchFailed:true});throw error; }
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>{this.pending.delete(id);const error=new Error(`Windows job helper ${op} timed out`);this.fail(error);this.child?.kill();reject(error);},10000);timer.unref();
      this.pending.set(id,{resolve,reject,timer});
      this.child!.stdin.write(JSON.stringify({id,op,...extra})+'\n');
    });
  }
  async launch(spec:JobLaunch):Promise<WindowsJob> {
    const key=randomUUID();
    const result=await this.request('launch',{...spec,key,executable:executablePath(spec.executable,spec.env,spec.cwd)}).catch(error=>{
      error.message = `Could not launch executable ${spec.executable} in ${spec.cwd}. Check the executable path and working directory. ${error.message}`;
      throw error;
    });
    let verified=false, released=false, last:JobState|undefined, stopping:Promise<void>|undefined;
    const query=async()=>{
      if(released)return last!;
      last=await this.request('query',{key}) as JobState;return last;
    };
    const job:WindowsJob={pid:result.pid!,query,
      terminate:()=>{
        if(verified)return Promise.resolve();if(stopping)return stopping;
        stopping=(async()=>{await this.request('terminate',{key});const until=performance.now()+3000;for(;;){const state=await query();if(state.activeProcesses===0&&state.exitCode!==null)break;if(performance.now()>=until)throw new Error('Windows job still has active processes');await pause();}verified=true;})().catch(error=>{stopping=undefined;throw error;});return stopping;
      },
      waitForExit:async()=>{for(;;){const value=await query();if(value.exitCode!==null)return value.exitCode;await pause();}},
      release:async()=>{if(released)return;if(!verified)throw new Error('Cannot release an unverified Windows job');await this.request('release',{key});released=true;},
    };
    return job;
  }
  /** Explicit private-client teardown for probes/tests; runtime sessions never call this. */
  async close():Promise<void> {
    const child=this.child;if(!child||child.exitCode!==null||child.signalCode!==null)return;
    await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill();});
  }
}
const KEY=Symbol.for('thoth-agents.background-tasks.windows-job-helper.v1');
const global=globalThis as typeof globalThis & {[KEY]?:WindowsJobClient};
export function getWindowsJobClient():WindowsJobClient {return global[KEY] ??= new WindowsJobClient();}
