import * as fs from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import * as patterns from '../../src/tool-patterns.js';
import * as config from '../../src/tools-panel/config.js';
import { createToolsPanel } from '../../src/tools-panel/panel.js';

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    readdirSync: vi.fn(actual.readdirSync),
    existsSync: vi.fn(actual.existsSync),
  };
});
vi.mock('../../src/tool-patterns.js', { spy: true });
vi.mock('../../src/tools-panel/config.js', { spy: true });

describe('tools panel navigation work', () => {
  test.each([
    'global',
    'project',
  ] as const)('%s repeat navigation reuses derived rows without filesystem or selection work', (scope) => {
    const names = Array.from(
      { length: 150 },
      (_, i) => `mcp__server__tool_${i}`,
    );
    const roles: config.ToolsRoleSnapshot[] = Array.from(
      { length: 120 },
      (_, i) => ({
        role: `agent_${i}`,
        scope: 'global',
        filePath: `/global/agents/agent_${i}.md`,
        tools: ['mcp__server__*'],
        disallowedTools: [],
        overlay: { add: ['future*'], remove: ['mcp__server__tool_0'] },
      }),
    );
    const requestRender = vi.fn();
    const panel = createToolsPanel({
      snapshot: {
        cwd: '/project',
        piRoot: '/global',
        roles,
        globalRoles: structuredClone(roles),
        contents: {},
        initialScope: scope,
      },
      discoveredTools: names.map((name) => ({ name, active: true })),
      save: vi.fn(),
      onDone: vi.fn(),
      requestRender,
      maxHeight: () => 24,
    });
    const repeat = () => {
      for (let i = 0; i < 20; i++) {
        panel.handleInput('\x1b[B');
        panel.render(110);
      }
    };
    const measured = () => {
      vi.clearAllMocks();
      const stringify = vi.spyOn(JSON, 'stringify');
      repeat();
      const serializations = stringify.mock.calls.length;
      stringify.mockRestore();
      return {
        selections: vi.mocked(patterns.composeToolSelection).mock.calls.length,
        matches: vi.mocked(patterns.matchesToolPattern).mock.calls.length,
        preparations: vi.mocked(config.prepareToolsConversion).mock.calls
          .length,
        reads: vi.mocked(fs.readFileSync).mock.calls.length,
        directories: vi.mocked(fs.readdirSync).mock.calls.length,
        stats: vi.mocked(fs.existsSync).mock.calls.length,
        serializations,
        renders: requestRender.mock.calls.length,
      };
    };
    panel.render(110); // Build the overview once, outside navigation.
    const overview = measured();
    panel.handleInput('\r');
    panel.render(110); // Build the picker once, outside navigation.
    const picker = measured();
    panel.handleInput(' ');
    expect(panel.render(110).join('\n')).toContain(
      `${scope === 'project' ? '[ ]' : '[x]'} mcp__server__tool_20`,
    );
    const editedPicker = measured();
    panel.handleInput('q');
    expect(panel.render(110).join('\n')).toContain('pending: 1 change');
    const editedOverview = measured();
    expect({ overview, picker, editedPicker, editedOverview }).toEqual({
      overview: {
        selections: 0,
        matches: 0,
        preparations: 0,
        reads: 0,
        directories: 0,
        stats: 0,
        serializations: 0,
        renders: 20,
      },
      picker: {
        selections: 0,
        matches: 0,
        preparations: 0,
        reads: 0,
        directories: 0,
        stats: 0,
        serializations: 0,
        renders: 20,
      },
      editedPicker: {
        selections: 0,
        matches: 0,
        preparations: 0,
        reads: 0,
        directories: 0,
        stats: 0,
        serializations: 0,
        renders: 20,
      },
      editedOverview: {
        selections: 0,
        matches: 0,
        preparations: 0,
        reads: 0,
        directories: 0,
        stats: 0,
        serializations: 0,
        renders: 20,
      },
    });
  });
});
