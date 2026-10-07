import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ManifestReader = (path: string) => string;

function isOwnedName(
  name: unknown,
  respectPackages: readonly string[],
): boolean {
  return (
    typeof name === 'string' &&
    respectPackages.some((pattern) => {
      if (name === pattern) return true;
      if (
        !pattern.endsWith('/*') ||
        pattern.indexOf('*') !== pattern.length - 1
      ) {
        return false;
      }
      const prefix = pattern.slice(0, -1);
      return name.startsWith(prefix) && name.length > prefix.length;
    })
  );
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Matches a tool's nearest `package.json` walking upward against the configured
 * package patterns. The first manifest found decides, even when unmatched,
 * malformed or unreadable. Results are cached per directory.
 */
export function createOwnershipResolver(
  respectPackages: readonly string[],
  read: ManifestReader = (path) => readFileSync(path, 'utf8'),
): (baseDir: string) => boolean {
  const cache = new Map<string, boolean>();

  return (baseDir) => {
    const visited: string[] = [];
    let dir = baseDir;
    let owned = false;
    for (;;) {
      const hit = cache.get(dir);
      if (hit !== undefined) {
        owned = hit;
        break;
      }
      visited.push(dir);
      try {
        const manifest: unknown = JSON.parse(read(join(dir, 'package.json')));
        owned = isOwnedName(
          (manifest as { name?: unknown } | null)?.name,
          respectPackages,
        );
        break;
      } catch (error) {
        if (!(error instanceof Error) || !isMissing(error)) break;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    for (const entry of visited) cache.set(entry, owned);
    return owned;
  };
}
