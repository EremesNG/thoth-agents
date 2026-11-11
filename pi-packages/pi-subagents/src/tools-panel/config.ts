import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  agentsDirSources,
  loadSubagents,
  loadSubagentsFromDir,
  parseToolOverlay,
  readSubagentsConfig,
} from '../config.js';
import {
  composeToolSelection,
  resolveEffectiveToolSelection,
} from '../tool-patterns.js';
import type { SubagentToolOverlay } from '../types.js';
import {
  nonToolsDifferences,
  readToolsFields,
  replaceToolsField,
  validateTools,
} from './frontmatter.js';
import {
  getToolsPanelAdapter,
  type ToolsDefinitionTarget,
  type ToolsPanelAdapter,
} from './registry.js';
import {
  assertSafeDefinitionPath,
  retireDefinitionText,
  writeDefinitionText,
  writeProjectOverlayText,
} from './write.js';

export interface ToolsRoleSnapshot extends ToolsDefinitionTarget {
  tools: string[];
  defaultTools?: string[];
  disallowedTools: string[];
  overlay?: SubagentToolOverlay;
  shadowedBy?: string;
}
export interface ToolsConfigSnapshot {
  cwd: string;
  piRoot: string;
  enableAskOrchestrator?: boolean;
  enableNotifyOrchestrator?: boolean;
  initialScope?: 'global' | 'project';
  editScope?: 'global' | 'project';
  globalRoles?: ToolsRoleSnapshot[];
  globalContents?: Record<string, string>;
  globalAdapters?: Record<string, ToolsPanelAdapter>;
  projectConfigContent?: string | null;
  roles: ToolsRoleSnapshot[];
  contents: Record<string, string>;
  /** Keep validation bound across retries, even if provenance or registration changes. */
  adapters?: Record<string, ToolsPanelAdapter>;
}
export interface ToolsRoleInput {
  role: string;
  tools: readonly string[];
  overlay?: SubagentToolOverlay;
}
export interface ToolsSaveResult {
  success: boolean;
  changedRoles: string[];
  snapshot: ToolsConfigSnapshot;
  error?: string;
}

