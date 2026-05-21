import { createHash } from 'node:crypto';
import path from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';

interface ProjectIdOptions {
  worktreeDirectory: string;
  projectName?: string;
  shell?: PluginInput['$'];
  timeoutMs?: number;
}

function sanitizeProjectName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return normalized.length > 0 ? normalized : 'project';
}

async function runGitCommand(
  shell: PluginInput['$'] | undefined,
  worktreeDirectory: string,
  args: string[],
  timeoutMs: number,
): Promise<string | null> {
  if (!shell) {
    return null;
  }

  const command = shell.nothrow().cwd(worktreeDirectory)`git ${args}`.quiet();

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      command,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);

    if (result === null || result.exitCode !== 0) {
      return null;
    }

    const firstLine = result.text().trim().split(/\r?\n/, 1)[0];
    return firstLine.length > 0 ? firstLine : null;
  } catch {
    return null;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function buildProjectId(projectName: string, hash: string): string {
  const normalizedProjectName = sanitizeProjectName(projectName);
  return `${normalizedProjectName}-${hash.slice(0, 12)}`;
}

function normalizeProjectIdOptions(
  input: string | ProjectIdOptions,
  timeoutMs: number,
  projectName?: string,
  shell?: PluginInput['$'],
): Required<Pick<ProjectIdOptions, 'worktreeDirectory' | 'projectName'>> & {
  shell?: PluginInput['$'];
  timeoutMs: number;
} {
  if (typeof input === 'string') {
    return {
      worktreeDirectory: input,
      projectName: projectName || path.basename(input) || 'project',
      shell,
      timeoutMs,
    };
  }

  return {
    worktreeDirectory: input.worktreeDirectory,
    projectName: input.projectName || path.basename(input.worktreeDirectory),
    shell: input.shell,
    timeoutMs: input.timeoutMs ?? timeoutMs,
  };
}

export async function getProjectId(
  directory: string,
  timeoutMs?: number,
  projectName?: string,
  shell?: PluginInput['$'],
): Promise<string | null>;
export async function getProjectId(
  options: ProjectIdOptions,
): Promise<string | null>;
export async function getProjectId(
  input: string | ProjectIdOptions,
  timeoutMs = 5_000,
  projectName?: string,
  shell?: PluginInput['$'],
): Promise<string | null> {
  const resolvedProjectName =
    typeof input === 'string' ? projectName : undefined;
  const resolvedShell = typeof input === 'string' ? shell : undefined;
  const options = normalizeProjectIdOptions(
    input,
    timeoutMs,
    resolvedProjectName,
    resolvedShell,
  );
  const normalizedDirectory = options.worktreeDirectory.trim();
  const normalizedProjectName = sanitizeProjectName(options.projectName);

  if (normalizedDirectory.length === 0) {
    return null;
  }

  const repoRoot = await runGitCommand(
    options.shell,
    normalizedDirectory,
    ['rev-parse', '--show-toplevel'],
    options.timeoutMs,
  );
  const rootCommit = await runGitCommand(
    options.shell,
    normalizedDirectory,
    ['rev-list', '--max-parents=0', 'HEAD'],
    options.timeoutMs,
  );

  if (repoRoot && rootCommit) {
    return buildProjectId(normalizedProjectName, rootCommit);
  }

  try {
    const resolvedDirectory = path.resolve(normalizedDirectory);
    const hash = createHash('sha256').update(resolvedDirectory).digest('hex');

    return buildProjectId(normalizedProjectName, hash);
  } catch {
    return null;
  }
}
