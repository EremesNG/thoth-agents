import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  classifyPiPackageOwnership,
  getPiPackageReceiptPath,
  type PiPackageReceipt,
  readPiPackageReceipt,
  writePiPackageReceipt,
} from './pi-package-receipt';

const roots: string[] = [];
const digest = 'a'.repeat(64);
const receipt: PiPackageReceipt = {
  schemaVersion: 1,
  owner: 'thoth-agents',
  scope: 'user',
  packageName: 'thoth-agents',
  source: 'npm:thoth-agents@0.3.12',
  installSource: 'npm:thoth-agents@0.3.12',
  version: '0.3.12',
  manifestSha256: digest,
  extensionSha256: digest,
};
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function root() {
  const configRoot = mkdtempSync(join(tmpdir(), 'thoth-pi-receipt-'));
  roots.push(configRoot);
  return configRoot;
}

describe('Pi package receipt', () => {
  test('round trips the strict receipt through an atomic sibling rename', () => {
    const configRoot = root();
    const result = writePiPackageReceipt(receipt, { configRoot });
    expect(result.success).toBe(true);
    expect(readPiPackageReceipt({ configRoot })).toEqual({
      status: 'valid',
      path: getPiPackageReceiptPath({ configRoot }),
      receipt,
    });
  });
  test('rejects malformed receipts and additional keys', () => {
    const configRoot = root();
    const path = getPiPackageReceiptPath({ configRoot });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...receipt, extra: true }));
    expect(readPiPackageReceipt({ configRoot }).status).toBe('invalid');
    expect(readFileSync(path, 'utf8')).toContain('extra');
  });
  test('accepts a Pi-canonical local source only with an absolute command-safe install source', () => {
    const configRoot = root();
    const local = {
      ...receipt,
      source: '..\\unpacked\\package',
      installSource: join(configRoot, 'unpacked', 'package'),
    };
    expect(writePiPackageReceipt(local, { configRoot }).success).toBe(true);
    expect(readPiPackageReceipt({ configRoot })).toMatchObject({
      status: 'valid',
      receipt: local,
    });
    expect(
      writePiPackageReceipt(
        { ...local, installSource: '..\\unpacked\\package' },
        { configRoot: root() },
      ).success,
    ).toBe(false);
  });
  test('distinguishes missing, unowned, owned missing/current, and conflicts', () => {
    expect(
      classifyPiPackageOwnership({
        receipt: { status: 'missing', path: 'x' },
        globalPackages: [],
        projectPackages: [],
      }).state,
    ).toBe('missing');
    expect(
      classifyPiPackageOwnership({
        receipt: { status: 'missing', path: 'x' },
        globalPackages: [{ source: receipt.source }],
        projectPackages: [],
      }).state,
    ).toBe('configured-unowned');
    expect(
      classifyPiPackageOwnership({
        receipt: { status: 'valid', path: 'x', receipt },
        globalPackages: [],
        projectPackages: [],
      }).state,
    ).toBe('owned-missing');
    expect(
      classifyPiPackageOwnership({
        receipt: { status: 'valid', path: 'x', receipt },
        globalPackages: [{ source: receipt.source }],
        projectPackages: [],
      }).state,
    ).toBe('owned-current');
    expect(
      classifyPiPackageOwnership({
        receipt: { status: 'valid', path: 'x', receipt },
        globalPackages: [{ source: receipt.source }],
        projectPackages: [{ source: 'npm:thoth-agents@9.0.0' }],
      }).state,
    ).toBe('conflicting');
    const localReceipt = {
      ...receipt,
      source: '..\\unpacked\\package',
      installSource: 'C:\\candidate\\package',
    };
    expect(
      classifyPiPackageOwnership({
        receipt: { status: 'valid', path: 'x', receipt: localReceipt },
        globalPackages: [
          {
            source: localReceipt.source,
            installedPath: localReceipt.installSource,
          },
        ],
        projectPackages: [],
      }).state,
    ).toBe('owned-current');
    expect(
      classifyPiPackageOwnership({
        receipt: { status: 'valid', path: 'x', receipt: localReceipt },
        globalPackages: [
          { source: localReceipt.source, installedPath: 'C:\\other\\package' },
        ],
        projectPackages: [],
      }).state,
    ).toBe('conflicting');
  });
});
