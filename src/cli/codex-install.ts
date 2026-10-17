import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_OPENAI_PRESET } from '../config/constants';
import {
  codexAdapter,
  renderLegacyCodexAgentArtifacts,
} from '../harness/adapters/codex';
import type { HarnessArtifact } from '../harness/types';
import {
  parseCodexToml,
  readCodexThreadsValue,
  writeCodexConfigMerge,
} from './codex-config-io';
import { codexHookSource, codexHookTrustEntries } from './codex-hook-trust';
import type { CodexInstallScope, CodexRoleName } from './codex-paths';
import { resolveCodexTargets } from './codex-paths';
import {
  type CodexHookCapabilityConfig,
  checkCodexHookCapability,
} from './codex-plugin-install';
import {
  assertSafeBackupDestination,
  type ManagedModelState,
  emptyManagedModelState as sharedEmptyManagedModelState,
  readManagedModelState as sharedReadManagedModelState,
  stableJson,
  uniqueMessages,
  writeManagedModelState,
  writeTextWithBackup,
} from './managed-state-io';
import { findPackageRoot } from './package-root';
import { safeAtomicWriteFileSync } from './safe-atomic-write';

export { CODEX_ROLE_NAMES } from './codex-paths';

export type CodexSetupAction =
  | 'remove-legacy-root-block'
  | 'write-role-toml'
  | 'preserve-role-toml'
  | 'retire-obsolete-role-toml'
  | 'write-install-recovery'
  | 'write-managed-model-state'
  | 'merge-toml'
  | 'diagnose-only';

export type CodexTargetKind =
  | 'root-instructions'
  | 'role-subagent-toml'
  | 'managed-model-state'
  | 'install-recovery'
  | 'user-config'
  | 'diagnostic';

export interface CodexInstallConfig extends CodexHookCapabilityConfig {
  dryRun?: boolean;
  reset: boolean;
  scope: CodexInstallScope;
  packageRoot?: string;
  trustHooks?: boolean;
  replaceLegacyAgents?: boolean;
}

export interface CodexSetupPlanItem {
  kind: CodexTargetKind;
  action: CodexSetupAction;
  targetPath: string;
  description: string;
  requiresBackup: boolean;
  content?: string;
  role?: CodexRoleName;
  renderedModel?: string;
  /** Apply-time guard captured while planning. */
  expectedContent?: string;
  expectedAbsent?: boolean;
  /** Raw legacy file bytes: never decode/re-encode operator content. */
  legacyRootBytes?: Buffer;
  remainingRootBytes?: Buffer;
}

export interface CodexSetupPlan {
  hookCapabilityConfig: CodexHookCapabilityConfig;
  dryRun: boolean;
  reset: boolean;
  items: CodexSetupPlanItem[];
  diagnostics: string[];
  disclaimers: string[];
  configPath: string;
  pluginId?: string;
  trustHooks?: boolean;
  priorThreadsValue?: string | null;
}

export interface CodexApplyResult {
  success: boolean;
  changed: string[];
  diagnostics: string[];
  error?: string;
}

const ROOT_START = '<!-- thoth-agents:codex-root:start -->';
const ROOT_END = '<!-- thoth-agents:codex-root:end -->';
export const MANAGED_MODEL_STATE_VERSION = 1;
const OBSOLETE_CODEX_ROLES = ['quick', 'deep'] as const;
const RECOVERY_FILE = '.thoth-agents-install-recovery.json';

function lstatIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function roleStructureFingerprint(content: string): string {
  // Everything except the operator-selectable model/effort lines is owned.
  return fingerprint(
    content.replace(
      /^(?:model|model_reasoning_effort)[ \t]*=[ \t]*"(?:\\.|[^"\\\r\n])*"[ \t]*(?:\r?\n|$)/gm,
      '',
    ),
  );
}

/** A recovery candidate, NOT proof of ownership. Only an explicit opt-in may replace it.
 * Historical descriptions/routing changed: match the stable responsibility prefix,
 * role envelope and Codex operational marker rather than a whole prompt digest.
 */
