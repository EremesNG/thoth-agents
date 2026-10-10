import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** HEAD is local to a linked worktree; do not read the common repository's HEAD. */
async function branchFromHead(cwd: string): Promise<string | undefined> {
  let directory = resolve(cwd);
  while (true) {
    const marker = join(directory, '.git');
    try {
      const info = await stat(marker);
      let gitDir = marker;
      if (!info.isDirectory()) {
        const link = (await readFile(marker, 'utf8')).trim();
        if (!link.startsWith('gitdir: ')) return undefined;
        gitDir = resolve(directory, link.slice(8));
      }
      const head = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
      if (head.startsWith('ref: refs/heads/')) return head.slice(16);
      return /^[a-f\d]{40,64}$/i.test(head)
        ? `Detached ${head.slice(0, 7)}`
        : undefined;
    } catch {
      /* Walk toward the repository root. */
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}
export interface WorkspaceGit {
  state: 'clean' | 'modified' | 'conflicts';
  /** Tracked paths changed versus HEAD, staged or not. */
  files: number;
  /** Text-line totals; absent when the numstat read failed. */
  added?: number;
  removed?: number;
  untracked: number;
  binary: number;
  conflicts: number;
}
export interface WorkspaceSnapshot {
  cwd: string;
  branch?: string;
  git?: WorkspaceGit;
  /** Why `git` is absent: loading, not a repository, or unavailable. */
  note?: string;
}
const GIT_TIMEOUT_MS = 2000;
export type GitRunner = (
  args: readonly string[],
  cwd: string,
  signal?: AbortSignal,
  input?: string,
) => Promise<string>;

/** Every git command is bounded: a stalled repository must not stall the sidebar. */
export function createGitRunner(timeout = GIT_TIMEOUT_MS): GitRunner {
  return async (args, cwd, signal, input) => {
    const pending = exec('git', [...args], {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      signal,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    if (input !== undefined) pending.child.stdin?.end(input);
    return (await pending).stdout;
  };
}
const runGit = createGitRunner();

interface PorcelainStatus {
  unborn: boolean;
  files: number;
  untracked: number;
  conflicts: number;
  /** Paths whose line totals are not file content. */
  excluded: Set<string>;
}
/** `--porcelain=v2 -z`: NUL-terminated records; renames carry a second path. */
function parseStatus(output: string): PorcelainStatus {
  const result: PorcelainStatus = {
    unborn: false,
    files: 0,
    untracked: 0,
    conflicts: 0,
    excluded: new Set(),
  };
  const records = output.split('\0');
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.startsWith('# branch.oid (initial)')) result.unborn = true;
    const fields = record.split(' ');
    if (record.startsWith('1 ')) {
      result.files++;
      if (fields[2]?.startsWith('S'))
        result.excluded.add(fields.slice(8).join(' '));
    } else if (record.startsWith('2 ')) {
      result.files++;
      if (fields[2]?.startsWith('S'))
        result.excluded.add(fields.slice(9).join(' '));
      index++; // original path of the rename
    } else if (record.startsWith('u ')) {
      result.conflicts++;
      result.excluded.add(fields.slice(10).join(' '));
    } else if (record.startsWith('? ')) result.untracked++;
  }
  return result;
}
/** `--numstat -z`: `A\tD\tpath\0`, or `A\tD\t\0old\0new\0` for renames. */
function parseNumstat(output: string, excluded: ReadonlySet<string>) {
  const totals = { added: 0, removed: 0, binary: 0 };
  const records = output.split('\0');
  for (let index = 0; index < records.length; index++) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(records[index]);
    if (!match) continue;
    let path = match[3];
    if (!path) {
      path = records[index + 2] ?? '';
      index += 2;
    }
    if (excluded.has(path)) continue;
    if (match[1] === '-' || match[2] === '-') totals.binary++;
    else {
      totals.added += Number(match[1]);
      totals.removed += Number(match[2]);
    }
  }
  return totals;
}
const STATUS_ARGS = [
  'status',
  '--porcelain=v2',
  '-z',
  '--branch',
  '--untracked-files=all',
];
export async function readWorkspace(
  cwd: string,
  signal?: AbortSignal,
  run: GitRunner = runGit,
): Promise<WorkspaceSnapshot> {
  const branch = await branchFromHead(cwd);
  try {
    const status = parseStatus(await run(STATUS_ARGS, cwd, signal));
    let totals: ReturnType<typeof parseNumstat> | undefined;
    if (status.files > 0)
      try {
        const base = status.unborn
          ? (
              await run(
                ['hash-object', '-t', 'tree', '--stdin'],
                cwd,
                signal,
                '',
              )
            ).trim()
          : 'HEAD';
        totals = parseNumstat(
          await run(
            [
              'diff',
              '--numstat',
              '-z',
              '--find-renames',
              '--no-ext-diff',
              '--no-textconv',
              base,
              '--',
            ],
            cwd,
            signal,
          ),
          status.excluded,
        );
      } catch {
        // Counts without line totals beat hiding a readable status.
        if (signal?.aborted) throw new Error('aborted');
      }
    return {
      cwd,
      ...(branch ? { branch } : {}),
      git: {
        state: status.conflicts
          ? 'conflicts'
          : status.files || status.untracked
            ? 'modified'
            : 'clean',
        files: status.files,
        ...(totals ? { added: totals.added, removed: totals.removed } : {}),
        untracked: status.untracked,
        binary: totals?.binary ?? 0,
        conflicts: status.conflicts,
      },
    };
  } catch {
    return {
      cwd,
      ...(branch ? { branch } : {}),
      note: branch ? 'Git status unavailable' : 'Not a git repository',
    };
  }
}

/** Event-driven: coalesce bursts and never overlap git processes or poll. */
export class WorkspaceReader {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private pending = false;
  private disposed = false;
  private readonly abort = new AbortController();
  constructor(
    private readonly cwd: string,
    private readonly update: (snapshot: WorkspaceSnapshot) => void,
    private readonly read = readWorkspace,
  ) {}
  refresh(): void {
    if (this.disposed) return;
    this.pending = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, 250);
  }
  private async flush(): Promise<void> {
    if (this.disposed || this.running || !this.pending) return;
    this.running = true;
    this.pending = false;
    try {
      const snapshot = await this.read(this.cwd, this.abort.signal);
      if (!this.disposed) this.update(snapshot);
    } catch {
      if (!this.disposed)
        this.update({ cwd: this.cwd, note: 'Git status unavailable' });
    } finally {
      this.running = false;
      if (this.pending && !this.timer && !this.disposed) this.refresh();
    }
  }
  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.pending = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
