import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { expect, it, vi } from 'vitest';
import { registerTools } from './tools.js';

// Freeze host-dependent shell discovery so the same definitions are measured on every OS.
vi.mock('./shell.js', async original => ({
  ...await original<typeof import('./shell.js')>(),
  detectShells: () => ({
    available: [
      { kind: 'bash', label: 'bash (D:/Git/bin/bash.exe)' },
      { kind: 'powershell', label: 'PowerShell Desktop 5.1.19041 (C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe)', edition: 'Desktop' },
      { kind: 'none', label: 'none (direct argv)' },
    ],
    unavailable: {},
  }),
}));

// Baseline with this fixture (8 tools): spawn 4128, watch 7487, list 1567,
// status 2274, log 2038, stop 1569, bg_task 9617, bg_status 2253 = 30,933.
const BASELINE_CHARACTERS = 30_933;
// Measured compact total 13,605; still fits the existing cap (originally ~5% headroom).
const BUDGET_CHARACTERS = 13_810;

it('publishes exactly seven standalone tools within the compact definition budget', () => {
  const definitions: Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: string[] }> = [];
  registerTools({
    on() {},
    registerTool({ name, description, parameters, promptSnippet, promptGuidelines }: Parameters<ExtensionAPI['registerTool']>[0]) {
      definitions.push({ name, description, parameters, promptSnippet, promptGuidelines });
    },
  } as unknown as ExtensionAPI);
  const sizes = Object.fromEntries(definitions.map(definition => [definition.name, JSON.stringify(definition).length]));
  const total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
  expect(definitions.map(tool => tool.name).sort()).toEqual([
    'bg_task_clear', 'bg_task_list', 'bg_task_log', 'bg_task_spawn', 'bg_task_status', 'bg_task_stop', 'bg_task_watch',
  ]);
  expect(total, JSON.stringify(sizes)).toBeLessThanOrEqual(BUDGET_CHARACTERS);
  expect(total).toBeLessThanOrEqual(BASELINE_CHARACTERS / 2);
});
