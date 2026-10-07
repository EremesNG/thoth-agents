import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { writePiManagedText } from './pi-managed-write';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const nativePlatform = process.platform;
let root: string;
let target: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'thoth-pi-managed-write-'));
  target = join(root, 'settings.json');
  writeFileSync(target, 'original');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: nativePlatform });
  vi.restoreAllMocks();
  vi.mocked(renameSync).mockReset();
  rmSync(root, { recursive: true, force: true });
});

function locked(code = 'EPERM') {
  return Object.assign(new Error('replacement denied'), { code });
}

test('replaces a managed file when a transient Windows lock is released', () => {
  vi.mocked(renameSync).mockImplementationOnce(() => {
    throw locked();
  });
  expect(writePiManagedText(target, 'replacement')).toBe(true);
  expect(readFileSync(target, 'utf8')).toBe('replacement');
  const backups = readdirSync(root).filter((name) => name.includes('.bak-'));
  expect(backups).toHaveLength(1);
  const backup = backups[0];
  if (!backup) throw new Error('Expected one preserved backup');
  expect(readFileSync(join(root, backup), 'utf8')).toBe('original');
  expect(readdirSync(root).some((name) => name.includes('.tmp-'))).toBe(false);
});

test.each([
  'EPERM',
  'EACCES',
  'EBUSY',
])('bounds persistent Windows %s failures without destroying the original', (code) => {
  const failure = locked(code);
  vi.mocked(renameSync).mockImplementation(() => {
    throw failure;
  });
  expect(() => writePiManagedText(target, 'replacement')).toThrow(
    'Close applications holding this file, check its permissions, and rerun setup',
  );
  expect(readFileSync(target, 'utf8')).toBe('original');
  expect(renameSync).toHaveBeenCalledTimes(11);
  expect(Atomics.wait).toHaveBeenCalledTimes(10);
  expect(readdirSync(root).some((name) => name.includes('.tmp-'))).toBe(false);
});

test('does not overwrite an edit made while waiting for the lock', () => {
  vi.mocked(renameSync).mockImplementationOnce(() => {
    writeFileSync(target, 'concurrent edit');
    throw locked();
  });
  expect(() => writePiManagedText(target, 'replacement')).toThrow(
    'Managed Pi target changed before replacement',
  );
  expect(readFileSync(target, 'utf8')).toBe('concurrent edit');
  expect(renameSync).toHaveBeenCalledTimes(1);
  expect(readdirSync(root).some((name) => name.includes('.tmp-'))).toBe(false);
});

test('rechecks target safety before retrying replacement', () => {
  vi.mocked(renameSync).mockImplementationOnce(() => {
    rmSync(target);
    mkdirSync(target);
    throw locked();
  });
  expect(() => writePiManagedText(target, 'replacement')).toThrow(
    'Managed Pi target is not a regular file',
  );
  expect(renameSync).toHaveBeenCalledTimes(1);
  expect(readdirSync(target)).toEqual([]);
});

test.each([
  ['linux', 'EPERM'],
  ['win32', 'ENOSPC'],
  ['win32', 'ENOENT'],
])('fails immediately on %s with %s', (platform, code) => {
  Object.defineProperty(process, 'platform', { value: platform });
  const failure = locked(code);
  vi.mocked(renameSync).mockImplementation(() => {
    throw failure;
  });
  expect(() => writePiManagedText(target, 'replacement')).toThrow(failure);
  expect(renameSync).toHaveBeenCalledTimes(1);
  expect(Atomics.wait).not.toHaveBeenCalled();
  expect(readFileSync(target, 'utf8')).toBe('original');
});

test('does not replace an already identical target', () => {
  expect(writePiManagedText(target, 'original')).toBe(false);
  expect(renameSync).not.toHaveBeenCalled();
  expect(readdirSync(root)).toEqual(['settings.json']);
});
