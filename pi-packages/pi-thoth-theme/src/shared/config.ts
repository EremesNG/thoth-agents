import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type IconMode = 'nerd' | 'unicode' | 'ascii';

export const DEFAULT_RESPECT_PACKAGES: readonly string[] = [
  'thoth-agents',
  '@thoth-agents/*',
  'thoth-mem',
];

export interface ThemeConfig {
  icons: IconMode;
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

export function loadConfig(
  configPath = join(
    process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'),
    'pi-thoth-theme.json',
  ),
): ThemeConfig {
  let config: Record<string, unknown> = {};
  try {
    config = asObject(JSON.parse(readFileSync(configPath, 'utf8')));
  } catch {
    // Missing or malformed package configuration uses package defaults.
  }
  return {
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
