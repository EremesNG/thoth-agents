import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isValidPackageVersion } from './package-version';

export const INSTALL_LEDGER_SCHEMA_VERSION = 1 as const;
export type InstallHarnessId = 'opencode' | 'codex' | 'claude' | 'pi';

export interface InstallLedger {
  schemaVersion: typeof INSTALL_LEDGER_SCHEMA_VERSION;
  harnesses: Partial<Record<InstallHarnessId, { version: string }>>;
}

export interface InstallLedgerOptions {
  configRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
  renameFile?: (source: string, destination: string) => void;
}

export type InstallLedgerReadResult =
  | { status: 'missing'; path: string }
  | { status: 'valid'; path: string; ledger: InstallLedger }
  | { status: 'invalid'; path: string; error: string };

export type RecordCompletedInstallResult =
  | {
      success: true;
      path: string;
      ledger: InstallLedger;
      repairedInvalidState: boolean;
      backupPath?: string;
    }
  | { success: false; path: string; error: string };

export interface RecordCompletedInstallOptions extends InstallLedgerOptions {
  harness: InstallHarnessId;
  version: string;
}

const INSTALL_HARNESSES = new Set<InstallHarnessId>([
  'opencode',
  'codex',
  'claude',
  'pi',
]);

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}

function parseInstallLedger(
  serialized: string,
):
  | { success: true; ledger: InstallLedger }
  | { success: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    return { success: false, error: `Malformed install ledger JSON: ${error}` };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { success: false, error: 'Install ledger must be a JSON object.' };
  }
  const root = parsed as Record<string, unknown>;
  if (
    !hasOnlyKeys(root, ['schemaVersion', 'harnesses']) ||
    root.schemaVersion !== INSTALL_LEDGER_SCHEMA_VERSION ||
    !root.harnesses ||
    typeof root.harnesses !== 'object' ||
    Array.isArray(root.harnesses)
  ) {
    return { success: false, error: 'Install ledger schema is unsupported.' };
  }

  const harnesses = root.harnesses as Record<string, unknown>;
  for (const [harness, value] of Object.entries(harnesses)) {
    if (
      !INSTALL_HARNESSES.has(harness as InstallHarnessId) ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !hasOnlyKeys(value as Record<string, unknown>, ['version']) ||
      !isValidPackageVersion((value as Record<string, unknown>).version)
    ) {
      return {
        success: false,
        error: `Install ledger record for ${harness} is invalid.`,
      };
    }
  }

  return { success: true, ledger: parsed as InstallLedger };
}

export function getInstallLedgerPath(
  options: InstallLedgerOptions = {},
): string {
  const env = options.env ?? process.env;
  const configuredRoot = env.XDG_CONFIG_HOME?.trim();
  const homeDir = options.homeDir ?? env.HOME ?? env.USERPROFILE ?? homedir();
  const configRoot =
    options.configRoot ?? (configuredRoot || join(homeDir, '.config'));
  return join(configRoot, 'thoth-agents', 'install-state.json');
}

export function readInstallLedger(
  options: InstallLedgerOptions = {},
): InstallLedgerReadResult {
  const path = getInstallLedgerPath(options);
  if (!existsSync(path)) return { status: 'missing', path };

  let serialized: string;
  try {
    serialized = readFileSync(path, 'utf8');
  } catch (error) {
    return {
      status: 'invalid',
      path,
      error: `Could not read install ledger: ${error}`,
    };
  }

  const parsed = parseInstallLedger(serialized);
  return parsed.success
    ? { status: 'valid', path, ledger: parsed.ledger }
    : { status: 'invalid', path, error: parsed.error };
}

export function recordCompletedInstall(
  options: RecordCompletedInstallOptions,
): RecordCompletedInstallResult {
  const { harness, version } = options;
  const path = getInstallLedgerPath(options);
  if (!INSTALL_HARNESSES.has(harness) || !isValidPackageVersion(version)) {
    return {
      success: false,
      path,
      error: 'A supported harness and valid package version are required.',
    };
  }

  const current = readInstallLedger(options);
  const ledger: InstallLedger = {
    schemaVersion: INSTALL_LEDGER_SCHEMA_VERSION,
    harnesses:
      current.status === 'valid' ? { ...current.ledger.harnesses } : {},
  };
  ledger.harnesses[harness] = { version };

  const temporaryPath = `${path}.tmp`;
  const repairedInvalidState = current.status === 'invalid';
  const backupPath = repairedInvalidState ? `${path}.bak` : undefined;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`);
    if (backupPath) copyFileSync(path, backupPath);
    (options.renameFile ?? renameSync)(temporaryPath, path);
    return {
      success: true,
      path,
      ledger,
      repairedInvalidState,
      ...(backupPath ? { backupPath } : {}),
    };
  } catch (error) {
    try {
      rmSync(temporaryPath, { recursive: true, force: true });
    } catch {
      // Preserve the original failure; a leftover sibling temp is non-authoritative.
    }
    return {
      success: false,
      path,
      error: `Could not record completed install: ${error}`,
    };
  }
}
