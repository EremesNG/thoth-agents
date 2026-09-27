import { randomUUID } from 'node:crypto';
import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, parse, resolve } from 'node:path';

interface FileSnapshot {
  exists: boolean;
  dev?: bigint;
  ino?: bigint;
  size?: number;
  mtimeMs?: number;
  content?: Buffer;
}

function lstatIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function snapshot(path: string): FileSnapshot {
  const present = lstatIfPresent(path);
  if (!present) return { exists: false };
  const stat = lstatSync(path, { bigint: true });
  return {
    exists: true,
    dev: stat.dev,
    ino: stat.ino,
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    content: readFileSync(path),
  };
}

function snapshotsEqual(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.exists === right.exists &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    (left.content === undefined
      ? right.content === undefined
      : right.content !== undefined && left.content.equals(right.content))
  );
}

/** Reject links and non-directory ancestors before reading or writing a managed file. */
export function assertSafePiManagedPath(path: string): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const ancestors: string[] = [];
  let cursor = dirname(absolute);
  while (cursor !== root) {
    ancestors.push(cursor);
    cursor = dirname(cursor);
  }
  ancestors.push(root);
  for (const ancestor of ancestors.reverse()) {
    const stat = lstatIfPresent(ancestor);
    if (!stat) continue;
    if (stat.isSymbolicLink())
      throw new Error(`Managed Pi path has a symlinked parent: ${ancestor}`);
    if (!stat.isDirectory())
      throw new Error(`Managed Pi path parent is not a directory: ${ancestor}`);
  }
  const target = lstatIfPresent(absolute);
  if (!target) return;
  if (target.isSymbolicLink())
    throw new Error(`Managed Pi target is a symlink: ${absolute}`);
  if (!target.isFile())
    throw new Error(`Managed Pi target is not a regular file: ${absolute}`);
}

export function writePiManagedText(path: string, content: string): boolean {
  assertSafePiManagedPath(path);
  const before = snapshot(path);
  const desired = Buffer.from(content);
  if (before.content?.equals(desired)) return false;

  mkdirSync(dirname(path), { recursive: true });
  assertSafePiManagedPath(path);
  const nonce = `${process.pid}-${randomUUID()}`;
  const temporaryPath = `${path}.tmp-${nonce}`;
  const backupPath = `${path}.bak-${nonce}`;
  writeFileSync(temporaryPath, desired, { flag: 'wx' });
  try {
    assertSafePiManagedPath(path);
    if (!snapshotsEqual(before, snapshot(path)))
      throw new Error(`Managed Pi target changed before replacement: ${path}`);
    if (before.exists) copyFileSync(path, backupPath, constants.COPYFILE_EXCL);
    // Windows readers can temporarily deny replacement without denying writes.
    // Keep the original intact; never fall back to unlinking or truncating it.
    const maxAttempts = process.platform === 'win32' ? 11 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      assertSafePiManagedPath(path);
      if (!snapshotsEqual(before, snapshot(path)))
        throw new Error(
          `Managed Pi target changed before replacement: ${path}`,
        );
      try {
        renameSync(temporaryPath, path);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          process.platform !== 'win32' ||
          !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')
        )
          throw error;
        if (attempt === maxAttempts)
          throw new Error(
            `Cannot replace managed Pi file ${path} (${code}) after bounded retries. The original file was not replaced. Close applications holding this file, check its permissions, and rerun setup.`,
            { cause: error },
          );
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  return true;
}
