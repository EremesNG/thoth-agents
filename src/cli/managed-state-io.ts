import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { isExplicitEffort, normalizeEffortSelection } from './model-effort';
import { safeAtomicWriteFileSync } from './safe-atomic-write';

/**
 * Harness-agnostic helpers shared by the Codex and Claude Code installers for
 * managed file writes and managed-model-state JSON bookkeeping.
 */

/** Fail closed: backups may replace regular files, never links or special files. */
export function assertSafeBackupDestination(path: string): void {
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(/[\\/]/)) {
    cursor = join(cursor, part);
    try {
      const stat = lstatSync(cursor);
      if (
        stat.isSymbolicLink() ||
        (cursor === absolute ? !stat.isFile() : !stat.isDirectory())
      )
        throw new Error(`Unsafe backup destination: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

export function writeTextWithBackup(path: string, content: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  if (existsSync(path)) {
    assertSafeBackupDestination(`${path}.bak`);
    copyFileSync(path, `${path}.bak`);
  }
  safeAtomicWriteFileSync(path, content);
  return true;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

export function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string',
    ),
  );
}

export interface ManagedModelState {
  version: number;
  models: Record<string, string>;
  configuredModels?: Record<string, string>;
  configuredEfforts?: Record<string, string>;
  /** SHA-256 of the exact last-written Codex TOML bytes, keyed by basename. */
  roleDigests?: Record<string, string>;
  /** SHA-256 excluding model/effort lines, permitting operator model selection. */
  roleStructureDigests?: Record<string, string>;
  /** Original raw capacity integer; null records that the key was absent. */
  priorThreadsValue?: string | null;
  ownedHookTrustKeys?: string[];
}

const managedModelStateSchema = z
  .object({
    version: z.number(),
    models: z.record(z.string(), z.unknown()),
    configuredModels: z.unknown().optional(),
    configuredEfforts: z.unknown().optional(),
    roleDigests: z.unknown().optional(),
    roleStructureDigests: z.unknown().optional(),
    priorThreadsValue: z
      .string()
      .regex(/^\+?\d[\d_]*$/)
      .nullable()
      .optional(),
    ownedHookTrustKeys: z.array(z.string()).optional(),
  })
  .passthrough();

/** Released pre-digest state: only the original version/models fields. */
export function isLegacyManagedModelState(
  value: unknown,
  version: number,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (
    state.version === version &&
    Object.keys(state).every((key) => key === 'version' || key === 'models') &&
    !!state.models &&
    typeof state.models === 'object' &&
    !Array.isArray(state.models) &&
    Object.values(state.models).every((model) => typeof model === 'string')
  );
}

function digestRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(stringRecord(value)).filter(([, digest]) =>
      /^[a-f0-9]{64}$/.test(digest),
    ),
  );
}

function effortRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(stringRecord(value)).filter(([, effort]) =>
      isExplicitEffort(normalizeEffortSelection(effort)),
    ),
  );
}

export function emptyManagedModelState(version: number): ManagedModelState {
  return { version, models: {} };
}

export function parseManagedModelStateJson(
  text: string | undefined,
  version: number,
): ManagedModelState {
  if (!text) return emptyManagedModelState(version);
  try {
    const input: unknown = JSON.parse(text);
    const result = managedModelStateSchema.safeParse(input);
    if (!result.success || result.data.version !== version) {
      return emptyManagedModelState(version);
    }
    const roleDigests = digestRecord(result.data.roleDigests);
    const roleStructureDigests = digestRecord(result.data.roleStructureDigests);
    const configuredModels = stringRecord(result.data.configuredModels);
    const configuredEfforts = effortRecord(result.data.configuredEfforts);
    return {
      version,
      models: stringRecord(result.data.models),
      ...(result.data.priorThreadsValue !== undefined
        ? { priorThreadsValue: result.data.priorThreadsValue }
        : {}),
      ...(result.data.ownedHookTrustKeys
        ? { ownedHookTrustKeys: result.data.ownedHookTrustKeys }
        : {}),
      ...(Object.keys(roleDigests).length > 0 ? { roleDigests } : {}),
      ...(Object.keys(roleStructureDigests).length > 0
        ? { roleStructureDigests }
        : {}),
      ...(Object.keys(configuredModels).length > 0 ? { configuredModels } : {}),
      ...(Object.keys(configuredEfforts).length > 0
        ? { configuredEfforts }
        : {}),
    };
  } catch {
    return emptyManagedModelState(version);
  }
}

/** Compare normalized state, allowing only planner-approved role digest refreshes. */
export function managedModelStatesEqual(
  actual: string,
  expected: string,
  version: number,
  refreshedRoleKeys: string[] = [],
): boolean {
  const normalize = (text: string): ManagedModelState => {
    const state = parseManagedModelStateJson(text, version);
    if (state.ownedHookTrustKeys)
      state.ownedHookTrustKeys = [...new Set(state.ownedHookTrustKeys)].sort();
    for (const field of ['roleDigests', 'roleStructureDigests'] as const) {
      for (const key of refreshedRoleKeys) delete state[field]?.[key];
      if (Object.keys(state[field] ?? {}).length === 0) delete state[field];
    }
    return state;
  };
  return isDeepStrictEqual(normalize(actual), normalize(expected));
}

export function readManagedModelState(
  path: string,
  version: number,
): ManagedModelState {
  if (!existsSync(path)) return emptyManagedModelState(version);
  return parseManagedModelStateJson(readFileSync(path, 'utf8'), version);
}

/**
 * Update only fields owned by this operation, retaining all other persisted data.
 * Maps are replaced, not deep-merged, so callers can retire entries. An explicit
 * undefined removes a field; omitted fields (including future extensions) survive.
 */
export function writeManagedModelState(
  path: string,
  version: number,
  updates: Partial<ManagedModelState>,
): boolean {
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const result = managedModelStateSchema.safeParse(
        JSON.parse(readFileSync(path, 'utf8')),
      );
      if (result.success && result.data.version === version)
        existing = result.data;
    } catch {
      // Match the reader's fallback for missing or malformed ownership state.
    }
  }
  const next = { version, models: {}, ...existing, ...updates };
  next.version = version;
  return writeTextWithBackup(path, stableJson(next));
}
