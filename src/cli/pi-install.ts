import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lt } from 'semver';
import { piAdapter } from '../harness/adapters/pi';
import { THOTH_OWNED_SKILL_NAMES } from '../harness/core/owned-skills';
import {
  PI_SPECIALIST_ROLES,
  piSpecialistName,
} from '../harness/pi-specialists';
import {
  PI_MANAGED_OWNER,
  PI_ROOT_END,
  PI_ROOT_START,
} from '../harness/writers/pi-agent';
import { findPackageRoot } from './package-root';
import {
  inspectPiExternalPackage,
  type PiExternalPackageEvidence,
  type PiExternalPackageSpec,
  piExternalSourceMatches,
} from './pi-external-package';
import { projectGitPackagePath } from './pi-git-source';
import {
  assertSafePiManagedPath,
  writePiManagedText,
} from './pi-managed-write';
import { migrateLegacyPiResources } from './pi-migration';
import { findPiWindowsCli, observePiNativeRoot } from './pi-native-probe';
import {
  classifyPiPackageOwnership,
  type PiPackageReceipt,
  type PiPackageReceiptOptions,
  piPackagePathsEqual,
  readPiPackageReceipt,
  writePiPackageReceipt,
} from './pi-package-receipt';
import { type PiPathOptions, type PiPaths, resolvePiPaths } from './pi-paths';
import { syncPiSpecialists } from './pi-resources';

export const PI_MINIMUM_VERSION = '0.99.0';
export const PI_NODE_MINIMUM = '22.19.0';
export const PI_COMMAND_TIMEOUT_MS = 120_000;
export interface PiSetupPackageSpec extends PiExternalPackageSpec {
  id: string;
  preserveUserCopy?: boolean;
}

export const PI_PACKAGE_SPECS = [
  {
    id: 'delegation',
    source: 'npm:@thoth-agents/pi-subagents@>=0.3.0',
    packageName: '@thoth-agents/pi-subagents',
    version: '0.3.0',
  },
  {
    id: 'context7',
    source: 'npm:@upstash/context7-pi@>=0.1.2',
    packageName: '@upstash/context7-pi',
    version: '0.1.2',
  },
  {
    id: 'web-access',
    source: 'npm:pi-web-access@>=0.27.0',
    packageName: 'pi-web-access',
    version: '0.27.0',
  },
  {
    id: 'grep-adapter',
    source: 'npm:pi-mcp-adapter@>=2.32.1',
    packageName: 'pi-mcp-adapter',
    version: '2.32.1',
  },
  {
    id: 'ask-user-question',
    source: 'npm:@thoth-agents/pi-questions-user@>=0.1.0',
    packageName: '@thoth-agents/pi-questions-user',
    version: '0.1.0',
  },
  {
    id: 'todo',
    source: 'npm:@thoth-agents/pi-todo@>=0.3.0',
    packageName: '@thoth-agents/pi-todo',
    version: '0.3.0',
  },
  {
    id: 'theme',
    source: 'npm:@thoth-agents/pi-thoth-theme@>=0.3.0',
    packageName: '@thoth-agents/pi-thoth-theme',
    version: '0.3.0',
    preserveUserCopy: true,
  },
  {
    id: 'background-tasks',
    source: 'npm:@thoth-agents/pi-background-tasks@>=0.3.0',
    packageName: '@thoth-agents/pi-background-tasks',
    version: '0.3.0',
    preserveUserCopy: true,
  },
] as const;

export const PI_GREP_MCP_ENTRY = {
  url: 'https://mcp.grep.app',
  protocolVersion: 'legacy',
  lifecycle: 'lazy',
} as const;

export interface PiCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: unknown;
}

export type PiCommandExecutor = (
  command: string,
  args: readonly string[],
) => PiCommandResult;

export interface PiSetupOptions extends PiPathOptions {
  dryRun?: boolean;
  commandExecutor?: PiCommandExecutor;
  expectedVersion?: string;
  packageRoot?: string;
  runtimePackageRoot?: string;
  firstPartySource?: string;
  receiptOptions?: PiPackageReceiptOptions;
  verifyFirstParty?: (input: {
    source: string;
    installSource: string;
    version: string;
    packageRoot: string;
  }) =>
    | { success: true; receipt: PiPackageReceipt }
    | { success: false; error: string };
}

export interface PiSetupPlanItem {
  kind: 'preflight' | 'package' | 'root' | 'agent' | 'settings' | 'mcp';
  description: string;
  target: string;
  command?: { command: string; args: string[] };
  content?: string;
}

export interface PiSetupPlan {
  dryRun: boolean;
  ready: boolean;
  paths: PiPaths;
  items: PiSetupPlanItem[];
  blockers: string[];
  diagnostics: string[];
  disclaimers: string[];
  projectIncumbentTodos?: PiConfiguredPackage[];
  options: PiSetupOptions;
}

export interface PiApplyResult {
  success: boolean;
  changed: string[];
  diagnostics: string[];
  error?: string;
  failedStep?: string;
  installedPackages: string[];
  receiptCommitted?: boolean;
  rollbackFailed?: boolean;
  manualRecovery?: string;
  configuredPackageRoot?: string;
}

