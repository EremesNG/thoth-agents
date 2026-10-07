import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
import { readMeta, writeMeta } from './registry.js';
import { processExists } from './process.js';

// Detached descendants exercise Windows containment, not POSIX setsid escapes.
describe.skipIf(process.platform!=='win32')('natural watch branches use contained short-lived intermediates',()=>{
  it.each(['job','success','failure','invalid condition','nonmatching','evaluation error'])('%s verifies remaining descendants before settlement/next poll',async branch=>{
    const dir=mkdtempSync(join(tmpdir(),'bg-watch-branches-'));
    const pids=join(dir,'pids'),release=join(dir,'release'),overlap=join(dir,'overlap');
    const grand=join(dir,'grand.cjs'),middle=join(dir,'middle.cjs'),leader=join(dir,'leader.cjs');
    const grandCode=`require('node:fs').appendFileSync(${JSON.stringify(pids)},process.pid+'\\n');setInterval(()=>{},1000);`;
    writeFileSync(grand,grandCode);
    writeFileSync(middle,`const fs=require('node:fs');const before=fs.existsSync(${JSON.stringify(pids)})?fs.readFileSync(${JSON.stringify(pids)},'utf8'):'';const c=require('node:child_process').spawn(process.execPath,[${JSON.stringify(grand)}],{windowsHide:true,detached:true,stdio:'inherit'});c.unref();setInterval(()=>{if(fs.existsSync(${JSON.stringify(pids)})&&fs.readFileSync(${JSON.stringify(pids)},'utf8')!==before)process.exit(0);},5);`);
    writeFileSync(leader,`const fs=require('node:fs');if(fs.existsSync(${JSON.stringify(pids)}))for(const p of fs.readFileSync(${JSON.stringify(pids)},'utf8').trim().split('\\n')){try{process.kill(Number(p),0);fs.writeFileSync(${JSON.stringify(overlap)},'bad')}catch{}}const c=require('node:child_process').spawn(process.execPath,[${JSON.stringify(middle)}],{windowsHide:true,detached:true,stdio:'inherit'});c.on('exit',()=>{const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){console.log('not-json');clearInterval(t);process.exit(0)}},5)});`);
    const host=lifecycleHost('natural-watch-'+branch);await host.emit('session_start');
    const controller=new AbortController();controller.abort();
    const condition=branch==='evaluation error'?{type:'json_path_equals',path:'$.ok',value:true}:{type:'exit_code',equals:branch==='nonmatching'?7:0};
    const text=branch==='job'?await host.spawn({shell: "none" as const,argv:[process.execPath,leader]}):await host.execute('bg_task_watch',{shell: "none" as const,argv:[process.execPath,leader],success_when:condition,interval_seconds:1,timeout_seconds:0,...(branch==='failure'?{failure_when:{type:'exit_code',equals:0}}:{})},controller.signal);
    const id=text.match(/bg_[a-z0-9_]+/)![0];
    try {
      await expect.poll(()=>existsSync(pids),{timeout:10000}).toBe(true);
      if(branch==='invalid condition')writeMeta({...readMeta(id)!,successWhen:{type:'json_path_exists',path:'invalid'}});
      writeFileSync(release,'go');
      if(branch==='nonmatching'||branch==='evaluation error')await expect.poll(()=>readFileSync(pids,'utf8').trim().split('\n').length,{timeout:10000}).toBeGreaterThanOrEqual(2);
      else await expect.poll(()=>host.status(id).then(m=>m.status),{timeout:10000}).toBe(branch==='success'||branch==='job'?'succeeded':'failed');
      expect(existsSync(overlap)).toBe(false);
      await host.emit('session_shutdown','quit');
      expect(readFileSync(pids,'utf8').trim().split('\n').map(Number).some(processExists)).toBe(false);
    }finally{await host.emit('session_shutdown','quit');rmSync(dir,{recursive:true,force:true});}
  },20000);
});
