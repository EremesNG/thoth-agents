import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OWNER_NAME = 'thoth-agents';
const OWNER_SCOPE = '@thoth-agents/';

export type ManifestReader = (path: string) => string;

function isOwnedName(name: unknown): boolean {
  return (
    typeof name === 'string' &&
    (name === OWNER_NAME || name.startsWith(OWNER_SCOPE))
  );
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Decides whether a tool's `baseDir` belongs to a thoth-agents package by the
 * nearest `package.json` walking upward. The first manifest found decides, even
 * when foreign, malformed or unreadable. Results are cached per directory.
 */
export function createOwnershipResolver(
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
        owned = isOwnedName((manifest as { name?: unknown } | null)?.name);
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