export function isMigratableLegacyRole(
  content: string,
  role: CodexRoleName,
): boolean {
  try {
    const current = parseCodexToml(content);
    const artifact = renderLegacyCodexAgentArtifacts().find((a) =>
      a.path.endsWith(`thoth-agents-${role}.toml`),
    );
    if (!artifact?.content) return false;
    const legacy = parseCodexToml(String(artifact.content));
    const prompt = current.developer_instructions;
    return (
      current.name === role &&
      current.sandbox_mode === legacy.sandbox_mode &&
      typeof current.description === 'string' &&
      typeof legacy.description === 'string' &&
      current.description.startsWith(
        legacy.description.split(' Use when:')[0],
      ) &&
      typeof prompt === 'string' &&
      prompt.includes(`<role>\nYou are ${role}.\n</role>`) &&
      prompt.includes('<role-operational-contract>') &&
      prompt.includes(`${role} runs as a Codex custom-agent TOML entry;`) &&
      prompt.includes('thoth-mem')
    );
  } catch {
    return false;
  }
}

function assertSafeCodexRolePath(path: string, agentsDir: string): void {
  const absolute = resolve(path);
  const expectedParent = resolve(agentsDir);
  if (dirname(absolute) !== expectedParent)
    throw new Error(
      `Unsafe Codex role path outside managed agents directory: ${path}`,
    );

  const root = parse(absolute).root;
  const ancestors: string[] = [];
  let cursor = dirname(absolute);
  while (cursor !== root) {
    ancestors.push(cursor);
    cursor = dirname(cursor);
  }
  ancestors.push(root);
  for (const ancestor of ancestors.reverse()) {
    const stat = lstatIfPresent(ancestor);
    if (!stat) continue;
    if (stat.isSymbolicLink())
      throw new Error(
        `Managed Codex role path has a symlinked parent: ${ancestor}`,
      );
    if (!stat.isDirectory())
      throw new Error(
        `Managed Codex role path parent is not a directory: ${ancestor}`,
      );
  }

  const stat = lstatIfPresent(absolute);
  if (!stat) return;
  if (stat.isSymbolicLink())
    throw new Error(`Managed Codex role target is a symlink: ${absolute}`);
  if (!stat.isFile())
    throw new Error(
      `Managed Codex role target is not a regular file: ${absolute}`,
    );
}

function addApplyGuard(item: CodexSetupPlanItem): CodexSetupPlanItem {
  if (!lstatIfPresent(item.targetPath))
    return { ...item, expectedAbsent: true };
  return { ...item, expectedContent: readFileSync(item.targetPath, 'utf8') };
}

function assertApplyGuard(item: CodexSetupPlanItem): void {
  if (item.expectedAbsent) {
    if (lstatIfPresent(item.targetPath))
      throw new Error(
        `Managed Codex target appeared after planning: ${item.targetPath}`,
      );
    return;
  }
  if (item.expectedContent !== undefined) {
    if (
      !lstatIfPresent(item.targetPath) ||
      readFileSync(item.targetPath, 'utf8') !== item.expectedContent
    )
      throw new Error(
        `Managed Codex target changed after planning: ${item.targetPath}`,
      );
  }
}

interface InstallRecovery {
  version: 1;
  roles: Record<string, string>;
}

function readInstallRecovery(path: string): InstallRecovery | undefined {
  if (!lstatIfPresent(path)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error(`Corrupt Codex install recovery state: ${path}`);
  const value = raw as { version?: unknown; roles?: unknown };
  if (
    value.version !== 1 ||
    !value.roles ||
    typeof value.roles !== 'object' ||
    Array.isArray(value.roles)
  )
    throw new Error(`Corrupt Codex install recovery state: ${path}`);
  const roles = Object.fromEntries(Object.entries(value.roles));
  if (
    Object.values(roles).some(
      (hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw new Error(`Corrupt Codex install recovery state: ${path}`);
  return { version: 1, roles: roles as Record<string, string> };
}

function resolvePackageRoot(
  packageRoot: string | undefined,
): string | undefined {
  if (packageRoot) return packageRoot;
  return (
    findPackageRoot(fileURLToPath(new URL('.', import.meta.url))) ?? undefined
  );
}

function emptyManagedModelState(): ManagedModelState {
  return sharedEmptyManagedModelState(MANAGED_MODEL_STATE_VERSION);
}

export function readManagedModelState(path: string): ManagedModelState {
  return sharedReadManagedModelState(path, MANAGED_MODEL_STATE_VERSION);
}

export function parseRoleTomlModel(content: string): string | undefined {
  const match = /^model\s*=\s*"((?:\\.|[^"\\])*)"\s*$/m.exec(content);
  if (!match) return undefined;
  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function escapeTomlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\f/g, '\\f')
    .replace(/\r/g, '\\r');
}

