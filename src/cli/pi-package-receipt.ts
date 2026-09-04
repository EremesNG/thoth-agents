import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';

export const PI_PACKAGE_RECEIPT_SCHEMA_VERSION = 1 as const;
export interface PiPackageReceipt {
  schemaVersion: typeof PI_PACKAGE_RECEIPT_SCHEMA_VERSION;
  owner: 'thoth-agents';
  scope: 'user';
  packageName: 'thoth-agents';
  source: string;
  installSource: string;
  version: string;
  manifestSha256: string;
  extensionSha256: string;
}
export interface PiPackageReceiptOptions {
  configRoot?: string;
  homeDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
}
export type PiPackageReceiptReadResult =
  | { status: 'missing'; path: string }
  | { status: 'invalid'; path: string; error: string }
  | { status: 'valid'; path: string; receipt: PiPackageReceipt };
export type PiPackageOwnershipState =
  | 'missing'
  | 'configured-unowned'
  | 'owned-missing'
  | 'owned-current'
  | 'conflicting';

const keys = [
  'schemaVersion',
  'owner',
  'scope',
  'packageName',
  'source',
  'installSource',
  'version',
  'manifestSha256',
  'extensionSha256',
] as const;
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const digest = /^[0-9a-f]{64}$/;

export function piPackagePathsEqual(left: string, right: string): boolean {
  const normalizedLeft = normalize(resolve(left));
  const normalizedRight = normalize(resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function getPiPackageReceiptPath(
  options: PiPackageReceiptOptions = {},
): string {
  const env = options.env ?? process.env;
  const root =
    options.configRoot ??
    env.XDG_CONFIG_HOME?.trim() ??
    join(options.homeDir ?? homedir(), '.config');
  return join(root, 'thoth-agents', 'pi-package.json');
}

function parse(value: unknown): PiPackageReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Receipt must be a JSON object.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join('|') !== [...keys].sort().join('|'))
    throw new Error('Receipt contains missing or additional keys.');
  if (
    record.schemaVersion !== 1 ||
    record.owner !== 'thoth-agents' ||
    record.scope !== 'user' ||
    record.packageName !== 'thoth-agents'
  )
    throw new Error('Receipt identity is invalid.');
  if (typeof record.version !== 'string' || !semver.test(record.version))
    throw new Error('Receipt version is invalid.');
  const npmSource = `npm:thoth-agents@${record.version}`;
  const npmIdentity =
    record.source === npmSource && record.installSource === npmSource;
  const localIdentity =
    typeof record.source === 'string' &&
    record.source.length > 0 &&
    !isAbsolute(record.source) &&
    !/^[a-z][a-z+.-]*:/i.test(record.source) &&
    typeof record.installSource === 'string' &&
    isAbsolute(record.installSource);
  if (!npmIdentity && !localIdentity)
    throw new Error('Receipt source is not canonical.');
  if (
    typeof record.manifestSha256 !== 'string' ||
    !digest.test(record.manifestSha256) ||
    typeof record.extensionSha256 !== 'string' ||
    !digest.test(record.extensionSha256)
  )
    throw new Error('Receipt digests are invalid.');
  return record as unknown as PiPackageReceipt;
}

export function readPiPackageReceipt(
  options: PiPackageReceiptOptions = {},
): PiPackageReceiptReadResult {
  const path = getPiPackageReceiptPath(options);
  if (!existsSync(path)) return { status: 'missing', path };
  try {
    return {
      status: 'valid',
      path,
      receipt: parse(JSON.parse(readFileSync(path, 'utf8'))),
    };
  } catch (error) {
    return {
      status: 'invalid',
      path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function writePiPackageReceipt(
  receipt: PiPackageReceipt,
  options: PiPackageReceiptOptions = {},
):
  | { success: true; path: string }
  | { success: false; path: string; error: string } {
  const path = getPiPackageReceiptPath(options);
  try {
    const validated = parse(receipt);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${process.pid}`;
    writeFileSync(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
      flag: 'wx',
    });
    try {
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
    return { success: true, path };
  } catch (error) {
    return {
      success: false,
      path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function classifyPiPackageOwnership(input: {
  receipt: PiPackageReceiptReadResult;
  globalPackages: readonly {
    source: string;
    installedPath?: string;
    packageName?: string;
    packageVersion?: string;
  }[];
  projectPackages: readonly {
    source: string;
    installedPath?: string;
    packageName?: string;
    packageVersion?: string;
  }[];
}): { state: PiPackageOwnershipState; reason?: string } {
  if (
    input.receipt.status === 'invalid' ||
    input.projectPackages.length > 0 ||
    input.globalPackages.length > 1
  )
    return {
      state: 'conflicting',
      reason:
        input.receipt.status === 'invalid'
          ? input.receipt.error
          : 'Ambiguous or project-local first-party source.',
    };
  const configured = input.globalPackages[0];
  if (input.receipt.status === 'missing')
    return { state: configured ? 'configured-unowned' : 'missing' };
  if (!configured) return { state: 'owned-missing' };
  const configuredPath = configured.installedPath;
  const receipt = input.receipt.receipt;
  const identityMatches =
    (configured.packageName === undefined ||
      configured.packageName === receipt.packageName) &&
    (configured.packageVersion === undefined ||
      configured.packageVersion === receipt.version);
  const isNpm = receipt.source === receipt.installSource;
  const pathMatches =
    isNpm ||
    (configuredPath !== undefined &&
      piPackagePathsEqual(configuredPath, receipt.installSource));
  return configured.source === receipt.source && pathMatches && identityMatches
    ? { state: 'owned-current' }
    : {
        state: 'conflicting',
        reason:
          'Configured source, resolved package identity, or path differs from the ownership receipt.',
      };
}
