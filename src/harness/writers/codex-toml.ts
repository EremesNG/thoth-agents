import {
  assertCodexSurfaceCanGenerate,
  getCodexSurface,
} from '../adapters/codex-surfaces';
import type { HarnessDiagnostic } from '../types';

export interface CodexTomlInput {
  surfaceId: string;
  values: Record<string, unknown>;
}

export interface CodexTomlResult {
  content: string;
  diagnostics: HarnessDiagnostic[];
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

function escapeTomlMultilineString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function renderScalar(value: unknown): string {
  if (typeof value === 'string') return `"${escapeTomlString(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(renderScalar).join(', ')}]`;
  }
  throw new Error(`Unsupported TOML scalar: ${String(value)}`);
}

function renderField(key: string, value: unknown): string[] {
  if (key === 'developer_instructions' && typeof value === 'string') {
    return [`${key} = """`, escapeTomlMultilineString(value), '"""', ''];
  }

  return [`${key} = ${renderScalar(value)}`];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripProviderMcpValues(
  surfaceId: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (surfaceId !== 'mcp-server-config') return values;
  const servers = values.mcp_servers;
  if (!isRecord(servers)) return values;
  const { thoth_mem: _provider, ...mcpServers } = servers;
  return { ...values, mcp_servers: mcpServers };
}

function fieldOrder(fields: string[], keys: string[]): string[] {
  const orderedRoots = fields.map((field) => field.split('.')[0]);
  return [...keys].sort((left, right) => {
    const leftIndex = orderedRoots.indexOf(left);
    const rightIndex = orderedRoots.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (
        (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    }
    return left.localeCompare(right);
  });
}

function isAllowedRoot(fields: string[], key: string): boolean {
  return fields.some(
    (field) =>
      field === key ||
      field.startsWith(`${key}.`) ||
      (field.includes('<id>') && key === field.split('.')[0]),
  );
}

function renderTable(
  lines: string[],
  tablePath: string[],
  value: Record<string, unknown>,
): void {
  lines.push(`[${tablePath.join('.')}]`);
  const nested: [string, Record<string, unknown>][] = [];

  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (isRecord(entry)) {
      nested.push([key, entry]);
    } else {
      lines.push(...renderField(key, entry));
    }
  }
  lines.push('');

  for (const [key, entry] of nested) {
    renderTable(lines, [...tablePath, key], entry);
  }
}

export function renderCodexToml(input: CodexTomlInput): CodexTomlResult {
  const canGenerate = assertCodexSurfaceCanGenerate(input.surfaceId);
  if (!canGenerate.ok) {
    return { content: '', diagnostics: [canGenerate.diagnostic] };
  }

  const surface = getCodexSurface(input.surfaceId);
  const fields = surface?.fields ?? [];
  const diagnostics: HarnessDiagnostic[] = [];
  const lines: string[] = [];
  const tables: [string, Record<string, unknown>][] = [];

  const values = stripProviderMcpValues(input.surfaceId, input.values);

  for (const key of fieldOrder(fields, Object.keys(values))) {
    const value = values[key];
    if (!isAllowedRoot(fields, key)) {
      diagnostics.push({
        severity: 'warning',
        code: 'codex.toml.field.unvalidated',
        message: `Skipping unvalidated Codex TOML field "${key}" for surface "${input.surfaceId}".`,
        harness: 'codex',
        surface: input.surfaceId,
        fallback: 'diagnostic-only',
      });
      continue;
    }

    if (isRecord(value)) {
      tables.push([key, value]);
    } else {
      lines.push(...renderField(key, value));
    }
  }

  if (tables.length > 0 && lines.length > 0) lines.push('');
  for (const [key, value] of tables) {
    renderTable(lines, [key], value);
  }

  while (lines.at(-1) === '') lines.pop();
  return {
    content: lines.join('\n') + (lines.length > 0 ? '\n' : ''),
    diagnostics,
  };
}
