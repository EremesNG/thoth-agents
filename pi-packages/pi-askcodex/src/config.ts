import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type AskCodexMode = 'plan' | 'accept-edits';
export type WebSearchMode = 'disabled' | 'cached' | 'live';
export interface AskCodexConfig {
  enabled: boolean;
  bin?: string;
  defaultModel?: string;
  defaultEffort?: string;
  defaultMode: AskCodexMode;
  defaultTimeoutMinutes: number;
  allowedApps: string[];
  webSearch: WebSearchMode;
  extraArgs?: string[];
}
export interface LoadConfigOptions {
  homeDir?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  fs?: { readFileSync(path: string, encoding: 'utf8'): string };
  warn?: (message: string) => void;
}

/** Missing files are normal; unreadable or malformed files are diagnosed, not thrown. */
export function loadConfig(options: LoadConfigOptions = {}): AskCodexConfig {
  const configPath =
    options.configPath ??
    path.join(
      options.homeDir ?? os.homedir(),
      '.pi',
      'agent',
      'askcodex',
      'config.json',
    );
  const warn = options.warn ?? console.warn;
  let file: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(
      (options.fs ?? fs).readFileSync(configPath, 'utf8'),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Expected a config object');
    file = parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT')
      warn(`AskCodex: could not read ${configPath}; using defaults.`);
  }
  const env = options.env ?? process.env;
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value.trim() || undefined : undefined;
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? [...value]
      : undefined;
  const enabled = text(env.ASKCODEX_ENABLED)?.toLowerCase();
  const extraArgs = strings(file.extraArgs);
  return {
    enabled:
      enabled && ['true', '1', 'yes', 'on'].includes(enabled)
        ? true
        : enabled && ['false', '0', 'no', 'off'].includes(enabled)
          ? false
          : typeof file.enabled === 'boolean'
            ? file.enabled
            : true,
    ...optional('bin', text(env.ASKCODEX_BIN ?? file.bin)),
    ...optional(
      'defaultModel',
      text(env.ASKCODEX_DEFAULT_MODEL ?? file.defaultModel),
    ),
    ...optional(
      'defaultEffort',
      text(env.ASKCODEX_DEFAULT_EFFORT ?? file.defaultEffort),
    ),
    defaultMode: file.defaultMode === 'plan' ? 'plan' : 'accept-edits',
    defaultTimeoutMinutes:
      typeof file.defaultTimeoutMinutes === 'number' &&
      Number.isFinite(file.defaultTimeoutMinutes) &&
      file.defaultTimeoutMinutes > 0
        ? file.defaultTimeoutMinutes
        : 15,
    allowedApps: strings(file.allowedApps) ?? [],
    // Search is opt-in: avoid silently adding network searches to a delegation.
    webSearch:
      file.webSearch === 'live' || file.webSearch === 'cached'
        ? file.webSearch
        : 'disabled',
    ...(extraArgs ? { extraArgs } : {}),
  };
}

function optional<K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
