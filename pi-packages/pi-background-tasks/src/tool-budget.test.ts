import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { expect, it, vi } from 'vitest';
import { registerTools } from './tools.js';

// Freeze host-dependent shell discovery so the same definitions are measured on every OS.
vi.mock('./shell.js', async original => ({
  ...await original<typeof import('./shell.js')>(),
  detectShells: () => ({
    available: [
      { kind: 'bash', label: 'bash (D:/Git/bin/bash.exe)' },
      { kind: 'powershell', label: 'PowerShell candidate (C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe)', unverified: true },
      { kind: 'none', label: 'none (direct argv)' },
    ],
    unavailable: {},
  }),
}));

// Baseline with this fixture (8 tools): spawn 4128, watch 7487, list 1567,
// status 2274, log 2038, stop 1569, bg_task 9617, bg_status 2253 = 30,933.
const BASELINE_CHARACTERS = 30_933;
// Before deferred exposure: 11,387 serialized characters. Keep all seven
// definitions compact even when discovered; namespace metadata is not a per-tool declaration.
const BUDGET_CHARACTERS = 10_300;
// Description + schema-description baselines with the frozen shell fixture.
const DESCRIPTION_BUDGETS = { bg_task_spawn: 937, bg_task_watch: 1603 }; // <= 70% of 1339 / 2290
// Original HEAD description fields with this same fixture, excluding schema prose.
const DESCRIPTION_FIELD_BASELINES = { bg_task_spawn: 468, bg_task_watch: 829 };

function schemaDescriptionCharacters(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((sum, [key, child]) => sum + (
    key === 'description' && typeof child === 'string' ? child.length : schemaDescriptionCharacters(child)
  ), 0);
}

it('publishes exactly seven standalone tools within the compact definition budget', () => {
  const definitions: Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: string[] }> = [];
  registerTools({
    on() {},
    registerTool({ name, description, parameters, promptSnippet, promptGuidelines }: Parameters<ExtensionAPI['registerTool']>[0]) {
      definitions.push({ name, description, parameters, promptSnippet, promptGuidelines });
    },
  } as unknown as ExtensionAPI);
  const sizes = Object.fromEntries(definitions.map(definition => [definition.name, JSON.stringify(definition).length]));
  const descriptionCharacters = Object.fromEntries(definitions.map(({ name, description, parameters }) => [
    name, description.length + schemaDescriptionCharacters(parameters),
  ]));
  const descriptionFieldCharacters = Object.fromEntries(definitions.map(({ name, description }) => [name, description.length]));
  process.stdout.write(`Description field characters (tokens ~= chars/4): ${JSON.stringify(descriptionFieldCharacters)}\n`);
  process.stdout.write(`Description + schema characters (tokens ~= chars/4): ${JSON.stringify(descriptionCharacters)}\n`);
  for (const [name, baseline] of Object.entries(DESCRIPTION_FIELD_BASELINES))
    expect(descriptionFieldCharacters[name], `${name} description field`).toBeLessThanOrEqual(Math.floor(baseline * 0.7));
  for (const [name, budget] of Object.entries(DESCRIPTION_BUDGETS))
    expect(descriptionCharacters[name], `${name} description + schema descriptions`).toBeLessThanOrEqual(budget);
  const total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
  process.stdout.write(`Serialized background tool characters: ${total}; ${JSON.stringify(sizes)}\n`);
  expect(definitions.map(tool => tool.name).sort()).toEqual([
    'bg_task_clear', 'bg_task_list', 'bg_task_log', 'bg_task_spawn', 'bg_task_status', 'bg_task_stop', 'bg_task_watch',
  ]);
  expect(total, JSON.stringify(sizes)).toBeLessThanOrEqual(BUDGET_CHARACTERS);
  expect(total).toBeLessThanOrEqual(BASELINE_CHARACTERS / 2);
});