export function getPiFirstPartySource(version: string): string {
  return `npm:thoth-agents@${version}`;
}
function packageRootFor(options: PiSetupOptions): string {
  const root =
    options.packageRoot ??
    findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  if (!root)
    throw new Error(
      'Unable to locate the executing thoth-agents package root.',
    );
  return root;
}
function packageVersionFor(root: string): string {
  const value = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  ) as { version?: unknown };
  if (typeof value.version !== 'string')
    throw new Error('Executing thoth-agents package version is invalid.');
  return value.version;
}
function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
export function verifyPiFirstPartyPackage(input: {
  source: string;
  installSource: string;
  version: string;
  packageRoot: string;
}):
  | { success: true; receipt: PiPackageReceipt }
  | { success: false; error: string } {
  try {
    const manifestPath = join(input.packageRoot, 'package.json');
    const extensionPath = join(input.packageRoot, 'dist', 'pi.js');
    const assetsPath = join(
      input.packageRoot,
      'pi',
      '.thoth-agents-assets.json',
    );
    for (const path of [manifestPath, extensionPath, assetsPath])
      if (
        !existsSync(path) ||
        !lstatSync(path).isFile() ||
        lstatSync(path).isSymbolicLink()
      )
        throw new Error(
          `Required regular package asset is missing or symlinked: ${path}`,
        );
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      unknown
    >;
    if (
      manifest.name !== 'thoth-agents' ||
      manifest.version !== input.version ||
      JSON.stringify(manifest.pi) !==
        JSON.stringify({ extensions: ['./dist/pi.js'], skills: ['./skills'] })
    )
      throw new Error(
        'Installed package identity or Pi manifest is inconsistent.',
      );
    const assets = JSON.parse(readFileSync(assetsPath, 'utf8')) as {
      schemaVersion?: unknown;
      owner?: unknown;
      files?: unknown;
    };
    const expectedAgentPaths = PI_SPECIALIST_ROLES.map(
      (role) => `agents/${piSpecialistName(role)}.md`,
    );
    if (
      assets.schemaVersion !== 1 ||
      assets.owner !== 'thoth-agents' ||
      !isRecord(assets.files) ||
      Object.keys(assets.files).sort().join('|') !==
        [...expectedAgentPaths].sort().join('|')
    )
      throw new Error('Installed Pi specialist provenance is invalid.');
    for (const relativePath of expectedAgentPaths) {
      const path = join(input.packageRoot, 'pi', relativePath);
      if (
        !existsSync(path) ||
        !lstatSync(path).isFile() ||
        lstatSync(path).isSymbolicLink() ||
        sha256(path) !== assets.files[relativePath]
      )
        throw new Error(
          `Installed Pi specialist asset is missing, symlinked, or stale: ${relativePath}`,
        );
    }
    for (const skill of THOTH_OWNED_SKILL_NAMES) {
      const path = join(input.packageRoot, 'skills', skill, 'SKILL.md');
      if (
        !existsSync(path) ||
        !lstatSync(path).isFile() ||
        lstatSync(path).isSymbolicLink()
      )
        throw new Error(
          `Installed Pi manifest skill is missing or symlinked: ${skill}`,
        );
    }
    const manifestSha256 = sha256(manifestPath);
    const extensionSha256 = sha256(extensionPath);
    // Pi supplies native peer modules through its extension loader. A bare
    // Node import is not a valid loadability check for a native extension;
    // the receipt-bound real-Pi observation below must prove successful loading.
    const observation = observePiNativeRoot({
      extensionPath,
      manifestSha256,
      extensionSha256,
    });
    if (observation.state !== 'observed-at-install')
      throw new Error(observation.basis.join('; '));
    return {
      success: true,
      receipt: {
        schemaVersion: 1,
        owner: 'thoth-agents',
        scope: 'user',
        packageName: 'thoth-agents',
        source: input.source,
        installSource: input.installSource,
        version: input.version,
        manifestSha256,
        extensionSha256,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(path: string): Record<string, unknown> {
  assertSafePiManagedPath(path);
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object.`);
  return parsed;
}

export function isPiIncumbentDelegationSource(source: string): boolean {
  return /^npm:pi-subagents(?:-j0k3r)?(?:@|$)/.test(source);
}

export function getPiExternalPackageSpecs(
  options: Pick<PiSetupOptions, 'runtimePackageRoot'> = {},
): readonly PiSetupPackageSpec[] {
  const runtimePackageRoot = options.runtimePackageRoot;
  if (!runtimePackageRoot) return PI_PACKAGE_SPECS;
  return PI_PACKAGE_SPECS.map((spec) =>
    spec.id === 'delegation' ? { ...spec, source: runtimePackageRoot } : spec,
  );
}

function sourceHintsAtPackage(
  source: string,
  spec: PiSetupPackageSpec,
): boolean {
  return source.includes(
    spec.packageName.split('/').at(-1) ?? spec.packageName,
  );
}

function hasPiResourceSelection(value: Record<string, unknown>): boolean {
  return ['prompts', 'skills', 'themes'].some(
    (key) => Array.isArray(value[key]) && value[key].length > 0,
  );
}

export function inspectPiSetupPackage(
  packages: readonly PiConfiguredPackage[],
  spec: PiSetupPackageSpec,
  requireManagedSource = true,
): PiExternalPackageEvidence {
  if (spec.preserveUserCopy) {
    // An unidentified configured copy could be this package under any local,
    // git, or aliased npm source. Never turn unreadable identity into absence.
    const unidentified = packages.find((candidate) => {
      const manifest = configuredPackageManifest(candidate);
      if (typeof manifest?.name === 'string' && manifest.name.trim())
        return false;
      const pi = manifest?.pi;
      const manifestIsResourceOnly =
        isRecord(pi) &&
        (pi.extensions === undefined ||
          (Array.isArray(pi.extensions) && pi.extensions.length === 0)) &&
        hasPiResourceSelection(pi);
      // Preserve the existing resource-only contract, but a target-like source
      // still needs a readable package identity even when extensions are filtered.
      return (
        sourceHintsAtPackage(candidate.source, spec) ||
        (!candidate.resourceOnly && !manifestIsResourceOnly)
      );
    });
    if (unidentified)
      return {
        state: 'drift',
        source: unidentified.source,
        installedPath: unidentified.installedPath,
        reason: `installed manifest identity is unavailable for ${unidentified.source}${unidentified.installedPath ? ` at ${unidentified.installedPath}` : ''}`,
      };
  }
  return inspectPiExternalPackage(
    packages,
    spec,
    requireManagedSource && !spec.preserveUserCopy,
  );
}

function piPreservedPackageRecovery(
  spec: PiSetupPackageSpec,
  evidence: PiExternalPackageEvidence,
): string | undefined {
  if (!spec.preserveUserCopy || evidence.state !== 'drift') return undefined;
  const diagnostic = `Cannot preserve and verify ${spec.packageName}: ${evidence.reason}. Existing copies are left untouched.`;
  if (evidence.version && evidence.source)
    return `${diagnostic} Upgrade this copy to >=${spec.version} (for local/git sources, upgrade the checkout), or review its ownership and switch with: pi remove ${evidence.source} --no-approve, then pi install ${spec.source} --no-approve. Verify with pi list --no-approve and the installed manifest, then rerun setup.`;
  return `${diagnostic} Inspect pi list --no-approve and the configured package manifests; resolve the package identity or source ambiguity, then rerun setup.`;
}

const PI_INCUMBENT_TODO_NAME = '@juicesharp/rpiv-todo';
const PI_INCUMBENT_QUESTIONS_NAME = '@juicesharp/rpiv-ask-user-question';

function piQuestionSourceName(source: string): string | undefined {
  if (!source.startsWith('npm:')) return undefined;
  const spec = source.slice(4).trim();
  const alias = spec.indexOf('@npm:');
  const target = alias >= 0 ? spec.slice(alias + 5) : spec;
  return target.match(/^(@[^/@\s]+\/[^/@\s]+|[^/@\s]+)(?:@.+)?$/)?.[1];
}

function findPiIncumbentQuestions(
  packages: readonly PiConfiguredPackage[],
): PiConfiguredPackage[] {
  return packages.filter(
    (candidate) =>
      piQuestionSourceName(candidate.source) === PI_INCUMBENT_QUESTIONS_NAME ||
      configuredPackageIdentity(candidate).packageName ===
        PI_INCUMBENT_QUESTIONS_NAME,
  );
}

function piQuestionIdentityBlockers(
  packages: readonly PiConfiguredPackage[],
  plan?: PiSetupPlan,
): string[] {
  return packages.flatMap((candidate) => {
    const manifest = configuredPackageManifest(candidate);
    if (typeof manifest?.name === 'string' && manifest.name) return [];
    const npmSource = candidate.source.startsWith('npm:');
    const questionSource =
      /(?:^|[\\/:@?#._-])rpiv-ask-user-question(?:$|[\\/:@?#._-])/i.test(
        candidate.source,
      );
    const unresolvedNpmLocation = npmSource && !candidate.installedPath;
    const unresolvedAlias =
      npmSource &&
      candidate.source.includes('@npm:') &&
      !piQuestionSourceName(candidate.source);
    // A previously identified local/git incumbent remains relevant even if
    // its manifest disappears between preview and any apply-time inspection.
    const previewedQuestion =
      candidate.scope === 'user' &&
      plan?.items.some(
        ({ command }) =>
          command?.command === 'pi' &&
          command.args[0] === 'remove' &&
          command.args[1] === candidate.source &&
          command.args[2] === '--no-approve',
      );
    if (manifest && !previewedQuestion) return [];
    if (
      !questionSource &&
      !unresolvedNpmLocation &&
      !unresolvedAlias &&
      !previewedQuestion
    )
      return [];
    const flags =
      candidate.scope === 'project' ? '--local --approve' : '--no-approve';
    return [
      `Cannot verify configured Pi package ${candidate.source}: installed manifest identity is unavailable. Review its ownership and inspect its package.json using pi list; if it is ${PI_INCUMBENT_QUESTIONS_NAME}, manually run pi remove ${candidate.source} ${flags}. Verify removal, then rerun setup preview.`,
    ];
  });
}

function piUnpreviewedQuestionRecovery(
  plan: PiSetupPlan,
  packages: readonly PiConfiguredPackage[],
): string | undefined {
  const previewed = new Set(
    plan.items.flatMap(({ command }) =>
      command?.command === 'pi' &&
      command.args[0] === 'remove' &&
      command.args[2] === '--no-approve'
        ? [command.args[1]]
        : [],
    ),
  );
  const unpreviewed = packages.filter(
    ({ scope, source }) => scope === 'user' && !previewed.has(source),
  );
  if (unpreviewed.length === 0) return undefined;
  return unpreviewed
    .map(
      ({ source }) =>
        `Pi question migration blocked: incumbent ${source} was not previewed for removal. Review its ownership, then manually run: pi remove ${source} --no-approve. Verify with pi list, then rerun setup preview; no unpreviewed incumbent may be removed automatically.`,
    )
    .join('\n');
}

function piProjectQuestionConflict(candidate: PiConfiguredPackage): string {
  const source = candidate.unmappedSource ? '<source>' : candidate.source;
  return `Incumbent Pi question package ${candidate.source} conflicts with @thoth-agents/pi-questions-user. ${candidate.identityLimitation ? `${candidate.identityLimitation} ` : ''}Review the project's ownership and trust first; --approve trusts project-local settings for this command only without saving a trust decision. ${candidate.unmappedSource ? 'Find the matching project settings entry, then' : 'Then'} run: pi remove ${source} --local --approve. Verify removal, then rerun setup.`;
}

function isPiIncumbentTodoSource(source: string): boolean {
  return /^npm:@juicesharp\/rpiv-todo(?:@|$)/.test(source);
}

export function piIncumbentTodoRecovery(
  source: string,
  scope: PiConfiguredPackage['scope'],
  identityLimitation?: string,
  unmappedSource = false,
): string {
  const flags = scope === 'project' ? '--local --approve' : '--no-approve';
  const review =
    scope === 'project'
      ? "Review the project's ownership and trust first; --approve trusts project-local settings for this command only without saving a trust decision. Then run:"
      : 'Review its ownership, then run:';
  const localRecovery = unmappedSource
    ? ' Find the matching project settings entry; after reviewing its ownership, remove it with: pi remove <source> --local --approve.'
    : isPiIncumbentTodoSource(source)
      ? ''
      : ` For the actual configured source, run: pi remove ${source} ${flags}.`;
  return `${identityLimitation ? `${identityLimitation} ` : ''}${review} pi remove npm:${PI_INCUMBENT_TODO_NAME} ${flags}.${localRecovery} Verify with pi list, then rerun setup.`;
}

function configuredPackageSources(settings: Record<string, unknown>): string[] {
  if (!Array.isArray(settings.packages)) return [];
  return settings.packages.flatMap((entry: unknown) => {
    const source =
      typeof entry === 'string'
        ? entry
        : isRecord(entry) && typeof entry.source === 'string'
          ? entry.source
          : undefined;
    return source ? [source] : [];
  });
}

function configuredPackageSource(
  settings: Record<string, unknown>,
  matches: (source: string) => boolean,
): string | undefined {
  return configuredPackageSources(settings).find(matches);
}

function projectLocalPackagePath(
  source: string,
  projectRoot: string,
  homeDir: string,
): string {
  let path = source.trim();
  if (
    process.platform === 'win32' &&
    !path.startsWith('//') &&
    !path.includes('\\')
  ) {
    const drivePath = path.match(
      /^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i,
    );
    if (drivePath)
      path = `${drivePath[1]?.toUpperCase()}:\\${drivePath[2]?.replaceAll('/', '\\') ?? ''}`;
  }
  if (path === '~') path = homeDir;
  else if (
    path.startsWith('~/') ||
    (process.platform === 'win32' && path.startsWith('~\\'))
  )
    path = join(homeDir, path.slice(2));
  else if (path.startsWith('file://')) path = fileURLToPath(path);
  return resolve(projectRoot, path);
}

// Pi SDK 1.0.2 dist/core/package-manager.js: getInstalledPath,
// parseNpmSpec, getNpmInstallPath/getLegacyGlobalNpmInstallPath and
// getPackageManagerName. Ported because the exported DefaultPackageManager
// requires project trust, has no injectable command boundary, and is dev-only.
// Only offline root/list metadata queries are allowed here; never resolve
// resources, install packages, run hooks, or trust project configuration.
function legacyPiNpmPackagePath(
  name: string,
  settings: Record<string, unknown>,
  execute: PiCommandExecutor,
): string | undefined {
  try {
    const commandParts =
      settings.npmCommand === undefined ? ['npm'] : settings.npmCommand;
    // Metadata inspection must never execute configured install/exec prefixes
    // or wrappers, including during preview. Only a plain manager is safe.
    if (
      !Array.isArray(commandParts) ||
      commandParts.length !== 1 ||
      typeof commandParts[0] !== 'string'
    )
      return undefined;
    const command = commandParts[0];
    // npm/pnpm command shims use a shell on Windows; reject shell expressions
    // even when their final path component looks like a manager binary.
    if (/[\0\r\n&|<>^%"'`$;!]/.test(command)) return undefined;
    const manager = basename(command).replace(/\.(cmd|exe)$/i, '');
    if (!['npm', 'pnpm', 'bun'].includes(manager)) return undefined;
    // Distinguish paths with spaces from flattened command prefixes.
    if (
      /\s/.test(command) &&
      !statSync(command, { throwIfNoEntry: false })?.isFile()
    )
      return undefined;
    const query = (args: string[]) => {
      const result = execute(command, args);
      if (result.error || result.exitCode !== 0)
        throw new Error('Package metadata unavailable');
      return (result.stdout || result.stderr).trim();
    };
    if (manager === 'pnpm') {
      const entries: unknown = JSON.parse(query(['list', '-g', '--json']));
      if (!Array.isArray(entries)) return undefined;
      for (const entry of entries) {
        const dependencies = isRecord(entry) ? entry.dependencies : undefined;
        const dependency = isRecord(dependencies)
          ? dependencies[name]
          : undefined;
        if (
          isRecord(dependency) &&
          typeof dependency.path === 'string' &&
          dependency.path
        )
          return dependency.path;
      }
      return undefined;
    }
    const root =
      manager === 'bun'
        ? join(
            dirname(query(['pm', 'bin', '-g'])),
            'install',
            'global',
            'node_modules',
          )
        : query(['root', '-g']);
    return root ? join(root, name) : undefined;
  } catch {
    return undefined;
  }
}

function parsePiPackageSource(source: string, baseDir: string) {
  // SDK parseSource: npm prefix, then local-path precedence in the mirrored
  // Git parser, then arbitrary text falls back to a local source.
  if (source.startsWith('npm:')) {
    const spec = source.slice(4).trim();
    const name = spec.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/)?.[1] ?? spec;
    return { type: 'npm' as const, name };
  }
  const gitPath = projectGitPackagePath(source, baseDir);
  return gitPath
    ? { type: 'git' as const, path: gitPath }
    : { type: 'local' as const, path: source };
}

function resolvePiPackage(
  candidate: PiConfiguredPackage,
  options: PiSetupOptions,
  userSettings: Record<string, unknown>,
): PiConfiguredPackage {
  const declaration = Array.isArray(userSettings.packages)
    ? userSettings.packages.find(
        (entry: unknown) =>
          isRecord(entry) && entry.source === candidate.source,
      )
    : undefined;
  const resourceOnly =
    isRecord(declaration) &&
    Array.isArray(declaration.extensions) &&
    declaration.extensions.length === 0 &&
    hasPiResourceSelection(declaration);
  candidate = { ...candidate, resourceOnly };
  // pi list reports paths from DefaultPackageManager.getInstalledPath. Reuse
  // that native resolution when present, but reread its manifest on every
  // inspection; settings-only planning uses the same SDK algorithm below.
  if (candidate.installedPath) return candidate;
  const paths = resolvePiPaths(options);
  const baseDir =
    candidate.scope === 'user'
      ? paths.piRoot
      : join(resolve(options.cwd ?? process.cwd()), '.pi');
  const parsed = parsePiPackageSource(candidate.source, baseDir);
  const npmName = parsed.type === 'npm' ? parsed.name : undefined;
  let path = npmName
    ? join(baseDir, 'npm', 'node_modules', npmName)
    : parsed.type === 'git'
      ? parsed.path
      : projectLocalPackagePath(candidate.source, baseDir, paths.homeDir);
  if (npmName && candidate.scope === 'user' && !existsSync(path))
    path =
      legacyPiNpmPackagePath(
        npmName,
        userSettings,
        options.commandExecutor ?? defaultCommandExecutor,
      ) ?? path;
  return {
    ...candidate,
    installedPath: existsSync(path) ? path : candidate.installedPath,
  };
}

function resolvePiConfiguredPackages(
  settings: Record<string, unknown>,
  scope: PiConfiguredPackage['scope'],
  options: PiSetupOptions,
): PiConfiguredPackage[] {
  return configuredPackageSources(settings).map((source) =>
    resolvePiPackage({ scope, source }, options, settings),
  );
}

function resolvePiListedPackages(
  output: string,
  options: PiSetupOptions,
): PiConfiguredPackage[] {
  const packages = parsePiPackageList(output);
  const paths = resolvePiPaths(options);
  const settings = readJsonObject(paths.settingsPath);
  const projectRoot = join(resolve(options.cwd ?? process.cwd()), '.pi');
  let projectSettings: Record<string, unknown> | undefined;
  for (const { scope, source, installedPath } of packages) {
    const baseDir = scope === 'user' ? paths.piRoot : projectRoot;
    if (parsePiPackageSource(source, baseDir).type !== 'local') continue;
    // The SDK also parses free-form diagnostics as local paths. Match local
    // entries against scoped inventory, or, when it is unavailable, require the
    // absolute directory from pi list's indented installed-path line.
    let inventory = settings;
    if (scope === 'project') {
      projectSettings ??= readJsonObject(join(projectRoot, 'settings.json'));
      inventory = projectSettings;
    }
    if (
      !configuredPackageSources(inventory).includes(source) &&
      (Array.isArray(inventory.packages) ||
        !installedPath ||
        !isAbsolute(installedPath))
    )
      throw new Error(
        `Pi package manifest identity cannot be verified: malformed pi list source ${source}. Rerun pi list --no-approve and inspect the configured sources before setup.`,
      );
  }
  return packages.map((candidate) => {
    if (candidate.scope === 'project')
      projectSettings ??= readJsonObject(join(projectRoot, 'settings.json'));
    return resolvePiPackage(
      candidate,
      options,
      candidate.scope === 'project' ? (projectSettings ?? {}) : settings,
    );
  });
}

function readPiProjectPackages(options: PiPathOptions): PiConfiguredPackage[] {
  const projectRoot = join(resolve(options.cwd ?? process.cwd()), '.pi');
  return resolvePiConfiguredPackages(
    readJsonObject(join(projectRoot, 'settings.json')),
    'project',
    options,
  );
}

export function resolvePiPreservationPackages(
  output: string,
  options: PiSetupOptions,
): PiConfiguredPackage[] {
  const listed = resolvePiListedPackages(output, options);
  const paths = resolvePiPaths(options);
  const configured = [
    ...resolvePiConfiguredPackages(
      readJsonObject(paths.settingsPath),
      'user',
      options,
    ),
    ...readPiProjectPackages(options),
  ];
  // pi list may omit a broken configured source. Retain scoped declarations
  // so a disappeared/unreadable copy cannot be misclassified as absent.
  return [
    ...listed,
    ...configured.filter(
      (candidate) =>
        !listed.some(
          ({ scope, source }) =>
            scope === candidate.scope && source === candidate.source,
        ),
    ),
  ];
}

function scanPiProjectInstalledIncumbents(
  options: PiPathOptions,
  configuredPackages: readonly PiConfiguredPackage[],
): PiConfiguredPackage[] {
  const projectRoot = join(resolve(options.cwd ?? process.cwd()), '.pi');
  const incumbents: PiConfiguredPackage[] = [];
  const visited = new Set<string>();
  const pathKey = (path: string) =>
    process.platform === 'win32' ? path.toLowerCase() : path;
  const knownPaths = new Set(
    configuredPackages.flatMap(({ installedPath }) =>
      installedPath ? [pathKey(realpathSync(installedPath))] : [],
    ),
  );
  // SDK 1.0.2 dist/core/package-manager.js:getGitInstallRoot/getNpmInstallRoot.
  // Inspect only filesystem data, including orphaned/renamed packages; never
  // resolve extensions, execute npm hooks, or invoke the project-trust gate.
  for (const root of [join(projectRoot, 'git'), join(projectRoot, 'npm')]) {
    if (!existsSync(root)) continue;
    const rootKey = pathKey(realpathSync(root));
    const pending = [root];
    while (pending.length > 0) {
      const path = pending.pop();
      if (!path || !statSync(path, { throwIfNoEntry: false })?.isDirectory())
        continue;
      const key = pathKey(realpathSync(path));
      if (visited.has(key)) continue;
      visited.add(key);
      const manifestPath = join(path, 'package.json');
      if (existsSync(manifestPath) && statSync(manifestPath).isFile()) {
        const candidate: PiConfiguredPackage = {
          scope: 'project',
          source: path,
          installedPath: path,
          unmappedSource: true,
        };
        const identity = configuredPackageIdentity(candidate);
        if (
          (identity.packageName === PI_INCUMBENT_TODO_NAME ||
            identity.packageName === PI_INCUMBENT_QUESTIONS_NAME) &&
          !knownPaths.has(key)
        )
          incumbents.push({
            ...candidate,
            ...identity,
            identityLimitation: `Installed manifest at ${path} identifies ${identity.packageName}, but no configured settings source maps to this directory.`,
          });
      }
      // Read a linked package's manifest, but do not walk links outside the
      // install root. Canonical visited paths also prevent in-root link cycles.
      if (key !== rootKey && !key.startsWith(`${rootKey}${sep}`)) continue;
      for (const entry of readdirSync(path, { withFileTypes: true }))
        if (entry.isDirectory() || entry.isSymbolicLink())
          pending.push(join(path, entry.name));
    }
  }
  return incumbents;
}

export function mergePiSubagentsConfig(
  current: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...current,
    session_resources: 'lean',
    enable_continue: false,
  };
}

export function mergePiGrepMcpConfig(
  current: Record<string, unknown>,
): Record<string, unknown> {
  const rawServers = current.mcpServers;
  if (rawServers !== undefined && !isRecord(rawServers)) {
    throw new Error('Global MCP mcpServers must be a JSON object.');
  }
  const servers = isRecord(rawServers) ? rawServers : {};
  const existing = servers.grep;
  if (
    existing !== undefined &&
    JSON.stringify(existing) !== JSON.stringify(PI_GREP_MCP_ENTRY)
  ) {
    throw new Error(
      'Global MCP server "grep" is not owned by thoth-agents and conflicts with the required grep.app entry.',
    );
  }
  return {
    ...current,
    mcpServers: { ...servers, grep: { ...PI_GREP_MCP_ENTRY } },
  };
}

export function mergePiRootBlock(
  current: string,
  managedBlock: string,
): string {
  const start = current.indexOf(PI_ROOT_START);
  const end = current.indexOf(PI_ROOT_END);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    throw new Error(
      'Pi APPEND_SYSTEM.md has an incomplete thoth-agents marker block.',
    );
  }
  if (start === -1) {
    const prefix =
      current.length === 0 || current.endsWith('\n') ? current : `${current}\n`;
    return `${prefix}${managedBlock}`;
  }
  const after = end + PI_ROOT_END.length;
  const suffix = current.slice(after).replace(/^\r?\n/, '');
  return `${current.slice(0, start)}${managedBlock}${suffix}`;
}

function frontmatterValue(content: string, field: string): string | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return undefined;
  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  );
  if (end === -1) return undefined;
  const prefix = `${field}:`;
  const line = lines
    .slice(1, end)
    .find((candidate) => candidate.startsWith(prefix));
  if (!line) return undefined;
  const value = line.slice(prefix.length).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim();
  }
  return value || undefined;
}

