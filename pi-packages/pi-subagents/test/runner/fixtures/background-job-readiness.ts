import fs from 'node:fs';

// bg_task_spawn acknowledges queued work, not executing processes. Windows must
// cold-start the PowerShell/Job Object helper, launch Node, then start a second
// Node process. The previous 35s budget still expired on hosted Windows runners.
export const FIXTURE_JOB_STARTUP_TIMEOUT_MS = 60_000;

function published(file: string): boolean {
  try {
    const { parent, grandchild } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [parent, grandchild].every(
      (pid) => Number.isInteger(pid) && pid > 0,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** The atomic PID file is published only after the grandchild's IPC handshake. */
export async function waitForFixtureJobs(
  files: string[],
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + FIXTURE_JOB_STARTUP_TIMEOUT_MS;
  for (;;) {
    signal?.throwIfAborted();
    const missing = files.filter((file) => !published(file));
    if (missing.length === 0) return;
    if (Date.now() >= deadline)
      throw new Error(`Fixture jobs did not start: ${missing.join(', ')}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
