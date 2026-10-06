import { getShellConfig, SettingsManager } from '@earendil-works/pi-coding-agent';
import { resolvePowerShellConfig } from './powershell.js';

export type ShellKind = 'bash' | 'powershell' | 'none';
export interface ResolvedShell {
  kind: ShellKind;
  executable: string;
  args: string[];
  label: string;
  edition?: string;
  version?: string;
}
export interface ShellDetection { available: ResolvedShell[]; unavailable: Partial<Record<ShellKind, string>> }

function discoverShell(kind: Exclude<ShellKind, 'none'>, cwd: string): ResolvedShell {
  if (kind === 'powershell') {
    const config = resolvePowerShellConfig();
    return { kind, ...config, label: `PowerShell ${config.edition} ${config.version} (${config.executable})` };
  }
  const setting = SettingsManager.create(cwd).getShellPath();
  // A Pi setting always wins; retain the historical override on POSIX only.
  const override = process.platform === 'win32' ? undefined : process.env.PI_BETTER_BACKGROUND_TASKS_SHELL;
  const config = getShellConfig(setting || override);
  const path = config.shell.replaceAll('\\', '/');
  if (!/(?:^|\/)bash(?:\.exe)?$/i.test(path) || /\/(?:system32|sysnative)\/bash\.exe$/i.test(path) || config.commandTransport === 'stdin') {
    throw new Error(`Pi resolved ${config.shell}, which is not a supported local bash (sh and WSL are unsupported)`);
  }
  return { kind, executable: config.shell, args: [...config.args], label: `bash (${config.shell})` };
}

export function detectShells(cwd = process.cwd()): ShellDetection {
  const detection: ShellDetection = { available: [], unavailable: {} };
  for (const kind of ['bash', 'powershell'] as const) {
    try { detection.available.push(discoverShell(kind, cwd)); }
    catch (error) { detection.unavailable[kind] = error instanceof Error ? error.message : String(error); }
  }
  detection.available.push({ kind: 'none', executable: '', args: [], label: 'none (direct argv)' });
  return detection;
}

export class ShellUnavailableError extends Error {
  constructor(readonly kind: ShellKind, readonly detection: ShellDetection) {
    super(`Requested shell "${kind}" is unavailable: ${detection.unavailable[kind]}. Available shells: ${detection.available.map(shell => shell.label).join('; ')}. `
      + 'Install bash / configure Pi shellPath and use shell:"bash" with bash syntax, or use shell:"powershell" with PowerShell syntax (Windows PowerShell 5.1 lacks &&/||). Use shell:"none" with argv for direct execution. No shell fallback is performed.');
    this.name = 'ShellUnavailableError';
  }
}

/** Revalidate at launch rather than reusing registration-time detection. */
export function resolveShell(kind: ShellKind = 'bash', cwd = process.cwd()): ResolvedShell {
  if (kind === 'none') return { kind, executable: '', args: [], label: 'none (direct argv)' };
  try { return discoverShell(kind, cwd); }
  catch { throw new ShellUnavailableError(kind, detectShells(cwd)); }
}