function findAgentConflicts(paths: PiPaths): string[] {
  const canonical = new Set(PI_SPECIALIST_ROLES.map(piSpecialistName));
  const conflicts: string[] = [];
  for (const root of [paths.agentsRoot, paths.alternateAgentsRoot]) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!name.endsWith('.md')) continue;
      const path = join(root, name);
      const content = readFileSync(path, 'utf8');
      const role = frontmatterValue(content, 'name');
      const filenameRole = name.slice(0, -'.md'.length).toLowerCase();
      const canonicalRole =
        role && canonical.has(role as never)
          ? role
          : canonical.has(filenameRole as never)
            ? filenameRole
            : undefined;
      if (
        canonicalRole &&
        frontmatterValue(content, 'managed-by') !== PI_MANAGED_OWNER
      ) {
        conflicts.push(
          `${path} defines canonical specialist ${canonicalRole} without thoth-agents ownership.`,
        );
      }
    }
  }
  return conflicts;
}

export function buildPiSetupPlan(options: PiSetupOptions = {}): PiSetupPlan {
  const paths = resolvePiPaths(options);
  let packageRoot: string;
  let expectedVersion: string;
  try {
    packageRoot = packageRootFor(options);
    expectedVersion = options.expectedVersion ?? packageVersionFor(packageRoot);
  } catch {
    packageRoot = options.packageRoot ?? '';
    expectedVersion = options.expectedVersion ?? '';
  }
  const blockers: string[] = [];
  const diagnostics: string[] = [];
  if (!paths.skillsDestinationCompatible) {
    blockers.push(
      `PI_CODING_AGENT_DIR resolves to ${paths.piRoot}, but the required skills CLI targets ${paths.defaultPiRoot}. Remove the override or install the four external skills manually into ${paths.ownedSkillsRoot}.`,
    );
  }
  blockers.push(...findAgentConflicts(paths));
  if (options.runtimePackageRoot) {
    const runtimeRoot = options.runtimePackageRoot;
    const spec = getPiExternalPackageSpecs(options)[0];
    const sourceIsNormalizedAbsolutePath =
      isAbsolute(runtimeRoot) && resolve(runtimeRoot) === runtimeRoot;
    const inspection = sourceIsNormalizedAbsolutePath
      ? inspectPiExternalPackage(
          [{ scope: 'user', source: runtimeRoot, installedPath: runtimeRoot }],
          spec,
        )
      : undefined;
    if (inspection?.state !== 'installed') {
      blockers.push(
        `Local Pi delegation runtime root ${runtimeRoot} is invalid: ${
          inspection?.reason ?? 'the source must be a normalized absolute path'
        }.`,
      );
    }
  }
  let userPackages: PiConfiguredPackage[] = [];
  let plannedQuestionRemovals: PiConfiguredPackage[] = [];
  let subagentsConfigContent: string | undefined;
  let mcpContent: string | undefined;
  try {
    const userSettings = readJsonObject(paths.settingsPath);
    const incumbentSource = configuredPackageSource(
      userSettings,
      isPiIncumbentDelegationSource,
    );
    const incumbentBlockers: string[] = [];
    if (incumbentSource)
      incumbentBlockers.push(
        `Incumbent delegation runtime ${incumbentSource} is configured in ${paths.settingsPath}. Review its ownership, then run: pi remove ${incumbentSource} --no-approve. Rerun setup after removing it; ${PI_PACKAGE_SPECS[0].source} cannot be loaded beside it.`,
      );
    const incumbentTodoSource = configuredPackageSource(
      userSettings,
      isPiIncumbentTodoSource,
    );
    if (incumbentTodoSource)
      incumbentBlockers.push(
        `Incumbent Pi task-list package ${incumbentTodoSource} is configured in ${paths.settingsPath} and conflicts with @thoth-agents/pi-todo. ${piIncumbentTodoRecovery(incumbentTodoSource, 'user')}`,
      );
    if (incumbentBlockers.length > 0)
      throw new Error(incumbentBlockers.join('\n'));
    userPackages = resolvePiConfiguredPackages(userSettings, 'user', options);
    blockers.push(...piQuestionIdentityBlockers(userPackages));
    plannedQuestionRemovals = findPiIncumbentQuestions(userPackages);
    subagentsConfigContent = `${JSON.stringify(
      mergePiSubagentsConfig(readJsonObject(paths.subagentsConfigPath)),
      null,
      2,
    )}\n`;
    mcpContent = `${JSON.stringify(
      mergePiGrepMcpConfig(readJsonObject(paths.mcpConfigPath)),
      null,
      2,
    )}\n`;
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }
  const projectSettingsPath = join(
    resolve(options.cwd ?? process.cwd()),
    '.pi',
    'settings.json',
  );
  let projectPackages: PiConfiguredPackage[] = [];
  try {
    projectPackages = readPiProjectPackages(options);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }
  try {
    // Scan independently so malformed/missing settings cannot hide installed
    // incumbents from status. Inspection failures still block mutation.
    projectPackages.push(
      ...scanPiProjectInstalledIncumbents(options, projectPackages),
    );
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }
  blockers.push(...piQuestionIdentityBlockers(projectPackages));
  // Preview inspects installed directories and target-source hints; the
  // authoritative apply-time inspection also retains unresolved declarations.
  for (const pkg of getPiExternalPackageSpecs(options)) {
    if (!pkg.preserveUserCopy) continue;
    const recovery = piPreservedPackageRecovery(
      pkg,
      inspectPiSetupPackage(
        [...userPackages, ...projectPackages].filter(
          ({ source, installedPath }) =>
            installedPath !== undefined || sourceHintsAtPackage(source, pkg),
        ),
        pkg,
      ),
    );
    if (recovery) blockers.push(recovery);
  }
  const projectIncumbentTodos = findPiIncumbentTodos(projectPackages);
  for (const incumbent of projectIncumbentTodos) {
    const location = incumbent.unmappedSource
      ? 'was found in the project install roots'
      : `is configured in ${projectSettingsPath}`;
    const recovery = piIncumbentTodoRecovery(
      incumbent.source,
      'project',
      incumbent.identityLimitation,
      incumbent.unmappedSource,
    );
    blockers.push(
      `Incumbent Pi task-list package ${incumbent.source} ${location} and conflicts with @thoth-agents/pi-todo. ${recovery}`,
    );
  }
  for (const incumbent of findPiIncumbentQuestions(projectPackages))
    blockers.push(piProjectQuestionConflict(incumbent));
  for (const path of [...paths.projectAgentRoots, ...paths.projectMcpPaths]) {
    if (existsSync(path))
      diagnostics.push(
        `Project-local Pi resource may shadow global managed state: ${path}`,
      );
  }
  const rendered = piAdapter.render({
    projectRoot: options.cwd ?? process.cwd(),
  });
  if (!expectedVersion || !packageRoot)
    blockers.push(
      'The executing thoth-agents package identity is unavailable.',
    );
  const firstPartySource =
    options.firstPartySource ?? getPiFirstPartySource(expectedVersion);
  const items: PiSetupPlanItem[] = [
    {
      kind: 'preflight',
      description: `Verify Node.js >=22.19 and Pi >=${PI_MINIMUM_VERSION} before mutation`,
      target: 'node/pi runtime',
    },
    {
      kind: 'package',
      description: `Install and verify first-party native Pi package ${firstPartySource}`,
      target: firstPartySource,
      command: {
        command: 'pi',
        args: ['install', firstPartySource, '--no-approve'],
      },
    },
    ...plannedQuestionRemovals.map(({ source }) => ({
      kind: 'preflight' as const,
      description:
        'Remove the conflicting user question provider through native Pi removal after root-package verification',
      target: source,
      command: { command: 'pi', args: ['remove', source, '--no-approve'] },
    })),
    ...getPiExternalPackageSpecs(options).map((pkg) => ({
      kind: 'package' as const,
      description: pkg.preserveUserCopy
        ? `Install Pi package ${pkg.source} if absent; otherwise preserve and verify its user copy`
        : `Install and verify Pi package ${pkg.source}`,
      target: pkg.source,
      command: { command: 'pi', args: ['install', pkg.source, '--no-approve'] },
    })),
    ...(subagentsConfigContent === undefined
      ? []
      : [
          {
            kind: 'settings' as const,
            description:
              'Configure global subagent lean resources and disable continuation',
            target: paths.subagentsConfigPath,
            content: subagentsConfigContent,
          },
        ]),
    ...(mcpContent === undefined
      ? []
      : [
          {
            kind: 'mcp' as const,
            description: 'Merge attributable global grep.app MCP entry',
            target: paths.mcpConfigPath,
            content: mcpContent,
          },
        ]),
    ...rendered.artifacts
      .filter((artifact) => artifact.kind === 'agent-config')
      .map((artifact) => ({
        kind: 'agent' as const,
        description: artifact.description ?? `Install ${artifact.path}`,
        target: join(paths.piRoot, artifact.path),
        content: String(artifact.content),
      })),
  ];
  return {
    dryRun: options.dryRun ?? false,
    ready: blockers.length === 0,
    paths,
    items,
    blockers,
    diagnostics,
    projectIncumbentTodos,
    disclaimers: [
      "Pi extensions execute with the invoking user's system permissions; package minimums and tool allowlists are not a security sandbox.",
      'Context7 and web access are native Pi extensions; only grep.app uses pi-mcp-adapter and directTools is intentionally omitted.',
      'Project-local resources require Pi trust and may shadow global resources.',
      'Global subagents.json requests lean session resources; project-local subagents.json may override it, and full child resource mode is unsupported.',
    ],
    options: { ...options, expectedVersion, packageRoot, firstPartySource },
  };
}

