import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function isTestPath(file) {
  return /(^|\/)tests?\//.test(file) || /\.test\.(ts|tsx|mjs)$/.test(file);
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function checkPiVersionBumps(
  baseRef,
  { projectRoot = defaultRoot } = {},
) {
  const warnings = [];
  const packagesDir = join(projectRoot, 'pi-packages');
  if (!existsSync(packagesDir)) return warnings;

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    const manifest = join(packagesDir, entry.name, 'package.json');
    if (!entry.isDirectory() || !existsSync(manifest)) continue;
    const prefix = `pi-packages/${entry.name}`;

    const diff = git(
      ['diff', '--name-only', `${baseRef}...HEAD`, '--', prefix],
      projectRoot,
    );
    if (diff.status !== 0) {
      throw new Error(`git diff failed for ${prefix}: ${diff.stderr.trim()}`);
    }
    const changed = diff.stdout
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean)
      .filter((file) => !isTestPath(file));
    if (changed.length === 0) continue;

    // Missing at base means a new package: nothing to bump against.
    const atBase = git(
      ['show', `${baseRef}:${prefix}/package.json`],
      projectRoot,
    );
    if (atBase.status !== 0) continue;

    const current = JSON.parse(readFileSync(manifest, 'utf8'));
    if (current.version === JSON.parse(atBase.stdout).version) {
      warnings.push(
        `::warning title=Pi package version not bumped::${current.name} changed without a version bump`,
      );
    }
  }
  return warnings;
}

export function runCheck(args, env = process.env, options = {}) {
  const baseRef =
    args[0] ?? (env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : '');
  if (!baseRef) {
    console.error('Usage: node scripts/check-pi-version-bumps.mjs <base-ref>');
    return 1;
  }
  try {
    for (const warning of checkPiVersionBumps(baseRef, options)) {
      console.log(warning);
    }
  } catch (error) {
    // Warn-only check: an unreadable base must not fail the PR.
    console.log(`::notice title=Pi version check skipped::${error.message}`);
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exit(runCheck(process.argv.slice(2)));
}
