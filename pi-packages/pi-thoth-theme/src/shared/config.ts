import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type IconMode = 'nerd' | 'ascii';

export interface ThemeConfig {
  icons: IconMode;
  statusLine: { enabled: boolean };
  tools: { enabled: boolean };
  images: { enabled: boolean };
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
    icons: config.icons === 'ascii' ? 'ascii' : 'nerd',
    statusLine: { enabled: moduleEnabled(config.statusLine) },
    tools: { enabled: moduleEnabled(config.tools) },
    images: { enabled: moduleEnabled(config.images) },
    welcome: { enabled: moduleEnabled(config.welcome) },
  };
}
