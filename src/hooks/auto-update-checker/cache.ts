import * as fs from 'node:fs';
import * as path from 'node:path';
import { stripJsonComments } from '../../cli/config-manager';
import { log } from '../../utils/logger';
import { CACHE_DIR, PACKAGE_NAME } from './constants';

/**
 * Invalidates the current package by removing its directory and dependency entries.
 * This forces pnpm to resolve the package again without editing pnpm-lock.yaml.
 * @param packageName The name of the package to invalidate.
 */
export function invalidatePnpmPackageCache(
  packageName: string = PACKAGE_NAME,
): boolean {
  try {
    const pkgDir = path.join(CACHE_DIR, 'node_modules', packageName);
    const pkgJsonPath = path.join(CACHE_DIR, 'package.json');

    let packageRemoved = false;
    let dependencyRemoved = false;

    if (fs.existsSync(pkgDir)) {
      fs.rmSync(pkgDir, { recursive: true, force: true });
      log(`[auto-update-checker] Package removed: ${pkgDir}`);
      packageRemoved = true;
    }

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const content = fs.readFileSync(pkgJsonPath, 'utf-8');
        const pkgJson = JSON.parse(stripJsonComments(content));
        if (pkgJson.dependencies?.[packageName]) {
          delete pkgJson.dependencies[packageName];
          fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
          log(
            `[auto-update-checker] Dependency removed from package.json: ${packageName}`,
          );
          dependencyRemoved = true;
        }
      } catch (err) {
        log(
          `[auto-update-checker] Failed to update package.json for invalidation:`,
          err,
        );
      }
    }

    if (!packageRemoved && !dependencyRemoved) {
      log(
        `[auto-update-checker] Package not found, nothing to invalidate: ${packageName}`,
      );
      return false;
    }

    return true;
  } catch (err) {
    log('[auto-update-checker] Failed to invalidate package:', err);
    return false;
  }
}

export { invalidatePnpmPackageCache as invalidatePackage };
