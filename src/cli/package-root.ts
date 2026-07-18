import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export function findPackageRoot(startDir: string): string | null {
  let currentDir = startDir;
  const filesystemRoot = parse(startDir).root;

  while (true) {
    if (existsSync(join(currentDir, 'package.json'))) {
      return currentDir;
    }

    if (currentDir === filesystemRoot) {
      return null;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}
