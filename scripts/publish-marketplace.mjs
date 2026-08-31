import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_CENTRAL_REPOSITORY =
  'https://github.com/EremesNG/thoth-plugins.git';
const CATALOG_PATHS = [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  'catalog/plugins.json',
];
const SEMVER = /^\d+\.\d+\.\d+$/u;

async function run(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      ...options,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const detail = String(error.stderr ?? error.message ?? error)
      .trim()
      .replace(/\s+/gu, ' ')
      .slice(0, 600);
    throw new Error(
      `${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
      {
        cause: error,
      },
    );
  }
}

function repositoryUrl(repository) {
  const value = typeof repository === 'string' ? repository : repository?.url;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('package.json must declare its authoritative repository');
  }
  return value.replace(/^git\+/u, '');
}

async function packageMetadata(projectRoot, expectedPluginName) {
  let metadata;
  try {
    metadata = JSON.parse(
      await readFile(join(projectRoot, 'package.json'), 'utf8'),
    );
  } catch (error) {
    throw new Error('package.json is missing or invalid', { cause: error });
  }
  if (metadata.name !== expectedPluginName) {
    throw new Error(
      `Expected package ${expectedPluginName}, received ${String(metadata.name)}`,
    );
  }
  if (!SEMVER.test(metadata.version ?? '')) {
    throw new Error(
      `Package version must be an exact semantic version: ${metadata.version}`,
    );
  }
  return metadata;
}

async function assertVisibleTag(repository, version) {
  const tag = `v${version}`;
  try {
    await run('git', [
      'ls-remote',
      '--exit-code',
      '--refs',
      '--tags',
      repository,
      `refs/tags/${tag}`,
    ]);
  } catch (error) {
    throw new Error(
      `Release tag ${tag} is not visible in ${repository}; push the package tag before publishing the marketplace.`,
      { cause: error },
    );
  }
}

async function validateCentralCheckout(checkoutRoot) {
  const testFiles = (await readdir(join(checkoutRoot, 'tests')))
    .filter((path) => path.endsWith('.test.mjs'))
    .sort()
    .map((path) => join('tests', path));
  if (testFiles.length === 0) {
    throw new Error('Central marketplace checkout has no test files');
  }
  await run(process.execPath, ['--test', ...testFiles], { cwd: checkoutRoot });
  await run(process.execPath, ['scripts/validate.mjs', '--catalog-only'], {
    cwd: checkoutRoot,
  });
}

async function changedPaths(checkoutRoot) {
  const [{ stdout: tracked }, { stdout: untracked }] = await Promise.all([
    run('git', ['diff', '--name-only'], { cwd: checkoutRoot }),
    run('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: checkoutRoot,
    }),
  ]);
  return [...tracked.split(/\r?\n/u), ...untracked.split(/\r?\n/u)]
    .filter(Boolean)
    .sort();
}

export async function publishMarketplace(options = {}) {
  const projectRoot = resolve(
    options.projectRoot ?? resolve(import.meta.dirname, '..'),
  );
  const pluginName = options.pluginName ?? 'thoth-agents';
  const metadata = await packageMetadata(projectRoot, pluginName);
  const version = metadata.version;
  const centralRepository =
    options.centralRepository ??
    process.env.THOTH_MARKETPLACE_REPOSITORY ??
    DEFAULT_CENTRAL_REPOSITORY;
  const pluginRepository =
    options.pluginRepository ??
    process.env.THOTH_PLUGIN_REPOSITORY ??
    repositoryUrl(metadata.repository);

  await assertVisibleTag(pluginRepository, version);

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'thoth-marketplace-publish-'),
  );
  const checkoutRoot = join(temporaryRoot, 'catalog');
  try {
    await run(
      'git',
      [
        'clone',
        '--quiet',
        '--single-branch',
        '--branch',
        'main',
        centralRepository,
        checkoutRoot,
      ],
      { cwd: temporaryRoot },
    );
    await run(
      process.execPath,
      [
        'scripts/update-plugin.mjs',
        '--plugin',
        pluginName,
        '--version',
        version,
        '--source-repository',
        pluginRepository,
      ],
      { cwd: checkoutRoot },
    );
    await validateCentralCheckout(checkoutRoot);

    const paths = await changedPaths(checkoutRoot);
    if (paths.length === 0) {
      return { status: 'current', pluginName, version };
    }
    if (JSON.stringify(paths) !== JSON.stringify(CATALOG_PATHS)) {
      throw new Error(
        `Catalog update changed files outside its ownership: ${paths.join(', ')}`,
      );
    }

    await run('git', ['add', '--', ...CATALOG_PATHS], { cwd: checkoutRoot });
    await run(
      'git',
      [
        '-c',
        'user.name=thoth-marketplace-publisher',
        '-c',
        'user.email=thoth-marketplace-publisher@users.noreply.github.com',
        'commit',
        '-m',
        `chore(catalog): publish ${pluginName} ${version}`,
      ],
      { cwd: checkoutRoot },
    );
    if (options.beforePush) await options.beforePush();
    try {
      await run('git', ['push', 'origin', 'HEAD:refs/heads/main'], {
        cwd: checkoutRoot,
      });
    } catch (error) {
      throw new Error(
        'Marketplace push was rejected; central main advanced or the remote refused the normal non-force push. Retry release:marketplace from a fresh clone.',
        { cause: error },
      );
    }
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], {
      cwd: checkoutRoot,
    });
    return {
      status: 'published',
      pluginName,
      version,
      commit: stdout.trim(),
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const result = await publishMarketplace();
    process.stdout.write(
      result.status === 'published'
        ? `Published ${result.pluginName}@${result.version} to thoth-plugins at ${result.commit}.\n`
        : `${result.pluginName}@${result.version} is already current in thoth-plugins.\n`,
    );
  } catch (error) {
    process.stderr.write(`Marketplace publication failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
