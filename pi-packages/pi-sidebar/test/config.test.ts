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

it('slots newly discovered panels before Cost without rearranging a saved order', () => {
  const config = loadConfig(fixture());
  reconcilePanels(config, ['session', 'workspace', 'cost']);
  reconcilePanels(config, ['subagents', 'todos', 'background-tasks']);
  expect(config.panels.map((p) => p.id)).toEqual([
    'session',
    'workspace',
    'subagents',
    'todos',
    'background-tasks',
    'cost',
  ]);
  const saved: Parameters<typeof reconcilePanels>[0] = {
    startup: 'auto',
    panels: [
      { id: 'workspace', visible: true },
      { id: 'session', visible: false },
    ],
  };
  reconcilePanels(saved, ['session', 'workspace', 'subagents', 'cost']);
  expect(saved.panels.map((p) => `${p.id}:${p.visible}`)).toEqual([
    'workspace:true',
    'session:false',
    'subagents:true',
    'cost:true',
  ]);
});

it('keeps a valid default width, clamped to 36..72, and ignores anything else', () => {
  const path = fixture();
  const load = (width: unknown) => {
    writeFileSync(path, JSON.stringify({ width }));
    return loadConfig(path);
  };
  expect(load(60).width).toBe(60);
  expect(load(10).width).toBe(36);
  expect(load(28).width).toBe(36);
  expect(load(35).width).toBe(36);
  expect(load(36).width).toBe(36);
  expect(load(500).width).toBe(72);
  expect('width' in load('wide')).toBe(false);
  expect('width' in load(null)).toBe(false);
  expect('width' in loadConfig(fixture())).toBe(false);
});

it.each([
  ['thin', 'thin'],
  ['classic', 'classic'],
  ['fat', undefined],
  [3, undefined],
  [null, undefined],
])('keeps the saved bar style %j as %j and drops anything else, so the default applies', (bars, expected) => {
  const path = fixture();
  writeFileSync(path, JSON.stringify({ bars }));
  const config = loadConfig(path);
  expect(config.bars).toBe(expected);
  expect('bars' in config).toBe(expected !== undefined);
  expect('bars' in loadConfig(fixture())).toBe(false);
});

it('persists the chosen bar style next to the other preferences', () => {
  const path = fixture();
  writeFileSync(path, JSON.stringify({ startup: 'manual', future: 1 }));
  const config = loadConfig(path);
  config.bars = 'classic';
  saveConfig(config, path);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
    bars: 'classic',
    startup: 'manual',
    future: 1,
  });
  expect(loadConfig(path).bars).toBe('classic');
});
