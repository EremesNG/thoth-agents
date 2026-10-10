import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGitRunner,
  readWorkspace,
  WorkspaceReader,
} from '../src/panels/workspace.js';

const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function directory() {
  const dir = mkdtempSync(join(tmpdir(), 'sidebar-git-'));
  directories.push(dir);
  return dir;
}
const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com'];
function repo(commit = true) {
  const dir = directory();
  const git = (...args: string[]) =>
    execFileSync('git', [...identity, ...args], { cwd: dir, stdio: 'pipe' });
  git('init', '-b', 'main');
  const write = (name: string, data: string | Buffer) =>
    writeFileSync(join(dir, name), data);
  if (commit) {
    write('a.txt', 'one\ntwo\nthree\n');
    write('b.txt', 'keep\n');
    git('add', '.');
    git('commit', '-m', 'init');
  }
  return { dir, git, write };
}
const lines = (...rows: string[]) => `${rows.join('\n')}\n`;

it('reports non-git directories and a clean repository', async () => {
  const plain = directory();
  expect(await readWorkspace(plain)).toEqual({
    cwd: plain,
    note: 'Not a git repository',
  });
  const { dir } = repo();
  expect(await readWorkspace(dir)).toEqual({
    cwd: dir,
    branch: 'main',
    git: {
      state: 'clean',
      files: 0,
      untracked: 0,
      binary: 0,
      conflicts: 0,
    },
  });
});

it('counts unstaged edits and untracked files', async () => {
  const { dir, write } = repo();
  write('a.txt', lines('one', 'TWO', 'three', 'four'));
  write('new file.txt', 'x');
  const { git } = await readWorkspace(dir);
  expect(git).toMatchObject({
    state: 'modified',
    files: 1,
    added: 2,
    removed: 1,
    untracked: 1,
    binary: 0,
  });
});

it('compares the working tree directly with HEAD, not staged plus unstaged', async () => {
  const { dir, git: run, write } = repo();
  write('a.txt', lines('one', 'two', 'three', 'x', 'y'));
  run('add', 'a.txt');
  write('a.txt', lines('one', 'two', 'three')); // unstaged revert to HEAD
  expect((await readWorkspace(dir)).git).toMatchObject({
    state: 'modified',
    files: 1,
    added: 0,
    removed: 0,
  });
  write('a.txt', lines('one', 'two', 'three', 'x'));
  write('b.txt', lines('keep', 'more'));
  run('add', 'b.txt');
  expect((await readWorkspace(dir)).git).toMatchObject({
    files: 2,
    added: 2,
    removed: 0,
  });
});

it('counts binary files separately and handles spaces and unicode names', async () => {
  const { dir, git: run, write } = repo(false);
  write('blob.bin', Buffer.from([0, 1, 2, 3, 0]));
  write('naïve file.txt', lines('a', 'b'));
  run('add', '.');
  run('commit', '-m', 'init');
  write('blob.bin', Buffer.from([0, 9, 9, 0, 0, 7]));
  write('naïve file.txt', lines('a', 'b', 'c'));
  expect((await readWorkspace(dir)).git).toMatchObject({
    files: 2,
    added: 1,
    removed: 0,
    binary: 1,
  });
});

it('counts a rename once, with its edited lines', async () => {
  const { dir, git: run, write } = repo();
  run('mv', 'a.txt', 'renamed name.txt');
  write('renamed name.txt', lines('one', 'two', 'three', 'four'));
  expect((await readWorkspace(dir)).git).toMatchObject({
    state: 'modified',
    files: 1,
    added: 1,
    removed: 0,
  });
});

it('reports conflicts apart from changed files', async () => {
  const { dir, git: run, write } = repo();
  run('checkout', '-b', 'topic');
  write('a.txt', lines('one', 'topic', 'three'));
  run('commit', '-am', 'topic');
  run('checkout', 'main');
  write('a.txt', lines('one', 'main', 'three'));
  run('commit', '-am', 'main');
  expect(() => run('merge', 'topic')).toThrow();
  write('b.txt', lines('keep', 'edited'));
  expect((await readWorkspace(dir)).git).toMatchObject({
    state: 'conflicts',
    conflicts: 1,
    files: 1,
    added: 1,
    removed: 0,
  });
});

