import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCommandOnce, commandExecution } from './process.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
const hosts:ReturnType<typeof lifecycleHost>[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const host of hosts.splice(0))await host.emit('session_shutdown','quit');});
const psQuote=(value:string)=>`'${value.replaceAll("'","''")}'`;
describe.skipIf(process.platform!=='win32')('PowerShell command jobs and watches',()=>{
  it('spawn/watch/action results report the actual launch shell, including changed 5.1 detection and argv executable', async () => {
    const host = lifecycleHost('shell-results'); hosts.push(host);
    await host.emit('session_start');
    // Registration saw normal pwsh; force the actual launch to Windows PowerShell.
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', 'Z:/missing/pwsh.exe');
    for (const shell of ['bash', 'powershell', 'none'] as const) {
      for (const [name, action] of [['bg_task_spawn', undefined], ['bg_task_watch', undefined], ['bg_task', 'spawn'], ['bg_task', 'watch']] as const) {
        const result = await host.tools.get(name).execute('shell-result', {
          action, shell, callback: false,
          ...(shell === 'none' ? { argv: [process.execPath, '-e', "console.log('ready')"] } : { command: shell === 'bash' ? "printf 'ready\\n'" : "[Console]::WriteLine('ready')" }),
          success_when: { type: 'stdout_contains', value: 'ready' },
        }, new AbortController().signal, undefined, host.ctx);
        expect(result.details?.shell).toMatchObject({ kind: shell, executable: expect.any(String), label: expect.any(String) });
        const text = result.content[0].text;
        expect(text).toContain(`Shell: ${result.details.shell.label}`);
        if (shell === 'powershell') expect(result.details.shell).toMatchObject({ edition: 'Desktop', version: expect.stringMatching(/^5\.1\./) });
        if (shell === 'none') expect(result.details.shell.executable).toBe(process.execPath);
      }
    }
  }, 30000);
  it('preserves quotes, literal dollars, newlines and Unicode with UTF-8 stdout/stderr',async()=>{
    const command=`$literal = 'quotes "double" and ''single'' $dollar π 漢字'
[Console]::Out.WriteLine($literal)
[Console]::Error.WriteLine('stderr café')`;
    const result=await runCommandOnce({shell:"powershell",command});expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('quotes "double" and \'single\' $dollar π 漢字');expect(result.stderr.trim()).toBe('stderr café');
    const execution=commandExecution({shell:"powershell",command});expect(execution.execPath).toMatch(/pwsh\.exe$/i);expect(execution.execArgs).toContain('-EncodedCommand');expect(execution.execArgs).not.toContain('-lc');
  });
  it.each([0,7,23])('preserves explicit exit %s',async code=>{expect((await runCommandOnce({shell:"powershell",command:`exit ${code}`})).exitCode).toBe(code);});
  it('propagates a failing native command exit code',async()=>{
    const result=await runCommandOnce({shell:"powershell",command:`& ${psQuote(process.execPath)} -e 'process.exit(19)'`});expect(result.exitCode).toBe(19);
  });
  it('runs watch conditions against PowerShell output',async()=>{
    const host=lifecycleHost('pwsh-watch');hosts.push(host);await host.emit('session_start');
    const text=await host.execute('bg_task_watch',{shell:"powershell",command:"$v = 'ready π'; [Console]::WriteLine($v)",success_when:{type:'stdout_contains',value:'ready π'}});
    const id=text.match(/bg_[a-z0-9_]+/)![0];await expect.poll(()=>host.status(id).then(m=>m.status)).toBe('succeeded');
  });
  it('sets UTF-8 before parsing invalid Unicode commands on Windows PowerShell 5.1', async () => {
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', `${process.env.SystemRoot || 'C:/Windows'}/System32/WindowsPowerShell/v1.0/powershell.exe`);
    const result = await runCommandOnce({ shell: 'powershell', command: "'después café π' )" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('después café π');
    expect(result.stderr).not.toContain('\uFFFD');
  });
  it('rejects unavailable PowerShell without launching a bash fallback',async()=>{
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH','Z:/missing/pwsh.exe');vi.stubEnv('SystemRoot','Z:/missing');
    expect(() => runCommandOnce({shell:"powershell",command:'Write-Output unreachable'})).toThrow(/Requested shell "powershell".*PI_BACKGROUND_TASKS_PWSH/);
  });
});
