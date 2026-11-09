import { randomUUID } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AnimationLevel } from '@thoth-agents/pi-core';

export type IconMode = 'nerd' | 'unicode' | 'ascii';
export type ToolDensity = 'frame' | 'compact' | 'line';

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
  tools: {
    enabled: boolean;
    respectPackages?: string[];
    /** Omission keeps framed tool cards for programmatic configs. */
    collapsed?: ToolDensity;
  };
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

export interface ThemeConfigPatch {
  icons?: IconMode;
  animation?: AnimationLevel;
  statusLine?: { enabled?: boolean };
  inputBox?: { enabled?: boolean };
  tools?: { enabled?: boolean; collapsed?: ToolDensity };
  welcome?: { enabled?: boolean };
}

/** Reread and patch settings without replacing producer-owned/unknown fields. */
export function saveThemeConfig(
  patch: ThemeConfigPatch,
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
      `Cannot save theme settings to ${configPath}: fix the file first; expected valid JSON containing an object.`,
    );
  }
  const updated = { ...config, ...patch };
  for (const key of ['statusLine', 'inputBox', 'tools', 'welcome'] as const) {
    if (patch[key] !== undefined) {
      updated[key] = { ...asObject(config[key]), ...patch[key] };
    }
  }
  mkdirSync(dirname(configPath), { recursive: true });
  const temporary = `${configPath}.${randomUUID()}.tmp`;
  // Acquire ownership before entering cleanup: an exclusive-open collision
  // must not remove another writer's file.
  const file = openSync(temporary, 'wx', 0o600);
  try {
    try {
      writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
    } finally {
      closeSync(file);
    }
    renameSync(temporary, configPath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Backwards-compatible animation-only save. */
export function saveAnimationLevel(
  animation: AnimationLevel,
  configPath = defaultConfigPath(),
): void {
  saveThemeConfig({ animation }, configPath);
}

export function loadConfig(configPath = defaultConfigPath()): ThemeConfig {
  let config: Record<string, unknown> = {};
  try {
    config = asObject(JSON.parse(readFileSync(configPath, 'utf8')));
  } catch {
    // Missing or malformed package configuration uses package defaults.
  }
  const collapsed = asObject(config.tools).collapsed;
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
      collapsed:
        collapsed === 'compact' || collapsed === 'line' ? collapsed : 'frame',
    },
    welcome: { enabled: moduleEnabled(config.welcome) },
  };
}
