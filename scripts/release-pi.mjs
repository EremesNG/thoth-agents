import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RELEASE_LEVELS = ['patch', 'minor', 'major'];

const USAGE = `Usage: pnpm release:pi <package> <${RELEASE_LEVELS.join('|')}>
  <package>: directory name (pi-subagents) or full name (@thoth-agents/pi-subagents)`;

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function discoverPiPackages(projectRoot = defaultRoot) {
  const base = join(projectRoot, 'pi-packages');
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join(base, entry.name);
      const manifest = join(dir, 'package.json');
      if (!existsSync(manifest)) return [];
      const { name, version } = JSON.parse(readFileSync(manifest, 'utf8'));
      return [{ directory: entry.name, dir, name, version }];
    });
}

export function resolvePiPackage(packages, identifier) {
  return packages.find(
    (pkg) => pkg.directory === identifier || pkg.name === identifier,
  );
}

function runNpmVersion(level, cwd) {
  // npm is a .cmd shim on Windows, which needs a shell to spawn.
  const result = spawnSync('npm', ['version', level, '--no-git-tag-version'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function releasePi(
  args,
  { projectRoot = defaultRoot, runNpm = runNpmVersion, log = console.log } = {},
) {
  const [identifier, level, ...extra] = args;
  const packages = discoverPiPackages(projectRoot);
  const pkg = identifier ? resolvePiPackage(packages, identifier) : undefined;
  const fail = (reason) => {
    log(`${reason}\n${USAGE}`);
    log(`Known packages: ${packages.map((p) => p.directory).join(', ')}`);
    return { ok: false, exitCode: 1 };
  };

  if (extra.length > 0 || !identifier || !level) return fail('Invalid usage.');
  if (!pkg) return fail(`Unknown Pi package: ${identifier}`);
  if (!RELEASE_LEVELS.includes(level)) {
    return fail(`Invalid release level: ${level}`);
  }

  const result = runNpm(level, pkg.dir);
  if (result.status !== 0) {
    log(`npm version failed for ${pkg.name}:\n${result.stderr}`.trim());
    return { ok: false, exitCode: result.status || 1 };
  }

  const newVersion = JSON.parse(
    readFileSync(join(pkg.dir, 'package.json'), 'utf8'),
  ).version;
  log(`${pkg.name}: ${pkg.version} -> ${newVersion}`);
  log(
    [
      'Next steps:',
      `  1. Commit the bump (pi-packages/${pkg.directory}/package.json).`,
      '  2. Release from the repository root: pnpm release:patch|minor|major',
    ].join('\n'),
  );
  return {
    ok: true,
    exitCode: 0,
    name: pkg.name,
    oldVersion: pkg.version,
    newVersion,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exit(releasePi(process.argv.slice(2)).exitCode);
}
