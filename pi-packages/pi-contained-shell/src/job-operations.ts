import { finished } from 'node:stream/promises';
import type {
  BashOperations,
  getShellConfig,
} from '@earendil-works/pi-coding-agent';
import {
  JobLauncherUnavailable,
  type LaunchedJob,
  launchInJob,
} from '@thoth-agents/pi-core/windows-job';

type ShellConfig = ReturnType<typeof getShellConfig>;
export interface JobOperationsOptions {
  resolveShell: () => ShellConfig;
  fallback: BashOperations;
  warn: () => void;
  launch?: typeof launchInJob;
  prefix?: string;
}

async function runJob(
  job: LaunchedJob,
  stdinCommand: string | undefined,
  onData: (data: Buffer) => void,
  cancelled: Promise<never>,
): Promise<{ exitCode: number }> {
  const drained = Promise.all(
    [job.stdout, job.stderr].map((stream) =>
      finished(stream, { readable: true, writable: false, cleanup: true }),
    ),
  );
  // Observe failures immediately, including while waiting for the leader.
  void drained.catch(() => {});
  job.stdout.on('data', onData);
  job.stderr.on('data', onData);
  job.stdin.on('error', () => {});
  job.stdin.end(stdinCommand);
  try {
    const { code } = await Promise.race([
      job.exited,
      cancelled,
      drained.then(() => job.exited),
    ]);
    return { exitCode: code };
  } finally {
    try {
      await job.terminate(5_000);
      await drained;
    } finally {
      await job.release();
    }
  }
}

async function runFallback(
  fallback: BashOperations,
  command: string,
  cwd: string,
  options: Parameters<BashOperations['exec']>[2],
  started: number,
) {
  if (options.timeout === undefined)
    return fallback.exec(command, cwd, options);
  const remaining = options.timeout - (performance.now() - started) / 1000;
  if (remaining <= 0) throw new Error(`timeout:${options.timeout}`);
  try {
    return await fallback.exec(command, cwd, {
      ...options,
      timeout: remaining,
    });
  } catch (error) {
    // The SDK reports its supplied (remaining) timeout. Restore the caller's value.
    if (error instanceof Error && error.message.startsWith('timeout:'))
      throw new Error(`timeout:${options.timeout}`);
    throw error;
  }
}

export function createJobOperations(
  options: JobOperationsOptions,
): BashOperations {
  return {
    async exec(command, cwd, execOptions) {
      const { onData, env, signal, timeout } = execOptions;
      if (timeout !== undefined) {
        if (!Number.isFinite(timeout) || timeout <= 0)
          throw new Error(
            'Invalid timeout: must be a finite number of seconds',
          );
        if (timeout * 1000 > 2_147_483_647)
          throw new Error('Invalid timeout: maximum is 2147483.647 seconds');
      }
      if (signal?.aborted) throw new Error('aborted');
      const started = performance.now();
      let cancellation: Error | undefined;
      let cancel!: (error: Error) => void;
      const cancelled = new Promise<never>((_, reject) => {
        cancel = reject;
      });
      const stop = (error: Error) => {
        cancellation ??= error;
        cancel(cancellation);
      };
      const onAbort = () => stop(new Error('aborted'));
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer =
        timeout === undefined
          ? undefined
          : setTimeout(
              () => stop(new Error(`timeout:${timeout}`)),
              timeout * 1000,
            );
      try {
        const shell = options.resolveShell();
        const text = (options.prefix ?? '') + command;
        const launch = (options.launch ?? launchInJob)({
          file: shell.shell,
          args:
            shell.commandTransport === 'stdin'
              ? shell.args
              : [...shell.args, text],
          cwd,
          env: env ?? process.env,
        });
        let job: LaunchedJob;
        try {
          job = await Promise.race([launch, cancelled]);
        } catch (error) {
          // Cancellation cannot revoke an in-flight launch. Retain its ownership
          // and clean up the late job, without allowing a fallback execution.
          if (cancellation) {
            void launch.then(
              (late) =>
                runJob(late, undefined, () => {}, cancelled).catch(
                  (failure) => {
                    if (failure !== cancellation)
                      console.warn(
                        'Contained shell late cleanup failed:',
                        failure,
                      );
                  },
                ),
              () => {},
            );
            throw cancellation;
          }
          if (!(error instanceof JobLauncherUnavailable)) throw error;
          options.warn();
          // The SDK owns cancellation once fallback starts. Keep the original
          // deadline rather than granting another complete timeout window.
          if (timer !== undefined) clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          return await runFallback(
            options.fallback,
            command,
            cwd,
            execOptions,
            started,
          );
        }
        const input =
          !cancellation && shell.commandTransport === 'stdin'
            ? text
            : undefined;
        const result = await runJob(
          job,
          input,
          cancellation ? () => {} : onData,
          cancelled,
        );
        if (signal?.aborted) throw new Error('aborted');
        if (cancellation) throw cancellation;
        return result;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
