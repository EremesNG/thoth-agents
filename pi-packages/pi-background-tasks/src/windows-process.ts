import { EventEmitter } from 'node:events';
import { closeSync, fstatSync, mkdtempSync, openSync, readSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getWindowsJobClient } from './windows-job-client.js';
import { commandExecution, CommandTerminationError, completeUtf8Length, type RunningCommand, type SpawnedProcess } from './process.js';
import type { CommandSpec, CommandResult } from './types.js';

export function spawnWindowsCommand(spec:CommandSpec,log:string,stderrLog?:string):SpawnedProcess {
  const child=Object.assign(new EventEmitter(),{pid:undefined as number|undefined,unref(){}});
  const ready=Promise.resolve().then(()=>{
    let execution;
    try { execution=commandExecution(spec); }
    catch(error) { throw Object.assign(error as Error,{launchFailed:true}); }
    return getWindowsJobClient().launch({executable:execution.execPath,argv:execution.execArgs,cwd:spec.cwd || process.cwd(),env:{...process.env,...spec.env},log,stderrLog});
  });
  let exitEmitted=false;
  const emitExit=(code:number|null)=>{if(exitEmitted)return;exitEmitted=true;child.emit('exit',code,null);child.emit('close',code,null);};
  const terminate=async()=>{
    const job=await ready.catch(error=>{if(error.launchFailed)return undefined;throw error;});
    if(job){await job.terminate();emitExit((await job.query()).exitCode);await job.release();}
  };
  void ready.then(async job=>{
    child.pid=job.pid;child.emit('spawn');
    emitExit(await job.waitForExit());
  }).catch(error=>{if(!exitEmitted){child.emit('error',error);emitExit(null);}});
  return {child,terminate};
}
function capture(file:string,cap:number):{text:string;discardedBytes:number} {
  const fd=openSync(file,'r');try {
    const size=fstatSync(fd).size;const buffer=Buffer.alloc(Math.min(cap,size));const bytes=readSync(fd,buffer,0,buffer.length,0);
    const keep=size>cap?completeUtf8Length(buffer.subarray(0,bytes)):bytes;
    return {text:buffer.subarray(0,keep).toString('utf8'),discardedBytes:size-keep};
  }finally{closeSync(fd);}
}
export function startWindowsCommandOnce(spec:CommandSpec,maxBufferBytes:number,timeoutMs?:number,signal?:AbortSignal):RunningCommand {
  const startedAt=Date.now(),dir=mkdtempSync(join(tmpdir(),'pi-bg-poll-')),out=join(dir,'stdout'),err=join(dir,'stderr');
  const spawned=spawnWindowsCommand(spec,out,err);
  let pending=true,verified=false,termination:Promise<void>|undefined,timedOut=false,removed=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const remove=()=>{if(!removed){rmSync(dir,{recursive:true,force:true});removed=true;}};
  const terminate=()=>termination ??= spawned.terminate().then(()=>{pending=false;verified=true;},error=>{termination=undefined;throw new CommandTerminationError(error);});
  const result=new Promise<CommandResult>((resolve,reject)=>{
    const abort=()=>{void terminate().catch(reject);};
    const cleanup=()=>{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    if(timeoutMs!==undefined){timer=setTimeout(()=>{timedOut=true;abort();},Math.max(1,timeoutMs));timer.unref();}
    let launchError:Error|undefined;
    spawned.child.on('error',(error:Error)=>{launchError=error;});
    spawned.child.on('close',(exitCode:number|null,exitSignal:NodeJS.Signals|null)=>{
      cleanup();void(async()=>{await terminate();if(launchError)throw launchError;
        const stdout=capture(out,Math.max(1,Math.floor(maxBufferBytes))),stderr=capture(err,Math.max(1,Math.floor(maxBufferBytes)));
        resolve({exitCode,signal:exitSignal,stdout:stdout.text,stderr:stderr.text,startedAt,endedAt:Date.now(),...(timedOut?{timedOut:true}:{}),...(stdout.discardedBytes?{stdoutDiscardedBytes:stdout.discardedBytes}:{}),...(stderr.discardedBytes?{stderrDiscardedBytes:stderr.discardedBytes}:{}),...(stdout.discardedBytes||stderr.discardedBytes?{captureTruncated:true}:{})});
      })().catch(reject).finally(()=>{if(verified)remove();});
    });
  });
  return {result,terminate:async()=>{await terminate();if(verified)removeAfterResult();},get cleanupPending(){return pending;},get cleanupVerified(){return verified;}};
  function removeAfterResult(){void result.then(remove,remove);}
}
