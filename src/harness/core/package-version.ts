import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Locate the thoth-agents root package.json by walking up from each candidate
 * directory. Shared by harness adapters that stamp the package version into
 * generated plugin manifests.
 */
export function findRootPackageJsonPath(startDirs: readonly string[]): string {
  for (const startDir of startDirs) {
    let currentDir = resolve(startDir);

    while (true) {
      const packageJsonPath = resolve(currentDir, 'package.json');

      if (existsSync(packageJsonPath)) {
        const packageJsonText = readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonText) as {
          name?: unknown;
        };

        if (packageJson.name === 'thoth-agents') {
          return packageJsonPath;
        }
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }
  }

  throw new Error(
    'Unable to locate the thoth-agents root package.json from the render context or current working directory.',
  );
}

export function readPackageJsonVersion(packageJsonPath: string): string {
  const packageJsonText = readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonText) as {
    version?: unknown;
  };

  if (
    typeof packageJson.version !== 'string' ||
    packageJson.version.length === 0
  ) {
    throw new Error('Root package.json version must be a non-empty string.');
  }

  return packageJson.version;
}
