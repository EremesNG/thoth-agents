import type { ChildProcess } from 'node:child_process';

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
