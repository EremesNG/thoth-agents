import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { assertSafeBackupDestination } from './managed-state-io';
import { safeAtomicWriteFileSync } from './safe-atomic-write';

type TomlScalar = string | boolean | number;
type TomlArray = TomlScalar[];
interface TomlTable {
  [key: string]: TomlValue;
}
type TomlValue = TomlScalar | TomlArray | TomlTable;
const arrayTablePathsSymbol = Symbol('codexArrayTablePaths');
export type CodexTomlDocument = TomlTable & {
  [arrayTablePathsSymbol]?: Set<string>;
};

export interface CodexConfigMergeResult {
  success: boolean;
  configPath: string;
  backupPath?: string;
  changed: boolean;
  diffSummary: string[];
  warnings: string[];
  /** Raw prior TOML integer, or null when originally absent. */
  priorThreadsValue?: string | null;
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
    .replace(
      /\\(U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|[btnfr"\\])/g,
      (_, sequence: string) => {
        if (sequence.startsWith('u') || sequence.startsWith('U'))
          return String.fromCodePoint(Number.parseInt(sequence.slice(1), 16));
        return (
          {
            b: '\b',
            t: '\t',
            n: '\n',
            f: '\f',
            r: '\r',
            '"': '"',
            '\\': '\\',
          } as Record<string, string>
        )[sequence];
      },
    );
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

function tomlPathKey(path: string[]): string {
  return JSON.stringify(path);
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
  const arrayTablePaths = new Set<string>();
  root[arrayTablePathsSymbol] = arrayTablePaths;
  let table: string[] = [];

  for (const statement of tomlStatements(content)) {
    const header = tomlHeader(statement.code);
    if (header) {
      table = header.path;
      if (header.array) arrayTablePaths.add(tomlPathKey(table));
      ensureTable(root, table);
      continue;
    }
    const assignment = tomlAssignment(statement.code);
    if (!assignment)
      throw new Error('Unsupported TOML statement in Codex config');
    const path = [...table, ...parseTomlKeyPath(assignment.key)];
    ensureTable(root, path.slice(0, -1))[path.at(-1) ?? ''] = parseScalar(
      assignment.value,
    );
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
  arrayTablePaths: Set<string>,
  path: string[] = [],
): void {
  if (path.length > 0) {
    const header = path.map(renderTomlKeySegment).join('.');
    lines.push(
      arrayTablePaths.has(tomlPathKey(path)) ? `[[${header}]]` : `[${header}]`,
    );
  }
  const nested: [string, Record<string, TomlValue>][] = [];
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (isRecord(entry)) nested.push([key, entry]);
    else lines.push(`${key} = ${renderValue(entry)}`);
  }
  if (path.length > 0) lines.push('');
  for (const [key, entry] of nested)
    renderTomlSection(lines, entry, arrayTablePaths, [...path, key]);
}

export function renderCodexTomlDocument(document: CodexTomlDocument): string {
  const lines: string[] = [];
  renderTomlSection(
    lines,
    document,
    document[arrayTablePathsSymbol] ?? new Set(),
  );
  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

export function mergeCodexManagedConfig(
  document: CodexTomlDocument,
  options: { pluginId?: string },
): { content: string; diffSummary: string[]; warnings: string[] } {
  const features = ensureTable(document, ['features']);
  features.default_mode_request_user_input = true;
  const diffSummary = [
    'ensure features.default_mode_request_user_input = true',
  ];

  if (options.pluginId) {
    const plugin = ensureTable(document, ['plugins', options.pluginId]);
    plugin.enabled = true;
    diffSummary.push(`ensure plugins."${options.pluginId}".enabled = true`);
  } else {
    diffSummary.push(
      'plugin installation and enablement owned by the native Codex plugin manager; no plugin table written',
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

interface TomlLine {
  text: string;
  eol: string;
}

function splitTomlLines(content: string): TomlLine[] {
  return (content.match(/[^\r\n]*(?:\r\n|\n|\r)|[^\r\n]+$/g) ?? []).map(
    (rawLine) => {
      const eol = /(\r\n|\n|\r)$/.exec(rawLine)?.[1] ?? '';
      return {
        text: eol ? rawLine.slice(0, -eol.length) : rawLine,
        eol,
      };
    },
  );
}

function tomlLineBreak(content: string): string {
  return /(\r\n|\n|\r)/.exec(content)?.[1] ?? '\n';
}

/** Scan logical statements, not physical lines: quoted #/[] and multiline
 * values must never become comments, headers, or managed assignments.
 * Keep original offsets so patching never serializes unrelated TOML.
 */
function tomlStatements(content: string) {
  const lines = splitTomlLines(content);
  const statements: { index: number; endIndex: number; code: string }[] = [];
  let quote = '';
  let depth = 0;
  let code = '';
  let start = 0;
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index].text;
    if (!code) start = index;
    for (let pos = 0; pos < text.length; pos++) {
      const char = text[pos];
      if (quote) {
        if (quote[0] === '"' && char === '\\') {
          code += text.slice(pos, pos + 2);
          pos++;
        } else if (text.startsWith(quote, pos)) {
          // A multiline closing delimiter may have one or two extra quotes.
          let length = quote.length;
          if (length === 3)
            while (length < 5 && text[pos + length] === quote[0]) length++;
          code += text.slice(pos, pos + length);
          pos += length - 1;
          quote = '';
        } else code += char;
      } else if (char === '#') break;
      else if (char === '"' || char === "'") {
        quote = text.startsWith(char.repeat(3), pos) ? char.repeat(3) : char;
        code += quote;
        pos += quote.length - 1;
      } else {
        if (char === '[' || char === '{') depth++;
        if (char === ']' || char === '}') depth--;
        code += char;
      }
    }
    if (!quote && depth === 0) {
      if (code.trim()) statements.push({ index: start, endIndex: index, code });
      code = '';
    } else code += '\n';
  }
  if (quote || depth !== 0)
    throw new Error('Unterminated TOML value in Codex config');
  return statements;
}

/** First unquoted separator. Basic-key escapes are consumed as pairs. */
function unquotedIndex(text: string, separator: string): number {
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote === '"' && char === '\\') index++;
    else if (quote && char === quote) quote = '';
    else if (!quote && (char === '"' || char === "'")) quote = char;
    else if (!quote && char === separator) return index;
  }
  return -1;
}

function tomlHeader(code: string) {
  const trimmed = code.trim();
  if (!trimmed.startsWith('[')) return undefined;
  const array = trimmed.startsWith('[[');
  const width = array ? 2 : 1;
  const body = trimmed.slice(width);
  const end = unquotedIndex(body, ']');
  if (end < 0 || body.slice(end) !== ']'.repeat(width))
    throw new Error('Invalid TOML table header in Codex config');
  return { path: parseTomlKeyPath(body.slice(0, end)), array };
}

function tomlAssignment(code: string) {
  const equals = unquotedIndex(code, '=');
  if (equals < 0) return undefined;
  const valueStart =
    equals + 1 + (code.slice(equals + 1).match(/^[ \t]*/)?.[0].length ?? 0);
  return {
    key: code.slice(0, equals),
    prefix: code.slice(0, valueStart),
    value: code.slice(valueStart).trimEnd(),
  };
}

function renderTomlLines(lines: TomlLine[]): string {
  return lines.map((line) => `${line.text}${line.eol}`).join('');
}

function ensureLineHasEol(lines: TomlLine[], index: number, eol: string): void {
  if (index >= 0 && lines[index]?.eol === '') lines[index].eol = eol;
}

export function patchCodexDefaultModeUserInputFeature(content: string): string {
  return patchScalar(
    content,
    ['features', 'default_mode_request_user_input'],
    'true',
  );
}

export interface CodexManagedConfigOptions {
  pluginId?: string;
  manageThreads?: boolean;
  priorThreadsValue?: string | null;
  trustedHooks?: Record<string, string>;
}

/** Locate a scalar by its semantic TOML path, accepting quoted and dotted keys.
 * Never serialize the document: all bytes outside the selected value survive.
 */
export function scalarLocation(content: string, path: string[]) {
  const lines = splitTomlLines(content);
  let table: string[] = [];
  let sectionStart = -1;
  let sectionEnd = lines.length;
  const sections = [{ path: [] as string[], start: -1, end: lines.length }];
  let rootDotted = false;
  const matches: {
    index: number;
    prefix: string;
    value: string;
    suffix: string;
  }[] = [];
  for (const statement of tomlStatements(content)) {
    const { index } = statement;
    const header = tomlHeader(statement.code);
    if (header) {
      if (
        header.array &&
        header.path.length < path.length &&
        header.path.every((segment, part) => segment === path[part])
      )
        throw new Error(
          `Unsupported array table parent for Codex key: ${path.join('.')}`,
        );
      if (sectionStart >= 0 && sectionEnd === lines.length) sectionEnd = index;
      sections[sections.length - 1].end = index;
      table = header.array ? ['[]', ...header.path] : header.path;
      sections.push({ path: table, start: index, end: lines.length });
      if (JSON.stringify(table) === JSON.stringify(path.slice(0, -1))) {
        sectionStart = index;
        sectionEnd = lines.length;
      }
      continue;
    }
    const assignment = tomlAssignment(statement.code);
    if (!assignment) continue;
    const key = assignment.key;
    const keyPath = parseTomlKeyPath(key);
    const assignmentPath = [...table, ...keyPath];
    if (table.length === 0 && keyPath.length > 1 && keyPath[0] === path[0])
      rootDotted = true;
    if (
      assignmentPath.length < path.length &&
      assignmentPath.every((segment, part) => segment === path[part])
    )
      throw new Error(
        `Unsupported inline or scalar parent for Codex key: ${path.join('.')}`,
      );
    if (JSON.stringify(assignmentPath) === JSON.stringify(path)) {
      if (statement.endIndex !== index)
        throw new Error(
          `Unsupported multiline Codex scalar: ${path.join('.')}`,
        );
      matches.push({
        index,
        prefix: assignment.prefix,
        value: assignment.value,
        suffix: lines[index].text.slice(
          assignment.prefix.length + assignment.value.length,
        ),
      });
    }
  }
  if (matches.length > 1)
    throw new Error(`Ambiguous Codex config key: ${path.join('.')}`);
  // Dotted keys define tables too: never append a header that redefines one.
  // Insert relative to the deepest explicit ancestor, or into the root section
  // when root dotted keys already define this namespace. Unrelated tables do
  // not count (e.g. [profiles.work] followed by agents.x).
  const insertionSection = sections
    .filter(
      (section) =>
        (section.path.length > 0 || rootDotted) &&
        section.path.length < path.length &&
        section.path.every((segment, part) => segment === path[part]),
    )
    .sort((left, right) => right.path.length - left.path.length)[0];
  return {
    lines,
    match: matches[0],
    sectionStart,
    sectionEnd,
    insertionSection,
  };
}

export function readCodexThreadsValue(content: string): string | null {
  const value = scalarLocation(content, [
    'agents',
    'max_concurrent_threads_per_session',
  ]).match?.value;
  if (value === undefined) return null;
  if (!/^\+?\d[\d_]*$/.test(value))
    throw new Error(
      'Unsupported agents.max_concurrent_threads_per_session value; preserve config and review it manually.',
    );
  return value;
}

export function patchScalar(
  content: string,
  path: string[],
  value: string,
): string {
  const { lines, match, insertionSection } = scalarLocation(content, path);
  const eol = tomlLineBreak(content);
  if (match) {
    lines[match.index].text = `${match.prefix}${value}${match.suffix}`;
    return renderTomlLines(lines);
  }
  if (insertionSection) {
    let insertAt = insertionSection.end;
    while (
      insertAt > insertionSection.start + 1 &&
      lines[insertAt - 1].text.trim() === ''
    )
      insertAt--;
    ensureLineHasEol(lines, insertAt - 1, eol);
    lines.splice(insertAt, 0, {
      text: `${path.slice(insertionSection.path.length).map(renderTomlKeySegment).join('.')} = ${value}`,
      eol,
    });
    return renderTomlLines(lines);
  }
  const separator = !content
    ? ''
    : content.endsWith(eol + eol)
      ? ''
      : content.endsWith(eol)
        ? eol
        : eol + eol;
  const header = path
    .slice(0, -1)
    .map((key) => (/^[A-Za-z0-9_]+$/.test(key) ? key : JSON.stringify(key)))
    .join('.');
  return `${content}${separator}[${header}]${eol}${renderTomlKeySegment(path.at(-1) ?? '')} = ${value}${eol}`;
}

function buildCodexManagedConfigPatch(
  content: string,
  options: CodexManagedConfigOptions,
): {
  content: string;
  diffSummary: string[];
  warnings: string[];
  priorThreadsValue?: string | null;
} {
  const diffSummary = [
    'ensure features.default_mode_request_user_input = true',
  ];
  if (options.pluginId) {
    diffSummary.push(
      `plugin enablement for "${options.pluginId}" is not textually merged; use the native Codex plugin manager`,
    );
  } else {
    diffSummary.push(
      'plugin installation and enablement owned by the native Codex plugin manager; no plugin table written',
    );
  }

  const warnings: string[] = [];
  let patched = patchCodexDefaultModeUserInputFeature(content);
  let priorThreadsValue = options.priorThreadsValue;
  if (options.manageThreads) {
    const current = readCodexThreadsValue(content);
    if (priorThreadsValue === undefined) priorThreadsValue = current;
    // undefined means no ownership record yet; null records original absence.
    if (
      options.priorThreadsValue !== undefined &&
      (current === null || Number(current.replaceAll('_', '')) !== 6)
    ) {
      warnings.push(
        'Preserved operator-modified agents.max_concurrent_threads_per_session; expected managed value 6.',
      );
    } else {
      patched = patchScalar(
        patched,
        ['agents', 'max_concurrent_threads_per_session'],
        '6',
      );
      diffSummary.push(
        'ensure agents.max_concurrent_threads_per_session = 6 (six children; restart Codex to activate)',
      );
    }
  }
  for (const [key, hash] of Object.entries(options.trustedHooks ?? {})) {
    patched = patchScalar(
      patched,
      ['hooks', 'state', key, 'trusted_hash'],
      JSON.stringify(hash),
    );
    diffSummary.push(`trust Codex hook ${key}`);
  }
  return {
    content: patched,
    diffSummary,
    warnings,
    ...(options.manageThreads ? { priorThreadsValue } : {}),
  };
}

export function writeCodexConfigMerge(
  options: CodexManagedConfigOptions & {
    configPath: string;
    dryRun?: boolean;
  },
): CodexConfigMergeResult {
  try {
    const before = existsSync(options.configPath)
      ? readFileSync(options.configPath, 'utf8')
      : '';
    const merged = buildCodexManagedConfigPatch(before, options);
    const changed = before !== merged.content;
    if (options.dryRun || !changed) {
      return {
        success: true,
        configPath: options.configPath,
        changed,
        diffSummary: merged.diffSummary,
        warnings: merged.warnings,
        priorThreadsValue: merged.priorThreadsValue,
      };
    }

    const backupPath = `${options.configPath}.bak`;
    assertSafeBackupDestination(backupPath);
    mkdirSync(dirname(options.configPath), { recursive: true });
    if (existsSync(options.configPath))
      copyFileSync(options.configPath, backupPath);
    safeAtomicWriteFileSync(options.configPath, merged.content);
    return {
      success: true,
      configPath: options.configPath,
      backupPath: existsSync(backupPath) ? backupPath : undefined,
      changed,
      diffSummary: merged.diffSummary,
      warnings: merged.warnings,
      priorThreadsValue: merged.priorThreadsValue,
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
