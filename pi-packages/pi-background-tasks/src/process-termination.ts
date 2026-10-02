/** POSIX only: best-effort ownership of the detached group, never a descendant census. */
export function createProcessTreeTerminator(pid:number,pgid=pid):()=>Promise<void> {
  if(process.platform==='win32')throw new Error('Windows termination requires an owned Job Object, never a PID');
  if(!Number.isInteger(pgid)||pgid<=0||pgid===process.pid)throw new Error('Invalid owned process group');
  let verified=false;
  const signal=(value:NodeJS.Signals|0)=>{try{process.kill(-pgid,value);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error;}};
  const wait=async(ms:number)=>{const deadline=performance.now()+ms;while(signal(0)){if(performance.now()>=deadline)return false;await new Promise(resolve=>setTimeout(resolve,25));}return true;};
  return async()=>{
    if(verified)return;
    if(!signal(0)){verified=true;return;}
    signal('SIGTERM');
    if(!await wait(500)){signal('SIGKILL');if(!await wait(2000))throw new Error(`Process group ${pgid} did not report ESRCH after SIGKILL`);}
    verified=true;
  };
}
export async function terminateProcessTree(pid:number,pgid?:number):Promise<void>{await createProcessTreeTerminator(pid,pgid)();}