it('diffs against the empty tree while HEAD is unborn', async () => {
  const { dir, git: run, write } = repo(false);
  write('a.txt', lines('one', 'two'));
  write('loose.txt', 'x');
  run('add', 'a.txt');
  const snapshot = await readWorkspace(dir);
  expect(snapshot.branch).toBe('main');
  expect(snapshot.git).toMatchObject({
    state: 'modified',
    files: 1,
    added: 2,
    removed: 0,
    untracked: 1,
  });
  unlinkSync(join(dir, 'a.txt'));
  expect((await readWorkspace(dir)).git).toMatchObject({ files: 1, added: 0 });
});

it('reads linked worktrees and detached HEAD', async () => {
  const { git: run } = repo();
  const worktree = join(directory(), 'linked');
  run('worktree', 'add', '-b', 'linked-test', worktree);
  const nested = join(worktree, 'nested');
  mkdirSync(nested);
  expect((await readWorkspace(nested)).branch).toBe('linked-test');
  run('-C', worktree, 'checkout', '--detach');
  expect((await readWorkspace(worktree)).branch).toMatch(
    /^Detached [a-f0-9]{7}$/,
  );
});

it('keeps counts when only the numstat read fails and falls back on status failure', async () => {
  const { dir, write } = repo();
  write('a.txt', lines('one', 'changed'));
  const real = createGitRunner();
  const snapshot = await readWorkspace(dir, undefined, (args, ...rest) =>
    args[0] === 'diff'
      ? Promise.reject(new Error('timed out'))
      : real(args, ...rest),
  );
  expect(snapshot.git).toMatchObject({ files: 1, state: 'modified' });
  expect(snapshot.git?.added).toBeUndefined();
  expect(
    await readWorkspace(dir, undefined, () =>
      Promise.reject(new Error('timed out')),
    ),
  ).toEqual({ cwd: dir, branch: 'main', note: 'Git status unavailable' });
});

it('bounds each git command with a timeout', async () => {
  const { dir } = repo();
  await expect(
    createGitRunner(1)(['status', '--porcelain=v2'], dir),
  ).rejects.toThrow();
  const outcome = await readWorkspace(dir, undefined, createGitRunner(1));
  expect(outcome.note).toBe('Git status unavailable');
});

it('retains the HEAD branch when git is unavailable', async () => {
  const dir = directory();
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/no-git\n');
  vi.stubEnv('PATH', '');
  expect(await readWorkspace(dir)).toEqual({
    cwd: dir,
    branch: 'no-git',
    note: 'Git status unavailable',
  });
});

it('debounces bursts, serializes reads, ignores late results on dispose and has no periodic timer', async () => {
  vi.useFakeTimers();
  const read = vi.fn(async (cwd: string) => ({ cwd }));
  const update = vi.fn();
  const reader = new WorkspaceReader('cwd', update, read);
  reader.refresh();
  reader.refresh();
  reader.refresh();
  await vi.advanceTimersByTimeAsync(249);
  expect(read).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({ cwd: 'cwd' });
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  reader.refresh();
  reader.dispose();
  await vi.advanceTimersByTimeAsync(1000);
  expect(read).toHaveBeenCalledTimes(1);
  let finish!: (result: { cwd: string }) => void;
  const pending = new WorkspaceReader(
    'later',
    update,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  pending.refresh();
  await vi.advanceTimersByTimeAsync(250);
  pending.dispose();
  finish({ cwd: 'later' });
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(1);
});

it('aborts reads on disposal and coalesces refreshes made during a read', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  let release!: () => void;
  const read = vi.fn(
    (cwd: string, abort?: AbortSignal) =>
      new Promise<{ cwd: string }>((resolve) => {
        signal = abort;
        release = () => resolve({ cwd });
      }),
  );
  const reader = new WorkspaceReader('dir', vi.fn(), read);
  reader.refresh();
  await vi.advanceTimersByTimeAsync(250);
  reader.refresh();
  reader.refresh();
  await vi.advanceTimersByTimeAsync(500);
  expect(read).toHaveBeenCalledTimes(1); // serialized
  release();
  await vi.advanceTimersByTimeAsync(250);
  expect(read).toHaveBeenCalledTimes(2);
  expect(signal?.aborted).toBe(false);
  reader.dispose();
  expect(signal?.aborted).toBe(true);
});
