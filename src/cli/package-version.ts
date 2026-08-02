import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from './package-root';

const EXPECTED_PACKAGE_NAME = 'thoth-agents';
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export type PackageVersionErrorCode =
  | 'package-root-not-found'
  | 'package-metadata-unreadable'
  | 'package-metadata-malformed'
  | 'package-name-mismatch'
  | 'package-version-invalid';

export interface PackageVersionError {
  code: PackageVersionErrorCode;
  message: string;
  packageJsonPath?: string;
}

export type ExecutingPackageVersionResult =
  | { ok: true; version: string; packageRoot: string }
  | { ok: false; error: PackageVersionError };

export interface ResolveExecutingPackageVersionOptions {
  moduleUrl?: string | URL;
}

export function isValidPackageVersion(version: unknown): version is string {
  return typeof version === 'string' && SEMVER_PATTERN.test(version);
}

export function resolveExecutingPackageVersion(
  options: ResolveExecutingPackageVersionOptions = {},
): ExecutingPackageVersionResult {
  const moduleUrl = options.moduleUrl ?? import.meta.url;
  const packageRoot = findPackageRoot(dirname(fileURLToPath(moduleUrl)));
  if (!packageRoot) {
    return {
      ok: false,
      error: {
        code: 'package-root-not-found',
        message: 'Could not locate the executing thoth-agents package root.',
      },
    };
  }

  const packageJsonPath = join(packageRoot, 'package.json');
  let serializedMetadata: string;
  try {
    serializedMetadata = readFileSync(packageJsonPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'package-metadata-unreadable',
        message: `Could not read executing package metadata: ${error}`,
        packageJsonPath,
      },
    };
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(serializedMetadata);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'package-metadata-malformed',
        message: `Could not parse executing package metadata: ${error}`,
        packageJsonPath,
      },
    };
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      ok: false,
      error: {
        code: 'package-metadata-malformed',
        message: 'Executing package metadata must be a JSON object.',
        packageJsonPath,
      },
    };
  }

  const { name, version } = metadata as Record<string, unknown>;
  if (typeof name !== 'string' || name.length === 0) {
    return {
      ok: false,
      error: {
        code: 'package-metadata-malformed',
        message: 'Executing package metadata has no valid package name.',
        packageJsonPath,
      },
    };
  }
  if (name !== EXPECTED_PACKAGE_NAME) {
    return {
      ok: false,
      error: {
        code: 'package-name-mismatch',
        message: `Expected package ${EXPECTED_PACKAGE_NAME}, received ${name}.`,
        packageJsonPath,
      },
    };
  }
  if (!isValidPackageVersion(version)) {
    return {
      ok: false,
      error: {
        code: 'package-version-invalid',
        message: 'Executing package metadata has no valid semantic version.',
        packageJsonPath,
      },
    };
  }

  return { ok: true, version, packageRoot };
}
