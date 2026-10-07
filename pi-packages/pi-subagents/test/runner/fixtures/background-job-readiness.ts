import fs from 'node:fs';

// Windows bg_task_spawn returns before its cold helper is ready. Allow the
// helper's 15s readiness window, its 10s launch acknowledgment window, then the
// original 10s allowance for Node and the grandchild to publish their PID file.
// Under CPU load the helper took 10.989s and PID publication took 13.376s;
// the old independent 10s fixture deadline failed an otherwise valid launch.
export const FIXTURE_JOB_STARTUP_TIMEOUT_MS = 15_000 + 10_000 + 10_000;

/** Spawn tools acknowledge background work before the fixture processes run. */
export async function waitForFixtureJobs(files: string[]): Promise<void> {
  const deadline = Date.now() + FIXTURE_JOB_STARTUP_TIMEOUT_MS;
  while (!files.every((file) => fs.existsSync(file))) {
    if (Date.now() >= deadline) throw new Error('Fixture jobs did not start');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
