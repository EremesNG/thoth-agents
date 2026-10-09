import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadSubagents, readSubagentsConfig } from '../config.js';
import {
  readToolsFields,
  replaceToolsField,
  validateTools,
} from './frontmatter.js';
import {
  getToolsPanelAdapter,
  type ToolsDefinitionTarget,
  type ToolsPanelAdapter,
} from './registry.js';
import { assertSafeDefinitionPath, writeDefinitionText } from './write.js';

export interface ToolsRoleSnapshot extends ToolsDefinitionTarget {
  tools: string[];
  defaultTools?: string[];
  disallowedTools: string[];
}
export interface ToolsConfigSnapshot {
  cwd: string;
  piRoot: string;
  roles: ToolsRoleSnapshot[];
  contents: Record<string, string>;
  /** Keep validation bound across retries, even if provenance or registration changes. */
  adapters?: Record<string, ToolsPanelAdapter>;
}
export interface ToolsRoleInput {
  role: string;
  tools: readonly string[];
}
export interface ToolsSaveResult {
  success: boolean;
  changedRoles: string[];
  snapshot: ToolsConfigSnapshot;
  error?: string;
}

export function readToolsConfig(cwd: string): ToolsConfigSnapshot {
  const adapters: Record<string, ToolsPanelAdapter> = {};
  const snapshot: ToolsConfigSnapshot = {
    cwd: resolve(cwd),
    piRoot: resolve(
      process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'),
    ),
    roles: [],
    contents: {},
    adapters,
  };
  const adapter = getToolsPanelAdapter();
  const config = readSubagentsConfig(cwd);
  for (const definition of loadSubagents(cwd)) {
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
    snapshot.contents[target.role] = content;
    if (managed) adapters[target.role] = managed;
    snapshot.roles.push({
      ...target,
      tools:
        fields.tools?.length === 0
          ? [...config.default_tools]
          : (fields.tools ??
            (defaults ? [...defaults] : [...definition.tools])),
      ...(defaults ? { defaultTools: [...defaults] } : {}),
      disallowedTools: fields.disallowedTools ?? [],
    });
  }
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
  const nextSnapshot: ToolsConfigSnapshot = {
    ...snapshot,
    roles: structuredClone(snapshot.roles),
    contents: { ...snapshot.contents },
  };
  const changedRoles: string[] = [];
  try {
    const resolved = loadSubagents(snapshot.cwd);
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
