import { join, resolve } from 'node:path';
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  type Pair,
  parseDocument,
  type YAMLMap,
} from 'yaml';
import {
  isPiSpecialistRole,
  PI_SPECIALIST_ROLES,
  type PiSpecialistRole,
  piSpecialistName,
} from '../harness/pi-specialists';
import { getPiSpecialistDefaultTools } from '../harness/writers/pi-agent';
import { writePiManagedText } from './pi-managed-write';
import { readOwnedPiSpecialistDefinition } from './pi-model-config';

export interface PiToolRoleSnapshot {
  role: PiSpecialistRole;
  tools: string[];
  defaultTools: string[];
  disallowedTools: string[];
}

export interface PiToolConfigSnapshot {
  piRoot: string;
  roles: PiToolRoleSnapshot[];
  contents: Partial<Record<PiSpecialistRole, string>>;
}

export interface PiToolRoleInput {
  role: PiSpecialistRole;
  tools: readonly string[];
}

export interface PiToolSaveResult {
  success: boolean;
  changedRoles: PiSpecialistRole[];
  /** Reflects only successful writes; pass it back to retry the same draft. */
  snapshot: PiToolConfigSnapshot;
  error?: string;
}

export interface PiSpecialistToolOverrides {
  tools?: string[];
  disallowedTools?: string[];
  subagentMode?: 'task' | 'background';
}

interface ParsedFrontmatter {
  source: string;
  blockStart: number;
  mapping: YAMLMap;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(content);
  if (!match) throw new Error('Pi specialist has malformed frontmatter.');
  const source = match[1] ?? '';
  const blockStart = /^---\r?\n/.exec(content)?.[0].length;
  if (blockStart === undefined)
    throw new Error('Pi specialist has malformed frontmatter.');

  const document = parseDocument(source, {
    keepSourceTokens: true,
    merge: false,
    strict: true,
    stringKeys: true,
    uniqueKeys: true,
  });
  const mapping = document.contents;
  if (isMap(mapping)) {
    for (const name of ['tools', 'disallowed_tools', 'subagent_mode']) {
      const occurrences = mapping.items.filter(
        ({ key }) => isScalar(key) && key.value === name,
      );
      if (occurrences.length > 1)
        throw new Error(
          `Duplicate ${name} fields in Pi specialist frontmatter.`,
        );
    }
  }
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem)
    throw new Error(
      `Invalid Pi specialist YAML frontmatter: ${problem.message}`,
    );
  if (!isMap(mapping))
    throw new Error('Pi specialist frontmatter must be a YAML mapping.');
  assertSupportedYamlFeatures(mapping);
  return { source, blockStart, mapping };
}

function assertSupportedYamlFeatures(node: unknown): void {
  if (isAlias(node))
    throw new Error(
      'Unsupported YAML aliases in Pi specialist frontmatter; replace aliases with explicit values.',
    );
  if (isScalar(node)) {
    if (node.anchor)
      throw new Error(
        'Unsupported YAML anchors in Pi specialist frontmatter; replace anchors with explicit values.',
      );
    if (node.tag)
      throw new Error(
        'Unsupported YAML tags in Pi specialist frontmatter; use standard untagged values.',
      );
    return;
  }
  if (isSeq(node)) {
    if (node.anchor)
      throw new Error(
        'Unsupported YAML anchors in Pi specialist frontmatter; replace anchors with explicit values.',
      );
    if (node.tag)
      throw new Error(
        'Unsupported YAML tags in Pi specialist frontmatter; use standard untagged values.',
      );
    for (const item of node.items) assertSupportedYamlFeatures(item);
    return;
  }
  if (isMap(node)) {
    if (node.anchor)
      throw new Error(
        'Unsupported YAML anchors in Pi specialist frontmatter; replace anchors with explicit values.',
      );
    if (node.tag)
      throw new Error(
        'Unsupported YAML tags in Pi specialist frontmatter; use standard untagged values.',
      );
    for (const { key, value } of node.items) {
      if (isScalar(key) && key.value === '<<')
        throw new Error(
          'Unsupported YAML merge keys in Pi specialist frontmatter; replace merges with explicit values.',
        );
      assertSupportedYamlFeatures(key);
      assertSupportedYamlFeatures(value);
    }
  }
}

function fieldPair(
  mapping: YAMLMap,
  name: 'tools' | 'disallowed_tools' | 'subagent_mode',
): Pair | undefined {
  return mapping.items.find(({ key }) => isScalar(key) && key.value === name);
}

function scalarString(node: unknown, name: string, source: string): string {
  if (!isScalar(node) || typeof node.value !== 'string')
    throw new Error(`${name} must be a YAML string scalar.`);
  const range = node.range;
  if (
    !range ||
    !node.srcToken ||
    range[0] < 0 ||
    range[1] < range[0] ||
    range[2] < range[1] ||
    range[2] > source.length
  )
    throw new Error(
      `Cannot safely read ${name} without its YAML source range.`,
    );
  const raw = source.slice(range[0], range[1]);
  if (/[\r\n]/.test(raw) || /[\r\n]/.test(node.value))
    throw new Error(
      `Malformed ${name} scalar continuation in Pi specialist frontmatter.`,
    );
  return node.value;
}

