import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCommandOnce, commandExecution } from './process.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
const hosts:ReturnType<typeof lifecycleHost>[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const host of hosts.splice(0))await host.emit('session_shutdown','quit');});
const psQuote=(value:string)=>`'${value.replaceAll("'","''")}'`;
describe.skipIf(process.platform!=='win32')('PowerShell command jobs and watches',()=>{
  it('tells tool callers the command shell on each platform',()=>{
    const host=lifecycleHost('shell-description');hosts.push(host);
    for(const name of ['bg_task_spawn','bg_task_watch']) {
      const tool=host.tools.get(name);expect(tool.description).toMatch(/PowerShell.*Windows/);
      expect(tool.parameters.properties.command.description).toMatch(/PowerShell/);
      expect(tool.parameters.properties.shell.description).toMatch(/POSIX/);
    }
  });
  it('preserves quotes, literal dollars, newlines and Unicode with UTF-8 stdout/stderr',async()=>{
    const command=`$literal = 'quotes "double" and ''single'' $dollar π 漢字'
[Console]::Out.WriteLine($literal)
[Console]::Error.WriteLine('stderr café')`;
    const result=await runCommandOnce({command});expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('quotes "double" and \'single\' $dollar π 漢字');expect(result.stderr.trim()).toBe('stderr café');
    const execution=commandExecution({command});expect(execution.execPath).toMatch(/pwsh\.exe$/i);expect(execution.execArgs).toContain('-EncodedCommand');expect(execution.execArgs).not.toContain('-lc');
  });
  it.each([0,7,23])('preserves explicit exit %s',async code=>{expect((await runCommandOnce({command:`exit ${code}`})).exitCode).toBe(code);});
  it('propagates a failing native command exit code',async()=>{
    const result=await runCommandOnce({command:`& ${psQuote(process.execPath)} -e 'process.exit(19)'`});expect(result.exitCode).toBe(19);
  });
  it('runs watch conditions against PowerShell output',async()=>{
    const host=lifecycleHost('pwsh-watch');hosts.push(host);await host.emit('session_start');
    const text=await host.execute('bg_task_watch',{command:"$v = 'ready π'; [Console]::WriteLine($v)",success_when:{type:'stdout_contains',value:'ready π'}});
    const id=text.match(/bg_[a-z0-9_]+/)![0];await expect.poll(()=>host.status(id).then(m=>m.status)).toBe('succeeded');
  });
  it('rejects a missing PowerShell override without launching a fallback shell',async()=>{
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','Z:/missing/pwsh.exe');
    await expect(runCommandOnce({command:'Write-Output unreachable'})).rejects.toThrow(/Install PowerShell 7.*PI_BACKGROUND_TASKS_PWSH/);
  });
});
