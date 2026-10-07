import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeJobHelper } from './test-support/job-helper-fixture.js';
import { WindowsJobClient } from './windows-job-client.js';

vi.mock('./powershell.js', async original => ({...await original<typeof import('./powershell.js')>(), resolvePowerShell: () => 'pwsh.exe'}));
vi.mock('node:child_process', async original => ({...await original<typeof import('node:child_process')>(), spawn: vi.fn()}));
const platform=process.platform;
const clients:WindowsJobClient[]=[];
afterEach(async()=>{
  for(const client of clients.splice(0))await client.close();
  Object.defineProperty(process,'platform',{value:platform,configurable:true});
  vi.restoreAllMocks();vi.clearAllMocks();
});
function setup(requestTimeoutMs?:number){
  const helper=fakeJobHelper(986001);helper.allowCleanup();
  const client=new WindowsJobClient({requestTimeoutMs});clients.push(client);
  const launch=()=>client.launch({executable:process.execPath,argv:[],cwd:process.cwd(),env:process.env,log:''});
  return {helper,client,launch};
}

describe('Windows job operation ordering',()=>{
  it('finishes an in-flight query before release without blocking other jobs',async()=>{
    const {helper,launch}=setup();
    const job=await launch(),other=await launch();await job.terminate();
    const response=helper.holdNextResponse('query');
    const query=job.query();await response.received;
    const release=job.release(),terminal=job.query(),unrelated=other.query();
    try {
      await expect(Promise.race([terminal,unrelated.then(()=> 'query waited for release')])).resolves.toMatchObject({activeProcesses:0,exitCode:1});
      expect((await unrelated).activeProcesses).toBeGreaterThan(0);
      expect(helper.requests.filter(request=>request.op==='release')).toHaveLength(0);
    }finally{response.reply();await Promise.all([query,release,terminal]);}
    await expect(query).resolves.toMatchObject({activeProcesses:0,exitCode:1});
    await expect(job.query()).resolves.toMatchObject({activeProcesses:0,exitCode:1});
  });
  it('returns the verified terminal state as soon as release starts, before its acknowledgment',async()=>{
    const {helper,launch}=setup();
    const job=await launch(),other=await launch();await job.terminate();
    const response=helper.holdNextResponse('release');
    const release=job.release();await response.received;
    const queries=helper.requests.filter(request=>request.op==='query').length;
    const terminal=job.query();
    // Another job's response is a deterministic I/O barrier, not a sleep.
    const result=Promise.race([terminal,other.query().then(()=> 'query waited for release')]);
    try {
      await expect(result).resolves.toMatchObject({activeProcesses:0,exitCode:1});
      expect(helper.requests.filter(request=>request.op==='query')).toHaveLength(queries+1);
      await expect(job.terminate()).resolves.toBeUndefined();
    }finally{response.reply();await Promise.all([release,terminal]);}
  });
  it('keeps terminal queries safe after a lost release acknowledgment and allows release retry',async()=>{
    const {helper,launch}=setup(100);
    const job=await launch();await job.terminate();
    const response=helper.holdNextResponse('release');
    const release=job.release();await response.received;
    await expect(release).rejects.toThrow(/release timed out/);
    const requests=helper.requests.length;
    await expect(job.query()).resolves.toMatchObject({activeProcesses:0,exitCode:1});
    expect(helper.requests).toHaveLength(requests);
    await expect(job.release()).resolves.toBeUndefined();
    response.reply();
    await expect(job.query()).resolves.toMatchObject({activeProcesses:0,exitCode:1});
  });
  it('propagates UNKNOWN_KEY outside release without poisoning later cleanup',async()=>{
    const {helper,launch}=setup();
    const job=await launch();
    helper.failQuery('Unknown job key','UNKNOWN_KEY');
    await expect(job.query()).rejects.toMatchObject({message:'Unknown job key',code:'UNKNOWN_KEY'});
    helper.allowCleanup();
    expect((await job.query()).activeProcesses).toBeGreaterThan(0);
    await job.terminate();await job.release();
    await expect(job.query()).resolves.toMatchObject({activeProcesses:0,exitCode:1});
  });
  it('does not contact the helper after releasing a launch that never created a container',async()=>{
    const {helper,client}=setup();helper.rejectLaunch();
    const job=client.createJob({executable:process.execPath,argv:[],cwd:process.cwd(),env:process.env,log:''});
    await expect(job.ready).rejects.toThrow(/CreateProcessW/);
    await expect(job.query()).rejects.toMatchObject({code:'UNKNOWN_KEY'});
    await job.terminate();await job.release();
    const requests=helper.requests.length;
    await expect(job.query()).rejects.toMatchObject({code:'UNKNOWN_KEY'});
    expect(helper.requests).toHaveLength(requests);
  });
  it('does not suppress live queries when release is refused as unverified',async()=>{
    const {launch}=setup();
    const job=await launch();
    await expect(job.release()).rejects.toThrow(/unverified/);
    expect((await job.query()).activeProcesses).toBeGreaterThan(0);
  });
});