function sourceRange(node: unknown, source: string): [number, number] {
  if (!node || typeof node !== 'object' || !('range' in node))
    throw new Error(
      'Cannot safely edit this Pi specialist YAML value without source ranges.',
    );
  const range = node.range;
  const sourceTokens = 'srcToken' in node ? node.srcToken : undefined;
  if (
    !Array.isArray(range) ||
    !sourceTokens ||
    range.length < 3 ||
    !range.every(Number.isInteger) ||
    range[0] < 0 ||
    range[1] < range[0] ||
    range[2] < range[1] ||
    range[2] > source.length
  )
    throw new Error(
      'Cannot safely edit this Pi specialist YAML value using its source range.',
    );
  let end = range[1] as number;
  if (isSeq(node) && !node.flow) {
    const trailingNewline = source
      .slice(range[0] as number, end)
      .match(/\r?\n$/)?.[0];
    if (trailingNewline) end -= trailingNewline.length;
  }
  return [range[0] as number, end];
}

export function validatePiSpecialistTools(tools: readonly string[]): void {
  if (!Array.isArray(tools) || tools.length === 0)
    throw new Error('Select at least one explicit Pi tool.');

  if (tools.includes('@active'))
    throw new Error(
      'Pi tool selector @active is no longer supported; use standalone "*" instead.',
    );

  if (tools.includes('*')) {
    if (tools.length !== 1)
      throw new Error('Pi tool selectors must be selected alone.');
    return;
  }

  const seen = new Set<string>();
  for (const tool of tools) {
    if (typeof tool === 'string' && /[*?[\]{}]/.test(tool))
      throw new Error(`Pi tool wildcards are not supported: ${tool}.`);
    if (
      typeof tool !== 'string' ||
      !tool ||
      tool.trim() !== tool ||
      /[\s,]/.test(tool)
    )
      throw new Error(`Invalid explicit Pi tool name: ${String(tool)}.`);
    const normalized = tool.toLowerCase();
    if (normalized.startsWith('subagent_'))
      throw new Error(`Pi delegation tool names are not allowed: ${tool}.`);
    if (seen.has(tool)) throw new Error(`Duplicate Pi tool name: ${tool}.`);
    seen.add(tool);
  }
}

function parseToolsField(
  mapping: YAMLMap,
  source: string,
): { present: false } | { present: true; tools: string[] } {
  const pair = fieldPair(mapping, 'tools');
  if (!pair) return { present: false };
  if (pair.value === null)
    throw new Error('The tools field must contain an explicit list.');

  let tools: string[];
  if (isSeq(pair.value)) {
    tools = pair.value.items.map((item) => scalarString(item, 'tools', source));
  } else if (isScalar(pair.value)) {
    tools = scalarString(pair.value, 'tools', source)
      .split(',')
      .map((tool) => tool.trim());
  } else {
    throw new Error('The tools field must be a string or a list of strings.');
  }
  validatePiSpecialistTools(tools);
  return { present: true, tools };
}

function parseDisallowedToolsField(
  mapping: YAMLMap,
  source: string,
): string[] | undefined {
  const pair = fieldPair(mapping, 'disallowed_tools');
  if (!pair) return undefined;
  if (
    isScalar(pair.value) &&
    pair.value.value === null &&
    pair.value.source === ''
  )
    return [];
  const value = isSeq(pair.value)
    ? pair.value.items.map((item) =>
        scalarString(item, 'disallowed_tools', source),
      )
    : scalarString(pair.value, 'disallowed_tools', source);
  const names =
    typeof value === 'string' ? (value === '' ? [] : value.split(',')) : value;
  const tools = names.map((name) => name.trim());
  for (const tool of tools) {
    if (!/^[a-zA-Z0-9_.:-]+$/.test(tool))
      throw new Error(
        `disallowed_tools must contain exact Pi tool names: ${tool}.`,
      );
  }
  return [...new Set(tools)];
}

function parseModeField(
  mapping: YAMLMap,
  source: string,
): 'task' | 'background' | undefined {
  const pair = fieldPair(mapping, 'subagent_mode');
  if (!pair) return undefined;
  const mode = scalarString(pair.value, 'subagent_mode', source);
  if (mode !== 'task' && mode !== 'background')
    throw new Error('Invalid subagent_mode; expected "task" or "background".');
  return mode;
}

export function readPiSpecialistToolOverrides(
  content: string,
): PiSpecialistToolOverrides {
  const { mapping, source } = parseFrontmatter(content);
  const parsedTools = parseToolsField(mapping, source);
  const disallowedTools = parseDisallowedToolsField(mapping, source);
  const subagentMode = parseModeField(mapping, source);
  return {
    ...(parsedTools.present ? { tools: parsedTools.tools } : {}),
    ...(disallowedTools !== undefined ? { disallowedTools } : {}),
    ...(subagentMode ? { subagentMode } : {}),
  };
}