export function formatPiSetupPlan(plan: PiSetupPlan): string {
  return [
    'Pi setup plan:',
    ...plan.items.map((item) =>
      item.command
        ? `- ${item.kind}: ${item.command.command} ${item.command.args.join(' ')}`
        : `- ${item.kind}: ${item.target}`,
    ),
    ...plan.blockers.map((blocker) => `- BLOCKED: ${blocker}`),
  ].join('\n');
}

export function isVersionAtLeast(actual: string, expected: string): boolean {
  const parts = (value: string) =>
    value
      .replace(/^v/, '')
      .split('.')
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10));
  const left = parts(actual);
  const right = parts(expected);
  if (left.some(Number.isNaN) || right.some(Number.isNaN)) return false;
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function hasExactInstalledPiPackage(
  output: string,
  source: string,
): boolean {
  return output.split(/\r?\n/).some((line) => line.trim() === source);
}

export interface PiConfiguredPackage {
  scope: 'user' | 'project';
  source: string;
  installedPath?: string;
  packageName?: string;
  packageVersion?: string;
  identityLimitation?: string;
  /** Scoped settings explicitly disable extensions and select only resources. */
  resourceOnly?: boolean;
  /** Directory-only evidence; source is a display path, not a removal source. */
  unmappedSource?: boolean;
}

