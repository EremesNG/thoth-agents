import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

export interface WorkspaceSnapshot {
  cwd: string;
  branch?: string;
  status: string;
}
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
function statusText(porcelain: string): string {
  let staged = 0,
    changed = 0,
    untracked = 0,
    conflicts = 0;
  for (const line of porcelain.split('\n')) {
    if (!line || line.startsWith('##')) continue;
    const code = line.slice(0, 2);
    if (code === '??') untracked++;
    else if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(code))
      conflicts++;
    else {
      if (code[0] !== ' ') staged++;
      if (code[1] !== ' ') changed++;
    }
  }
  return (
    [
      conflicts && `${conflicts} conflicts`,
      staged && `${staged} staged`,
      changed && `${changed} changed`,
      untracked && `${untracked} untracked`,
    ]
      .filter(Boolean)
      .join(' · ') || 'Clean'
  );
}
export async function readWorkspace(
  cwd: string,
  signal?: AbortSignal,
): Promise<WorkspaceSnapshot> {
  const branch = await branchFromHead(cwd);
  try {
    const { stdout } = await exec('git', ['status', '--porcelain=v1', '-b'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      signal,
    });
    return { cwd, branch, status: statusText(stdout) };
  } catch {
    return {
      cwd,
      ...(branch ? { branch } : {}),
      status: branch ? 'Git status unavailable' : 'Not a git repository',
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
    }, 150);
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
        this.update({ cwd: this.cwd, status: 'Git status unavailable' });
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
