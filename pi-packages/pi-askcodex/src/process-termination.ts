import { type ChildProcess, execFile } from 'node:child_process';

export interface TerminationOptions {
  timeoutMs?: number;
  log?: (message: string, data?: unknown) => void;
}

/** Only for owned children spawned detached on POSIX. Always bounded. */
export function terminateProcessTree(
  child: ChildProcess,
  opts: TerminationOptions = {},
): Promise<void> {
  if (!child.pid) return Promise.resolve();
  const pid = child.pid;
  const timeoutMs = Math.max(1, opts.timeoutMs ?? 3000);
  if (process.platform === 'win32')
    return terminateWindowsTree(child, timeoutMs, opts.log);
  return new Promise((resolve) => {
    let exited = child.exitCode !== null || child.signalCode !== null;
    let signalled = false;
    let done = false;
    let escalation: NodeJS.Timeout | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      clearTimeout(escalation);
      child.removeListener('exit', onExit);
      resolve();
    };
    const check = () => {
      if (exited && signalled) finish();
    };
    const onExit = () => {
      exited = true;
      check();
    };
    const warn = (reason: string) => {
      try {
        opts.log?.('termination-warning', { pid, reason, timeoutMs });
      } catch {
        /* diagnostics cannot break cleanup */
      }
    };
    const deadline = setTimeout(() => {
      warn('gave up waiting for process-tree termination');
      finish();
    }, timeoutMs);
    child.once('exit', onExit);
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    // Escalate even when the group leader exited: descendants can ignore TERM.
    escalation = setTimeout(
      () => {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
        signalled = true;
        check();
      },
      Math.min(750, Math.max(1, timeoutMs / 2)),
    );
  });
}

/** Snapshot before signalling: ParentProcessId still identifies orphans after leader exit. */
async function terminateWindowsTree(
  child: ChildProcess,
  timeoutMs: number,
  log?: TerminationOptions['log'],
): Promise<void> {
  const pid = child.pid as number;
  const deadline = Date.now() + timeoutMs;
  const run = (file: string, args: string[], budget: number): Promise<string> =>
    new Promise((resolve) => {
      try {
        execFile(
          file,
          args,
          {
            windowsHide: true,
            shell: false,
            timeout: Math.max(1, Math.floor(budget)),
            killSignal: 'SIGKILL',
            maxBuffer: 1024 * 1024,
            encoding: 'utf8',
          },
          (error, stdout) => {
            if (error) {
              try {
                log?.('termination-warning', {
                  pid,
                  reason: error.message,
                  timeoutMs,
                });
              } catch {
                /* diagnostics cannot break cleanup */
              }
            }
            resolve(error ? '' : stdout);
          },
        );
      } catch {
        resolve('');
      }
    });
  // Query once, then walk locally; bound both enumeration and helper lifetime.
  const script = `$all=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId); $owned=[System.Collections.Generic.HashSet[int]]::new(); [void]$owned.Add(${pid}); do { $added=$false; foreach($p in $all) { if($owned.Contains([int]$p.ParentProcessId) -and $owned.Add([int]$p.ProcessId)) { $added=$true } } } while($added -and $owned.Count -lt 4096); $owned | Where-Object { $_ -ne ${pid} }`;
  const output = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    Math.min(1500, timeoutMs / 2),
  );
  const descendants = output
    .split(/\s+/)
    .filter((value) => /^[1-9]\d*$/.test(value))
    .slice(0, 4096);
  // Kill the live root first; do not end stdin before taskkill has captured its tree.
  await run(
    'taskkill',
    ['/PID', String(pid), '/T', '/F'],
    (deadline - Date.now()) / (descendants.length ? 2 : 1),
  );
  // A root that exited before/during taskkill no longer anchors /T. Kill snapshots too.
  // Batch to stay below Windows' command-line limit, sharing one deadline.
  for (let i = 0; i < descendants.length && Date.now() < deadline; i += 128) {
    const batch = descendants.slice(i, i + 128);
    await run(
      'taskkill',
      [...batch.flatMap((id) => ['/PID', id]), '/T', '/F'],
      (deadline - Date.now()) / Math.ceil((descendants.length - i) / 128),
    );
  }
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        child.removeListener('exit', finish);
        resolve();
      };
      const timer = setTimeout(finish, Math.max(1, deadline - Date.now()));
      child.once('exit', finish);
    });
  }
}
