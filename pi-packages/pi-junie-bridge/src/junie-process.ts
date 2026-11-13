import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import {
  JobLauncherUnavailable,
  type JobLaunchOptions,
  type LaunchedJob,
  launchInJob,
} from '@thoth-agents/pi-core/windows-job';

export interface JunieCommand {
  file: string;
  args: string[];
}
export interface LauncherOptions {
  /** Explicit setting wins over JUNIE_BRIDGE_LAUNCHER. */
  launcherPath?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}
const isFile = (file: string) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};
export function resolveJunieLauncher(
  options: LauncherOptions = {},
): JunieCommand {
  const env = options.env ?? process.env,
    home = options.home ?? homedir();
  const windows = (options.platform ?? process.platform) === 'win32';
  const override = options.launcherPath ?? env.JUNIE_BRIDGE_LAUNCHER;
  if (override) {
    if (!isFile(override))
      throw new Error(
        `Junie launcher not found: ${override}. Please install Junie or set JUNIE_BRIDGE_LAUNCHER.`,
      );
    return { file: resolve(override), args: [] };
  }
  const data =
    env.JUNIE_DATA_DIR ?? env.JUNIE_DATA ?? join(home, '.local/share/junie');
  const name = windows ? 'junie.exe' : 'junie';
  const candidates = [
    join(data, 'current/junie', name),
    join(data, 'current/bin', name),
  ];
  try {
    const version =
      env.JUNIE_VERSION ?? readFileSync(join(data, 'current'), 'utf8').trim();
    if (/^[\w.-]+$/.test(version))
      candidates.unshift(join(data, 'versions', version, 'junie', name));
  } catch {
    /* current may be a directory/symlink instead of the Windows pointer file */
  }
  candidates.push(join(home, '.local/bin', windows ? 'junie.bat' : 'junie'));
  const path =
    Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ??
    '';
  for (const directory of path
    .split(windows ? ';' : delimiter)
    .filter(Boolean)) {
    for (const binary of windows
      ? ['junie.exe', 'junie.bat', 'junie.cmd']
      : ['junie'])
      candidates.push(join(directory.replace(/^"|"$/g, ''), binary));
  }
  const file = candidates.find(isFile);
  if (!file)
    throw new Error(
      'Junie launcher not found. Please install Junie and run `junie` to log in, or set JUNIE_BRIDGE_LAUNCHER.',
    );
  return { file, args: [] };
}

/** Use a fixed encoded PowerShell command rather than interpolating a batch path
 * into cmd.exe /c. The core launcher applies CRT quoting, not cmd quoting. */
export function windowsCommand(
  command: JunieCommand,
  env: NodeJS.ProcessEnv,
): JunieCommand {
  if (!/\.(bat|cmd)$/i.test(command.file)) return command;
  if (/[\r\n%!^"&|<>]/.test(command.file) || command.args.length)
    throw new Error(
      'Unsafe Junie batch launcher path; configure the real junie.exe with JUNIE_BRIDGE_LAUNCHER.',
    );
  const literal = command.file.replace(/'/g, "''");
  const script = `& '${literal}' --acp true --skip-update-check; exit $LASTEXITCODE`;
  return {
    file: join(
      env.SystemRoot ?? 'C:\\Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    ),
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
  };
}
export interface JunieProcess {
  pid: number | undefined;
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  jobBacked: boolean;
  exited: Promise<{ code: number | null }>;
  stderrTail(): string;
  terminate(): Promise<void>;
}
export interface JunieLaunchOptions extends LauncherOptions {
  cwd?: string;
  command?: JunieCommand;
  warn?: (message: string) => void;
  launchJob?: (options: JobLaunchOptions) => Promise<LaunchedJob>;
}
export async function launchJunie(
  options: JunieLaunchOptions = {},
): Promise<JunieProcess> {
  const cwd = options.cwd ?? process.cwd(),
    env = {
      ...process.env,
      ...options.env,
      EJ_RUNNER_PWD: cwd,
      JUNIE_SKIP_UPDATE_CHECK: '1',
    };
  const platform = options.platform ?? process.platform;
  let command = options.command ?? resolveJunieLauncher(options);
  command =
    platform === 'win32' && /\.(bat|cmd)$/i.test(command.file)
      ? windowsCommand(command, env)
      : {
          file: command.file,
          args: [...command.args, '--acp', 'true', '--skip-update-check'],
        };
  let job: LaunchedJob | undefined;
  if (platform === 'win32') {
    try {
      job = await (options.launchJob ?? launchInJob)({ ...command, cwd, env });
    } catch (error) {
      if (!(error instanceof JobLauncherUnavailable)) throw error;
      (options.warn ?? console.warn)(
        `Junie Windows job launcher unavailable; leader-only fallback (descendants are not contained): ${error.message}`,
      );
    }
  }
  let result: Omit<JunieProcess, 'stderrTail'>;
  let termination: Promise<void> | undefined;
  if (job) {
    const owned = job;
    result = {
      ...owned,
      jobBacked: true,
      terminate: () =>
        (termination ??= (async () => {
          await owned.terminate(3000);
          await owned.release();
        })()),
    };
  } else {
    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd,
      env,
      shell: false,
      windowsHide: true,
    };
    const child = spawn(command.file, command.args, {
      ...spawnOptions,
      stdio: 'pipe',
    });
    const exited = new Promise<{ code: number | null }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code }));
    });
    void exited.catch(() => {});
    // Await spawn so missing/invalid overrides fail during startup, not as unhandled events.
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    result = {
      pid: child.pid,
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      jobBacked: false,
      exited,
      terminate: () =>
        (termination ??= (async () => {
          if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGKILL');
          await exited;
        })()),
    };
  }
  let tail = '';
  result.stderr.setEncoding('utf8');
  result.stderr.on('data', (chunk) => {
    tail = (tail + chunk).slice(-16384);
  });
  return { ...result, stderrTail: () => tail };
}
