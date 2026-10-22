import fs from 'node:fs';
import path from 'node:path';
import { writeSubagentsDebugLog } from '../debug.js';

const MARKER = '@orca-managed-pi-extension';
const PREFIX_BYTES = 4096;
const cache = new Map<
  string,
  { mtimeMs: number; size: number; managed: boolean }
>();
const loggedExclusions = new Set<string>();

function isOrcaManaged(file: string, cwd: string): boolean {
  try {
    const stat = fs.statSync(file);
    const { mtimeMs, size } = stat;
    const cached = cache.get(file);
    if (cached?.mtimeMs === mtimeMs && cached.size === size)
      return cached.managed;
    if (!stat.isFile()) {
      cache.set(file, { mtimeMs, size, managed: false });
      return false;
    }
    const fd = fs.openSync(file, 'r');
    let managed: boolean;
    try {
      const prefix = Buffer.alloc(Math.min(size, PREFIX_BYTES));
      const bytes = fs.readSync(fd, prefix, 0, prefix.length, 0);
      managed = prefix.toString('utf8', 0, bytes).includes(MARKER);
    } finally {
      fs.closeSync(fd);
    }
    cache.set(file, { mtimeMs, size, managed });
    return managed;
  } catch (error) {
    // Detection is an optimization for UI-only host extensions, not a trust gate.
    writeSubagentsDebugLog(cwd, 'orca_extension_read_error', { file, error });
    return false;
  }
}

/** Child-only: exclude host UI factories before the SDK can execute them. */
export function excludeOrcaManagedExtensions(
  paths: string[],
  cwd: string,
): string[] {
  const newlyExcluded: string[] = [];
  const kept = paths.filter((entry) => {
    if (entry.startsWith('builtin:')) return true;
    const file = path.resolve(cwd, entry);
    if (!isOrcaManaged(file, cwd)) return true;
    if (!loggedExclusions.has(file)) {
      loggedExclusions.add(file);
      newlyExcluded.push(file);
    }
    return false;
  });
  if (newlyExcluded.length)
    writeSubagentsDebugLog(cwd, 'orca_extensions_excluded', {
      paths: newlyExcluded,
    });
  return kept;
}
