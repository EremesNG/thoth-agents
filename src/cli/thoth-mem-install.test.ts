import { describe, expect, test } from 'vitest';
import {
  getThothMemSetupCommand,
  runThothMemSetup,
  THOTH_MEM_SETUP_TIMEOUT_MS,
  type ThothMemCommandExecutor,
  type ThothMemSetupStatus,
} from './thoth-mem-install';

function providerJson(
  status: ThothMemSetupStatus,
  harness: 'opencode' | 'codex' | 'claude' = 'opencode',
): string {
  return JSON.stringify({
    status,
    changed: status === 'complete',
    harness,
    scope: 'global',
    target: `C:/provider/${harness}`,
    steps: [
      {
        name: 'Verify provider-owned setup',
        outcome: status === 'complete' ? 'confirmed' : 'unavailable',
      },
    ],
    diagnostics: [`provider status: ${status}`],
    manual_actions:
      status === 'complete' ? [] : [`resolve provider status: ${status}`],
    receipt: status === 'complete' ? `C:/receipts/${harness}-setup.json` : null,
  });
}

function executorReturning(
  exitCode: number | null,
  stdout: string,
  stderr = '',
): ThothMemCommandExecutor {
  return () => ({ exitCode, stdout, stderr });
}

describe('thoth-mem setup adapter', () => {
  test.each([
    ['opencode', 'opencode'],
    ['codex', 'codex'],
    ['claude', 'claude'],
  ] as const)('builds the official global setup command for %s', (harness, providerHarness) => {
    expect(
      getThothMemSetupCommand(harness, false, { platform: 'linux' }),
    ).toEqual({
      command: 'npx',
      args: [
        '-y',
        'thoth-mem@latest',
        'setup',
        providerHarness,
        '--scope',
        'global',
        '--json',
      ],
    });
  });

  test('adds plan only for dry-run and never infers force from consumer setup', () => {
    const planned = getThothMemSetupCommand('codex', true, {
      platform: 'linux',
    });
    const applied = getThothMemSetupCommand('codex', false, {
      platform: 'linux',
    });

    expect(planned.args).toEqual([
      '-y',
      'thoth-mem@latest',
      'setup',
      'codex',
      '--scope',
      'global',
      '--plan',
      '--json',
    ]);
    expect(applied.args).not.toContain('--plan');
    expect(planned.args).not.toContain('--force');
    expect(applied.args).not.toContain('--force');
  });

  test('routes the complete provider command through cmd.exe on Windows', () => {
    const commandShell = 'C:\\Windows\\System32\\cmd.exe';

    expect(
      getThothMemSetupCommand('codex', false, {
        platform: 'win32',
        commandShell,
      }),
    ).toEqual({
      command: commandShell,
      args: [
        '/d',
        '/s',
        '/c',
        'npx -y thoth-mem@latest setup codex --scope global --json',
      ],
    });
  });

  test('accepts only consistent complete provider evidence', () => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(0, providerJson('complete')),
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        evidenceValid: true,
        status: 'complete',
        changed: true,
        harness: 'opencode',
        target: 'C:/provider/opencode',
        diagnostics: ['provider status: complete'],
        manualActions: [],
        receipt: 'C:/receipts/opencode-setup.json',
        exitCode: 0,
      }),
    );
  });

  test.each([
    ['failed', 1],
    ['partial', 2],
    ['requires_user_action', 3],
  ] as const)('preserves %s evidence without claiming success', (status, exitCode) => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(exitCode, providerJson(status)),
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(true);
    expect(result.status).toBe(status);
    expect(result.exitCode).toBe(exitCode);
    expect(result.diagnostics).toContain(`provider status: ${status}`);
    expect(result.manualActions).toContain(
      `resolve provider status: ${status}`,
    );
  });

  test('rejects a status and exit-code contradiction', () => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(0, providerJson('partial')),
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(false);
    expect(result.status).toBe('partial');
    expect(result.error).toMatch(/exit code 0.*partial/i);
  });

  test.each([
    ['not-json', 'not json'],
    [
      'incomplete-json',
      JSON.stringify({ status: 'complete', harness: 'opencode' }),
    ],
    ['wrong-harness', providerJson('complete', 'codex')],
  ])('rejects %s provider output', (_caseName, stdout) => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(0, stdout),
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.error).toBeTruthy();
  });

  test('reports launch failures without fabricating provider evidence', () => {
    const result = runThothMemSetup({
      harness: 'claude',
      commandExecutor: () => {
        throw new Error('npx unavailable');
      },
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.changed).toBe(false);
    expect(result.error).toContain('npx unavailable');
    expect(result.receipt).toBeNull();
  });

  test('bounds provider setup execution and reports timeout without fabricated evidence', () => {
    let observedTimeout: number | undefined;
    const timeoutError = Object.assign(new Error('spawnSync npx ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });

    const result = runThothMemSetup({
      harness: 'codex',
      commandExecutor: (_command, _args, options) => {
        observedTimeout = options.timeoutMs;
        return {
          exitCode: null,
          stdout: '',
          stderr: 'provider process exceeded its execution budget',
          error: timeoutError,
        };
      },
    });

    expect(THOTH_MEM_SETUP_TIMEOUT_MS).toBe(120_000);
    expect(observedTimeout).toBe(THOTH_MEM_SETUP_TIMEOUT_MS);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        evidenceValid: false,
        status: 'invalid',
        changed: false,
        exitCode: null,
        receipt: null,
      }),
    );
    expect(result.error).toMatch(/timed out/i);
    expect(result.error).toContain(String(THOTH_MEM_SETUP_TIMEOUT_MS));
    expect(result.error).toContain('exceeded its execution budget');
  });
});
