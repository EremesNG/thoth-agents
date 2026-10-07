import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  FIXTURE_JOB_STARTUP_TIMEOUT_MS,
  waitForFixtureJobs,
} from './fixtures/background-job-readiness.js';

const roots: string[] = [];
function fixtureFiles() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-job-readiness-'));
  roots.push(root);
  return [path.join(root, 'first.json'), path.join(root, 'second.json')];
}

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it('waits for every PID file when asynchronous job startup exceeds ten seconds', async () => {
  vi.useFakeTimers();
  const files = fixtureFiles();
  let outcome = 'pending';
  const ready = waitForFixtureJobs(files).then(
    () => {
      outcome = 'ready';
    },
    () => {
      outcome = 'failed';
    },
  );

  // A measured cold Windows helper needed 10.989s; its permitted readiness
  // window is 15s, followed by up to 10s for a launch acknowledgment.
  await vi.advanceTimersByTimeAsync(25_000);
  expect(outcome).toBe('pending');
  fs.writeFileSync(files[0]!, '{}');
  await vi.advanceTimersByTimeAsync(25);
  expect(outcome).toBe('pending');
  fs.writeFileSync(files[1]!, '{}');
  await vi.advanceTimersByTimeAsync(25);
  await ready;
  expect(outcome).toBe('ready');
});

it('fails within the finite startup budget when a PID file is never published', async () => {
  vi.useFakeTimers();
  const files = fixtureFiles();
  fs.writeFileSync(files[0]!, '{}');
  const failure = expect(waitForFixtureJobs(files)).rejects.toThrow(
    'Fixture jobs did not start',
  );
  await vi.advanceTimersByTimeAsync(FIXTURE_JOB_STARTUP_TIMEOUT_MS);
  await failure;
});
