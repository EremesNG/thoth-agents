import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getInstallLedgerPath,
  readInstallLedger,
  recordCompletedInstall,
} from './install-ledger';

describe('install ledger', () => {
  let configRoot: string;

  beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), 'thoth-install-ledger-'));
  });

  afterEach(() => {
    rmSync(configRoot, { recursive: true, force: true });
  });

  test('distinguishes missing, valid, and invalid state without repairing reads', () => {
    const options = { configRoot };
    const ledgerPath = getInstallLedgerPath(options);

    expect(readInstallLedger(options)).toEqual({
      status: 'missing',
      path: ledgerPath,
    });

    mkdirSync(join(ledgerPath, '..'), { recursive: true });
    writeFileSync(
      ledgerPath,
      JSON.stringify({
        schemaVersion: 1,
        harnesses: { opencode: { version: '0.4.8' } },
      }),
    );
    expect(readInstallLedger(options)).toMatchObject({
      status: 'valid',
      ledger: {
        schemaVersion: 1,
        harnesses: { opencode: { version: '0.4.8' } },
      },
    });

    writeFileSync(ledgerPath, '{ malformed');
    expect(readInstallLedger(options)).toMatchObject({
      status: 'invalid',
      path: ledgerPath,
      error: expect.any(String),
    });
    expect(existsSync(`${ledgerPath}.bak`)).toBe(false);
  });

  test.each([
    { schemaVersion: 2, harnesses: {} },
    { schemaVersion: 1, harnesses: { unknown: { version: '0.4.8' } } },
    { schemaVersion: 1, harnesses: { opencode: { version: 'latest' } } },
    {
      schemaVersion: 1,
      harnesses: {
        codex: { version: '0.4.8', marketplaceVersion: '9.9.9' },
      },
    },
  ])('rejects unsupported or non-minimal schema: %#', (value) => {
    const ledgerPath = getInstallLedgerPath({ configRoot });
    mkdirSync(join(ledgerPath, '..'), { recursive: true });
    writeFileSync(ledgerPath, JSON.stringify(value));

    expect(readInstallLedger({ configRoot }).status).toBe('invalid');
  });

  test('records independent harness versions with sibling-temp atomic replacement', () => {
    const renames: [string, string][] = [];
    const options = {
      configRoot,
      renameFile: (source: string, destination: string) => {
        renames.push([source, destination]);
        renameSync(source, destination);
      },
    };

    expect(
      recordCompletedInstall({
        harness: 'opencode',
        version: '0.4.8',
        ...options,
      }).success,
    ).toBe(true);
    expect(
      recordCompletedInstall({
        harness: 'codex',
        version: '0.4.8-beta.1',
        ...options,
      }).success,
    ).toBe(true);
    expect(
      recordCompletedInstall({
        harness: 'claude',
        version: '0.5.0',
        ...options,
      }).success,
    ).toBe(true);

    const ledgerPath = getInstallLedgerPath(options);
    expect(JSON.parse(readFileSync(ledgerPath, 'utf8'))).toEqual({
      schemaVersion: 1,
      harnesses: {
        opencode: { version: '0.4.8' },
        codex: { version: '0.4.8-beta.1' },
        claude: { version: '0.5.0' },
      },
    });
    expect(renames).toHaveLength(3);
    expect(renames.at(-1)).toEqual([`${ledgerPath}.tmp`, ledgerPath]);
    expect(existsSync(`${ledgerPath}.tmp`)).toBe(false);
  });

  test('updates only the completed harness record', () => {
    for (const [harness, version] of [
      ['opencode', '0.4.8'],
      ['codex', '0.4.7'],
    ] as const) {
      expect(
        recordCompletedInstall({ harness, version, configRoot }).success,
      ).toBe(true);
    }

    expect(
      recordCompletedInstall({
        harness: 'opencode',
        version: '0.5.0',
        configRoot,
      }).success,
    ).toBe(true);

    expect(readInstallLedger({ configRoot })).toMatchObject({
      status: 'valid',
      ledger: {
        harnesses: {
          opencode: { version: '0.5.0' },
          codex: { version: '0.4.7' },
        },
      },
    });
  });

  test('backs up invalid state only when a successful record repairs it', () => {
    const ledgerPath = getInstallLedgerPath({ configRoot });
    mkdirSync(join(ledgerPath, '..'), { recursive: true });
    const malformed = '{ malformed';
    writeFileSync(ledgerPath, malformed);

    expect(readInstallLedger({ configRoot }).status).toBe('invalid');
    expect(existsSync(`${ledgerPath}.bak`)).toBe(false);

    const result = recordCompletedInstall({
      harness: 'claude',
      version: '0.4.8',
      configRoot,
    });

    expect(result).toMatchObject({
      success: true,
      repairedInvalidState: true,
      backupPath: `${ledgerPath}.bak`,
    });
    expect(readFileSync(`${ledgerPath}.bak`, 'utf8')).toBe(malformed);
    expect(JSON.parse(readFileSync(ledgerPath, 'utf8'))).toEqual({
      schemaVersion: 1,
      harnesses: { claude: { version: '0.4.8' } },
    });
  });

  test('retains the prior authoritative record when replacement fails', () => {
    expect(
      recordCompletedInstall({
        harness: 'codex',
        version: '0.4.7',
        configRoot,
      }).success,
    ).toBe(true);
    const ledgerPath = getInstallLedgerPath({ configRoot });
    const before = readFileSync(ledgerPath, 'utf8');
    mkdirSync(`${ledgerPath}.tmp`);

    const result = recordCompletedInstall({
      harness: 'codex',
      version: '0.4.8',
      configRoot,
    });

    expect(result).toMatchObject({ success: false, error: expect.any(String) });
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before);
    expect(readInstallLedger({ configRoot })).toMatchObject({
      status: 'valid',
      ledger: { harnesses: { codex: { version: '0.4.7' } } },
    });
  });

  test('rejects invalid versions without creating state', () => {
    const renameFile = vi.fn();

    const result = recordCompletedInstall({
      harness: 'opencode',
      version: 'latest',
      configRoot,
      renameFile,
    });

    expect(result).toMatchObject({ success: false });
    expect(renameFile).not.toHaveBeenCalled();
    expect(existsSync(getInstallLedgerPath({ configRoot }))).toBe(false);
  });
});