export function parsePiPackageList(output: string): PiConfiguredPackage[] {
  const packages: PiConfiguredPackage[] = [];
  let scope: PiConfiguredPackage['scope'] = 'user';
  for (const line of output.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value === 'No packages installed.') continue;
    if (value === 'User packages:') {
      scope = 'user';
      continue;
    }
    if (value === 'Project packages:') {
      scope = 'project';
      continue;
    }
    const previous = packages.at(-1);
    if (/^\s{4,}\S/.test(line) && previous && !previous.installedPath) {
      previous.installedPath = value;
      continue;
    }
    packages.push({ scope, source: value.replace(/ \(filtered\)$/, '') });
  }
  return packages;
}

export interface PiIncumbentDelegation {
  candidate: PiConfiguredPackage;
  classification: 'confirmed' | 'ambiguous';
  reason: string;
}

function npmPackageName(source: string): string | undefined {
  if (!source.startsWith('npm:')) return undefined;
  const spec = source.slice('npm:'.length);
  const separator = spec.lastIndexOf('@');
  return separator <= 0 ? spec || undefined : spec.slice(0, separator);
}

const incumbentDelegationNames = new Set([
  'pi-subagents',
  'pi-subagents-j0k3r',
]);

function isPiLocalOrGitSource(source: string): boolean {
  return /^(?:git\+|https?:\/\/|ssh:\/\/|git@|github:|file:|\.\.?[\\/]|[a-z]:[\\/]|\/)/i.test(
    source,
  );
}

