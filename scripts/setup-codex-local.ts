import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyCodexSetup, buildCodexSetupPlan } from '../src/cli/codex-install';
import {
  type CodexCommandExecutor,
  getCodexCommand,
} from '../src/cli/codex-plugin-install';

const PACKAGE_NAME = 'thoth-agents';
const EXACT_SEMVER = /^\d+\.\d+\.\d+$/u;
const LOCAL_CACHEBUSTER = /^[0-9A-Za-z-]+$/u;
const MANIFEST_PATHS = [
  '.codex-plugin/plugin.json',
  '.claude-plugin/plugin.json',
] as const;

interface JsonRecord {
  [key: string]: unknown;
}

export interface SyncCodexLocalSetupOptions {
  repositoryRoot?: string;
  homeDirectory?: string;
  codexHome?: string;
  cachebuster?: string;
  inspectPluginState?: boolean;
  pluginStateExecutor?: CodexCommandExecutor;
}

export interface SyncCodexLocalSetupResult {
  pluginTarget: string;
  marketplaceName: string;
  pluginId: string;
  version: string;
  changed: string[];
  warnings: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${path} is missing or invalid JSON.`, { cause: error });
  }
  if (!isRecord(value)) throw new Error(`${path} must contain a JSON object.`);
  return value;
}

function writeJson(path: string, value: JsonRecord): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultCachebuster(): string {
  return new Date().toISOString().replace(/[-:.]/gu, '');
}

function strictDescendant(base: string, candidate: string): boolean {
  const suffix = relative(base, candidate);
  return (
    suffix !== '' &&
    suffix !== '..' &&
    !suffix.startsWith(`..${sep}`) &&
    !isAbsolute(suffix)
  );
}

function assertSafeDirectory(path: string, base: string, label: string): void {
  if (!strictDescendant(base, path)) {
    throw new Error(`${label} must remain below ${base}.`);
  }
  if (!existsSync(path)) return;
  const target = lstatSync(path);
  if (target.isSymbolicLink() || !target.isDirectory()) {
    throw new Error(`${label} must be a real directory when it exists.`);
  }
}

function assertRealDirectoryChain(
  base: string,
  candidate: string,
  label: string,
): void {
  if (!strictDescendant(base, candidate)) {
    throw new Error(`${label} must remain below ${base}.`);
  }
  const baseStat = existsSync(base) ? lstatSync(base) : null;
  if (!baseStat || baseStat.isSymbolicLink() || !baseStat.isDirectory()) {
    throw new Error(`${label} requires a real base directory.`);
  }
  let boundary = base;
  for (const segment of relative(base, candidate).split(/[\\/]/u)) {
    boundary = join(boundary, segment);
    if (!existsSync(boundary)) break;
    const stat = lstatSync(boundary);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`${label} must be a real directory boundary.`);
    }
  }
}

function checkoutMetadata(repositoryRoot: string): {
  pluginSource: string;
  version: string;
} {
  const metadata = readJson(join(repositoryRoot, 'package.json'));
  if (
    metadata.name !== PACKAGE_NAME ||
    typeof metadata.version !== 'string' ||
    !EXACT_SEMVER.test(metadata.version)
  ) {
    throw new Error('The checkout package identity is invalid.');
  }
  const pluginSource = join(repositoryRoot, 'plugin');
  const pluginStat = existsSync(pluginSource) ? lstatSync(pluginSource) : null;
  if (!pluginStat || pluginStat.isSymbolicLink() || !pluginStat.isDirectory()) {
    throw new Error(
      'Build thoth-agents before synchronizing the local plugin.',
    );
  }
  for (const manifestPath of MANIFEST_PATHS) {
    const manifest = readJson(join(pluginSource, manifestPath));
    if (manifest.name !== PACKAGE_NAME) {
      throw new Error(
        `The checkout plugin manifest ${manifestPath} is invalid.`,
      );
    }
  }
  return { pluginSource, version: metadata.version };
}

function personalMarketplace(
  homeDirectory: string,
  pluginTarget: string,
): { marketplaceName: string; pluginId: string } {
  const path = join(homeDirectory, '.agents', 'plugins', 'marketplace.json');
  const marketplace = readJson(path);
  if (typeof marketplace.name !== 'string' || !marketplace.name.trim()) {
    throw new Error('The personal marketplace must declare a non-empty name.');
  }
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = plugins.find(
    (candidate) => isRecord(candidate) && candidate.name === PACKAGE_NAME,
  );
  if (!isRecord(entry) || !isRecord(entry.source)) {
    throw new Error(
      `The personal marketplace must contain a local ${PACKAGE_NAME} entry.`,
    );
  }
  const sourcePath = entry.source.path;
  if (
    entry.source.source !== 'local' ||
    typeof sourcePath !== 'string' ||
    !sourcePath.startsWith('./') ||
    resolve(homeDirectory, sourcePath) !== pluginTarget
  ) {
    throw new Error(
      `The personal marketplace ${PACKAGE_NAME} entry must point to ./plugins/${PACKAGE_NAME}.`,
    );
  }
  const marketplaceName = marketplace.name.trim();
  return {
    marketplaceName,
    pluginId: `${PACKAGE_NAME}@${marketplaceName}`,
  };
}

function rewritePluginVersion(stagingRoot: string, version: string): void {
  for (const relativePath of MANIFEST_PATHS) {
    const manifestPath = join(stagingRoot, relativePath);
    const manifest = readJson(manifestPath);
    manifest.version = version;
    writeJson(manifestPath, manifest);
  }
}

const defaultPluginStateExecutor: CodexCommandExecutor = (
  command,
  args,
  commandOptions,
) => {
  const invocation =
    command === 'codex' ? getCodexCommand(args) : { command, args: [...args] };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: commandOptions.cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  };
};

function inspectPluginSelection(
  executor: CodexCommandExecutor,
  projectRoot: string,
  personalPluginId: string,
): string[] {
  const result = executor('codex', ['plugin', 'list', '--json'], {
    cwd: projectRoot,
  });
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim().replace(/\s+/gu, ' ').slice(0, 240);
    throw new Error(
      `Codex plugin state could not be inspected${detail ? `: ${detail}` : '.'}`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout) as unknown;
  } catch (error) {
    throw new Error('Codex returned invalid plugin state JSON.', {
      cause: error,
    });
  }
  if (!isRecord(payload) || !Array.isArray(payload.installed)) {
    throw new Error('Codex returned an invalid installed plugin list.');
  }
  const enabledPluginIds = payload.installed.flatMap((entry) =>
    isRecord(entry) &&
    entry.enabled === true &&
    typeof entry.pluginId === 'string'
      ? [entry.pluginId]
      : [],
  );
  const publicPluginId = `${PACKAGE_NAME}@thoth-plugins`;
  if (
    enabledPluginIds.includes(publicPluginId) &&
    enabledPluginIds.includes(personalPluginId)
  ) {
    throw new Error(
      'The public and personal thoth-agents plugins are both enabled; select only the personal plugin before synchronizing local development state.',
    );
  }
  return enabledPluginIds.includes(personalPluginId)
    ? []
    : [
        `The personal plugin ${personalPluginId} is not enabled; install it from the personal marketplace after synchronization.`,
      ];
}

export function syncCodexLocalSetup(
  options: SyncCodexLocalSetupOptions = {},
): SyncCodexLocalSetupResult {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? resolve(import.meta.dirname, '..'),
  );
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const codexHome = resolve(options.codexHome ?? join(homeDirectory, '.codex'));
  const cachebuster = options.cachebuster ?? defaultCachebuster();
  if (!LOCAL_CACHEBUSTER.test(cachebuster)) {
    throw new Error('The local plugin cachebuster is invalid.');
  }

  const pluginTarget = resolve(homeDirectory, 'plugins', PACKAGE_NAME);
  assertRealDirectoryChain(
    homeDirectory,
    dirname(pluginTarget),
    'Plugin target boundary',
  );
  assertSafeDirectory(pluginTarget, homeDirectory, 'Local plugin target');
  const marketplace = personalMarketplace(homeDirectory, pluginTarget);
  const checkout = checkoutMetadata(repositoryRoot);
  const localVersion = `${checkout.version}+codex.local-${cachebuster}`;
  const warnings =
    options.inspectPluginState === false
      ? []
      : inspectPluginSelection(
          options.pluginStateExecutor ?? defaultPluginStateExecutor,
          repositoryRoot,
          marketplace.pluginId,
        );
  const plan = buildCodexSetupPlan({
    dryRun: false,
    reset: false,
    scope: 'user',
    projectRoot: repositoryRoot,
    packageRoot: repositoryRoot,
    homeDir: homeDirectory,
    codexHome,
  });

  const targetParent = dirname(pluginTarget);
  mkdirSync(targetParent, { recursive: true });
  const stagingRoot = mkdtempSync(
    join(targetParent, `.${PACKAGE_NAME}-local-`),
  );
  const backupRoot = `${pluginTarget}.backup-${process.pid}-${Date.now()}`;
  assertSafeDirectory(stagingRoot, homeDirectory, 'Plugin staging root');
  assertSafeDirectory(backupRoot, homeDirectory, 'Plugin backup root');

  let movedExistingTarget = false;
  let installedStagedTarget = false;
  try {
    cpSync(checkout.pluginSource, stagingRoot, { recursive: true });
    rewritePluginVersion(stagingRoot, localVersion);
    if (existsSync(pluginTarget)) {
      renameSync(pluginTarget, backupRoot);
      movedExistingTarget = true;
    }
    renameSync(stagingRoot, pluginTarget);
    installedStagedTarget = true;

    const applied = applyCodexSetup(plan);
    if (!applied.success) {
      throw new Error(
        applied.error ?? 'Codex agent-pack synchronization failed.',
      );
    }
    if (movedExistingTarget) {
      rmSync(backupRoot, { recursive: true, force: false });
    }
    return {
      pluginTarget,
      ...marketplace,
      version: localVersion,
      changed: [pluginTarget, ...applied.changed],
      warnings,
    };
  } catch (error) {
    if (existsSync(stagingRoot)) {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
    if (installedStagedTarget && existsSync(pluginTarget)) {
      assertSafeDirectory(pluginTarget, homeDirectory, 'Local plugin target');
      rmSync(pluginTarget, { recursive: true, force: true });
    }
    if (movedExistingTarget && existsSync(backupRoot)) {
      renameSync(backupRoot, pluginTarget);
    }
    throw error;
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const result = syncCodexLocalSetup();
    for (const warning of result.warnings) {
      process.stderr.write(`Warning: ${warning}\n`);
    }
    process.stdout.write(
      `Synced ${result.version} to ${result.pluginTarget} and refreshed ${result.changed.length - 1} Codex agent-pack targets.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