function globalDefinitions(cwd: string): ReturnType<typeof loadSubagents> {
  const global = new Map<string, ReturnType<typeof loadSubagents>[number]>();
  for (const source of agentsDirSources(cwd).filter(
    (source) => source.scope === 'global',
  )) {
    const blocked = new Set<string>();
    for (const definition of loadSubagentsFromDir(
      source.dir,
      source.scope,
      (entry) => blocked.add(entry.name),
    ))
      global.set(definition.name, definition);
    for (const name of blocked) global.delete(name);
  }
  const defaults = readSubagentsConfig(cwd).default_tools;
  for (const definition of global.values())
    if (!definition.tools.length) definition.tools = [...defaults];
  return [...global.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function readToolsConfig(cwd: string): ToolsConfigSnapshot {
  const resolved = loadSubagents(cwd);
  const config = readSubagentsConfig(cwd);
  const snapshot: ToolsConfigSnapshot = {
    enableAskOrchestrator: config.enable_ask_orchestrator,
    enableNotifyOrchestrator: config.enable_notify_orchestrator,
    cwd: resolve(cwd),
    piRoot: resolve(
      process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'),
    ),
    roles: [],
    contents: {},
  };
  const adapter = getToolsPanelAdapter();
  const collect = (definitions: typeof resolved) => {
    const roles: ToolsRoleSnapshot[] = [];
    const contents: Record<string, string> = {};
    const adapters: Record<string, ToolsPanelAdapter> = {};
    for (const definition of definitions) {
      const target: ToolsDefinitionTarget = {
        role: definition.name,
        filePath: resolve(definition.filePath),
        scope: definition.scope ?? 'global',
      };
      assertSafeDefinitionPath(target.filePath);
      const content = readFileSync(target.filePath, 'utf8');
      const fields = readToolsFields(content);
      const managed = adapter?.appliesTo(target, content) ? adapter : undefined;
      managed?.validate(target, content);
      const defaults = managed?.defaultTools?.(target, content);
      if (defaults) validateTools(defaults);
      contents[target.role] = content;
      if (managed) adapters[target.role] = managed;
      roles.push({
        ...target,
        // Preserve explicit entries even when runtime filtering excludes them.
        tools: [...(fields.tools?.length ? fields.tools : definition.tools)],
        ...(defaults ? { defaultTools: [...defaults] } : {}),
        disallowedTools: fields.disallowedTools ?? [],
        ...(definition.toolOverlay
          ? { overlay: structuredClone(definition.toolOverlay) }
          : {}),
      });
    }
    return { roles, contents, adapters };
  };
  const global = collect(globalDefinitions(cwd));
  snapshot.globalRoles = global.roles;
  snapshot.globalContents = global.contents;
  snapshot.globalAdapters = global.adapters;
  Object.assign(snapshot, collect(resolved));
  for (const role of snapshot.globalRoles) {
    const winner = snapshot.roles.find((entry) => entry.role === role.role);
    if (winner?.scope === 'project') role.shadowedBy = winner.filePath;
  }
  const configPath = join(snapshot.cwd, '.pi', 'subagents.json');
  assertSafeDefinitionPath(configPath);
  try {
    snapshot.projectConfigContent = readFileSync(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    snapshot.projectConfigContent = null;
  }
  const raw =
    snapshot.projectConfigContent === null
      ? {}
      : JSON.parse(snapshot.projectConfigContent);
  snapshot.initialScope =
    (raw.agents &&
      typeof raw.agents === 'object' &&
      Object.keys(raw.agents).length > 0) ||
    snapshot.globalRoles.some((role) => role.shadowedBy)
      ? 'project'
      : 'global';
  return snapshot;
}

function currentContent(
  snapshot: ToolsConfigSnapshot,
  target: ToolsRoleSnapshot,
): string {
  assertSafeDefinitionPath(target.filePath);
  const content = readFileSync(target.filePath, 'utf8');
  readToolsFields(content);
  // A file managed on open may never escape validation by removing its markers.
  const registered = getToolsPanelAdapter();
  const adapter =
    snapshot.adapters?.[target.role] ??
    (registered?.appliesTo(target, content) ? registered : undefined);
  adapter?.validate(target, content);
  return content;
}

export function saveToolsConfig(
  snapshot: ToolsConfigSnapshot,
  inputs: readonly ToolsRoleInput[],
): ToolsSaveResult {
  if (snapshot.editScope === 'project')
    return saveProjectToolsConfig(snapshot, inputs);
  if (snapshot.editScope === 'global' && snapshot.globalRoles) {
    const globalSnapshot = {
      ...snapshot,
      roles: snapshot.globalRoles,
      contents: snapshot.globalContents ?? {},
      adapters: snapshot.globalAdapters,
    };
    const result = saveDefinitionToolsConfig(globalSnapshot, inputs, true);
    const roles = structuredClone(snapshot.roles);
    const contents = { ...snapshot.contents };
    // Keep the Project baseline in sync with our own Global writes, including
    // partial saves, but never replace a shadowing project's definition.
    for (const name of result.changedRoles) {
      const effective = roles.find((role) => role.role === name);
      const global = result.snapshot.roles.find((role) => role.role === name);
      const content = result.snapshot.contents[name];
      if (
        effective &&
        global &&
        effective.filePath === global.filePath &&
        content !== undefined
      ) {
        effective.tools = [...global.tools];
        contents[name] = content;
      }
    }
    return {
      ...result,
      snapshot: {
        ...snapshot,
        globalRoles: result.snapshot.roles,
        globalContents: result.snapshot.contents,
        roles,
        contents,
      },
    };
  }
  return saveDefinitionToolsConfig(snapshot, inputs);
}

function saveDefinitionToolsConfig(
  snapshot: ToolsConfigSnapshot,
  inputs: readonly ToolsRoleInput[],
  globalOnly = false,
): ToolsSaveResult {
  const nextSnapshot: ToolsConfigSnapshot = {
    ...snapshot,
    roles: structuredClone(snapshot.roles),
    contents: { ...snapshot.contents },
  };
  const changedRoles: string[] = [];
  try {
    const resolved = globalOnly
      ? globalDefinitions(snapshot.cwd)
      : loadSubagents(snapshot.cwd);
    const seen = new Set<string>();
    const preflight: Array<{
      input: ToolsRoleInput;
      target: ToolsRoleSnapshot;
      expected: string;
    }> = [];
    for (const input of inputs) {
      if (seen.has(input.role))
        throw new Error(`Duplicate subagent: ${input.role}`);
      seen.add(input.role);
      validateTools(input.tools);
      const target = snapshot.roles.find(({ role }) => role === input.role);
      const expected = snapshot.contents[input.role];
      if (!target || expected === undefined)
        throw new Error(`Missing definition snapshot: ${input.role}`);
      if (
        !resolved.some(
          (definition) =>
            definition.name === input.role &&
            resolve(definition.filePath) === target.filePath,
        )
      )
        throw new Error(
          `Subagent resolution changed since opening: ${input.role}. Reopen the editor.`,
        );
      if (currentContent(snapshot, target) !== expected)
        throw new Error(
          `Subagent changed since opening: ${input.role}. Reopen the editor before saving.`,
        );
      preflight.push({ input, target, expected });
    }
    for (const { input, target, expected } of preflight) {
      if (JSON.stringify(target.tools) === JSON.stringify(input.tools))
        continue;
      const next = replaceToolsField(expected, input.tools);
      if (currentContent(snapshot, target) !== expected)
        throw new Error(
          `Subagent changed before saving: ${input.role}. Reopen the editor.`,
        );
      if (writeDefinitionText(target.filePath, next, expected))
        changedRoles.push(input.role);
      nextSnapshot.contents[input.role] = next;
      nextSnapshot.roles = nextSnapshot.roles.map((role) =>
        role.role === input.role ? { ...role, tools: [...input.tools] } : role,
      );
    }
    return { success: true, changedRoles, snapshot: nextSnapshot };
  } catch (error) {
    return {
      success: false,
      changedRoles,
      snapshot: nextSnapshot,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Save only changed per-agent tools, retaining unknown JSON fields and untouched agents. */
export function saveProjectToolsConfig(
  snapshot: ToolsConfigSnapshot,
  inputs: readonly ToolsRoleInput[],
  writeOverlay: typeof writeProjectOverlayText = writeProjectOverlayText,
): ToolsSaveResult {
  try {
    const current = readToolsConfig(snapshot.cwd);
    for (const { role } of inputs) {
      if (
        JSON.stringify(selectionDependencies(current, role)) !==
        JSON.stringify(selectionDependencies(snapshot, role))
      )
        throw new Error(
          `Subagent resolution or configuration changed since opening: ${role}. Reopen the editor.`,
        );
    }
    const expected = snapshot.projectConfigContent ?? null;
    const raw = expected === null ? {} : JSON.parse(expected);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Project subagents.json must be an object.');
    const agents = raw.agents ?? {};
    if (!agents || typeof agents !== 'object' || Array.isArray(agents))
      throw new Error('Project agents must be an object.');
    const changedRoles: string[] = [];
    const roles = structuredClone(snapshot.roles);
    const seen = new Set<string>();
    for (const input of inputs) {
      if (seen.has(input.role))
        throw new Error(`Duplicate subagent: ${input.role}`);
      seen.add(input.role);
      const role = roles.find((role) => role.role === input.role);
      if (!role) throw new Error(`Missing definition snapshot: ${input.role}`);
      const overlay = input.overlay ?? { add: [], remove: [] };
      const parsed = parseToolOverlay(overlay, (message) => {
        throw new Error(message);
      });
      if (!parsed) throw new Error('Invalid overlay');
      if (
        JSON.stringify(role.overlay ?? { add: [], remove: [] }) ===
        JSON.stringify(overlay)
      )
        continue;
      const agent = agents[input.role] ?? {};
      if (!agent || typeof agent !== 'object' || Array.isArray(agent))
        throw new Error(`Invalid agent: ${input.role}`);
      if (overlay.add.length || overlay.remove.length)
        agent.tools = {
          ...agent.tools,
          add: [...overlay.add],
          remove: [...overlay.remove],
        };
      else delete agent.tools;
      if (Object.keys(agent).length) agents[input.role] = agent;
      else delete agents[input.role];
      role.overlay = structuredClone(overlay);
      changedRoles.push(input.role);
    }
    if (Object.keys(agents).length) raw.agents = agents;
    else delete raw.agents;
    const content = changedRoles.length
      ? `${JSON.stringify(raw, null, 2)}\n`
      : expected;
    writeOverlay(snapshot.cwd, content, expected);
    return {
      success: true,
      changedRoles,
      snapshot: { ...snapshot, roles, projectConfigContent: content },
    };
  } catch (error) {
    return {
      success: false,
      changedRoles: [],
      snapshot,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type ToolsConversionPlan =
  | { eligible: false; error: string }
  | {
      eligible: true;
      overlay: SubagentToolOverlay;
      differences: string[];
      dependencies: string;
    };

function selectionDependencies(snapshot: ToolsConfigSnapshot, name: string) {
  const role = snapshot.roles.find((role) => role.role === name);
  return {
    piRoot: snapshot.piRoot,
    role: role && {
      filePath: role.filePath,
      scope: role.scope,
      tools: role.tools,
      disallowedTools: role.disallowedTools,
    },
    content: snapshot.contents[name],
    ask: snapshot.enableAskOrchestrator ?? true,
    notify: snapshot.enableNotifyOrchestrator ?? true,
  };
}

function conversionDependencies(
  snapshot: ToolsConfigSnapshot,
  name: string,
  inventory: readonly string[],
): string {
  return JSON.stringify({
    selection: selectionDependencies(snapshot, name),
    global: snapshot.globalRoles?.find((role) => role.role === name),
    globalContent: snapshot.globalContents?.[name],
    projectConfig: snapshot.projectConfigContent ?? null,
    inventory: [...new Set(inventory)].sort(),
  });
}

/** Candidate replaces, rather than composes with, the existing overlay. */
export function prepareToolsConversion(
  snapshot: ToolsConfigSnapshot,
  name: string,
  inventory: readonly string[],
): ToolsConversionPlan {
  const copy = snapshot.roles.find((role) => role.role === name);
  const global = snapshot.globalRoles?.find((role) => role.role === name);
  if (copy?.scope !== 'project' || !global)
    return {
      eligible: false,
      error: 'Conversion requires a project copy with a global counterpart.',
    };
  for (const source of agentsDirSources(snapshot.cwd).filter(
    (source) => source.scope === 'project',
  )) {
    if (!existsSync(source.dir)) continue;
    if (
      readdirSync(source.dir).some(
        (file) =>
          file.endsWith('.md') &&
          file.slice(0, -3).trim().toLowerCase() === name &&
          resolve(source.dir, file) !== copy.filePath,
      )
    )
      return {
        eligible: false,
        error:
          'Cannot convert: another same-name project definition would remain.',
      };
  }
  const copySelection = new Set(composeToolSelection(copy.tools, inventory));
  const overlay = {
    add: copy.tools.filter((entry) => !global.tools.includes(entry)),
    remove: composeToolSelection(global.tools, inventory).filter(
      (name) => !copySelection.has(name),
    ),
  };
  const effective = (
    role: ToolsRoleSnapshot,
    selection?: SubagentToolOverlay,
  ) =>
    resolveEffectiveToolSelection(
      role.tools,
      inventory,
      role.disallowedTools,
      snapshot.enableAskOrchestrator ?? true,
      snapshot.enableNotifyOrchestrator ?? true,
      selection,
    ).sort();
  const before = JSON.stringify(effective(copy, copy.overlay));
  if (JSON.stringify(effective(global, overlay)) !== before)
    return {
      eligible: false,
      error:
        'Cannot convert: global plus candidate changes the effective selection.',
    };
  if (JSON.stringify(effective(copy, overlay)) !== before)
    return {
      eligible: false,
      error:
        'Cannot convert: intermediate copy plus candidate changes the effective selection.',
    };
  const copyContent = snapshot.contents[name];
  const globalContent = snapshot.globalContents?.[name];
  if (copyContent === undefined || globalContent === undefined)
    return {
      eligible: false,
      error: 'Missing definition content snapshot; reopen /subagents-tools.',
    };
  return {
    eligible: true,
    overlay,
    differences: nonToolsDifferences(copyContent, globalContent),
    dependencies: conversionDependencies(snapshot, name, inventory),
  };
}

export function convertToolsDefinition(
  snapshot: ToolsConfigSnapshot,
  name: string,
  inventory: readonly string[],
  io: {
    retire?: typeof retireDefinitionText;
    writeOverlay?: typeof writeProjectOverlayText;
    plan?: Extract<ToolsConversionPlan, { eligible: true }>;
  } = {},
): ToolsSaveResult {
  let written = false;
  let retired = false;
  let failure: string | undefined;
  let refreshed = snapshot;
  try {
    const plan = io.plan ?? prepareToolsConversion(snapshot, name, inventory);
    if (!plan.eligible) throw new Error(plan.error);
    const copy = snapshot.roles.find((role) => role.role === name);
    const global = snapshot.globalRoles?.find((role) => role.role === name);
    const copyContent = snapshot.contents[name];
    if (!copy || !global || copyContent === undefined)
      throw new Error('Missing definition snapshot; reopen /subagents-tools.');
    for (const [target, expected] of [
      [copy, snapshot.contents[name]],
      [global, snapshot.globalContents?.[name]],
    ] as const) {
      assertSafeDefinitionPath(target.filePath);
      if (
        expected === undefined ||
        readFileSync(target.filePath, 'utf8') !== expected
      )
        throw new Error(
          `Subagent target changed since preflight: ${target.filePath}`,
        );
    }
    // Re-resolve winners, inherited tools, flags and overlay, not just the
    // snapshotted paths: a new higher-priority source can leave both files intact.
    const current = readToolsConfig(snapshot.cwd);
    const currentPlan = prepareToolsConversion(current, name, inventory);
    if (
      !currentPlan.eligible ||
      currentPlan.dependencies !== plan.dependencies ||
      JSON.stringify(currentPlan.overlay) !== JSON.stringify(plan.overlay) ||
      JSON.stringify(currentPlan.differences) !==
        JSON.stringify(plan.differences)
    )
      throw new Error(
        'Conversion inputs changed since preflight; reopen /subagents-tools.',
      );
    const result = saveProjectToolsConfig(
      snapshot,
      [{ role: name, tools: copy.tools, overlay: plan.overlay }],
      io.writeOverlay,
    );
    if (!result.success)
      throw new Error(result.error ?? 'Overlay write failed.');
    written = true;
    refreshed = result.snapshot;
    (io.retire ?? retireDefinitionText)(copy.filePath, copyContent);
    retired = true;
  } catch (error) {
    failure = `${written ? 'Partial state: project overlay was written; project copy was not retired. ' : ''}${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    refreshed = readToolsConfig(snapshot.cwd);
  } catch (error) {
    failure = `${failure ?? (retired ? 'Conversion completed; backup retained.' : 'No conversion completed.')} Snapshot refresh failed; reopen /subagents-tools: ${error instanceof Error ? error.message : String(error)}`;
  }
  return {
    success: !failure,
    changedRoles: written ? [name] : [],
    snapshot: refreshed,
    error: failure,
  };
}
