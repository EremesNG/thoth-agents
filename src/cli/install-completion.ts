import {
  getInstallLedgerPath,
  type InstallHarnessId,
  type InstallLedgerOptions,
  type RecordCompletedInstallResult,
  recordCompletedInstall,
} from './install-ledger';
import {
  runThothMemSetup,
  type ThothMemSetupOptions,
  type ThothMemSetupResult,
} from './thoth-mem-install';

export type InstallCompletionLedgerResult =
  | { status: 'planned'; path: string }
  | { status: 'not-attempted'; path: string }
  | {
      status: 'recorded';
      path: string;
      repairedInvalidState: boolean;
      backupPath?: string;
    }
  | { status: 'failed'; path: string; error: string };

export interface HarnessInstallCompletionResult {
  success: boolean;
  provider: ThothMemSetupResult;
  ledger: InstallCompletionLedgerResult;
  error?: string;
}

export interface FinalizeHarnessInstallOptions {
  harness: InstallHarnessId;
  version: string;
  dryRun?: boolean;
  cwd: string;
  runThothMemSetup?: (options: ThothMemSetupOptions) => ThothMemSetupResult;
  recordCompletedInstall?: (
    options: Parameters<typeof recordCompletedInstall>[0],
  ) => RecordCompletedInstallResult;
  ledgerOptions?: InstallLedgerOptions;
}

function isConsistentProviderSuccess(
  result: ThothMemSetupResult,
  harness: InstallHarnessId,
): boolean {
  return (
    result.success &&
    result.evidenceValid &&
    result.status === 'complete' &&
    result.exitCode === 0 &&
    result.harness === harness
  );
}

export function finalizeHarnessInstall(
  options: FinalizeHarnessInstallOptions,
): HarnessInstallCompletionResult {
  const ledgerPath = getInstallLedgerPath(options.ledgerOptions);
  const setup = options.runThothMemSetup ?? runThothMemSetup;
  const provider = setup({
    harness: options.harness,
    dryRun: options.dryRun,
    cwd: options.cwd,
  });

  if (!isConsistentProviderSuccess(provider, options.harness)) {
    return {
      success: false,
      provider,
      ledger: { status: 'not-attempted', path: ledgerPath },
      error:
        provider.error ??
        'thoth-mem setup did not return consistent complete evidence.',
    };
  }

  if (options.dryRun) {
    return {
      success: true,
      provider,
      ledger: { status: 'planned', path: ledgerPath },
    };
  }

  const record = options.recordCompletedInstall ?? recordCompletedInstall;
  const ledger = record({
    ...options.ledgerOptions,
    harness: options.harness,
    version: options.version,
  });
  if (!ledger.success) {
    return {
      success: false,
      provider,
      ledger: {
        status: 'failed',
        path: ledger.path,
        error: ledger.error,
      },
      error: ledger.error,
    };
  }

  return {
    success: true,
    provider,
    ledger: {
      status: 'recorded',
      path: ledger.path,
      repairedInvalidState: ledger.repairedInvalidState,
      ...(ledger.backupPath ? { backupPath: ledger.backupPath } : {}),
    },
  };
}
