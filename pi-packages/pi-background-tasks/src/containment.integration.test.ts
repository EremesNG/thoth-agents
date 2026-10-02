import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { spawnCommand, startCommandOnce, processExists } from './process.js';
describe.skipIf(process.platform !== 'win32')('job and watch containment',()=>{
  it.each(['job','watch'])('cleans an immediate-exit intermediate for a %s',async kind=>{
    const dir=mkdtempSync(join(tmpdir(),'bg-contained-'));
    const pidFile=join(dir,'pid');
    const grand=join(dir,'grand.cjs'),middle=join(dir,'middle.cjs'),leader=join(dir,'leader.cjs');
    writeFileSync(grand,`require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`);
    writeFileSync(middle,`const c=require('node:child_process').spawn(process.execPath,[${JSON.stringify(grand)}],{windowsHide:true,detached:true,stdio:'inherit'});c.unref();const t=setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(pidFile)})){clearInterval(t);process.exit(0)}},5);`);
    writeFileSync(leader,`const c=require('node:child_process').spawn(process.execPath,[${JSON.stringify(middle)}],{windowsHide:true,detached:true,stdio:'inherit'});c.on('exit',()=>process.exit(0));`);
    const spec={shell:false,argv:[process.execPath,leader]};
    const work=kind==='job'?spawnCommand(spec,join(dir,'log'),true):startCommandOnce(spec);
    try {
      if('child' in work){await once(work.child,'close');await work.terminate();}
      else expect((await work.result).exitCode).toBe(0);
      const pid=Number(readFileSync(pidFile,'utf8'));expect(processExists(pid)).toBe(false);
    }finally{await work.terminate();rmSync(dir,{recursive:true,force:true});}
  });
});
