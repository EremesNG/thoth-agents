import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { vi } from 'vitest';

/** Fake the native helper's public JSON-lines boundary, not the client/container logic. */
export function fakeJobHelper(basePid:number) {
  Object.defineProperty(process,'platform',{value:'win32',configurable:true});
  Reflect.deleteProperty(globalThis,Symbol.for('thoth-agents.background-tasks.windows-job-helper.v1'));
  const primary={live:new Set([basePid,basePid+1]),exitCode:null as number|null};
  const jobs=new Map<string,typeof primary>();
  const unrelated=new Set<number>();
  const requests:{op:string;key?:string}[]=[];
  let launchCount=0,failTerminations=1,queryError:string|undefined,oneQueryError:string|undefined,ignoreTerminate=false,unavailable=false;
  let onTerminate:(()=>void)|undefined;
  const stdout=new PassThrough(),stderr=new PassThrough();
  const child=Object.assign(new EventEmitter(),{pid:basePid+999,stdout,stderr,exitCode:null as number|null,signalCode:null as string|null,unref(){},kill(){this.exitCode=1;(this as unknown as EventEmitter).emit('exit',1,null);return true;}});
  const reply=(id:number,value:Record<string,unknown>)=>stdout.write(JSON.stringify({id,...value})+'\n');
  const stdin=new Writable({write(chunk,_encoding,done){
    for(const line of String(chunk).trim().split('\n')) {
      const request=JSON.parse(line);requests.push(request);
      if(unavailable){reply(request.id,{error:'helper unavailable mid-cleanup'});continue;}
      if(request.op==='launch') {
        const state=launchCount++===0?primary:{live:new Set([basePid+launchCount*10,basePid+launchCount*10+1]),exitCode:null};
        jobs.set(request.key,state);
        // Native output files exist even when the process writes nothing.
        fixtureFiles(request.log,request.stderrLog);
        reply(request.id,{pid:[...state.live][0]});continue;
      }
      const state=jobs.get(request.key);
      if(!state){reply(request.id,{error:'unknown owned container'});continue;}
      if(request.op==='query'&&(queryError||oneQueryError)) {reply(request.id,{error:queryError||oneQueryError});oneQueryError=undefined;continue;}
      if(request.op==='terminate') {
        state.live.delete([...state.live].find(pid=>pid===basePid) ?? -1);
        state.exitCode ??= 1;
        onTerminate?.();
        if(failTerminations>0){failTerminations--;reply(request.id,{error:'TerminateJobObject: Access is denied'});continue;}
        if(!ignoreTerminate)state.live.clear();
      }
      if(request.op==='release') {
        if(state.live.size){reply(request.id,{error:'cannot release nonempty container'});continue;}
        jobs.delete(request.key);reply(request.id,{released:true});continue;
      }
      reply(request.id,{pid:basePid,activeProcesses:state.live.size,exitCode:state.exitCode,creationTime:'2026-10-01T00:00:00.000Z'});
    }
    done();
  }});
  Object.assign(child,{stdin});
  vi.mocked(spawn).mockImplementation(()=>{queueMicrotask(()=>stdout.write(JSON.stringify({event:'ready',pid:child.pid})+'\n'));return child as any;});
  vi.spyOn(process,'kill').mockImplementation((pid)=>{if(pid===process.pid||unrelated.has(pid)||[...jobs.values()].some(state=>state.live.has(pid)))return true;throw Object.assign(new Error('gone'),{code:'ESRCH'});});
  // Compatibility event driver denotes the *job leader*, not the helper process.
  const leader={emit(event:string,...args:any[]){
    if(event==='close'){primary.live.delete(basePid);primary.exitCode=args[0];}
    if(event==='error')oneQueryError=args[0].message;
    return true;
  }};
  return {live:primary.live,child:leader,requests,helper:child,
    get launchCount(){return launchCount;},
    allowCleanup(){failTerminations=0;queryError=undefined;oneQueryError=undefined;ignoreTerminate=false;unavailable=false;},
    failQuery(message?:string){queryError=message;},
    failHelper(value=true){unavailable=value;},
    leaveActive(value=true){ignoreTerminate=value;},
    onTerminate(callback:()=>void){onTerminate=callback;},
    reuseDescendantPid(){primary.live.clear();unrelated.add(basePid+1);},
    isUnrelatedAlive(pid:number){return unrelated.has(pid);},
  };
}
import { closeSync, openSync } from 'node:fs';
function fixtureFiles(...files:(string|undefined)[]){for(const file of files)if(file)closeSync(openSync(file,'a'));}
