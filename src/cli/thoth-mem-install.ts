import { spawnSync } from 'node:child_process';
import type { NpxCommand, NpxCommandOptions } from './npx-command';
import type { InstallAgent } from './types';

export const THOTH_MEM_PACKAGE_SPEC = 'thoth-mem@>=0.7.0';

export const THOTH_MEM_SETUP_TIMEOUT_MS = 120_000;

export type ThothMemSetupStatus =
  | 'planned'
  | 'complete'
  | 'unsupported'
  | 'requires-user-action';

export interface ThothMemCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: unknown;
}

export type ThothMemCommandExecutor = (
  command: string,
  args: readonly string[],
  options: { cwd?: string; timeoutMs: number },
) => ThothMemCommandResult;

export interface ThothMemSetupOptions {
  harness: InstallAgent;
  dryRun?: boolean;
  cwd?: string;
  commandExecutor?: ThothMemCommandExecutor;
}

export interface ThothMemSetupResult {
  success: boolean;
  evidenceValid: boolean;
  status: ThothMemSetupStatus | 'invalid';
  changed: boolean;
  harness: InstallAgent;
  actions: string[];
  warnings: string[];
  restartRequired?: boolean;
  diagnostics: string[];
  receipt: string | null;
  command: string;
  args: string[];
  exitCode: number | null;
  error?: string;
}

// Wire types mirror thoth-mem 0.7.0's required per-host fields, including
// informational evidence. Unknown future fields remain tolerated.
interface ProviderSetupCore {
  status: ThothMemSetupStatus;
  changed: boolean;
  actions: string[];
  warnings: string[];
  receiptPath: string | null;
  recovered: boolean;
}

interface OpenCodeSetupResult extends ProviderSetupCore {
  status: 'planned' | 'complete';
  plugin: string;
  opencodeVersion: string;
  configPath: string;
  skillPath: string;
  providerConfigPath: string;
}

interface PiSetupResult extends ProviderSetupCore {
  host: 'pi';
  status: 'planned' | 'complete';
  source: string;
  version: string;
  piVersion: string;
  verification: { package: boolean; source: boolean; manifest: boolean };
}

interface NativeManagerSetupResult extends ProviderSetupCore {
  host: 'codex' | 'claude';
  strategy: 'plugin_manager' | 'unsupported';
  source: string;
  version: string;
  diagnostics: string[];
  restartRequired: boolean;
  verification: {
    marketplace: boolean;
    plugin: boolean;
    enabled: boolean;
    modelUse?: false;
  };
}

type ProviderSetupResult =
  | OpenCodeSetupResult
  | PiSetupResult
  | NativeManagerSetupResult;

type ProviderSetupEvidence = Pick<
  ProviderSetupResult,
  'status' | 'changed' | 'actions' | 'warnings' | 'receiptPath'
> &
  Partial<Pick<NativeManagerSetupResult, 'diagnostics' | 'restartRequired'>>;

const STATUS_EXIT_CODE: Record<ThothMemSetupStatus, number> = {
  planned: 0,
  complete: 0,
  unsupported: 1,
  'requires-user-action': 1,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isProviderSetupResult(
  value: unknown,
  expectedHarness: InstallAgent,
): value is ProviderSetupEvidence {
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    !Object.hasOwn(STATUS_EXIT_CODE, value.status) ||
    typeof value.changed !== 'boolean' ||
    typeof value.recovered !== 'boolean' ||
    (value.host !== undefined && value.host !== expectedHarness) ||
    !isStringArray(value.actions) ||
    !isStringArray(value.warnings) ||
    !(value.receiptPath === null || typeof value.receiptPath === 'string') ||
    (value.diagnostics !== undefined && !isStringArray(value.diagnostics)) ||
    (value.restartRequired !== undefined &&
      typeof value.restartRequired !== 'boolean')
  ) {
    return false;
  }

  if (expectedHarness === 'opencode') {
    return (
      typeof value.plugin === 'string' &&
      typeof value.opencodeVersion === 'string' &&
      typeof value.configPath === 'string' &&
      typeof value.skillPath === 'string' &&
      typeof value.providerConfigPath === 'string'
    );
  }

  if (
    value.host !== expectedHarness ||
    typeof value.source !== 'string' ||
    typeof value.version !== 'string' ||
    !isRecord(value.verification)
  ) {
    return false;
  }

  const verification = value.verification;
  if (expectedHarness === 'pi') {
    return (
      typeof value.piVersion === 'string' &&
      typeof verification.package === 'boolean' &&
      typeof verification.source === 'boolean' &&
      typeof verification.manifest === 'boolean'
    );
  }

  return (
    (value.strategy === 'plugin_manager' || value.strategy === 'unsupported') &&
    isStringArray(value.diagnostics) &&
    typeof value.restartRequired === 'boolean' &&
    typeof verification.marketplace === 'boolean' &&
    typeof verification.plugin === 'boolean' &&
    typeof verification.enabled === 'boolean' &&
    (verification.modelUse === undefined || verification.modelUse === false)
  );
}