export function replaceRoleTomlModel(content: string, model: string): string {
  const rendered = `model = "${escapeTomlString(model)}"`;
  if (/^model\s*=\s*"(?:\\.|[^"\\])*"\s*$/m.test(content)) {
    return content.replace(/^model\s*=\s*"(?:\\.|[^"\\])*"\s*$/m, rendered);
  }
  return `${rendered}\n${content}`;
}

export function parseRoleTomlEffort(content: string): string | undefined {
  return /^model_reasoning_effort\s*=\s*"([^"\\]+)"\s*$/m.exec(content)?.[1];
}

export function replaceRoleTomlEffort(
  content: string,
  effort: string | undefined,
): string {
  const pattern = /^model_reasoning_effort\s*=\s*"[^"\\]+"\s*\r?\n?/m;
  if (effort === undefined) return content.replace(pattern, '');
  const rendered = `model_reasoning_effort = "${escapeTomlString(effort)}"`;
  if (pattern.test(content)) return content.replace(pattern, `${rendered}\n`);
  const modelPattern = /^model\s*=\s*"(?:\\.|[^"\\])*"\s*\r?\n?/m;
  if (modelPattern.test(content)) {
    return content.replace(
      modelPattern,
      (modelLine) => `${modelLine}${rendered}\n`,
    );
  }
  return `${rendered}\n${content}`;
}

export function roleManagedModelStateKey(path: string): string {
  return basename(path);
}

export function normalizeCodexRuntimeModel(model: string): string {
  const separator = model.indexOf('/');
  return separator === -1 ? model : model.slice(separator + 1);
}

export interface CodexManagedModelOverride {
  role: CodexRoleName;
  model: string;
  effort?: string;
  clearEffort?: boolean;
}

