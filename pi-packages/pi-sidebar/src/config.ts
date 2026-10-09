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
import type { Startup } from './controls.js';

export interface PanelPreference {
  id: string;
  visible: boolean;
  [key: string]: unknown;
}
export interface SidebarConfig {
  startup: Startup;
  panels: PanelPreference[];
  [key: string]: unknown;
}
export function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
}
export function configPath(directory = agentDir()): string {
  return join(directory, 'thoth-sidebar.json');
}
function readObject(path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {
    /* Missing or malformed configuration uses defaults. */
  }
  return {};
}
export function loadConfig(path = configPath()): SidebarConfig {
  const raw = readObject(path);
  const seen = new Set<string>();
  const panels: PanelPreference[] = [];
  if (Array.isArray(raw.panels))
    for (const panel of raw.panels) {
      if (
        !panel ||
        typeof panel !== 'object' ||
        typeof panel.id !== 'string' ||
        !panel.id ||
        seen.has(panel.id)
      )
        continue;
      seen.add(panel.id);
      panels.push({
        ...panel,
        visible: typeof panel.visible === 'boolean' ? panel.visible : true,
      });
    }
  return {
    ...raw,
    startup:
      raw.startup === 'manual' || raw.startup === 'off' ? raw.startup : 'auto',
    panels,
  };
}
export function saveConfig(config: SidebarConfig, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
export function reconcilePanels(
  config: SidebarConfig,
  ids: readonly string[],
): void {
  const known = new Set(config.panels.map((panel) => panel.id));
  for (const id of ids)
    if (!known.has(id)) {
      config.panels.push({ id, visible: true });
      known.add(id);
    }
}
export function changePanel(
  config: SidebarConfig,
  action: string,
  id: string,
): boolean {
  const index = config.panels.findIndex((panel) => panel.id === id);
  if (index < 0) return false;
  if (action === 'show' || action === 'hide')
    config.panels[index].visible = action === 'show';
  else if (action === 'up' || action === 'down') {
    const next = index + (action === 'up' ? -1 : 1);
    if (next >= 0 && next < config.panels.length)
      [config.panels[index], config.panels[next]] = [
        config.panels[next],
        config.panels[index],
      ];
  } else return false;
  return true;
}
export function loadSubscriptionProviders(
  path = join(agentDir(), 'pi-thoth-theme.json'),
): string[] {
  const status = readObject(path).statusLine;
  const providers =
    status && typeof status === 'object' && 'subscriptionProviders' in status
      ? status.subscriptionProviders
      : undefined;
  return Array.isArray(providers)
    ? providers.filter(
        (provider): provider is string =>
          typeof provider === 'string' && provider.trim().length > 0,
      )
    : ['claude-bridge', 'antigravity'];
}