function parseProviderSetupResult(
  stdout: string,
  expectedHarness: InstallAgent,
): ProviderSetupEvidence | undefined {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    return undefined;
  }

  return isProviderSetupResult(value, expectedHarness) ? value : undefined;
}

export function executeThothMemCommand(
  command: string,
  args: readonly string[],
  options: { cwd?: string; timeoutMs: number },
): ThothMemCommandResult {
  const result = spawnSync(command, [...args], {
    windowsHide: true,
    windowsVerbatimArguments: process.platform === 'win32',
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs,
  });

  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ETIMEDOUT';
}

function invalidResult(
  harness: InstallAgent,
  command: string,
  args: string[],
  exitCode: number | null,
  error: string,
): ThothMemSetupResult {
  return {
    success: false,
    evidenceValid: false,
    status: 'invalid',
    changed: false,
    harness,
    actions: [],
    warnings: [],
    diagnostics: [],
    receipt: null,
    command,
    args,
    exitCode,
    error,
  };
}

export function getThothMemSetupCommand(
  harness: InstallAgent,
  dryRun: boolean,
  options: NpxCommandOptions = {},
): NpxCommand {
  const args = [
    '-y',
    THOTH_MEM_PACKAGE_SPEC,
    'setup',
    harness,
    ...(dryRun ? ['--plan'] : []),
    '--json',
  ];
  if ((options.platform ?? process.platform) !== 'win32') {
    return { command: 'npx', args };
  }
  return {
    command: options.commandShell ?? process.env.ComSpec ?? 'cmd.exe',
    // Node must not escape this cmd command line: quoted > is a literal,
    // not redirection, and npx must receive the selector without quote characters.
    args: [
      `/d /s /c "npx ${args.map((arg) => (arg === THOTH_MEM_PACKAGE_SPEC ? `"${arg}"` : arg)).join(' ')}"`,
    ],
  };
}

export function runThothMemSetup(
  options: ThothMemSetupOptions,
): ThothMemSetupResult {
  const { command, args } = getThothMemSetupCommand(
    options.harness,
    options.dryRun ?? false,
  );
  const executor = options.commandExecutor ?? executeThothMemCommand;

  let commandResult: ThothMemCommandResult;
  try {
    commandResult = executor(command, args, {
      cwd: options.cwd,
      timeoutMs: THOTH_MEM_SETUP_TIMEOUT_MS,
    });
  } catch (error) {
    return invalidResult(
      options.harness,
      command,
      args,
      null,
      `Unable to launch thoth-mem setup: ${describeError(error)}`,
    );
  }

  if (commandResult.error) {
    const stderr = commandResult.stderr.trim().slice(0, 2_000);
    return invalidResult(
      options.harness,
      command,
      args,
      commandResult.exitCode,
      isTimeoutError(commandResult.error)
        ? `thoth-mem setup timed out after ${THOTH_MEM_SETUP_TIMEOUT_MS} ms${stderr ? `: ${stderr}` : '.'}`
        : `Unable to launch thoth-mem setup: ${describeError(commandResult.error)}`,
    );
  }

  const provider = parseProviderSetupResult(
    commandResult.stdout,
    options.harness,
  );
  if (!provider) {
    const stderr = commandResult.stderr.trim();
    return invalidResult(
      options.harness,
      command,
      args,
      commandResult.exitCode,
      stderr
        ? `thoth-mem setup failed or returned invalid JSON evidence: ${stderr.slice(0, 2_000)}`
        : 'thoth-mem returned invalid JSON evidence.',
    );
  }

  const expectedExitCode = STATUS_EXIT_CODE[provider.status];
  const expectedStatus = options.dryRun ? 'planned' : 'complete';
  const exitConsistent = commandResult.exitCode === expectedExitCode;
  const modeConsistent =
    expectedExitCode !== 0 || provider.status === expectedStatus;
  const evidenceValid = exitConsistent && modeConsistent;
  return {
    success: evidenceValid && provider.status === expectedStatus,
    evidenceValid,
    status: provider.status,
    changed: provider.changed,
    harness: options.harness,
    actions: provider.actions,
    warnings: provider.warnings,
    diagnostics: provider.diagnostics ?? [],
    restartRequired: provider.restartRequired,
    receipt: provider.receiptPath,
    command,
    args,
    exitCode: commandResult.exitCode,
    ...(!evidenceValid
      ? {
          error: !exitConsistent
            ? `thoth-mem exit code ${String(commandResult.exitCode)} contradicts reported status ${provider.status} (expected ${expectedExitCode}).`
            : `thoth-mem reported ${provider.status}; expected ${expectedStatus} for this setup mode.`,
        }
      : {}),
  };
}
