import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  finalizeHarnessInstall,
  recordHarnessInstallCompletion,
} from './install-completion';
import {
  getInstallLedgerPath,
  readInstallLedger,
  recordCompletedInstall,
} from './install-ledger';
import type { ThothMemSetupResult } from './thoth-mem-install';

function providerResult(
  harness: 'opencode' | 'codex' | 'claude',
  overrides: Partial<ThothMemSetupResult> = {},
): ThothMemSetupResult {
  return {
    success: true,
    evidenceValid: true,
    status: 'complete',
    changed: true,
    harness,
    target: `C:/provider/${harness}`,
    steps: [{ name: 'Provider setup', outcome: 'complete' }],
    diagnostics: ['provider diagnostic'],
    manualActions: [],
    receipt: 'C:/provider/receipt.json',
    command: 'npx',
    args: ['-y', 'thoth-mem@latest', 'setup', harness],
    exitCode: 0,
    ...overrides,
  };
}

describe('finalizeHarnessInstall', () => {
  let configRoot: string;

  beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), 'thoth-install-completion-'));
  });

  afterEach(() => {
    rmSync(configRoot, { recursive: true, force: true });
  });

  test('runs provider setup before recording the completed harness', () => {
    const effects: string[] = [];
    const runProvider = vi.fn((options) => {
      effects.push(`provider:${options.harness}`);
      return providerResult(options.harness);
    });
    const recordInstall = vi.fn((options) => {
      effects.push(`ledger:${options.harness}:${options.version}`);
      return recordCompletedInstall(options);
    });

    const result = finalizeHarnessInstall({
      harness: 'opencode',
      version: '0.4.8',
      dryRun: false,
      cwd: 'C:/project',
      runThothMemSetup: runProvider,
      recordCompletedInstall: recordInstall,
      ledgerOptions: { configRoot },
    });

    expect(result.success).toBe(true);
    expect(result.ledger).toMatchObject({ status: 'recorded' });
    expect(result.provider).toMatchObject({
      diagnostics: ['provider diagnostic'],
      receipt: 'C:/provider/receipt.json',
    });
    expect(effects).toEqual(['provider:opencode', 'ledger:opencode:0.4.8']);
    expect(readInstallLedger({ configRoot })).toMatchObject({
      status: 'valid',
      ledger: { harnesses: { opencode: { version: '0.4.8' } } },
    });
  });

  test('dry-run plans provider and ledger finalization without writing state', () => {
    const runProvider = vi.fn(() => providerResult('codex'));
    const recordInstall = vi.fn(recordCompletedInstall);

    const result = finalizeHarnessInstall({
      harness: 'codex',
      version: '0.4.8',
      dryRun: true,
      cwd: 'C:/project',
      runThothMemSetup: runProvider,
      recordCompletedInstall: recordInstall,
      ledgerOptions: { configRoot },
    });

    expect(result).toMatchObject({
      success: true,
      ledger: { status: 'planned' },
    });
    expect(runProvider).toHaveBeenCalledWith({
      harness: 'codex',
      dryRun: true,
      cwd: 'C:/project',
    });
    expect(recordInstall).not.toHaveBeenCalled();
    expect(existsSync(getInstallLedgerPath({ configRoot }))).toBe(false);
  });

  test('records a local harness install without invoking provider setup', () => {
    const recordInstall = vi.fn(recordCompletedInstall);

    const result = recordHarnessInstallCompletion({
      harness: 'pi',
      version: '0.6.0',
      dryRun: false,
      recordCompletedInstall: recordInstall,
      ledgerOptions: { configRoot },
    });

    expect(result).toMatchObject({
      success: true,
      ledger: { status: 'recorded' },
    });
    expect(recordInstall).toHaveBeenCalledOnce();
    expect(readInstallLedger({ configRoot })).toMatchObject({
      status: 'valid',
      ledger: { harnesses: { pi: { version: '0.6.0' } } },
    });
  });

  test.each([
    {
      name: 'partial evidence',
      result: { success: false, status: 'partial' as const, exitCode: 2 },
    },
    {
      name: 'contradictory complete evidence',
      result: { success: true, evidenceValid: false, exitCode: 1 },
    },
    {
      name: 'contradictory success status',
      result: { success: true, status: 'partial' as const, exitCode: 2 },
    },
    {
      name: 'wrong harness evidence',
      result: { success: true, harness: 'codex' as const },
    },
  ])('does not record $name', ({ result: overrides }) => {
    const recordInstall = vi.fn(recordCompletedInstall);

    const result = finalizeHarnessInstall({
      harness: 'claude',
      version: '0.4.8',
      dryRun: false,
      cwd: 'C:/project',
      runThothMemSetup: () => providerResult('claude', overrides),
      recordCompletedInstall: recordInstall,
      ledgerOptions: { configRoot },
    });

    expect(result).toMatchObject({
      success: false,
      ledger: { status: 'not-attempted' },
    });
    expect(recordInstall).not.toHaveBeenCalled();
    expect(existsSync(getInstallLedgerPath({ configRoot }))).toBe(false);
  });

  test('reports ledger failure and retains the prior official version', () => {
    expect(
      recordCompletedInstall({
        harness: 'codex',
        version: '0.4.7',
        configRoot,
      }).success,
    ).toBe(true);
    const ledgerPath = getInstallLedgerPath({ configRoot });
    const before = readFileSync(ledgerPath, 'utf8');
    const failingRecord = vi.fn(() => ({
      success: false as const,
      path: ledgerPath,
      error: 'injected ledger failure',
    }));

    const result = finalizeHarnessInstall({
      harness: 'codex',
      version: '0.4.8',
      dryRun: false,
      cwd: 'C:/project',
      runThothMemSetup: () => providerResult('codex'),
      recordCompletedInstall: failingRecord,
      ledgerOptions: { configRoot },
    });

    expect(result).toMatchObject({
      success: false,
      ledger: { status: 'failed', error: 'injected ledger failure' },
    });
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before);
  });
});
