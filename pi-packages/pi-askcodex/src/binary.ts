import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AskCodexConfig } from './config.js';

export type DesktopStatus = true | false | 'unknown';
export type DesktopExec = (
  file: string,
  args: string[],
  options: {
    timeout: number;
    shell: false;
    windowsHide: true;
    maxBuffer: number;
  },
) => Promise<{ stdout: string }>;
export interface DesktopProbeOptions {
  platform?: NodeJS.Platform;
  exec?: DesktopExec;
}

const execDesktopProbe: DesktopExec = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: 'utf8' }, (error, stdout) =>
      error ? reject(error) : resolve({ stdout }),
    );
  });

/** Best-effort app-process signal, not a Computer Use capability check.
 * Store Codex runs as ChatGPT.exe; the regular ChatGPT app is a different package.
 * Keep legacy non-Store app paths, but never count CLI/helper binaries in bin/.
 */
export async function isCodexDesktopRunning(
  options: DesktopProbeOptions = {},
): Promise<DesktopStatus> {
  if ((options.platform ?? process.platform) !== 'win32') return 'unknown';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Desktop probe timed out')),
        2000,
      );
    });
    const probe = (options.exec ?? execDesktopProbe)(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$ErrorActionPreference='Stop'; $paths = @(Get-Process | Where-Object { $_.ProcessName -in @('ChatGPT', 'Codex') } | ForEach-Object { [string]$_.Path }); ConvertTo-Json -InputObject $paths -Compress",
      ],
      {
        timeout: 2000,
        shell: false,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    const { stdout } = await Promise.race([probe, deadline]);
    const paths: unknown = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    if (
      !Array.isArray(paths) ||
      !paths.every((item) => typeof item === 'string')
    )
      return 'unknown';
    if (
      paths.some(
        (file) =>
          /\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$/i.test(
            file,
          ) ||
          (/\\OpenAI\\Codex\\/i.test(file) &&
            !/\\bin\\/i.test(file) &&
            /\\(?:codex|chatgpt)\.exe$/i.test(file)),
      )
    )
      return true;
    return paths.some((file) => !file.trim()) ? 'unknown' : false;
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

export interface BinaryFileSystem {
  statSync(path: string): { isFile(): boolean; mtimeMs: number };
  readdirSync(path: string): string[];
}
export interface ResolveCodexBinaryOptions {
  config?: Pick<AskCodexConfig, 'bin'>;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fs?: BinaryFileSystem;
  homeDir?: string;
  localAppData?: string;
  /** Resolve the exact requested filename, never via a shell. */
  pathLookup?: (name: string) => string | undefined;
}
export interface ResolvedCodexBinary {
  path: string;
  source: 'config' | 'env' | 'desktop' | 'path';
  warnings: string[];
}

export function resolveCodexBinary(
  options: ResolveCodexBinaryOptions = {},
): ResolvedCodexBinary {
  const env = options.env ?? process.env;
  const io = options.fs ?? fs;
  const platform = options.platform ?? process.platform;
  const shimError = () =>
    new Error(
      'AskCodex: .cmd/.bat shims are not spawnable with shell:false. Set ASKCODEX_BIN to a native codex.exe executable.',
    );
  const explicit = env.ASKCODEX_BIN?.trim() || options.config?.bin?.trim();
  if (explicit) {
    if (platform === 'win32' && /\.(cmd|bat)$/i.test(explicit))
      throw shimError();
    try {
      if (!io.statSync(explicit).isFile()) throw new Error('not a file');
    } catch {
      throw new Error(
        `AskCodex: configured binary does not exist or is not a file: ${explicit}. Set ASKCODEX_BIN to the Codex executable.`,
      );
    }
    return {
      path: explicit,
      source: env.ASKCODEX_BIN?.trim() ? 'env' : 'config',
      warnings: [],
    };
  }
  if (platform === 'win32') {
    const local =
      options.localAppData ??
      env.LOCALAPPDATA ??
      path.win32.join(options.homeDir ?? os.homedir(), 'AppData', 'Local');
    const root = path.win32.join(local, 'OpenAI', 'Codex', 'bin');
    let newest: { path: string; mtime: number } | undefined;
    try {
      for (const entry of io.readdirSync(root).sort()) {
        const candidate = path.win32.join(root, entry, 'codex.exe');
        try {
          const stat = io.statSync(candidate);
          if (stat.isFile() && (!newest || stat.mtimeMs > newest.mtime))
            newest = { path: candidate, mtime: stat.mtimeMs };
        } catch {
          /* An update may have removed or not yet written this executable. */
        }
      }
    } catch {
      /* Desktop is not installed, or its bundle directory is inaccessible. */
    }
    if (newest) return { path: newest.path, source: 'desktop', warnings: [] };
  }
  // No stable Desktop-bundled location is currently known on macOS/Linux.
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const lookup =
    options.pathLookup ??
    ((name: string) => {
      const pathValue =
        Object.entries(env).find(([key]) =>
          platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH',
        )?.[1] ?? '';
      for (const dir of pathValue.split(paths.delimiter)) {
        if (!dir.trim()) continue;
        const candidate = paths.join(dir.replace(/^"|"$/g, ''), name);
        try {
          if (io.statSync(candidate).isFile()) return candidate;
        } catch {
          /* Try the next PATH entry. */
        }
      }
      return undefined;
    });
  const fromPath = lookup(platform === 'win32' ? 'codex.exe' : 'codex');
  if (platform === 'win32' && fromPath && /\.(cmd|bat)$/i.test(fromPath))
    throw shimError();
  if (fromPath)
    return {
      path: fromPath,
      source: 'path',
      warnings: [
        'AskCodex: using Codex from PATH rather than the Desktop bundle; native Computer Use and read-only shell may not work. Prefer the Desktop-bundled executable via ASKCODEX_BIN.',
      ],
    };
  if (platform === 'win32' && (lookup('codex.cmd') || lookup('codex.bat')))
    throw shimError();
  throw new Error(
    'AskCodex: Codex executable not found. Install Codex Desktop or set ASKCODEX_BIN to the native executable.',
  );
}
