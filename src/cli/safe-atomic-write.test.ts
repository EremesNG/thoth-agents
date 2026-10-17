import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { safeAtomicWriteFileSync } from './safe-atomic-write';

vi.mock('node:crypto', () => ({ randomUUID: () => 'test-nonce' }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'safe-atomic-'));
  roots.push(root);
  const target = join(root, 'target');
  return {
    root,
    target,
    staging: `${target}.tmp-test-nonce`,
    unrelated: join(root, 'unrelated'),
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test.each([
  'symlink',
  'dangling',
  'regular',
] as const)('exclusive creation fails closed on a %s collision without deleting it', (kind) => {
  const { target, staging, unrelated } = fixture();
  writeFileSync(target, 'original');
  if (kind === 'regular') writeFileSync(staging, 'operator staging');
  else {
    if (kind === 'symlink') writeFileSync(unrelated, 'operator content');
    symlinkSync(unrelated, staging, 'file');
  }
  expect(() => safeAtomicWriteFileSync(target, 'replacement')).toThrow();
  expect(readFileSync(target, 'utf8')).toBe('original');
  if (kind === 'regular')
    expect(readFileSync(staging, 'utf8')).toBe('operator staging');
  else {
    expect(lstatSync(staging).isSymbolicLink()).toBe(true);
    if (kind === 'symlink')
      expect(readFileSync(unrelated, 'utf8')).toBe('operator content');
    else expect(existsSync(unrelated)).toBe(false);
  }
});

test('a failed rename cleans up only the newly created temporary file', () => {
  const { root, target } = fixture();
  writeFileSync(target, 'original');
  vi.mocked(renameSync).mockImplementationOnce(() => {
    throw new Error('rename denied');
  });
  expect(() => safeAtomicWriteFileSync(target, 'replacement')).toThrow(
    'rename denied',
  );
  expect(readFileSync(target, 'utf8')).toBe('original');
  expect(readdirSync(root)).toEqual(['target']);
});

test('replaces bytes atomically and preserves the existing mode', () => {
  const { root, target } = fixture();
  writeFileSync(target, 'original');
  chmodSync(target, 0o600);
  const mode = lstatSync(target).mode & 0o777;
  safeAtomicWriteFileSync(target, Buffer.from('replacement'));
  expect(readFileSync(target, 'utf8')).toBe('replacement');
  expect(lstatSync(target).mode & 0o777).toBe(mode);
  expect(readdirSync(root)).toEqual(['target']);
});