export function applyCodexManagedModelOverrides(
  config: CodexInstallConfig,
  overrides: CodexManagedModelOverride[],
): CodexApplyResult {
  if (config.dryRun) {
    return {
      success: true,
      changed: [],
      diagnostics: [
        'Dry-run Codex model override apply requested; no files were written.',
      ],
    };
  }

  const plan = buildCodexSetupPlan({ ...config, dryRun: true, reset: false });
  const stateItem = plan.items.find(
    (item) => item.action === 'write-managed-model-state',
  );
  const statePath = stateItem?.targetPath;
  if (!statePath) {
    return {
      success: false,
      changed: [],
      diagnostics: plan.diagnostics,
      error: 'Codex managed model state target was not found.',
    };
  }

  const changed: string[] = [];
  const diagnostics = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  const state = readManagedModelState(statePath);
  const nextState: ManagedModelState = {
    version: MANAGED_MODEL_STATE_VERSION,
    models: { ...state.models },
    roleDigests: { ...state.roleDigests },
    roleStructureDigests: { ...state.roleStructureDigests },
    ...(state.configuredModels
      ? { configuredModels: { ...state.configuredModels } }
      : {}),
    ...(state.configuredEfforts
      ? { configuredEfforts: { ...state.configuredEfforts } }
      : {}),
  };

  try {
    for (const override of overrides) {
      const roleItem = plan.items.find(
        (item) =>
          (item.action === 'write-role-toml' ||
            item.action === 'preserve-role-toml') &&
          item.role === override.role,
      );
      if (!roleItem?.content) {
        throw new Error(
          `Missing Codex role TOML content for ${override.role}.`,
        );
      }

      const before = existsSync(roleItem.targetPath)
        ? readFileSync(roleItem.targetPath, 'utf8')
        : roleItem.content;
      const model = normalizeCodexRuntimeModel(override.model);
      let updated = replaceRoleTomlModel(before, model);
      if (override.clearEffort) {
        updated = replaceRoleTomlEffort(updated, undefined);
      } else if (override.effort !== undefined) {
        updated = replaceRoleTomlEffort(updated, override.effort);
      }
      if (writeTextWithBackup(roleItem.targetPath, updated)) {
        changed.push(roleItem.targetPath);
      }
      const key = roleManagedModelStateKey(roleItem.targetPath);
      // Explicit model changes do not adopt unrelated operator edits as ours.
      if (roleItem.action === 'write-role-toml') {
        nextState.roleDigests ??= {};
        nextState.roleDigests[key] = fingerprint(updated);
        nextState.roleStructureDigests ??= {};
        nextState.roleStructureDigests[key] = roleStructureFingerprint(updated);
      }
      nextState.models[key] = normalizeCodexRuntimeModel(
        roleItem.renderedModel ?? model,
      );
      nextState.configuredModels ??= {};
      nextState.configuredModels[key] = model;
      if (override.clearEffort) {
        if (nextState.configuredEfforts) {
          delete nextState.configuredEfforts[key];
        }
      } else if (override.effort !== undefined) {
        nextState.configuredEfforts ??= {};
        nextState.configuredEfforts[key] = override.effort;
      }
    }

    if (
      writeManagedModelState(statePath, MANAGED_MODEL_STATE_VERSION, nextState)
    ) {
      changed.push(statePath);
    }

    return {
      success: true,
      changed,
      diagnostics: uniqueMessages(diagnostics),
    };
  } catch (error) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveRoleTomlContent(options: {
  role: CodexRoleName;
  renderedContent: string;
  targetPath: string;
  state: ManagedModelState;
  nextState: ManagedModelState;
  reset: boolean;
}): string {
  const renderedModel = parseRoleTomlModel(options.renderedContent);
  const key = roleManagedModelStateKey(options.targetPath);

  if (!renderedModel) return options.renderedContent;
  const configuredModel = options.reset
    ? undefined
    : options.state.configuredModels?.[key];
  const configuredEffort = options.reset
    ? undefined
    : options.state.configuredEfforts?.[key];

  if (configuredEffort !== undefined) {
    options.nextState.configuredEfforts ??= {};
    options.nextState.configuredEfforts[key] = configuredEffort;
  }

  if (options.reset || !existsSync(options.targetPath)) {
    options.nextState.models[key] = renderedModel;
    if (configuredModel !== undefined) {
      options.nextState.configuredModels ??= {};
      options.nextState.configuredModels[key] = configuredModel;
      return replaceRoleTomlModel(options.renderedContent, configuredModel);
    }
    return options.renderedContent;
  }

  const installedContent = readFileSync(options.targetPath, 'utf8');
  const currentModel = parseRoleTomlModel(installedContent);
  const currentEffort = parseRoleTomlEffort(installedContent);
  const legacy = LEGACY_OPENAI_PRESET[options.role];
  if (currentModel === legacy.model && currentEffort === legacy.effort) {
    options.nextState.models[key] = renderedModel;
    if (configuredModel !== undefined) {
      options.nextState.configuredModels ??= {};
      options.nextState.configuredModels[key] = renderedModel;
    }
    if (configuredEffort !== undefined) {
      options.nextState.configuredEfforts ??= {};
      const renderedEffort = parseRoleTomlEffort(options.renderedContent);
      if (renderedEffort !== undefined)
        options.nextState.configuredEfforts[key] = renderedEffort;
      else delete options.nextState.configuredEfforts[key];
    }
    return options.renderedContent;
  }

  if (configuredModel !== undefined) {
    options.nextState.models[key] = renderedModel;
    options.nextState.configuredModels ??= {};
    options.nextState.configuredModels[key] = configuredModel;
    return replaceRoleTomlEffort(
      replaceRoleTomlModel(
        options.renderedContent,
        currentModel && currentModel !== configuredModel
          ? currentModel
          : configuredModel,
      ),
      currentEffort,
    );
  }

  const trackedModel = options.state.models[key];
  const isUserOwned =
    currentModel !== undefined &&
    (trackedModel === undefined
      ? currentModel !== renderedModel
      : currentModel !== trackedModel);

  if (isUserOwned) {
    if (trackedModel !== undefined)
      options.nextState.models[key] = trackedModel;
    return replaceRoleTomlEffort(
      replaceRoleTomlModel(options.renderedContent, currentModel),
      currentEffort,
    );
  }

  options.nextState.models[key] = renderedModel;
  return replaceRoleTomlEffort(
    currentModel === undefined
      ? options.renderedContent
      : replaceRoleTomlModel(options.renderedContent, currentModel),
    currentEffort,
  );
}

function roleArtifactContent(
  role: CodexRoleName,
  artifacts: HarnessArtifact[],
): string {
  const path = `.codex/agents/thoth-agents-${role}.toml`;
  const artifact = artifacts.find((candidate) => candidate.path === path);
  if (!artifact?.content)
    throw new Error(`Missing Codex role artifact: ${path}`);
  return String(artifact.content);
}

export function planLegacyRootRemoval(path: string): {
  items: CodexSetupPlanItem[];
  diagnostics: string[];
} {
  if (!lstatIfPresent(path)) return { items: [], diagnostics: [] };
  assertSafeCodexRolePath(path, dirname(path));
  const bytes = readFileSync(path);
  const text = bytes.toString('latin1');
  const starts = text.split(ROOT_START).length - 1;
  const ends = text.split(ROOT_END).length - 1;
  const markerPrefixes = text.split('<!-- thoth-agents:codex-root:').length - 1;
  if (markerPrefixes === 0) return { items: [], diagnostics: [] };
  const start = text.indexOf(ROOT_START);
  const end = text.indexOf(ROOT_END);
  if (starts !== 1 || ends !== 1 || markerPrefixes !== 2 || end < start)
    return {
      items: [],
      diagnostics: [
        `Preserved malformed or ambiguous legacy Codex root markers in ${path}; repair the markers manually.`,
      ],
    };
  return {
    items: [
      {
        kind: 'root-instructions',
        action: 'remove-legacy-root-block',
        targetPath: path,
        description: `Remove legacy Codex root block; preserve outside bytes, delete whitespace-only result (backup: ${path}.bak).`,
        requiresBackup: true,
        legacyRootBytes: bytes,
        remainingRootBytes: Buffer.concat([
          bytes.subarray(0, start),
          bytes.subarray(end + ROOT_END.length),
        ]),
      },
    ],
    diagnostics: [],
  };
}

export function buildCodexSetupPlan(
  config: CodexInstallConfig,
): CodexSetupPlan {
  const targets = resolveCodexTargets({
    scope: config.scope,
    projectRoot: config.projectRoot,
    homeDir: config.homeDir,
    codexHome: config.codexHome,
  });
  const packageRoot = resolvePackageRoot(config.packageRoot);
  const render = codexAdapter.render({
    projectRoot: config.projectRoot,
    ...(packageRoot ? { packageRoot } : {}),
  });
  const legacyRoot = planLegacyRootRemoval(targets.rootInstructionsPath);
  const agentsDir = dirname(
    targets.roleAgentPaths[0]?.path ?? targets.managedModelsPath,
  );
  const recoveryPath = resolve(agentsDir, RECOVERY_FILE);
  assertSafeCodexRolePath(targets.managedModelsPath, agentsDir);
  assertSafeCodexRolePath(recoveryPath, agentsDir);
  for (const target of targets.roleAgentPaths)
    assertSafeCodexRolePath(target.path, agentsDir);

  const managedModelState = readManagedModelState(targets.managedModelsPath);
  const recovery = readInstallRecovery(recoveryPath);
  const nextManagedModelState = emptyManagedModelState();
  if (config.reset) {
    nextManagedModelState.configuredModels = {};
    nextManagedModelState.configuredEfforts = {};
  }
  nextManagedModelState.priorThreadsValue =
    managedModelState.priorThreadsValue === undefined
      ? readCodexThreadsValue(
          existsSync(targets.configPath)
            ? readFileSync(targets.configPath, 'utf8')
            : '',
        )
      : managedModelState.priorThreadsValue;
  if (managedModelState.ownedHookTrustKeys)
    nextManagedModelState.ownedHookTrustKeys = [
      ...managedModelState.ownedHookTrustKeys,
    ];
  const configPreview = writeCodexConfigMerge({
    configPath: targets.configPath,
    dryRun: true,
    manageThreads: true,
    priorThreadsValue: managedModelState.priorThreadsValue,
  });
  if (!configPreview.success) throw new Error(configPreview.error);
  nextManagedModelState.roleDigests = { ...managedModelState.roleDigests };
  nextManagedModelState.roleStructureDigests = {
    ...managedModelState.roleStructureDigests,
  };
  const legacyArtifacts = renderLegacyCodexAgentArtifacts();
  const ownershipDiagnostics: string[] = [];
  const roleItems = targets.roleAgentPaths.map((target): CodexSetupPlanItem => {
    const key = roleManagedModelStateKey(target.path);
    const renderedContent = roleArtifactContent(target.role, render.artifacts);
    if (existsSync(target.path)) {
      const current = readFileSync(target.path, 'utf8');
      const digest = fingerprint(current);
      const structureDigest = roleStructureFingerprint(current);
      const legacyDigest = roleStructureFingerprint(
        roleArtifactContent(target.role, legacyArtifacts),
      );
      const recovered = recovery?.roles[key] === digest;
      const owned =
        managedModelState.roleDigests?.[key] === digest ||
        managedModelState.roleStructureDigests?.[key] === structureDigest ||
        structureDigest === legacyDigest ||
        recovered ||
        (config.replaceLegacyAgents === true &&
          isMigratableLegacyRole(current, target.role));
      if (!owned) {
        ownershipDiagnostics.push(
          `Preserved operator-edited or unattributed Codex role TOML: ${target.path}${isMigratableLegacyRole(current, target.role) ? '; legacy full TOML (migratable). Review/back up edits, then run thoth-agents update --agent=codex --apply --replace-legacy-agents (or setup:codex:local -- --replace-legacy-agents).' : ''}`,
        );
        if (managedModelState.models[key] !== undefined)
          nextManagedModelState.models[key] = managedModelState.models[key];
        for (const field of [
          'configuredModels',
          'configuredEfforts',
        ] as const) {
          const value = config.reset
            ? undefined
            : managedModelState[field]?.[key];
          if (value !== undefined) {
            nextManagedModelState[field] ??= {};
            nextManagedModelState[field][key] = value;
          }
        }
        return addApplyGuard({
          kind: 'role-subagent-toml',
          action: 'preserve-role-toml',
          targetPath: target.path,
          description:
            'Preserve operator-edited or unattributed TOML; no replacement will be made.',
          requiresBackup: false,
          role: target.role,
          renderedModel: parseRoleTomlModel(renderedContent),
          content: renderedContent,
        });
      }
    }
    const item = addApplyGuard({
      kind: 'role-subagent-toml',
      action: 'write-role-toml',
      targetPath: target.path,
      description: `Materialize Codex role subagent ${target.role}${config.replaceLegacyAgents && lstatIfPresent(target.path) ? ` (explicit legacy recovery; backup: ${target.path}.bak)` : ''}.`,
      requiresBackup: Boolean(lstatIfPresent(target.path)),
      role: target.role,
      renderedModel: parseRoleTomlModel(renderedContent),
      content: resolveRoleTomlContent({
        role: target.role,
        renderedContent,
        targetPath: target.path,
        state: managedModelState,
        nextState: nextManagedModelState,
        reset: config.reset,
      }),
    });
    nextManagedModelState.roleDigests ??= {};
    nextManagedModelState.roleDigests[key] = fingerprint(item.content ?? '');
    nextManagedModelState.roleStructureDigests ??= {};
    nextManagedModelState.roleStructureDigests[key] = roleStructureFingerprint(
      item.content ?? '',
    );
    return item;
  });
  const recoveryRoles = Object.fromEntries(
    roleItems
      .filter((item) => item.action === 'write-role-toml')
      .map((item) => [
        roleManagedModelStateKey(item.targetPath),
        fingerprint(item.content ?? ''),
      ]),
  );

  if (recovery) {
    ownershipDiagnostics.push(
      'Recovered prior Codex install journal; only attributable role files are migrated.',
    );
  }

  const obsoleteItems: CodexSetupPlanItem[] = OBSOLETE_CODEX_ROLES.flatMap(
    (role) => {
      const targetPath = resolve(agentsDir, `thoth-agents-${role}.toml`);
      assertSafeCodexRolePath(targetPath, agentsDir);
      if (!lstatIfPresent(targetPath)) return [];
      const key = roleManagedModelStateKey(targetPath);
      if (!(key in managedModelState.models))
        throw new Error(
          `Obsolete Codex role lacks thoth-agents ownership state and was preserved: ${targetPath}. Remove it explicitly before retrying.`,
        );
      return [
        addApplyGuard({
          kind: 'role-subagent-toml' as const,
          action: 'retire-obsolete-role-toml' as const,
          targetPath,
          description: `Retire attributable obsolete Codex role ${role}.`,
          requiresBackup: false,
        }),
      ];
    },
  );
  const items: CodexSetupPlanItem[] = [
    ...legacyRoot.items,
    addApplyGuard({
      kind: 'install-recovery',
      action: 'write-install-recovery',
      targetPath: recoveryPath,
      description:
        'Persist exact role fingerprints for interrupted-install recovery.',
      requiresBackup: Boolean(lstatIfPresent(recoveryPath)),
      content: stableJson({ version: 1, roles: recoveryRoles }),
    }),
    ...roleItems,
    ...obsoleteItems,
    addApplyGuard({
      kind: 'managed-model-state',
      action: 'write-managed-model-state',
      targetPath: targets.managedModelsPath,
      description:
        'Record thoth-agents-managed Codex role model ownership state.',
      requiresBackup: existsSync(targets.managedModelsPath),
      content: stableJson(nextManagedModelState),
    }),
    {
      kind: 'user-config',
      action: 'merge-toml',
      targetPath: targets.configPath,
      description: `Merge managed Codex feature gates; set agents.max_concurrent_threads_per_session = 6 unless operator-modified. ${config.trustHooks ? 'With consent, trust installed SessionStart and SubagentStart declarations (hooks can run outside the sandbox).' : 'No hook trust written without consent; review /hooks or the startup Trust all and continue prompt in Codex.'}`,
      requiresBackup: true,
    },
    {
      kind: 'diagnostic',
      action: 'diagnose-only',
      targetPath: targets.codexHome,
      description:
        'Report /plugins, precedence, and consumer capability review steps.',
      requiresBackup: false,
    },
  ];

  return {
    hookCapabilityConfig: {
      codexHome: targets.codexHome,
      projectRoot: config.projectRoot,
      commandExecutor: config.commandExecutor,
      pluginId: config.pluginId,
      localPluginBundlePath: config.localPluginBundlePath,
    },
    dryRun: config.dryRun === true,
    reset: config.reset,
    items,
    configPath: targets.configPath,
    pluginId: config.pluginId,
    trustHooks: config.trustHooks,
    priorThreadsValue: managedModelState.priorThreadsValue,
    diagnostics: [
      ...configPreview.diffSummary,
      ...configPreview.warnings,
      config.trustHooks
        ? 'Consent received: trust installed thoth-agents hooks; trusted hooks can run outside the sandbox.'
        : 'No hook trust written without consent. Trust thoth-agents hooks in Codex via /hooks or the startup "Trust all and continue" prompt.',
      ...legacyRoot.diagnostics,
      ...ownershipDiagnostics,
      'The combined install flow runs `codex plugin marketplace add https://github.com/EremesNG/thoth-plugins.git` and `codex plugin add thoth-agents@thoth-plugins` through the native manager; restart Codex, then use /plugins to review its state.',
      'The CLI does not copy a plugin into ~/.codex/plugins or merge ~/.agents/plugins/marketplace.json directly; Codex owns marketplace snapshots and installed plugin cache state.',
      'The /hooks surface may show hooks from independently installed plugins; this thoth-agents setup plan does not install provider hooks.',
      'Codex Default mode user-input requests require features.default_mode_request_user_input = true and use the request_user_input tool; other modes may not expose it.',
      'Higher-precedence Codex config (project, profile, CLI, system, or admin) may override user config feature flags.',
      'Provider capability is owned by the external provider and is not established by this thoth-agents setup plan.',
    ],
    disclaimers: [
      'Role permissions and provider-per-agent settings are instruction-level or user-managed unless documented Codex runtime controls are available.',
      'Codex reset is managed-only; no broad destructive --force behavior is implemented.',
    ],
  };
}

export function formatCodexSetupPlan(plan: CodexSetupPlan): string {
  const lines = plan.items.map(
    (item) => `- ${item.action}: ${item.targetPath} (${item.description})`,
  );

  return ['Codex setup plan:', ...lines].join('\n');
}

export function applyCodexSetup(plan: CodexSetupPlan): CodexApplyResult {
  const changed: string[] = [];
  const diagnostics: string[] = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  const capability = checkCodexHookCapability(plan.hookCapabilityConfig);
  diagnostics.push(...capability.diagnostics);
  if (plan.dryRun) {
    if (!capability.success)
      diagnostics.push(
        `${capability.error} Planned migration is conditional on the plugin step passing this prerequisite.`,
      );
    return { success: true, changed, diagnostics: uniqueMessages(diagnostics) };
  }
  if (!capability.success)
    return { success: false, changed, diagnostics, error: capability.error };

  try {
    // Revalidate the complete ownership transition before its first mutation.
    // This closes the plan-to-apply window for Worker collisions, obsolete-role
    // ownership state, and replaced role files.
    const stateItem = plan.items.find(
      (item) => item.action === 'write-managed-model-state',
    );
    if (!stateItem)
      throw new Error('Codex managed model state item is missing from plan.');
    const trustedHooks = plan.trustHooks
      ? codexHookTrustEntries(
          JSON.parse(
            readFileSync(
              join(capability.bundlePath ?? '', 'codex-hooks/hooks.json'),
              'utf8',
            ),
          ),
          codexHookSource(plan.pluginId),
          process.platform,
        )
      : {};
    const nextState: ManagedModelState = JSON.parse(stateItem.content ?? '{}');
    // Native plugin installation may have changed config since preview. Capture
    // the actual prior capacity immediately before the first managed write.
    if (plan.priorThreadsValue === undefined)
      nextState.priorThreadsValue = readCodexThreadsValue(
        existsSync(plan.configPath)
          ? readFileSync(plan.configPath, 'utf8')
          : '',
      );
    if (plan.trustHooks)
      nextState.ownedHookTrustKeys = [
        ...new Set([
          ...(nextState.ownedHookTrustKeys ?? []),
          ...Object.keys(trustedHooks),
        ]),
      ];
    const agentsDir = dirname(stateItem.targetPath);
    for (const item of plan.items) {
      if (item.requiresBackup)
        assertSafeBackupDestination(`${item.targetPath}.bak`);
      if (
        item.action === 'write-role-toml' ||
        item.action === 'retire-obsolete-role-toml' ||
        item.action === 'write-install-recovery' ||
        item.action === 'write-managed-model-state'
      ) {
        assertSafeCodexRolePath(item.targetPath, agentsDir);
        assertApplyGuard(item);
      }
    }

    for (const item of plan.items) {
      if (
        item.action === 'diagnose-only' ||
        item.action === 'preserve-role-toml'
      )
        continue;
      if (item.action === 'remove-legacy-root-block') {
        assertSafeCodexRolePath(item.targetPath, dirname(item.targetPath));
        if (
          !item.legacyRootBytes ||
          !item.remainingRootBytes ||
          !readFileSync(item.targetPath).equals(item.legacyRootBytes)
        )
          throw new Error(
            `Legacy Codex root file changed after planning: ${item.targetPath}`,
          );
        assertSafeBackupDestination(`${item.targetPath}.bak`);
        copyFileSync(item.targetPath, `${item.targetPath}.bak`);
        // Keep every byte outside the markers, including all surrounding newlines.
        // Delete whitespace-only migration results; an unmarked file is never touched.
        if (
          item.remainingRootBytes.every(
            (byte) => byte === 32 || (byte >= 9 && byte <= 13),
          )
        )
          rmSync(item.targetPath);
        else safeAtomicWriteFileSync(item.targetPath, item.remainingRootBytes);
        changed.push(item.targetPath);
        diagnostics.push(
          `Removed legacy Codex root block from ${item.targetPath}; backup: ${item.targetPath}.bak`,
        );
        continue;
      }
      if (item.action === 'retire-obsolete-role-toml') {
        const agentsDir = dirname(item.targetPath);
        assertSafeCodexRolePath(item.targetPath, agentsDir);
        assertApplyGuard(item);
        assertSafeCodexRolePath(stateItem.targetPath, agentsDir);
        assertApplyGuard(stateItem);
        if (existsSync(item.targetPath)) {
          rmSync(item.targetPath);
          changed.push(item.targetPath);
        }
        continue;
      }
      if (item.action === 'merge-toml') {
        const result = writeCodexConfigMerge({
          configPath: item.targetPath,
          dryRun: false,
          pluginId: plan.pluginId,
          manageThreads: true,
          priorThreadsValue: plan.priorThreadsValue,
          trustedHooks,
        });
        diagnostics.push(...result.diffSummary, ...result.warnings);
        if (!result.success) throw new Error(result.error);
        if (result.changed) changed.push(item.targetPath);
        continue;
      }
      if (item.content === undefined) continue;
      if (
        item.action === 'write-role-toml' ||
        item.action === 'write-install-recovery' ||
        item.action === 'write-managed-model-state'
      ) {
        assertSafeCodexRolePath(item.targetPath, agentsDir);
        assertApplyGuard(item);
      }
      const wrote =
        item.action === 'write-managed-model-state'
          ? writeManagedModelState(
              item.targetPath,
              MANAGED_MODEL_STATE_VERSION,
              nextState,
            )
          : writeTextWithBackup(item.targetPath, item.content);
      if (wrote) changed.push(item.targetPath);
      if (item.action === 'write-install-recovery') {
        assertSafeCodexRolePath(item.targetPath, agentsDir);
        if (readFileSync(item.targetPath, 'utf8') !== item.content)
          throw new Error(
            `Codex install recovery state changed after writing: ${item.targetPath}`,
          );
      }
      if (item.action === 'write-managed-model-state') {
        const recoveryItem = plan.items.find(
          (candidate) => candidate.action === 'write-install-recovery',
        );
        if (!recoveryItem?.content)
          throw new Error('Codex install recovery item is missing from plan.');
        assertSafeCodexRolePath(recoveryItem.targetPath, agentsDir);
        if (
          !lstatIfPresent(recoveryItem.targetPath) ||
          readFileSync(recoveryItem.targetPath, 'utf8') !== recoveryItem.content
        )
          throw new Error(
            `Codex install recovery state changed before completion: ${recoveryItem.targetPath}`,
          );
        rmSync(recoveryItem.targetPath);
      }
    }
    return { success: true, changed, diagnostics: uniqueMessages(diagnostics) };
  } catch (error) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