function sourceSuggestsIncumbentDelegation(source: string): boolean {
  if (!isPiLocalOrGitSource(source)) return false;
  return /(?:^|[\\/:@?#._-])pi-subagents(?:-j0k3r)?(?:$|[\\/:@?#._-])/i.test(
    source,
  );
}

export function findPiIncumbentDelegation(
  packages: readonly PiConfiguredPackage[],
): PiIncumbentDelegation | undefined {
  for (const candidate of packages) {
    const sourceName = npmPackageName(candidate.source);
    const { packageName: installedName } = configuredPackageIdentity(candidate);
    if (installedName && incumbentDelegationNames.has(installedName)) {
      return {
        candidate,
        classification: 'confirmed',
        reason: `installed manifest identifies ${installedName}`,
      };
    }
    if (sourceName && incumbentDelegationNames.has(sourceName)) {
      return {
        candidate,
        classification: 'ambiguous',
        reason: installedName
          ? `source names ${sourceName}, but its installed manifest identifies ${installedName}`
          : `source names ${sourceName}, but its installed manifest is unavailable`,
      };
    }
    if (
      !installedName &&
      !sourceName &&
      sourceSuggestsIncumbentDelegation(candidate.source)
    ) {
      return {
        candidate,
        classification: 'ambiguous',
        reason:
          'the source suggests an incumbent, but its manifest is unavailable',
      };
    }
  }
  return undefined;
}

export function findPiIncumbentTodos(
  packages: readonly PiConfiguredPackage[],
): PiConfiguredPackage[] {
  const incumbents: PiConfiguredPackage[] = [];
  for (const candidate of packages) {
    const { packageName: installedName } = configuredPackageIdentity(candidate);
    const matches =
      installedName === PI_INCUMBENT_TODO_NAME ||
      isPiIncumbentTodoSource(candidate.source) ||
      (!installedName &&
        !npmPackageName(candidate.source) &&
        (isPiLocalOrGitSource(candidate.source) ||
          candidate.scope === 'project') &&
        /(?:^|[\\/:@?#._-])rpiv-todo(?:$|[\\/:@?#._-])/i.test(
          candidate.source,
        ));
    if (!matches) continue;
    incumbents.push(
      candidate.scope === 'project' && !installedName
        ? {
            ...candidate,
            identityLimitation:
              'Project package manifest identity is unavailable; detection relies on its source and read-only inspection cannot confirm its installed identity.',
          }
        : candidate,
    );
  }
  return incumbents;
}

export function piIncumbentDelegationRecovery(
  incumbent: PiIncumbentDelegation,
): string {
  const source = incumbent.candidate.source;
  const inspectManifest = incumbent.candidate.installedPath
    ? ` Inspect the installed manifest at ${incumbent.candidate.installedPath}.`
    : ' Inspect the package manifest through Pi’s package directory.';
  return incumbent.classification === 'confirmed'
    ? `Review its ownership, then run: pi remove ${source} --no-approve. Rerun setup after verifying it is removed.`
    : `${incumbent.reason}.${inspectManifest} If it is an incumbent delegation runtime, run: pi remove ${source} --no-approve. Verify with pi list, then rerun setup.`;
}

export function isThothPackageLocation(
  candidate: PiConfiguredPackage,
  knownSource?: string,
): boolean {
  if (
    candidate.source === knownSource ||
    /^npm:thoth-agents@/.test(candidate.source)
  )
    return true;
  if (!candidate.installedPath) return false;
  try {
    const manifest = JSON.parse(
      readFileSync(join(candidate.installedPath, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    return manifest.name === 'thoth-agents';
  } catch {
    return false;
  }
}

function configuredPackageManifest(
  candidate: PiConfiguredPackage,
): Record<string, unknown> | undefined {
  if (!candidate.installedPath) return undefined;
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(candidate.installedPath, 'package.json'), 'utf8'),
    );
    return isRecord(manifest) ? manifest : undefined;
  } catch {
    return undefined;
  }
}

function configuredPackageIdentity(candidate: PiConfiguredPackage): {
  packageName: string;
  packageVersion: string;
} {
  const manifest = configuredPackageManifest(candidate);
  return {
    packageName: typeof manifest?.name === 'string' ? manifest.name : '',
    packageVersion:
      typeof manifest?.version === 'string' ? manifest.version : '',
  };
}

export function getPiFirstPartyPackages(
  packages: readonly PiConfiguredPackage[],
  knownSource?: string,
): PiConfiguredPackage[] {
  return packages
    .filter((candidate) => isThothPackageLocation(candidate, knownSource))
    .map((candidate) => ({
      ...candidate,
      ...configuredPackageIdentity(candidate),
    }));
}

function matchesInstallSource(
  candidate: PiConfiguredPackage,
  installSource: string,
): boolean {
  return isAbsolute(installSource)
    ? candidate.installedPath !== undefined &&
        piPackagePathsEqual(candidate.installedPath, installSource)
    : candidate.source === installSource;
}

function defaultCommandExecutor(
  command: string,
  args: readonly string[],
): PiCommandResult {
  let executable = command;
  let executableArgs = [...args];
  if (process.platform === 'win32' && command === 'pi') {
    const cli = findPiWindowsCli();
    if (cli) {
      executable = process.execPath;
      executableArgs = [cli, ...args];
    }
  }
  const result = spawnSync(executable, executableArgs, {
    windowsHide: true,
    encoding: 'utf8',
    timeout: PI_COMMAND_TIMEOUT_MS,
    // Like the SDK's cross-spawn, support npm/pnpm's Windows command shims
    // for the offline metadata queries used by package resolution.
    shell:
      process.platform === 'win32' &&
      /^(npm|pnpm)(\.cmd)?$/i.test(basename(executable)),
  });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

export { writePiManagedText } from './pi-managed-write';

export function applyPiSetup(plan: PiSetupPlan): PiApplyResult {
  const diagnostics = [...plan.diagnostics];
  if (!plan.ready)
    return {
      success: false,
      changed: [],
      diagnostics,
      error: plan.blockers.join('\n'),
      failedStep: 'preflight',
      installedPackages: [],
    };
  if (plan.dryRun)
    return { success: true, changed: [], diagnostics, installedPackages: [] };
  const execute = plan.options.commandExecutor ?? defaultCommandExecutor;
  const changed: string[] = [];
  const installedPackages: string[] = [];
  let receiptCommitted = false;
  let configuredPackageRoot: string | undefined;
  let manualRecovery: string | undefined;
  try {
    // Validate every shared configuration surface before package commands mutate
    // the installation. The writer repeats these checks to narrow TOCTOU races.
    for (const path of [
      plan.paths.settingsPath,
      plan.paths.subagentsConfigPath,
      plan.paths.mcpConfigPath,
    ])
      assertSafePiManagedPath(path);

    const node = execute('node', ['--version']);
    if (
      node.exitCode !== 0 ||
      !isVersionAtLeast(node.stdout.trim(), PI_NODE_MINIMUM)
    )
      throw new Error(
        `Node.js >=${PI_NODE_MINIMUM} is required; observed ${node.stdout.trim() || node.stderr.trim() || 'unavailable'}.`,
      );
    const pi = execute('pi', ['--version']);
    if (
      pi.exitCode !== 0 ||
      !isVersionAtLeast(pi.stdout.trim(), PI_MINIMUM_VERSION)
    )
      throw new Error(
        `Pi >=${PI_MINIMUM_VERSION} is required; observed ${pi.stdout.trim() || pi.stderr.trim() || 'unavailable'}.`,
      );

    const desiredSource =
      plan.options.firstPartySource ??
      getPiFirstPartySource(plan.options.expectedVersion ?? '');
    const before = execute('pi', ['list', '--no-approve']);
    if (before.exitCode !== 0)
      throw new Error(
        `Unable to inspect Pi package ownership before mutation: ${before.stderr}`,
      );
    const receiptOptions = {
      homeDir: plan.paths.homeDir,
      env: plan.options.env,
      ...plan.options.receiptOptions,
    };
    const receipt = readPiPackageReceipt(receiptOptions);
    let configuredBefore: PiConfiguredPackage[];
    try {
      configuredBefore = resolvePiListedPackages(before.stdout, plan.options);
    } catch (error) {
      return {
        success: false,
        changed,
        diagnostics,
        error: error instanceof Error ? error.message : String(error),
        failedStep: 'preflight',
        installedPackages,
      };
    }
    const incumbentDelegation = findPiIncumbentDelegation(configuredBefore);
    let configuredProjectPackages: PiConfiguredPackage[];
    try {
      configuredProjectPackages = readPiProjectPackages(plan.options);
      configuredProjectPackages.push(
        ...scanPiProjectInstalledIncumbents(
          plan.options,
          configuredProjectPackages,
        ),
      );
    } catch (error) {
      return {
        success: false,
        changed,
        diagnostics,
        error: error instanceof Error ? error.message : String(error),
        failedStep: 'preflight',
        installedPackages,
      };
    }
    const projectQuestions = findPiIncumbentQuestions([
      ...configuredBefore.filter(({ scope }) => scope === 'project'),
      ...configuredProjectPackages,
    ]);
    if (projectQuestions.length > 0) {
      const recovery = projectQuestions
        .map(piProjectQuestionConflict)
        .join('\n');
      return {
        success: false,
        changed,
        diagnostics,
        error: recovery,
        failedStep: 'preflight',
        installedPackages,
        manualRecovery: recovery,
      };
    }
    const unpreviewedQuestions = piUnpreviewedQuestionRecovery(
      plan,
      findPiIncumbentQuestions(configuredBefore),
    );
    if (unpreviewedQuestions)
      return {
        success: false,
        changed,
        diagnostics,
        error: unpreviewedQuestions,
        failedStep: 'preflight',
        installedPackages,
        manualRecovery: unpreviewedQuestions,
      };
    const incumbentTodos = findPiIncumbentTodos([
      ...configuredBefore,
      ...configuredProjectPackages,
    ]);
    if (incumbentDelegation || incumbentTodos.length > 0) {
      const incumbentBlockers: string[] = [];
      const recovery: string[] = [];
      if (incumbentDelegation) {
        incumbentBlockers.push(
          `Pi delegation runtime preflight blocked ${incumbentDelegation.candidate.source}: ${incumbentDelegation.reason}. Loading it beside ${PI_PACKAGE_SPECS[0].source} is unsupported.`,
        );
        recovery.push(piIncumbentDelegationRecovery(incumbentDelegation));
      }
      for (const incumbentTodo of incumbentTodos) {
        const todoRecovery = piIncumbentTodoRecovery(
          incumbentTodo.source,
          incumbentTodo.scope,
          incumbentTodo.identityLimitation,
          incumbentTodo.unmappedSource,
        );
        incumbentBlockers.push(
          `Pi task-list preflight blocked ${incumbentTodo.source}: it conflicts with @thoth-agents/pi-todo. ${todoRecovery}`,
        );
        recovery.push(todoRecovery);
      }
      return {
        success: false,
        changed,
        diagnostics,
        error: incumbentBlockers.join('\n'),
        failedStep: 'preflight',
        installedPackages,
        manualRecovery: `Manual recovery: ${recovery.join(' ')}`,
      };
    }
    const knownReceiptSource =
      receipt.status === 'valid' ? receipt.receipt.source : undefined;
    const firstPartyBefore = getPiFirstPartyPackages(
      configuredBefore,
      knownReceiptSource,
    );
    const globalPackages = firstPartyBefore.filter(
      ({ scope }) => scope === 'user',
    );
    const projectPackages = firstPartyBefore.filter(
      ({ scope }) => scope === 'project',
    );
    const ownership = classifyPiPackageOwnership({
      receipt,
      globalPackages,
      projectPackages,
    });
    if (
      ownership.state === 'configured-unowned' ||
      ownership.state === 'conflicting'
    )
      throw new Error(
        `First-party Pi package ownership conflict: ${ownership.reason ?? ownership.state}`,
      );

    const identityRecovery = piQuestionIdentityBlockers(
      [...configuredBefore, ...configuredProjectPackages],
      plan,
    ).join('\n');
    if (identityRecovery)
      return {
        success: false,
        changed,
        diagnostics,
        error: identityRecovery,
        failedStep: 'preflight',
        installedPackages,
        manualRecovery: identityRecovery,
      };

    const preservationPackages = resolvePiPreservationPackages(
      before.stdout,
      plan.options,
    );
    for (const pkg of getPiExternalPackageSpecs(plan.options)) {
      if (!pkg.preserveUserCopy) continue;
      const evidence = inspectPiSetupPackage(preservationPackages, pkg, false);
      const recovery = piPreservedPackageRecovery(pkg, evidence);
      if (recovery)
        return {
          success: false,
          changed,
          diagnostics,
          error: recovery,
          failedStep: 'preflight',
          installedPackages,
          manualRecovery: recovery,
        };
    }

    const installed = execute('pi', ['install', desiredSource, '--no-approve']);
    if (installed.exitCode !== 0)
      throw new Error(
        `Failed to install ${desiredSource}: ${installed.stderr.trim() || 'unknown Pi error'}`,
      );
    installedPackages.push(desiredSource);
    try {
      const listed = execute('pi', ['list', '--no-approve']);
      const configuredAfter = parsePiPackageList(listed.stdout);
      const firstPartyAfter = getPiFirstPartyPackages(
        configuredAfter.filter(
          (candidate) =>
            isThothPackageLocation(candidate, knownReceiptSource) ||
            matchesInstallSource(candidate, desiredSource),
        ),
        knownReceiptSource,
      );
      const projectCandidates = firstPartyAfter.filter(
        ({ scope }) => scope === 'project',
      );
      const globalCandidates = firstPartyAfter.filter(
        ({ scope }) => scope === 'user',
      );
      const candidates = globalCandidates.filter((candidate) =>
        matchesInstallSource(candidate, desiredSource),
      );
      if (
        listed.exitCode !== 0 ||
        candidates.length !== 1 ||
        globalCandidates.length !== 1 ||
        projectCandidates.length !== 0
      )
        throw new Error(
          `Pi did not verify the exact installed package source ${desiredSource}.`,
        );
      const resolvedPackageRoot = candidates[0]?.installedPath;
      if (
        !resolvedPackageRoot ||
        !isAbsolute(resolvedPackageRoot) ||
        !existsSync(resolvedPackageRoot) ||
        !lstatSync(resolvedPackageRoot).isDirectory() ||
        lstatSync(resolvedPackageRoot).isSymbolicLink()
      )
        throw new Error(
          `Pi did not report one absolute regular installed directory for ${desiredSource}.`,
        );
      const packageRoot = resolvedPackageRoot;
      configuredPackageRoot = packageRoot;
      const verified = (
        plan.options.verifyFirstParty ?? verifyPiFirstPartyPackage
      )({
        source: candidates[0]?.source ?? desiredSource,
        installSource: desiredSource,
        version: plan.options.expectedVersion ?? packageVersionFor(packageRoot),
        packageRoot,
      });
      if (!verified.success) throw new Error(verified.error);
      const committed = writePiPackageReceipt(verified.receipt, receiptOptions);
      if (!committed.success)
        throw new Error(
          `Could not commit Pi package receipt: ${committed.error}`,
        );
      receiptCommitted = true;
      changed.push(committed.path);
    } catch (originalError) {
      const restoreSource =
        ownership.state === 'owned-current' && receipt.status === 'valid'
          ? receipt.receipt.installSource
          : undefined;
      const rollback = restoreSource
        ? execute('pi', ['install', restoreSource, '--no-approve'])
        : execute('pi', ['remove', desiredSource, '--no-approve']);
      const afterRollback = execute('pi', ['list', '--no-approve']);
      const rollbackPackages = parsePiPackageList(afterRollback.stdout);
      const restored = (() => {
        if (rollback.exitCode !== 0 || afterRollback.exitCode !== 0)
          return false;
        if (restoreSource && receipt.status === 'valid') {
          const priorPackages = getPiFirstPartyPackages(
            rollbackPackages,
            receipt.receipt.source,
          );
          return (
            classifyPiPackageOwnership({
              receipt,
              globalPackages: priorPackages.filter(
                ({ scope }) => scope === 'user',
              ),
              projectPackages: priorPackages.filter(
                ({ scope }) => scope === 'project',
              ),
            }).state === 'owned-current'
          );
        }
        return !rollbackPackages.some((candidate) =>
          matchesInstallSource(candidate, desiredSource),
        );
      })();
      if (!restored)
        return {
          success: false,
          changed,
          diagnostics,
          error: `${originalError instanceof Error ? originalError.message : String(originalError)}; rollback failed: ${rollback.stderr || afterRollback.stderr}`,
          failedStep: 'package',
          installedPackages,
          rollbackFailed: true,
          manualRecovery: restoreSource
            ? `pi install ${restoreSource} --no-approve`
            : `pi remove ${desiredSource} --no-approve`,
        };
      return {
        success: false,
        changed,
        diagnostics,
        error:
          originalError instanceof Error
            ? originalError.message
            : String(originalError),
        failedStep: 'package',
        installedPackages,
        receiptCommitted: false,
      };
    }

    if (!configuredPackageRoot)
      throw new Error('Verified Pi package root is unavailable.');
    const migration = migrateLegacyPiResources({
      packageRoot: configuredPackageRoot,
      piRoot: plan.paths.piRoot,
    });
    diagnostics.push(...migration.manualActions);
    if (!migration.success)
      throw new Error(migration.error ?? 'Pi legacy migration failed.');
    changed.push(...migration.changed);

    const questionListing = execute('pi', ['list', '--no-approve']);
    if (questionListing.exitCode !== 0)
      throw new Error(
        `Unable to inspect conflicting Pi question packages: ${questionListing.stderr.trim() || 'pi list unavailable'}`,
      );
    const questionPackages = resolvePiListedPackages(
      questionListing.stdout,
      plan.options,
    );
    const freshProjectQuestions = findPiIncumbentQuestions(
      questionPackages,
    ).filter(({ scope }) => scope === 'project');
    const questionRecovery =
      freshProjectQuestions.length > 0
        ? freshProjectQuestions.map(piProjectQuestionConflict).join('\n')
        : (piUnpreviewedQuestionRecovery(
            plan,
            findPiIncumbentQuestions(questionPackages),
          ) ??
          (piQuestionIdentityBlockers(questionPackages, plan).join('\n') ||
            undefined));
    if (questionRecovery) {
      manualRecovery = questionRecovery;
      throw new Error(questionRecovery);
    }
    const incumbentQuestions = findPiIncumbentQuestions(
      questionPackages,
    ).filter(({ scope }) => scope === 'user');
    for (const incumbent of incumbentQuestions) {
      // Authorize each actual command as well as the batch precheck: identity
      // reads can race, but no removal source may escape the approved preview.
      const unpreviewed = piUnpreviewedQuestionRecovery(plan, [incumbent]);
      if (unpreviewed) {
        manualRecovery = unpreviewed;
        throw new Error(unpreviewed);
      }
      const removed = execute('pi', [
        'remove',
        incumbent.source,
        '--no-approve',
      ]);
      if (removed.exitCode !== 0)
        throw new Error(
          `Failed to remove conflicting Pi question package ${incumbent.source}: ${removed.stderr.trim() || 'unknown Pi error'}`,
        );
    }
    if (incumbentQuestions.length > 0) {
      const afterRemoval = execute('pi', ['list', '--no-approve']);
      const remaining = resolvePiListedPackages(
        afterRemoval.stdout,
        plan.options,
      );
      const identityRecovery = piQuestionIdentityBlockers(remaining, plan).join(
        '\n',
      );
      if (identityRecovery) {
        manualRecovery = identityRecovery;
        throw new Error(identityRecovery);
      }
      if (
        afterRemoval.exitCode !== 0 ||
        findPiIncumbentQuestions(remaining).some(
          ({ scope }) => scope === 'user',
        ) ||
        remaining.some(
          ({ scope, source }) =>
            scope === 'user' &&
            incumbentQuestions.some((incumbent) => incumbent.source === source),
        )
      )
        throw new Error(
          'Pi did not verify removal of the conflicting user question package; rerun pi list and remove it before retrying setup.',
        );
    }

    for (const pkg of getPiExternalPackageSpecs(plan.options)) {
      const preserveUserCopy = pkg.preserveUserCopy === true;
      const beforeInstall = execute('pi', ['list', '--no-approve']);
      if (beforeInstall.exitCode !== 0)
        throw new Error(
          `Unable to inspect ${pkg.packageName} before installation: ${beforeInstall.stderr.trim() || 'pi list unavailable'}`,
        );
      const prior = inspectPiSetupPackage(
        preserveUserCopy
          ? resolvePiPreservationPackages(beforeInstall.stdout, plan.options)
          : parsePiPackageList(beforeInstall.stdout),
        pkg,
        false,
      );
      const recovery = piPreservedPackageRecovery(pkg, prior);
      if (recovery) {
        manualRecovery = recovery;
        throw new Error(recovery);
      }
      const priorSourceMatches =
        prior.state === 'installed' &&
        prior.source !== undefined &&
        prior.installedPath !== undefined &&
        piExternalSourceMatches(
          {
            scope: 'user',
            source: prior.source,
            installedPath: prior.installedPath,
          },
          pkg.source,
        );
      const preserving = preserveUserCopy && prior.state === 'installed';
      if (!preserving && !priorSourceMatches) {
        const result = execute('pi', ['install', pkg.source, '--no-approve']);
        if (result.exitCode !== 0)
          throw new Error(
            `Failed to install ${pkg.source}: ${result.stderr.trim() || 'unknown Pi error'}`,
          );
      }
      const listed = execute('pi', ['list', '--no-approve']);
      const verified =
        listed.exitCode === 0
          ? inspectPiSetupPackage(
              preserveUserCopy
                ? resolvePiPreservationPackages(listed.stdout, plan.options)
                : parsePiPackageList(listed.stdout),
              pkg,
            )
          : {
              state: 'drift' as const,
              version: undefined,
              reason: listed.stderr.trim() || 'pi list unavailable',
            };
      if (
        !preserveUserCopy &&
        prior.state === 'installed' &&
        verified.version !== undefined &&
        lt(verified.version, prior.version)
      ) {
        const restoreSource =
          prior.source ?? `npm:${pkg.packageName}@${prior.version}`;
        const restored = execute('pi', [
          'install',
          restoreSource,
          '--no-approve',
        ]);
        const restoredListing = execute('pi', ['list', '--no-approve']);
        const restoredEvidence =
          restored.exitCode === 0 && restoredListing.exitCode === 0
            ? inspectPiExternalPackage(
                parsePiPackageList(restoredListing.stdout),
                pkg,
                false,
              )
            : undefined;
        const recoverySucceeded =
          restoredEvidence?.state === 'installed' &&
          restoredEvidence.source === prior.source &&
          restoredEvidence.version === prior.version;
        const recoveryGuidance = `Manual recovery: run pi install ${restoreSource} --no-approve, then verify with pi list and the installed package manifest.`;
        manualRecovery = recoveryGuidance;
        throw new Error(
          `Pi attempted to downgrade ${pkg.packageName} from ${prior.version} to ${verified.version}; exact-version recovery ${recoverySucceeded ? 'verified' : 'failed or unverifiable'}. ${recoveryGuidance}`,
        );
      }
      if (verified.state !== 'installed') {
        manualRecovery = piPreservedPackageRecovery(pkg, verified);
        throw new Error(
          `Pi did not verify ${pkg.source}: ${verified.reason}.${manualRecovery ? ` ${manualRecovery}` : ''}`,
        );
      }
      if (preserving) {
        if (
          verified.source !== prior.source ||
          !piPackagePathsEqual(verified.installedPath, prior.installedPath)
        )
          throw new Error(
            `Preserved Pi package ${pkg.packageName} changed source or directory during verification; inspect pi list --no-approve, then rerun setup.`,
          );
        diagnostics.push(
          `Preserved and verified ${pkg.packageName}@${verified.version} from ${verified.source}; no reinstall.`,
        );
      }
      installedPackages.push(pkg.source);
    }
    for (const item of plan.items.filter(
      (candidate) =>
        candidate.content !== undefined &&
        (candidate.kind === 'settings' || candidate.kind === 'mcp'),
    )) {
      const content =
        item.target === plan.paths.subagentsConfigPath
          ? `${JSON.stringify(mergePiSubagentsConfig(readJsonObject(item.target)), null, 2)}\n`
          : item.target === plan.paths.mcpConfigPath
            ? `${JSON.stringify(mergePiGrepMcpConfig(readJsonObject(item.target)), null, 2)}\n`
            : (item.content ?? '');
      if (writePiManagedText(item.target, content)) changed.push(item.target);
    }
    const resources = syncPiSpecialists({
      packageRoot: configuredPackageRoot,
      piRoot: plan.paths.piRoot,
      projectRoots: plan.paths.projectAgentRoots,
    });
    diagnostics.push(...resources.diagnostics);
    if (!resources.success)
      throw new Error(
        resources.error ?? 'Pi specialist synchronization failed.',
      );
    changed.push(...resources.changed);
    return {
      success: true,
      changed,
      diagnostics,
      installedPackages,
      receiptCommitted,
      configuredPackageRoot,
    };
  } catch (error) {
    return {
      success: false,
      changed,
      diagnostics,
      error: error instanceof Error ? error.message : String(error),
      failedStep:
        installedPackages.length <
        plan.items.filter((item) => item.kind === 'package').length
          ? 'package'
          : 'managed-surface',
      installedPackages,
      receiptCommitted,
      manualRecovery,
    };
  }
}
