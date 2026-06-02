import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

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
    const parsed = JSON.parse(text) as {
      version?: unknown;
      models?: unknown;
      configuredModels?: unknown;
    };
    if (
      parsed.version !== version ||
      !parsed.models ||
      typeof parsed.models !== 'object' ||
      Array.isArray(parsed.models)
    ) {
      return emptyManagedModelState(version);
    }
    const configuredModels = stringRecord(parsed.configuredModels);
    return {
      version,
      models: stringRecord(parsed.models),
      ...(Object.keys(configuredModels).length > 0 ? { configuredModels } : {}),
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
