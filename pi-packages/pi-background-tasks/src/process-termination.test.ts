import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProcessTreeTerminator } from './process-termination.js';
const platform=process.platform;
afterEach(()=>{Object.defineProperty(process,'platform',{value:platform,configurable:true});vi.restoreAllMocks();});
describe('best-effort POSIX process groups',()=>{
  it('uses TERM then bounded wait then KILL, and verifies ESRCH',async()=>{
    Object.defineProperty(process,'platform',{value:'linux',configurable:true});
    let alive=true;
    const kill=vi.spyOn(process,'kill').mockImplementation((pid,signal)=>{expect(pid).toBe(-950001);if(!alive)throw Object.assign(new Error('gone'),{code:'ESRCH'});if(signal==='SIGKILL')alive=false;return true;});
    await createProcessTreeTerminator(950001)();
    expect(kill).toHaveBeenCalledWith(-950001,'SIGTERM');expect(kill).toHaveBeenCalledWith(-950001,'SIGKILL');expect(alive).toBe(false);
  });
  it('does not confuse EPERM with an empty group',async()=>{
    Object.defineProperty(process,'platform',{value:'linux',configurable:true});vi.spyOn(process,'kill').mockImplementation(()=>{throw Object.assign(new Error('denied'),{code:'EPERM'});});await expect(createProcessTreeTerminator(950001)()).rejects.toThrow('denied');
  });
  it('refuses PID authority on Windows, including a reused PID',()=>{
    Object.defineProperty(process,'platform',{value:'win32',configurable:true});const kill=vi.spyOn(process,'kill');expect(()=>createProcessTreeTerminator(950001)).toThrow(/Job Object/);expect(kill).not.toHaveBeenCalled();
  });
});
