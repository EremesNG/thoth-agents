import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeJobHelper } from './job-helper-fixture.js';
import { FaultDeadlineClient } from './fault-deadline-client.js';

vi.mock('../powershell.js', async original => ({...await original<typeof import('../powershell.js')>(), resolvePowerShell: () => 'pwsh.exe'}));
vi.mock('node:child_process', async original => ({...await original<typeof import('node:child_process')>(), spawn: vi.fn()}));
const platform=process.platform;
const clients:FaultDeadlineClient[]=[];
afterEach(async()=>{
  for(const client of clients.splice(0))await client.close();
  Object.defineProperty(process,'platform',{value:platform,configurable:true});
  vi.useRealTimers();vi.restoreAllMocks();vi.clearAllMocks();
});
function setup(){
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  const helper=fakeJobHelper(987001);helper.allowCleanup();
  const client=new FaultDeadlineClient();clients.push(client);
  const spec={executable:process.execPath,argv:[],cwd:process.cwd(),env:process.env,log:''};
  return {helper,client,spec};
}
const outcome=<T>(promise:Promise<T>)=>promise.then(value=>({value}),error=>({error}));

describe('fault acknowledgment deadline isolation',()=>{
  it('allows a healthy launch to take longer than the lost-response deadline with an existing cwd',async()=>{
    const {helper,client,spec}=setup();
    const response=helper.holdNextResponse('launch');
    const launched=outcome(client.launch({...spec,responseFaults:{terminate:'timeout'}}));
    await response.received;
    expect(existsSync(spec.cwd)).toBe(true);
    await vi.advanceTimersByTimeAsync(600);response.reply();
    await expect(launched).resolves.toMatchObject({value:{pid:987001}});
  });
  it.each(['terminate','query','release'] as const)('shortens only the first faulted %s, not another job or its retry',async op=>{
    const {helper,client,spec}=setup();
    const job=await client.launch({...spec,responseFaults:{[op]:'timeout'}}),root=await client.launch(spec);
    if(op==='release')await job.terminate();
    const lost=helper.holdNextResponse(op);
    const fault=outcome<unknown>(job[op]());await lost.received;
    const delayed=helper.holdNextResponse('query');
    const healthy=outcome(root.query());await delayed.received;
    await vi.advanceTimersByTimeAsync(600);delayed.reply();
    await expect(fault).resolves.toMatchObject({error:{message:`Windows job helper ${op} timed out`}});
    await expect(healthy).resolves.toMatchObject({value:{activeProcesses:2}});
    // A healthy retry must not inherit the injected request's short deadline.
    if(op!=='release'){
      const retried=helper.holdNextResponse(op);
      const retry=outcome<unknown>(job[op]());await retried.received;
      await vi.advanceTimersByTimeAsync(600);retried.reply();
      const result=await retry;expect(result).not.toHaveProperty('error');
      if(op==='query')expect(result).toMatchObject({value:{activeProcesses:2}});
    }else await expect(job.release()).resolves.toBeUndefined();
    lost.reply();
  });
});
