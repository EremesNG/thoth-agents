import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'job-gaps-'));
const live = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(fn) { for(let i=0;i<200;i++){ const result=await fn(); if(result)return result; await new Promise(r=>setTimeout(r,25)); } throw Error('condition timed out'); }
const parent = spawn(process.execPath, [path.join(dir, 'windows-job-parent-fixture.mjs'), process.env.PWSH_PATH || 'C:/Program Files/PowerShell/7/pwsh.exe', path.join(dir, '..', 'windows-job-helper.ps1')], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
let stderr=''; parent.stderr.on('data', c=>stderr+=c);
let ready; const pending=new Map(); let id=0;
createInterface({input:parent.stdout}).on('line', line=>{ const result=JSON.parse(line); if(result.event==='ready')ready=result; else { pending.get(result.id)?.(result); pending.delete(result.id); } });
const send=(op,extra={})=>new Promise(resolve=>{pending.set(++id,resolve);parent.stdin.write(JSON.stringify({id,op,...extra})+'\n');});
try {
  await until(()=>ready || (parent.exitCode!==null && Promise.reject(Error(stderr))));
  const marker=path.join(temp,'resumed.txt');
  await writeFile(path.join(temp,'denied.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(marker)},'BAD');setInterval(()=>{},1000);`);
  const denied=await send('launch',{key:'denied',executable:process.execPath,argv:[path.join(temp,'denied.cjs')],cwd:temp,env:process.env,log:path.join(temp,'denied.log'),denyAssignment:true});
  assert.ok(denied.error, 'assignment denial must fail launch');
  assert.equal(denied.neverResumed,true); assert.ok(denied.failedPid>0);
  await until(()=>!live(denied.failedPid));
  await assert.rejects(access(marker));
  const childPidFile=path.join(temp,'child.pid');
  await writeFile(path.join(temp,'tree.cjs'), `const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,detached:true,stdio:'inherit'});require('node:fs').writeFileSync(${JSON.stringify(childPidFile)},String(c.pid));setInterval(()=>{},1000);`);
  const job=await send('launch',{key:'tree',executable:process.execPath,argv:[path.join(temp,'tree.cjs')],cwd:temp,env:process.env,log:path.join(temp,'tree.log')});
  assert.equal(job.error,undefined);
  const descendant=await until(async()=>{try{return Number(await readFile(childPidFile,'utf8'));}catch{return false;}});
  const start=performance.now();
  const killer=spawn('C:/Windows/System32/taskkill.exe',['/PID',String(parent.pid),'/F'],{windowsHide:true,stdio:'ignore'});
  const [code]=await once(killer,'exit');assert.equal(code,0);
  await until(()=>!live(parent.pid)&&!live(ready.pid)&&!live(job.pid)&&!live(descendant));
  console.log(JSON.stringify({parent:parent.pid,helper:ready.pid,leader:job.pid,descendant,deathMs:performance.now()-start,denied,allGone:true},null,2));
} finally {
  if(parent.exitCode===null){const done=once(parent,'exit');parent.kill();await done;}
  if(ready)await until(()=>!live(ready.pid));
  await rm(temp,{recursive:true,force:true});
}
