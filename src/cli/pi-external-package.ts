import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { satisfies, valid } from 'semver';

export interface PiExternalPackageSpec {
  source: string;
  packageName: string;
  version: string;
}

export interface PiConfiguredExternalPackage {
  scope: 'user' | 'project';
  source: string;
  installedPath?: string;
}

export type PiExternalPackageEvidence =
  | {
      state: 'installed';
      source: string;
      installedPath: string;
      version: string;
    }
  | {
      state: 'missing' | 'drift';
      source?: string;
      installedPath?: string;
      version?: string;
      reason: string;
    };

function npmPackageName(source: string): string | undefined {
  if (!source.startsWith('npm:')) return undefined;
  const spec = source.slice('npm:'.length);
  const separator = spec.lastIndexOf('@');
  if (separator <= 0) return spec || undefined;
  return spec.slice(0, separator);
}

function installedPackageName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(path, 'package.json'), 'utf8'),
    );
    if (
      typeof manifest === 'object' &&
      manifest !== null &&
      !Array.isArray(manifest)
    ) {
      const { name } = manifest as { name?: unknown };
      if (typeof name === 'string') return name;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function piExternalSourceMatches(
  candidate: PiConfiguredExternalPackage,
  expectedSource: string,
): boolean {
  if (candidate.source === expectedSource) return true;
  if (!isAbsolute(expectedSource) || !candidate.installedPath) return false;
  try {
    return (
      realpathSync(candidate.installedPath) === realpathSync(expectedSource)
    );
  } catch {
    return false;
  }
}

export function inspectPiExternalPackage(
  packages: readonly PiConfiguredExternalPackage[],
  spec: PiExternalPackageSpec,
  requireManagedSource = true,
): PiExternalPackageEvidence {
  const matching = packages.filter(
    ({ source, installedPath }) =>
      source === spec.source ||
      npmPackageName(source) === spec.packageName ||
      installedPackageName(installedPath) === spec.packageName,
  );
  if (matching.some(({ scope }) => scope === 'project'))
    return {
      state: 'drift',
      reason: 'project package shadows the required global package',
    };
  const candidates = matching.filter(({ scope }) => scope === 'user');
  if (candidates.length === 0)
    return { state: 'missing', reason: 'package is not configured globally' };
  if (candidates.length !== 1)
    return { state: 'drift', reason: 'package configuration is ambiguous' };

  const candidate = candidates[0];
  if (!candidate?.installedPath)
    return {
      state: 'drift',
      source: candidate?.source,
      reason: 'Pi did not report an installed package directory',
    };

  let manifest: unknown;
  try {
    manifest = JSON.parse(
      readFileSync(join(candidate.installedPath, 'package.json'), 'utf8'),
    );
  } catch {
    return {
      state: 'drift',
      source: candidate.source,
      installedPath: candidate.installedPath,
      reason: 'installed package manifest is missing or malformed',
    };
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    return {
      state: 'drift',
      source: candidate.source,
      installedPath: candidate.installedPath,
      reason: 'installed package manifest is not an object',
    };
  const { name, version } = manifest as Record<string, unknown>;
  if (name !== spec.packageName)
    return {
      state: 'drift',
      source: candidate.source,
      installedPath: candidate.installedPath,
      reason: `installed package name does not match ${spec.packageName}`,
    };
  if (typeof version !== 'string' || valid(version) === null)
    return {
      state: 'drift',
      source: candidate.source,
      installedPath: candidate.installedPath,
      reason: 'installed package version is not valid SemVer',
    };
  if (!satisfies(version, `>=${spec.version}`))
    return {
      state: 'drift',
      source: candidate.source,
      installedPath: candidate.installedPath,
      version,
      reason: `installed package version does not satisfy >=${spec.version}`,
    };
  if (requireManagedSource && !piExternalSourceMatches(candidate, spec.source))
    return {
      state: 'drift',
      source: candidate.source,
      installedPath: candidate.installedPath,
      version,
      reason: `configured source must resolve to ${spec.source}`,
    };
  return {
    state: 'installed',
    source: candidate.source,
    installedPath: candidate.installedPath,
    version,
  };
}
