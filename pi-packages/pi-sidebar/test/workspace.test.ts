import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readWorkspace, WorkspaceReader } from '../src/panels/workspace.js';

const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function directory() {
  const dir = mkdtempSync(join(tmpdir(), 'sidebar-git-'));
  directories.push(dir);
  return dir;
}

it('reads branch from HEAD and porcelain status in repositories, worktrees and non-git directories', async () => {
  const dir = directory();
  expect(await readWorkspace(dir)).toEqual({
    cwd: dir,
    status: 'Not a git repository',
  });
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-b', 'sidebar-test');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'init',
  );
  expect(await readWorkspace(dir)).toEqual({
    cwd: dir,
    branch: 'sidebar-test',
    status: 'Clean',
  });
  writeFileSync(join(dir, 'untracked'), 'data');
  expect((await readWorkspace(dir)).status).toBe('1 untracked');
  git('add', 'untracked');
  expect((await readWorkspace(dir)).status).toBe('1 staged');
  const worktree = join(directory(), 'linked');
  git('worktree', 'add', '-b', 'linked-test', worktree);
  const nested = join(worktree, 'nested');
  mkdirSync(nested);
  expect((await readWorkspace(nested)).branch).toBe('linked-test');
  git('-C', worktree, 'checkout', '--detach');
  expect((await readWorkspace(worktree)).branch).toMatch(
    /^Detached [a-f0-9]{7}$/,
  );
});

it('debounces bursts, serializes reads, ignores late results on dispose and has no periodic timer', async () => {
  vi.useFakeTimers();
  const read = vi.fn(async (cwd: string) => ({ cwd, status: 'Clean' }));
  const update = vi.fn();
  const reader = new WorkspaceReader('cwd', update, read);
  reader.refresh();
  reader.refresh();
  reader.refresh();
  await vi.advanceTimersByTimeAsync(149);
  expect(read).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({ cwd: 'cwd', status: 'Clean' });
  await vi.advanceTimersByTimeAsync(10000);
  expect(read).toHaveBeenCalledTimes(1);
  reader.refresh();
  reader.dispose();
  await vi.advanceTimersByTimeAsync(1000);
  expect(read).toHaveBeenCalledTimes(1);
  let finish!: (result: { cwd: string; status: string }) => void;
  const pending = new WorkspaceReader(
    'later',
    update,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  pending.refresh();
  await vi.advanceTimersByTimeAsync(150);
  pending.dispose();
  finish({ cwd: 'later', status: 'Clean' });
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(1);
});

it('retains the HEAD branch when git is unavailable and aborts reads on disposal', async () => {
  const dir = directory();
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/no-git\n');
  vi.stubEnv('PATH', '');
  try {
    expect(await readWorkspace(dir)).toEqual({
      cwd: dir,
      branch: 'no-git',
      status: 'Git status unavailable',
    });
  } finally {
    vi.unstubAllEnvs();
  }
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const reader = new WorkspaceReader(dir, vi.fn(), async (cwd, abort) => {
    signal = abort;
    return { cwd, status: 'Clean' };
  });
  reader.refresh();
  await vi.advanceTimersByTimeAsync(150);
  expect(signal?.aborted).toBe(false);
  reader.dispose();
  expect(signal?.aborted).toBe(true);
});
