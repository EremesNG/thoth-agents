import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
import { migrateLegacyPiResources } from './pi-migration';
import { observePiNativeRoot } from './pi-native-probe';
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

export const PI_MINIMUM_VERSION = '0.84.4';
export const PI_NODE_MINIMUM = '22.19.0';
export const PI_COMMAND_TIMEOUT_MS = 120_000;
export const PI_PACKAGE_SPECS = [
  {
    id: 'delegation',
    source: 'npm:pi-subagents-j0k3r@1.5.9',
    packageName: 'pi-subagents-j0k3r',
    version: '1.5.9',
  },
  {
    id: 'context7',
    source: 'npm:@upstash/context7-pi@0.1.2',
    packageName: '@upstash/context7-pi',
    version: '0.1.2',
  },
  {
    id: 'web-access',
    source: 'npm:pi-web-access@0.27.0',
    packageName: 'pi-web-access',
    version: '0.27.0',
  },
  {
    id: 'grep-adapter',
    source: 'npm:pi-mcp-adapter@2.32.1',
    packageName: 'pi-mcp-adapter',
    version: '2.32.1',
  },
  {
    id: 'ask-user-question',
    source: 'npm:@juicesharp/rpiv-ask-user-question@2.9.0',
    packageName: '@juicesharp/rpiv-ask-user-question',
    version: '2.9.0',
  },
  {
    id: 'todo',
    source: 'npm:@juicesharp/rpiv-todo@2.9.0',
    packageName: '@juicesharp/rpiv-todo',
    version: '2.9.0',
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
  kind: 'preflight' | 'package' | 'root' | 'agent' | 'mcp';
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
    const load = defaultCommandExecutor('node', [
      '--input-type=module',
      '--eval',
      `import(${JSON.stringify(pathToFileURL(extensionPath).href)}).then(m=>{if(typeof m.default!=="function")process.exit(2)})`,
    ]);
    if (load.exitCode !== 0)
      throw new Error(`Compiled Pi extension is not loadable: ${load.stderr}`);
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
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object.`);
  return parsed;
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
  let mcpContent: string | undefined;
  try {
    mcpContent = `${JSON.stringify(
      mergePiGrepMcpConfig(readJsonObject(paths.mcpConfigPath)),
      null,
      2,
    )}\n`;
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }
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
      description: 'Verify Node.js >=22.19 and Pi >=0.84.4 before mutation',
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
    ...PI_PACKAGE_SPECS.map((pkg) => ({
      kind: 'package' as const,
      description: `Install and verify Pi package ${pkg.source}`,
      target: pkg.source,
      command: { command: 'pi', args: ['install', pkg.source, '--no-approve'] },
    })),
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
    disclaimers: [
      "Pi extensions execute with the invoking user's system permissions; package pins and tool allowlists are not a security sandbox.",
      'Context7 and web access are native Pi extensions; only grep.app uses pi-mcp-adapter and directTools is intentionally omitted.',
      'Project-local resources require Pi trust and may shadow global resources.',
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

function configuredPackageIdentity(candidate: PiConfiguredPackage): {
  packageName: string;
  packageVersion: string;
} {
  if (!candidate.installedPath) return { packageName: '', packageVersion: '' };
  try {
    const manifest = JSON.parse(
      readFileSync(join(candidate.installedPath, 'package.json'), 'utf8'),
    ) as { name?: unknown; version?: unknown };
    return {
      packageName: typeof manifest.name === 'string' ? manifest.name : '',
      packageVersion:
        typeof manifest.version === 'string' ? manifest.version : '',
    };
  } catch {
    return { packageName: '', packageVersion: '' };
  }
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
    const located = spawnSync('where.exe', ['pi.cmd'], { encoding: 'utf8' })
      .stdout?.split(/\r?\n/)
      .find(Boolean);
    const cli = located
      ? join(
          dirname(located),
          'node_modules',
          '@earendil-works',
          'pi-coding-agent',
          'dist',
          'bundle',
          'cli.js',
        )
      : undefined;
    if (cli && existsSync(cli)) {
      executable = process.execPath;
      executableArgs = [cli, ...args];
    }
  }
  const result = spawnSync(executable, executableArgs, {
    encoding: 'utf8',
    timeout: PI_COMMAND_TIMEOUT_MS,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

export function writePiManagedText(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  const backupPath = `${path}.bak`;
  writeFileSync(temporaryPath, content);
  try {
    if (existsSync(path)) copyFileSync(path, backupPath);
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  return true;
}

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
  try {
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
    const configuredBefore = parsePiPackageList(before.stdout);
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

    for (const pkg of PI_PACKAGE_SPECS) {
      const result = execute('pi', ['install', pkg.source, '--no-approve']);
      if (result.exitCode !== 0)
        throw new Error(
          `Failed to install ${pkg.source}: ${result.stderr.trim() || 'unknown Pi error'}`,
        );
      const listed = execute('pi', ['list', '--no-approve']);
      if (
        listed.exitCode !== 0 ||
        !hasExactInstalledPiPackage(listed.stdout, pkg.source)
      ) {
        throw new Error(
          `Pi did not verify the exact installed package source ${pkg.source}.`,
        );
      }
      installedPackages.push(pkg.source);
    }
    for (const item of plan.items.filter(
      (candidate) =>
        candidate.content !== undefined && candidate.kind === 'mcp',
    )) {
      if (writePiManagedText(item.target, item.content ?? ''))
        changed.push(item.target);
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
    };
  }
}
