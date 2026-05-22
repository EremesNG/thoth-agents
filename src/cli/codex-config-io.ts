import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

type TomlScalar = string | boolean | number;
type TomlArray = TomlScalar[];
interface TomlTable {
  [key: string]: TomlValue;
}
type TomlValue = TomlScalar | TomlArray | TomlTable;
export type CodexTomlDocument = TomlTable;

export interface CodexConfigMergeResult {
  success: boolean;
  configPath: string;
  backupPath?: string;
  changed: boolean;
  diffSummary: string[];
  warnings: string[];
  error?: string;
}

function isRecord(value: unknown): value is Record<string, TomlValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function splitArrayItems(raw: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | undefined;
  let escaped = false;

  for (const char of raw) {
    if (quote === 'double' && escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote === 'double' && char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (!quote && char === ',') {
      items.push(current.trim());
      current = '';
      continue;
    }
    if (!quote && char === "'") quote = 'single';
    else if (quote === 'single' && char === "'") quote = undefined;
    else if (!quote && char === '"') quote = 'double';
    else if (quote === 'double' && char === '"') quote = undefined;
    current += char;
  }

  if (current.trim()) items.push(current.trim());
  return items;
}

function parseBasicString(value: string): string {
  return value
    .slice(1, -1)
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function parseScalar(raw: string): TomlScalar | TomlArray {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const body = value.slice(1, -1).trim();
    if (!body) return [];
    return splitArrayItems(body).map(parseScalar) as TomlScalar[];
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return parseBasicString(value);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseTomlKeySegment(raw: string): string {
  const segment = raw.trim();
  if (segment.startsWith('"') && segment.endsWith('"')) {
    return parseBasicString(segment);
  }
  if (segment.startsWith("'") && segment.endsWith("'")) {
    return segment.slice(1, -1);
  }
  return segment;
}

function parseTomlKeyPath(raw: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | undefined;
  let escaped = false;

  for (const char of raw) {
    if (quote === 'double' && escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote === 'double' && char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (!quote && char === '.') {
      segments.push(parseTomlKeySegment(current));
      current = '';
      continue;
    }
    if (!quote && char === "'") quote = 'single';
    else if (quote === 'single' && char === "'") quote = undefined;
    else if (!quote && char === '"') quote = 'double';
    else if (quote === 'double' && char === '"') quote = undefined;
    current += char;
  }

  segments.push(parseTomlKeySegment(current));
  return segments;
}

function ensureTable(
  root: CodexTomlDocument,
  path: string[],
): Record<string, TomlValue> {
  let current: Record<string, TomlValue> = root;
  for (const segment of path) {
    const existing = current[segment];
    if (!isRecord(existing)) current[segment] = {};
    current = current[segment] as Record<string, TomlValue>;
  }
  return current;
}

export function parseCodexToml(content: string): CodexTomlDocument {
  const root: CodexTomlDocument = {};
  let table: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const arrayTableMatch = /^\[\[([^\]]+)\]\]$/.exec(trimmed);
    const tableMatch = /^\[([^\]]+)\]$/.exec(trimmed);
    const tablePath = arrayTableMatch?.[1] ?? tableMatch?.[1];
    if (tablePath) {
      table = parseTomlKeyPath(tablePath);
      ensureTable(root, table);
      continue;
    }
    const assignment = /^([^=]+)=(.*)$/.exec(trimmed);
    if (!assignment) throw new Error(`Unsupported TOML line: ${rawLine}`);
    ensureTable(root, table)[assignment[1].trim()] = parseScalar(assignment[2]);
  }

  return root;
}

function renderScalar(value: TomlScalar): string {
  if (typeof value === 'string') {
    const canUseLiteralString =
      value.includes('\\') &&
      !value.includes("'") &&
      [...value].every((char) => char.charCodeAt(0) >= 0x20);
    if (canUseLiteralString) {
      return `'${value}'`;
    }
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return String(value);
}

function renderValue(value: TomlScalar | TomlArray): string {
  if (Array.isArray(value)) return `[${value.map(renderScalar).join(', ')}]`;
  return renderScalar(value);
}

function renderTomlKeySegment(segment: string): string {
  if (/^[A-Za-z0-9_]+$/.test(segment)) return segment;
  const canUseLiteralKey =
    (segment.includes('\\') || segment.includes('.')) &&
    !segment.includes("'") &&
    [...segment].every((char) => char.charCodeAt(0) >= 0x20);
  if (canUseLiteralKey) return `'${segment}'`;
  return `"${segment.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderTomlSection(
  lines: string[],
  value: Record<string, TomlValue>,
  path: string[] = [],
): void {
  if (path.length > 0)
    lines.push(`[${path.map(renderTomlKeySegment).join('.')}]`);
  const nested: [string, Record<string, TomlValue>][] = [];
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (isRecord(entry)) nested.push([key, entry]);
    else lines.push(`${key} = ${renderValue(entry)}`);
  }
  if (path.length > 0) lines.push('');
  for (const [key, entry] of nested)
    renderTomlSection(lines, entry, [...path, key]);
}

export function renderCodexTomlDocument(document: CodexTomlDocument): string {
  const lines: string[] = [];
  renderTomlSection(lines, document);
  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

export function mergeCodexManagedConfig(
  document: CodexTomlDocument,
  options: { pluginId?: string },
): { content: string; diffSummary: string[]; warnings: string[] } {
  const features = ensureTable(document, ['features']);
  features.default_mode_request_user_input = true;
  const diffSummary = ['ensure features.default_mode_request_user_input = true'];

  if (options.pluginId) {
    const plugin = ensureTable(document, ['plugins', options.pluginId]);
    plugin.enabled = true;
    diffSummary.push(`ensure plugins."${options.pluginId}".enabled = true`);
  } else {
    diffSummary.push(
      'plugin enablement left to /plugins; no guessed plugin id written',
    );
  }

  return {
    content: renderCodexTomlDocument(document),
    diffSummary,
    warnings: [
      'Codex TOML comments and formatting may be rewritten; a backup is created before apply.',
    ],
  };
}

export function writeCodexConfigMerge(options: {
  configPath: string;
  dryRun?: boolean;
  pluginId?: string;
}): CodexConfigMergeResult {
  try {
    const before = existsSync(options.configPath)
      ? readFileSync(options.configPath, 'utf8')
      : '';
    const parsed = parseCodexToml(before);
    const merged = mergeCodexManagedConfig(parsed, {
      pluginId: options.pluginId,
    });
    const changed = before !== merged.content;
    if (options.dryRun || !changed) {
      return {
        success: true,
        configPath: options.configPath,
        changed,
        diffSummary: merged.diffSummary,
        warnings: merged.warnings,
      };
    }

    mkdirSync(dirname(options.configPath), { recursive: true });
    const backupPath = `${options.configPath}.bak`;
    if (existsSync(options.configPath))
      copyFileSync(options.configPath, backupPath);
    const tmpPath = `${options.configPath}.tmp`;
    writeFileSync(tmpPath, merged.content);
    renameSync(tmpPath, options.configPath);
    return {
      success: true,
      configPath: options.configPath,
      backupPath: existsSync(backupPath) ? backupPath : undefined,
      changed,
      diffSummary: merged.diffSummary,
      warnings: merged.warnings,
    };
  } catch (error) {
    return {
      success: false,
      configPath: options.configPath,
      changed: false,
      diffSummary: [],
      warnings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
