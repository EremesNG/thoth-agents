import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { isExplicitEffort, normalizeEffortSelection } from './model-effort';

/**
 * Harness-agnostic helpers shared by the Codex and Claude Code installers for
 * managed file writes and managed-model-state JSON bookkeeping.
 */

export function writeTextWithBackup(path: string, content: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  writeFileSync(path, content);
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
}

const managedModelStateSchema = z
  .object({
    version: z.number(),
    models: z.record(z.string(), z.unknown()),
    configuredModels: z.unknown().optional(),
    configuredEfforts: z.unknown().optional(),
  })
  .passthrough();

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
    const configuredModels = stringRecord(result.data.configuredModels);
    const configuredEfforts = effortRecord(result.data.configuredEfforts);
    return {
      version,
      models: stringRecord(result.data.models),
      ...(Object.keys(configuredModels).length > 0 ? { configuredModels } : {}),
      ...(Object.keys(configuredEfforts).length > 0
        ? { configuredEfforts }
        : {}),
    };
  } catch {
    return emptyManagedModelState(version);
  }
}

export function readManagedModelState(
  path: string,
  version: number,
): ManagedModelState {
  if (!existsSync(path)) return emptyManagedModelState(version);
  return parseManagedModelStateJson(readFileSync(path, 'utf8'), version);
}
