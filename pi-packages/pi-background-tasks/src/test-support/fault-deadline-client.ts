import { AsyncLocalStorage } from 'node:async_hooks';
import { WindowsJobClient, type JobLaunch, type PendingWindowsJob, type ResponseFault } from '../windows-job-client.js';

const losesResponse=(fault:ResponseFault|undefined)=>fault==='timeout'||fault==='malformed';

/** Keep real helper I/O at its production deadline; only injected lost replies use 500 ms.
 * A healthy query was observed arriving at 548 ms during reload. A client-wide
 * 500 ms deadline made that origin terminate itself, and also raced normal launches.
 */
export class FaultDeadlineClient extends WindowsJobClient {
  private readonly deadline:AsyncLocalStorage<number>;
  constructor() {
    const deadline=new AsyncLocalStorage<number>();
    super({testFaults:true,get requestTimeoutMs(){return deadline.getStore();}});
    this.deadline=deadline;
  }
  private faultOnce<T>(operation:()=>Promise<T>):()=>Promise<T> {
    let first=true;
    return ()=>{
      if(!first)return operation();
      first=false;
      return this.deadline.run(500,operation);
    };
  }
  override createJob(spec:JobLaunch):PendingWindowsJob {
    const create=()=>super.createJob(spec);
    const job=losesResponse(spec.responseFaults?.launch)?this.deadline.run(500,create):create();
    if(losesResponse(spec.responseFaults?.terminate)||losesResponse(spec.terminationFault))job.terminate=this.faultOnce(job.terminate);
    if(losesResponse(spec.responseFaults?.query))job.query=this.faultOnce(job.query);
    if(losesResponse(spec.responseFaults?.release))job.release=this.faultOnce(job.release);
    return job;
  }
}
