import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import {
  getWindowsJobClient,
  JobLauncherUnavailable,
  type WindowsJobClient,
} from './client.js';

const directories: string[] = [];
const clients = new Set<WindowsJobClient>();
function bundles() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-job-bundles-'));
  directories.push(root);
  return ['askcodex', 'bridge'].map((name) => {
    const directory = join(root, name);
    mkdirSync(directory);
    for (const asset of ['launcher.ps1', 'launcher.cs'])
      copyFileSync(
        fileURLToPath(new URL(asset, import.meta.url)),
        join(directory, asset),
      );
    return join(directory, 'launcher.ps1');
  });
}
function client(asset: string) {
  const result = getWindowsJobClient(asset);
  clients.add(result);
  return result;
}
const spec = {
  file: process.execPath,
  args: ['-e', 'setInterval(()=>{},1000)'],
  cwd: process.cwd(),
  env: process.env,
};
afterEach(async () => {
  await Promise.all([...clients].map((c) => c.close()));
  clients.clear();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
it('shares clients only for the same resolved asset location, including across module copies', async () => {
  const [first, second] = bundles();
  const a = client(first);
  expect(client(second)).not.toBe(a);
  expect(client(join(first, '..', 'launcher.ps1'))).toBe(a);
  vi.resetModules();
  const otherModule = await import('./client.js');
  expect(otherModule.getWindowsJobClient(first)).toBe(a);
});
it.skipIf(process.platform !== 'win32')(
  'closing and recovering one bundle helper leaves the other bundle job running',
  async () => {
    const [first, second] = bundles();
    const a = client(first);
    const b = client(second);
    const [jobA, jobB, sharedJob] = await Promise.all([
      a.launch(spec),
      b.launch(spec),
      client(first).launch(spec),
    ]);
    expect(a.helperPid).toBeGreaterThan(0);
    expect(b.helperPid).toBeGreaterThan(0);
    expect(a.helperPid).not.toBe(b.helperPid);
    const helperB = b.helperPid;
    const failedA = expect(jobA.exited).rejects.toBeInstanceOf(
      JobLauncherUnavailable,
    );
    const failedShared = expect(sharedJob.exited).rejects.toBeInstanceOf(
      JobLauncherUnavailable,
    );
    let bExited = false;
    void jobB.exited.then(
      () => {
        bExited = true;
      },
      () => {
        bExited = true;
      },
    );
    await a.close();
    await Promise.all([failedA, failedShared]);
    await expect
      .poll(
        () => {
          try {
            process.kill(jobA.pid, 0);
            return false;
          } catch {
            return true;
          }
        },
        { timeout: 10000 },
      )
      .toBe(true);
    expect(() => process.kill(jobB.pid, 0)).not.toThrow();
    const recovered = await client(first).launch(spec);
    expect(b.helperPid).toBe(helperB);
    expect(() => process.kill(jobB.pid, 0)).not.toThrow();
    expect(bExited).toBe(false);
    await recovered.terminate(10000);
    await recovered.exited;
    await recovered.release();
    await jobB.terminate(10000);
    await jobB.exited;
    await jobB.release();
  },
  120000,
);
