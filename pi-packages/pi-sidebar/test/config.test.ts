import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  changePanel,
  configPath,
  loadConfig,
  loadSubscriptionProviders,
  reconcilePanels,
  saveConfig,
} from '../src/config.js';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sidebar-config-'));
  directories.push(dir);
  return join(dir, 'thoth-sidebar.json');
}

it('round-trips unknown keys and panels, preserving their order while editing known panels atomically', () => {
  const path = fixture();
  writeFileSync(
    path,
    JSON.stringify({
      future: { enabled: true },
      startup: 'manual',
      panels: [
        { id: 'future', visible: false, extra: 9 },
        { id: 'workspace', visible: true },
      ],
    }),
  );
  const config = loadConfig(path);
  reconcilePanels(config, ['session', 'workspace', 'agents']);
  expect(config.panels.map((p) => p.id)).toEqual([
    'future',
    'workspace',
    'session',
    'agents',
  ]);
  expect(changePanel(config, 'hide', 'session')).toBe(true);
  expect(changePanel(config, 'up', 'agents')).toBe(true);
  expect(changePanel(config, 'down', 'missing')).toBe(false);
  saveConfig(config, path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved.future).toEqual({ enabled: true });
  expect(saved.panels[0]).toEqual({ id: 'future', visible: false, extra: 9 });
  expect(saved.panels.map((p: { id: string }) => p.id)).toEqual([
    'future',
    'workspace',
    'agents',
    'session',
  ]);
  expect(loadConfig(path)).toEqual(config);
});

it('uses defaults for absent/invalid preferences and reads theme subscription settings from the selected agent dir', () => {
  const path = fixture();
  expect(loadConfig(path).startup).toBe('auto');
  writeFileSync(path, '{');
  expect(loadConfig(path).panels).toEqual([]);
  expect(configPath('chosen')).toBe(join('chosen', 'thoth-sidebar.json'));
  expect(loadSubscriptionProviders(path)).toEqual([
    'claude-bridge',
    'antigravity',
  ]);
  writeFileSync(
    path,
    JSON.stringify({
      statusLine: { subscriptionProviders: ['custom', '', 3] },
    }),
  );
  expect(loadSubscriptionProviders(path)).toEqual(['custom']);
  writeFileSync(
    path,
    JSON.stringify({ statusLine: { subscriptionProviders: [] } }),
  );
  expect(loadSubscriptionProviders(path)).toEqual([]);
});
