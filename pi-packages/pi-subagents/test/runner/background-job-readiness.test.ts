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

it('waits for every PID file when asynchronous job startup exceeds the previous Windows budget', async () => {
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

  // Hosted runners can exceed the previous combined 35s startup budget.
  await vi.advanceTimersByTimeAsync(45_000);
  expect(outcome).toBe('pending');
  fs.writeFileSync(files[0]!, JSON.stringify({ parent: 1, grandchild: 2 }));
  await vi.advanceTimersByTimeAsync(25);
  expect(outcome).toBe('pending');
  fs.writeFileSync(files[1]!, JSON.stringify({ parent: 3, grandchild: 4 }));
  await vi.advanceTimersByTimeAsync(25);
  await ready;
  expect(outcome).toBe('ready');
});

it('fails within the finite startup budget when a PID file is never published', async () => {
  vi.useFakeTimers();
  const files = fixtureFiles();
  fs.writeFileSync(files[0]!, JSON.stringify({ parent: 1, grandchild: 2 }));
  const failure = expect(waitForFixtureJobs(files)).rejects.toThrow(
    'Fixture jobs did not start',
  );
  await vi.advanceTimersByTimeAsync(FIXTURE_JOB_STARTUP_TIMEOUT_MS);
  await failure;
});

it('does not treat an empty PID file as a process readiness signal', async () => {
  vi.useFakeTimers();
  const files = fixtureFiles();
  for (const file of files) fs.writeFileSync(file, '{}');
  const failure = expect(waitForFixtureJobs(files)).rejects.toThrow(
    'Fixture jobs did not start',
  );
  await vi.advanceTimersByTimeAsync(FIXTURE_JOB_STARTUP_TIMEOUT_MS);
  await failure;
});

it('cancels a pending readiness wait so teardown does not wait for its deadline', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const reason = new Error('Fixture teardown');
  const failure = expect(
    waitForFixtureJobs(fixtureFiles(), controller.signal),
  ).rejects.toBe(reason);
  controller.abort(reason);
  await vi.advanceTimersByTimeAsync(25);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});
