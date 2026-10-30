import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AnimationLevel } from '@thoth-agents/pi-core';

export type IconMode = 'nerd' | 'unicode' | 'ascii';

export const DEFAULT_RESPECT_PACKAGES: readonly string[] = [
  'thoth-agents',
  '@thoth-agents/*',
  'thoth-mem',
];

export interface ThemeConfig {
  icons: IconMode;
  /** Omission uses full animation, preserving existing programmatic configs. */
  animation?: AnimationLevel;
  statusLine: {
    enabled: boolean;
    subscriptionProviders?: string[];
  };
  /** Omission enables the input box, preserving the legacy config shape. */
  inputBox?: { enabled: boolean };
  tools: { enabled: boolean; respectPackages?: string[] };
  welcome: { enabled: boolean };
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function moduleEnabled(value: unknown): boolean {
  const enabled = asObject(value).enabled;
  return typeof enabled === 'boolean' ? enabled : true;
}

function parseSubscriptionProviders(value: unknown): string[] {
  const obj = asObject(value);
  const providers = obj.subscriptionProviders;
  if (Array.isArray(providers)) {
    return providers.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }
  return ['claude-bridge', 'antigravity'];
}

function parseRespectPackages(value: unknown): string[] {
  const packages = asObject(value).respectPackages;
  return Array.isArray(packages) &&
    packages.every(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    )
    ? packages
    : [...DEFAULT_RESPECT_PACKAGES];
}

function defaultConfigPath(): string {
  return join(
    process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'),
    'pi-thoth-theme.json',
  );
}

export const ANIMATION_LEVELS = ['full', 'reduced', 'minimal', 'off'] as const;

export function isAnimationLevel(value: unknown): value is AnimationLevel {
  return ANIMATION_LEVELS.some((level) => level === value);
}

/** Replace just the setting, preserving producer-owned and unknown JSON fields. */
export function saveAnimationLevel(
  animation: AnimationLevel,
  configPath = defaultConfigPath(),
): void {
  let contents = '{}';
  try {
    contents = readFileSync(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let config: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(contents);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Expected a JSON object');
    config = value as Record<string, unknown>;
  } catch {
    throw new Error(
      `Cannot save animation to ${configPath}: fix the file first; expected valid JSON containing an object.`,
    );
  }
  mkdirSync(dirname(configPath), { recursive: true });
  const temporary = `${configPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temporary,
      `${JSON.stringify({ ...config, animation }, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    renameSync(temporary, configPath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function loadConfig(configPath = defaultConfigPath()): ThemeConfig {
  let config: Record<string, unknown> = {};
  try {
    config = asObject(JSON.parse(readFileSync(configPath, 'utf8')));
  } catch {
    // Missing or malformed package configuration uses package defaults.
  }
  return {
    animation: isAnimationLevel(config.animation) ? config.animation : 'full',
    icons:
      config.icons === 'ascii' || config.icons === 'unicode'
        ? config.icons
        : 'nerd',
    ...(config.inputBox === undefined
      ? {}
      : { inputBox: { enabled: moduleEnabled(config.inputBox) } }),
    statusLine: {
      enabled: moduleEnabled(config.statusLine),
      subscriptionProviders: parseSubscriptionProviders(config.statusLine),
    },
    tools: {
      enabled: moduleEnabled(config.tools),
      respectPackages: parseRespectPackages(config.tools),
    },
    welcome: { enabled: moduleEnabled(config.welcome) },
  };
}