export function readPiToolConfig(
  piRoot: string,
  roles: readonly PiSpecialistRole[] = PI_SPECIALIST_ROLES,
): PiToolConfigSnapshot {
  const snapshot: PiToolConfigSnapshot = {
    piRoot: resolve(piRoot),
    roles: [],
    contents: {},
  };
  const seen = new Set<PiSpecialistRole>();
  for (const role of roles) {
    if (!isPiSpecialistRole(role))
      throw new Error(`Unsupported Pi specialist: ${role}`);
    if (seen.has(role)) throw new Error(`Duplicate Pi specialist: ${role}`);
    seen.add(role);
    const content = readOwnedPiSpecialistDefinition(snapshot.piRoot, role);
    snapshot.contents[role] = content;
    const parsed = readPiSpecialistToolOverrides(content);
    snapshot.roles.push({
      role,
      tools: parsed.tools ?? getPiSpecialistDefaultTools(role),
      defaultTools: getPiSpecialistDefaultTools(role),
      disallowedTools: parsed.disallowedTools ?? [],
    });
  }
  return snapshot;
}

function replaceToolsField(content: string, tools: readonly string[]): string {
  const parsed = parseFrontmatter(content);
  const pair = fieldPair(parsed.mapping, 'tools');
  const rendered = JSON.stringify(tools.join(', '));
  if (!pair) {
    if (parsed.mapping.flow)
      throw new Error(
        'Cannot safely add tools to a flow-style Pi specialist frontmatter mapping.',
      );
    const newline =
      parsed.source.match(/\r?\n/)?.[0] ??
      (content.includes('\r\n') ? '\r\n' : '\n');
    return `${content.slice(0, parsed.blockStart)}tools: ${rendered}${newline}${content.slice(parsed.blockStart)}`;
  }
  if (pair.value === null)
    throw new Error('The tools field must contain an explicit list.');

  let [start, end] = sourceRange(pair.value, parsed.source);
  let replacement = rendered;
  const explicitKey =
    pair.srcToken &&
    'explicitKey' in pair.srcToken &&
    pair.srcToken.explicitKey === true;
  if (isSeq(pair.value) && !pair.value.flow && !explicitKey) {
    const [keyStart, keyEnd] = sourceRange(pair.key, parsed.source);
    start = keyStart;
    replacement = `${parsed.source.slice(keyStart, keyEnd)}: ${rendered}`;
  }
  const next =
    content.slice(0, parsed.blockStart + start) +
    replacement +
    content.slice(parsed.blockStart + end);
  const verifiedTools = readPiSpecialistToolOverrides(next).tools;
  if (JSON.stringify(verifiedTools) !== JSON.stringify(tools))
    throw new Error(
      'Cannot safely replace the tools field without changing its parsed value.',
    );
  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function savePiToolConfig(
  snapshot: PiToolConfigSnapshot,
  roles: readonly PiToolRoleInput[],
): PiToolSaveResult {
  const changedRoles: PiSpecialistRole[] = [];
  const nextSnapshot: PiToolConfigSnapshot = {
    ...snapshot,
    roles: structuredClone(snapshot.roles),
    contents: { ...snapshot.contents },
  };
  try {
    const seen = new Set<PiSpecialistRole>();
    for (const input of roles) {
      if (!isPiSpecialistRole(input.role))
        throw new Error(`Unsupported Pi specialist: ${input.role}`);
      if (seen.has(input.role))
        throw new Error(`Duplicate Pi specialist: ${input.role}`);
      seen.add(input.role);
      validatePiSpecialistTools(input.tools);
      const expected = snapshot.contents[input.role];
      if (expected === undefined)
        throw new Error(`Missing specialist snapshot: ${input.role}`);
      readPiSpecialistToolOverrides(expected);
      const current = readOwnedPiSpecialistDefinition(
        snapshot.piRoot,
        input.role,
      );
      readPiSpecialistToolOverrides(current);
      if (current !== expected)
        throw new Error(
          `Pi specialist changed since opening: ${input.role}. Reopen the editor before saving.`,
        );
    }

    for (const input of roles) {
      const current = snapshot.contents[input.role];
      const original = snapshot.roles.find(({ role }) => role === input.role);
      if (!current || !original)
        throw new Error(`Missing specialist snapshot: ${input.role}`);
      if (JSON.stringify(original.tools) === JSON.stringify(input.tools))
        continue;

      const next = replaceToolsField(current, input.tools);
      if (
        readOwnedPiSpecialistDefinition(snapshot.piRoot, input.role) !== current
      )
        throw new Error(
          `Pi specialist changed before saving: ${input.role}. Reopen the editor.`,
        );
      if (
        writePiManagedText(
          join(snapshot.piRoot, 'agents', `${piSpecialistName(input.role)}.md`),
          next,
          current,
        )
      )
        changedRoles.push(input.role);
      nextSnapshot.contents[input.role] = next;
      const nextRole = nextSnapshot.roles.find(
        ({ role }) => role === input.role,
      );
      if (nextRole) nextRole.tools = [...input.tools];
    }
    return { success: true, changedRoles, snapshot: nextSnapshot };
  } catch (error) {
    return {
      success: false,
      changedRoles,
      snapshot: nextSnapshot,
      error: errorMessage(error),
    };
  }
}
