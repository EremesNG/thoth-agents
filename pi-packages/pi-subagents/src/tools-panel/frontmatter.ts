import { createRequire } from 'node:module';
import { join } from 'node:path';
import { getPackageDir } from '@earendil-works/pi-coding-agent';
import type { Pair, YAMLMap } from 'yaml';

// Resolve Pi's parser as config.ts does; no bundled/private YAML dependency.
const yaml = (() => {
  try {
    return createRequire(join(getPackageDir(), 'package.json'))(
      'yaml',
    ) as typeof import('yaml');
  } catch {
    return undefined;
  }
})();
const { isAlias, isMap, isScalar, isSeq, parseDocument } =
  yaml ?? ({} as typeof import('yaml'));

export interface ToolsFields {
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
  if (!yaml)
    throw new Error(
      'YAML frontmatter validation is unavailable; no files were changed.',
    );
  const match =
    /^(?:\uFEFF)?---[^\S\r\n]*(?:#[^\r\n]*)?\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:#[^\r\n]*)?(?=\r?\n|$)/.exec(
      content,
    );
  if (!match) throw new Error('Subagent has malformed frontmatter.');
  const source = match[1] ?? '';
  const blockStart = /^(?:\uFEFF)?---[^\S\r\n]*(?:#[^\r\n]*)?\r?\n/.exec(
    content,
  )?.[0].length;
  if (blockStart === undefined)
    throw new Error('Subagent has malformed frontmatter.');

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
        throw new Error(`Duplicate ${name} fields in Subagent frontmatter.`);
    }
  }
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem)
    throw new Error(`Invalid Subagent YAML frontmatter: ${problem.message}`);
  if (!isMap(mapping))
    throw new Error('Subagent frontmatter must be a YAML mapping.');
  assertSupportedYamlFeatures(mapping);
  return { source, blockStart, mapping };
}

function assertSupportedYamlFeatures(node: unknown): void {
  if (isAlias(node))
    throw new Error(
      'Unsupported YAML aliases in Subagent frontmatter; replace aliases with explicit values.',
    );
  if (isScalar(node)) {
    if (node.anchor)
      throw new Error(
        'Unsupported YAML anchors in Subagent frontmatter; replace anchors with explicit values.',
      );
    if (node.tag)
      throw new Error(
        'Unsupported YAML tags in Subagent frontmatter; use standard untagged values.',
      );
    return;
  }
  if (isSeq(node)) {
    if (node.anchor)
      throw new Error(
        'Unsupported YAML anchors in Subagent frontmatter; replace anchors with explicit values.',
      );
    if (node.tag)
      throw new Error(
        'Unsupported YAML tags in Subagent frontmatter; use standard untagged values.',
      );
    for (const item of node.items) assertSupportedYamlFeatures(item);
    return;
  }
  if (isMap(node)) {
    if (node.anchor)
      throw new Error(
        'Unsupported YAML anchors in Subagent frontmatter; replace anchors with explicit values.',
      );
    if (node.tag)
      throw new Error(
        'Unsupported YAML tags in Subagent frontmatter; use standard untagged values.',
      );
    for (const { key, value } of node.items) {
      if (isScalar(key) && key.value === '<<')
        throw new Error(
          'Unsupported YAML merge keys in Subagent frontmatter; replace merges with explicit values.',
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
      `Malformed ${name} scalar continuation in Subagent frontmatter.`,
    );
  return node.value;
}

function sourceRange(node: unknown, source: string): [number, number] {
  if (!node || typeof node !== 'object' || !('range' in node))
    throw new Error(
      'Cannot safely edit this Subagent YAML value without source ranges.',
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
      'Cannot safely edit this Subagent YAML value using its source range.',
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

export function validateTools(tools: readonly string[]): void {
  if (!Array.isArray(tools) || tools.length === 0)
    throw new Error('Select at least one Subagent tool name or glob.');

  if (tools.includes('@active'))
    throw new Error(
      'Subagent tool selector @active is no longer supported; select exact tool names instead.',
    );

  const seen = new Set<string>();
  for (const tool of tools) {
    if (
      typeof tool !== 'string' ||
      !tool ||
      tool.trim() !== tool ||
      /[\s,]/.test(tool)
    )
      throw new Error(`Invalid Subagent tool name or glob: ${String(tool)}.`);
    const normalized = tool.toLowerCase();
    if (!/[*?[\]{}]/.test(tool) && normalized.startsWith('subagent_'))
      throw new Error(`Pi delegation tool names are not allowed: ${tool}.`);
    if (seen.has(tool))
      throw new Error(`Duplicate Subagent tool name: ${tool}.`);
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
  // Pi interprets an explicit empty list as configured default_tools. Never
  // materialize that fallback until the operator actually changes the selection.
  if (tools.length) validateTools(tools);
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
        `disallowed_tools must contain exact Subagent tool names: ${tool}.`,
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

export function readToolsFields(content: string): ToolsFields {
  if (!/^(?:\uFEFF)?---/.test(content)) return {};
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

export function replaceToolsField(
  content: string,
  tools: readonly string[],
): string {
  if (!/^(?:\uFEFF)?---/.test(content)) {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    return `---${newline}tools: ${JSON.stringify(tools.join(', '))}${newline}---${newline}${content}`;
  }
  const parsed = parseFrontmatter(content);
  const pair = fieldPair(parsed.mapping, 'tools');
  const rendered = JSON.stringify(tools.join(', '));
  if (!pair) {
    if (parsed.mapping.flow)
      throw new Error(
        'Cannot safely add tools to a flow-style Subagent frontmatter mapping.',
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
  const verifiedTools = readToolsFields(next).tools;
  if (JSON.stringify(verifiedTools) !== JSON.stringify(tools))
    throw new Error(
      'Cannot safely replace the tools field without changing its parsed value.',
    );
  return next;
}
