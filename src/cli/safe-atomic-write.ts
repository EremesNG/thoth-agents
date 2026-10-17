import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

/** Replace a file without following or clobbering pre-existing staging paths. */
export function safeAtomicWriteFileSync(
  path: string,
  content: string | Uint8Array,
): void {
  let mode: number | undefined;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Unsafe atomic write target: ${path}`);
    mode = stat.mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  // Windows can follow a dangling symlink even with 'wx'. Reject any existing
  // directory entry as well as using exclusive creation for regular collisions.
  try {
    lstatSync(temporaryPath);
    throw new Error(`Atomic staging path already exists: ${temporaryPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // Keep open outside the cleanup block: a failed exclusive create owns nothing.
  let fd: number | undefined = openSync(temporaryPath, 'wx', mode ?? 0o666);
  try {
    if (mode !== undefined) fchmodSync(fd, mode);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporaryPath, path);
  } catch (error) {
    // Best-effort cleanup must not obscure the original write/rename failure.
    try {
      if (fd !== undefined) closeSync(fd);
    } catch {}
    try {
      unlinkSync(temporaryPath);
    } catch {}
    throw error;
  }
}
