import { spawnSync } from 'node:child_process';
import {
  getNpxCommand,
  type NpxCommand,
  type NpxCommandOptions,
} from './npx-command';
import type { InstallAgent } from './types';

export const THOTH_MEM_SETUP_TIMEOUT_MS = 120_000;

export type ThothMemSetupStatus =
  | 'complete'
  | 'failed'
  | 'partial'
  | 'requires_user_action';

export type ThothMemSetupOutcome =
  | 'planned'
  | 'skipped'
  | 'confirmed'
  | 'failed'
  | 'unavailable';

export interface ThothMemSetupStep {
  name: string;
  outcome: ThothMemSetupOutcome;
}

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
  target?: string;
  steps: ThothMemSetupStep[];
  diagnostics: string[];
  manualActions: string[];
  receipt: string | null;
  command: string;
  args: string[];
  exitCode: number | null;
  error?: string;
}

interface ProviderSetupResult {
  status: ThothMemSetupStatus;
  changed: boolean;
  harness: InstallAgent;
  scope: 'global';
  target: string;
  steps: ThothMemSetupStep[];
  diagnostics: string[];
  manual_actions: string[];
  receipt: string | null;
}

const STATUS_EXIT_CODE: Record<ThothMemSetupStatus, number> = {
  complete: 0,
  failed: 1,
  partial: 2,
  requires_user_action: 3,
};

const SETUP_STATUSES = new Set<ThothMemSetupStatus>(
  Object.keys(STATUS_EXIT_CODE) as ThothMemSetupStatus[],
);

const STEP_OUTCOMES = new Set<ThothMemSetupOutcome>([
  'planned',
  'skipped',
  'confirmed',
  'failed',
  'unavailable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isSetupStep(value: unknown): value is ThothMemSetupStep {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.outcome === 'string' &&
    STEP_OUTCOMES.has(value.outcome as ThothMemSetupOutcome)
  );
}

function isProviderSetupResult(
  value: unknown,
  expectedHarness: InstallAgent,
): value is ProviderSetupResult {
  return (
    isRecord(value) &&
    typeof value.status === 'string' &&
    SETUP_STATUSES.has(value.status as ThothMemSetupStatus) &&
    typeof value.changed === 'boolean' &&
    value.harness === expectedHarness &&
    value.scope === 'global' &&
    typeof value.target === 'string' &&
    value.target.length > 0 &&
    Array.isArray(value.steps) &&
    value.steps.every(isSetupStep) &&
    isStringArray(value.diagnostics) &&
    isStringArray(value.manual_actions) &&
    (value.receipt === null || typeof value.receipt === 'string')
  );
}

function parseProviderSetupResult(
  stdout: string,
  expectedHarness: InstallAgent,
): ProviderSetupResult | undefined {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    return undefined;
  }

  return isProviderSetupResult(value, expectedHarness) ? value : undefined;
}

function defaultCommandExecutor(
  command: string,
  args: readonly string[],
  options: { cwd?: string; timeoutMs: number },
): ThothMemCommandResult {
  const result = spawnSync(command, [...args], {
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
    steps: [],
    diagnostics: [],
    manualActions: [],
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
  return getNpxCommand(
    [
      '-y',
      'thoth-mem@latest',
      'setup',
      harness,
      '--scope',
      'global',
      ...(dryRun ? ['--plan'] : []),
      '--json',
    ],
    options,
  );
}

export function runThothMemSetup(
  options: ThothMemSetupOptions,
): ThothMemSetupResult {
  const { command, args } = getThothMemSetupCommand(
    options.harness,
    options.dryRun ?? false,
  );
  const executor = options.commandExecutor ?? defaultCommandExecutor;

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
        ? `thoth-mem returned invalid JSON evidence: ${stderr.slice(0, 2_000)}`
        : 'thoth-mem returned invalid JSON evidence.',
    );
  }

  const expectedExitCode = STATUS_EXIT_CODE[provider.status];
  const evidenceValid = commandResult.exitCode === expectedExitCode;
  return {
    success: evidenceValid && provider.status === 'complete',
    evidenceValid,
    status: provider.status,
    changed: provider.changed,
    harness: provider.harness,
    target: provider.target,
    steps: provider.steps,
    diagnostics: provider.diagnostics,
    manualActions: provider.manual_actions,
    receipt: provider.receipt,
    command,
    args,
    exitCode: commandResult.exitCode,
    ...(!evidenceValid
      ? {
          error: `thoth-mem exit code ${String(commandResult.exitCode)} contradicts reported status ${provider.status} (expected ${expectedExitCode}).`,
        }
      : {}),
  };
}
