import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, test, vi } from 'vitest';
import type {
  ToolsConfigSnapshot as PiToolConfigSnapshot,
  ToolsSaveResult as PiToolSaveResult,
} from '../../src/tools-panel/config.js';
import { validateTools as validatePiSpecialistTools } from '../../src/tools-panel/frontmatter.js';
import {
  createToolsPanel,
  isEligibleTool,
  type ToolsPanelDiscoveredTool,
} from '../../src/tools-panel/panel.js';

const roles = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
] as const;

function sampleSnapshot(): PiToolConfigSnapshot {
  return {
    cwd: '/project',
    piRoot: '/global/.pi/agent',
    roles: roles.map((role) => ({
      role,
      filePath: `/global/.pi/agent/agents/${role}.md`,
      scope: 'global',
      tools: ['read', 'write'],
      defaultTools: ['read', 'write'],
      disallowedTools: role === 'oracle' ? ['ask_orchestrator'] : [],
    })),
    contents: Object.fromEntries(
      roles.map((role) => [role, `${role}-content`]),
    ),
  };
}

const sampleDiscovered: ToolsPanelDiscoveredTool[] = [
  { name: 'read', description: 'Read file', active: true },
  { name: 'write', description: 'Write file', active: true },
  { name: 'bash', description: 'Run bash', active: true },
  {
    name: 'custom_inactive',
    description: 'Inactive custom tool',
    active: false,
  },
  {
    name: 'subagent_run',
    description: 'Native subagent delegation',
    active: true,
  },
  {
    name: 'ask_user_question',
    description: 'Root question tool',
    active: true,
  },
  { name: 'todo', description: 'Root progress tool', active: true },
  { name: 'ask_orchestrator', active: false },
];

function successfulSave(
  base: PiToolConfigSnapshot,
  draft = base.roles,
): PiToolSaveResult {
  return {
    success: true,
    changedRoles: ['explorer'],
    snapshot: {
      ...base,
      roles: structuredClone(draft).map((r) => ({
        ...r,
        defaultTools: ['read', 'write'],
      })),
    },
  };
}

describe('isEligibleTool', () => {
  test('allows standard tool names', () => {
    expect(isEligibleTool('read')).toBe(true);
    expect(isEligibleTool('mcp__server__tool')).toBe(true);
    expect(isEligibleTool('git_status')).toBe(true);
    expect(isEligibleTool('AskClaude')).toBe(true);
    expect(isEligibleTool('AskAntigravity')).toBe(true);
  });

  test('rejects native delegation tools', () => {
    expect(isEligibleTool('subagent_run')).toBe(false);
    expect(isEligibleTool('subagent_list_agents')).toBe(false);
    expect(isEligibleTool('SUBAGENT_KILL')).toBe(false);
  });

  test('allows other packages controls as exact names', () => {
    expect(isEligibleTool('ask_user_question')).toBe(true);
    expect(isEligibleTool('todo')).toBe(true);
    expect(isEligibleTool('TODO')).toBe(true);
  });

  test('rejects wildcards, whitespace, commas and invalid characters', () => {
    expect(isEligibleTool('*')).toBe(false);
    expect(isEligibleTool('@active')).toBe(false);
    expect(isEligibleTool('tool*')).toBe(false);
    expect(isEligibleTool('tool?')).toBe(false);
    expect(isEligibleTool('tool[1]')).toBe(false);
    expect(isEligibleTool('tool{a,b}')).toBe(false);
    expect(isEligibleTool('tool a')).toBe(false);
    expect(isEligibleTool('tool,b')).toBe(false);
    expect(isEligibleTool('')).toBe(false);
  });
});

describe('global Pi tools panel', () => {
  test.each([
    '\x1b[99;5u',
    '\x1b[99;5:1u',
  ])('handles native Ctrl-C for clean cancel, picker back and dirty discard (%j)', (data) => {
    const save = vi.fn();
    const onDone = vi.fn();
    const create = () =>
      createToolsPanel({
        snapshot: sampleSnapshot(),
        discoveredTools: sampleDiscovered,
        save,
        onDone,
      });
    const clean = create();
    clean.handleInput(data);
    expect(onDone).toHaveBeenCalledExactlyOnceWith({ kind: 'cancelled' });
    onDone.mockClear();

    const dirty = create();
    dirty.handleInput('\r');
    dirty.handleInput(' ');
    dirty.handleInput(data);
    expect(dirty.render(110).join('\n')).toContain('Subagent tools');
    expect(dirty.getState().draft[0]?.tools).toEqual(['write']);
    expect(onDone).not.toHaveBeenCalled();
    dirty.handleInput(data);
    expect(dirty.render(110).join('\n')).toContain('Discard unsaved draft?');
    expect(onDone).not.toHaveBeenCalled();
    dirty.handleInput('d');
    expect(onDone).toHaveBeenCalledExactlyOnceWith({ kind: 'cancelled' });
    expect(save).not.toHaveBeenCalled();
  });

  test('handles native CSI-u navigation, Enter and Escape without per-panel key wiring', () => {
    const onDone = vi.fn();
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone,
    });
    panel.handleInput('\x1b[57420u');
    expect(panel.render(110).join('\n')).toContain('selected: librarian');
    panel.handleInput('\x1b[13u');
    expect(panel.render(110).join('\n')).toContain('Choose tools · librarian');
    panel.handleInput('\x1b[27u');
    expect(panel.render(110).join('\n')).toContain('Subagent tools');
    expect(onDone).not.toHaveBeenCalled();
    panel.handleInput('\x1b[27u');
    expect(onDone).toHaveBeenCalledWith({ kind: 'cancelled' });
  });

  test('edits registered exact names only and retains manual entries through normal save', () => {
    const snapshot = sampleSnapshot();
    snapshot.roles[0] = {
      role: 'explorer',
      filePath: '/global/.pi/agent/agents/explorer.md',
      scope: 'global',
      tools: ['*', 'agent_browser_*', 'retired_tool', 'read'],
      defaultTools: ['read', 'bash'],
      disallowedTools: [],
    };
    const save = vi.fn((_base, draft) => {
      validatePiSpecialistTools(draft[0].tools);
      return successfulSave(snapshot, draft);
    });
    const panel = createToolsPanel({
      snapshot,
      discoveredTools: sampleDiscovered,
      save,
      onDone: vi.fn(),
    });
    const overview = panel.render(180).join('\n');
    expect(overview).not.toContain('* active tools');
    expect(overview).not.toContain('dynamic');
    panel.handleInput('*');
    expect(panel.getState().draft[0]?.tools).toEqual(snapshot.roles[0]?.tools);
    panel.handleInput('\r');
    const text = panel.render(240).join('\n');
    expect(text).toContain('Read-only: *, agent_browser_*, retired_tool');
    expect(text).toContain('ask_orchestrator: child-provided');
    expect(text).toContain('enable_ask_orchestrator');
    expect(text).not.toMatch(/\[[x ]\] (?:ask_orchestrator|retired_tool|\*)/);
    expect(text).toContain('[ ] custom_inactive (inactive)');
    panel.handleInput('*');
    panel.handleInput(' '); // exact read only
    expect(panel.getState().draft[0]?.tools).toEqual([
      '*',
      'agent_browser_*',
      'retired_tool',
    ]);
    panel.handleInput('q');
    panel.handleInput('s');
    expect(save.mock.calls[0]?.[1][0]?.tools).toEqual([
      '*',
      'agent_browser_*',
      'retired_tool',
    ]);
  });

  test('renders global scope, five roles, ambient-root warning and override boundary', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    const text = panel.render(100).join('\n');
    expect(text).toContain('Subagent tools');
    expect(text).toContain('/global/.pi/agent');
    for (const role of roles) expect(text).toContain(role);
    expect(text).toContain('Ambient root tools are unchanged');
    expect(text).toContain(
      'Native settings or project definitions may override',
    );
    expect(text).toContain(
      'Child specialists do not inherit root tools automatically',
    );
  });

  test('frames the panel and makes the selected role visually distinct', () => {
    const theme = {
      fg: (color: string, text: string) =>
        `\x1b[3${color === 'accent' ? '6' : '7'}m${text}\x1b[39m`,
      bg: (_color: string, text: string) => `\x1b[44m${text}\x1b[49m`,
    };
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
      theme,
    });
    const initial = panel.render(80);
    expect(initial[0]).toContain('Subagent tools');
    expect(initial[0]).toContain('╭');
    expect(initial.at(-1)).toContain('╰');
    expect(initial.find((line) => line.includes('explorer'))).toContain(
      '\x1b[44m',
    );

    panel.handleInput('\x1b[B'); // down arrow
    const moved = panel.render(80);
    expect(moved.find((line) => line.includes('explorer'))).not.toContain(
      '\x1b[44m',
    );
    expect(moved.find((line) => line.includes('librarian'))).toContain(
      '\x1b[44m',
    );
  });

  test('uses the model editor row layout and keyboard navigation', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    const wide = panel.render(110).join('\n');
    expect(wide).toContain('agent');
    expect(wide).toContain('selected tools');
    expect(wide).toContain('pending: none');
    expect(wide).toContain('selected: explorer');
    panel.handleInput('j');
    expect(panel.render(110).join('\n')).toContain('selected: librarian');
    panel.handleInput('G');
    expect(panel.render(110).join('\n')).toContain('selected: worker');
    panel.handleInput('g');
    expect(panel.render(110).join('\n')).toContain('selected: explorer');
    panel.handleInput('\r');
    expect(panel.render(80).join('\n')).toContain('Choose tools');
    panel.handleInput('j');
    expect(panel.render(80).join('\n')).toContain('selected: write');
    panel.handleInput('q');
    expect(panel.render(80).join('\n')).toContain('Subagent tools');
  });

  test('keeps lines within terminal columns for narrow terminals and long tool lists', () => {
    const wideSnapshot = sampleSnapshot();
    wideSnapshot.roles[0] = {
      role: 'explorer',
      filePath: '/global/.pi/agent/agents/explorer.md',
      scope: 'global',
      tools: [
        'very_long_tool_identifier_one',
        'very_long_tool_identifier_two',
        'very_long_tool_identifier_three',
        'very_long_tool_identifier_four',
      ],
      defaultTools: ['read', 'write'],
      disallowedTools: [],
    };
    const panel = createToolsPanel({
      snapshot: wideSnapshot,
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
      theme: {
        fg: (_color, text) => `\x1b[36m${text}\x1b[39m`,
        bg: (_color, text) => `\x1b[44m${text}\x1b[49m`,
      },
    });
    const lines = panel.render(30);
    expect(lines.length).toBeGreaterThan(6);
    expect(lines.every((line) => visibleWidth(line) <= 30)).toBe(true);
    expect(lines.join('\n')).toContain('tools');
    panel.handleInput('\r');
    expect(panel.render(30).every((line) => visibleWidth(line) <= 30)).toBe(
      true,
    );
  });

  test('keeps the selected role and tool visible in short overlays and after resize', () => {
    let maxHeight = 9; // 90% of a ten-row terminal
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: Array.from({ length: 30 }, (_, index) => ({
        name: `tool_${index.toString().padStart(2, '0')}`,
        active: true,
      })),
      save: vi.fn(),
      onDone: vi.fn(),
      maxHeight: () => maxHeight,
    });
    const render = () => {
      const lines = panel.render(96);
      expect(lines.length).toBeLessThanOrEqual(maxHeight);
      expect(lines[0]).toContain('╭');
      expect(lines.at(-1)).toContain('╰');
      return lines.join('\n');
    };

    expect(render()).toContain('›   explorer');
    panel.handleInput('G');
    expect(render()).toContain('›   worker');
    expect(render()).toContain('s save');
    panel.handleInput('\r');
    panel.handleInput('G');
    expect(render()).toContain('›   [ ] tool_29');
    expect(render()).toContain('space toggle');
    panel.handleInput(' ');
    expect(render()).toContain('›   [x] tool_29');
    panel.handleInput('g');
    expect(render()).toContain('›   [ ] tool_00');

    maxHeight = 5;
    panel.handleInput('G');
    expect(render()).toContain('›   [x] tool_29');
    panel.handleInput('q');
    expect(render()).toContain('› * worker');
    panel.handleInput('\x1b');
    expect(render()).toContain('d discard and close · k or esc keep editing');
    panel.handleInput('k');
    expect(render()).toContain('› * worker');
    maxHeight = 21;
    expect(render()).toContain('Ambient root tools are unchanged');
  });

  test('filters out only native delegation tools from selectable list', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer tools
    const text = panel.render(80).join('\n');
    expect(text).toContain('read');
    expect(text).toContain('write');
    expect(text).toContain('bash');
    expect(text).toContain('custom_inactive');
    expect(text).not.toContain('[ ] subagent_run');
    expect(text).toContain('[ ] ask_user_question');
    expect(text).toContain('[ ] todo');
  });

  test('clearly marks registered inactive tools and allows selecting them', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer tools
    const text = panel.render(80).join('\n');
    expect(text).toContain('custom_inactive (inactive)');

    // Navigate down to custom_inactive: index 3 (read=0, write=1, bash=2, custom_inactive=3)
    panel.handleInput('\x1b[B');
    panel.handleInput('\x1b[B');
    panel.handleInput('\x1b[B');
    panel.handleInput(' '); // toggle
    expect(panel.getState().draft[0]?.tools).toContain('custom_inactive');
  });

  test('shows unregistered role defaults read-only after reset', () => {
    const snapshot = sampleSnapshot();
    snapshot.roles[0] = {
      role: 'explorer',
      filePath: '/global/.pi/agent/agents/explorer.md',
      scope: 'global',
      tools: ['read'],
      defaultTools: ['read', 'default_extension'],
      disallowedTools: [],
    };
    const panel = createToolsPanel({
      snapshot,
      discoveredTools: [{ name: 'read', active: true }],
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r');
    panel.handleInput('r');
    expect(panel.render(120).join('\n')).toContain(
      'Read-only: default_extension',
    );
    expect(panel.render(120).join('\n')).not.toContain('[x] default_extension');
    panel.handleInput('G'); // read is the only registered choice
    panel.handleInput(' ');
    expect(panel.getState().draft[0]?.tools).toEqual(['default_extension']);
  });

  test('retains unrecognized exact names while editing but removes them on defaults reset', () => {
    const snapshotWithUnavailable = sampleSnapshot();
    snapshotWithUnavailable.roles[0] = {
      role: 'explorer',
      filePath: '/global/.pi/agent/agents/explorer.md',
      scope: 'global',
      tools: ['read', 'write', 'legacy_mcp_tool'],
      defaultTools: ['read', 'write'],
      disallowedTools: [],
    };
    const panel = createToolsPanel({
      snapshot: snapshotWithUnavailable,
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer
    const text = panel.render(80).join('\n');
    expect(text).toContain('Read-only: legacy_mcp_tool');
    expect(text).not.toContain('[x] legacy_mcp_tool');

    panel.handleInput('G');
    panel.handleInput(' '); // toggle the last registered choice, not the unknown name
    expect(panel.getState().draft[0]?.tools).toContain('legacy_mcp_tool');
    panel.handleInput('r');
    expect(panel.getState().draft[0]?.tools).toEqual(['read', 'write']);
  });

  test('removed active-selection keys do not edit or persist in either screen', () => {
    const snapshot = sampleSnapshot();
    const save = vi.fn();
    const panel = createToolsPanel({
      snapshot,
      discoveredTools: sampleDiscovered,
      save,
      onDone: vi.fn(),
    });
    panel.handleInput('a');
    panel.handleInput('A');
    panel.handleInput('*');
    expect(panel.getState().draft).toEqual(snapshot.roles);
    panel.handleInput('\r');
    panel.handleInput('a');
    panel.handleInput('A');
    panel.handleInput('*');
    expect(panel.getState().draft).toEqual(snapshot.roles);
    panel.handleInput('\r');
    panel.handleInput('s');
    expect(save).not.toHaveBeenCalled();
  });

  test('restore defaults ("r") resets tools to role defaultTools', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer
    panel.handleInput(' '); // remove read
    expect(panel.getState().draft[0]?.tools).toEqual(['write']);
    panel.handleInput('r'); // restore defaults -> ['read', 'write']
    expect(panel.getState().draft[0]?.tools).toEqual(['read', 'write']);
  });

  test('restore defaults works directly from overview screen', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r');
    panel.handleInput(' ');
    panel.handleInput('q');
    expect(panel.getState().draft[0]?.tools).toEqual(['write']);
    panel.handleInput('r'); // restore defaults on explorer from overview
    expect(panel.getState().draft[0]?.tools).toEqual(['read', 'write']);
  });

  test('clean cancel with escape or ctrl-c performs zero writes', () => {
    const save = vi.fn();
    const done = vi.fn();
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save,
      onDone: done,
    });
    panel.handleInput('\x1b'); // escape in overview
    expect(save).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ kind: 'cancelled' });

    const doneCtrlC = vi.fn();
    const panelCtrlC = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save,
      onDone: doneCtrlC,
    });
    panelCtrlC.handleInput('\x03'); // ctrl-c in overview
    expect(doneCtrlC).toHaveBeenCalledWith({ kind: 'cancelled' });
  });

  test('dirty cancel requires discard confirmation and keeps editing by default', () => {
    const save = vi.fn();
    const done = vi.fn();
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save,
      onDone: done,
    });
    panel.handleInput('\r');
    panel.handleInput(' ');
    panel.handleInput('q');
    panel.handleInput('\x1b'); // escape
    expect(panel.render(80).join('\n')).toContain('Discard unsaved draft?');

    panel.handleInput('k'); // keep editing
    expect(panel.render(80).join('\n')).toContain('Subagent tools');
    expect(done).not.toHaveBeenCalled();

    panel.handleInput('\x1b'); // escape again
    panel.handleInput('d'); // discard
    expect(save).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ kind: 'cancelled' });
  });

  test('saves changes and notifies with changed roles', () => {
    const base = sampleSnapshot();
    const save = vi.fn((_base, draft) => successfulSave(base, draft));
    const done = vi.fn();
    const panel = createToolsPanel({
      snapshot: base,
      discoveredTools: sampleDiscovered,
      save,
      onDone: done,
    });
    panel.handleInput('\r');
    panel.handleInput(' ');
    panel.handleInput('q');
    panel.handleInput('s'); // save
    expect(save).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith({
      kind: 'saved',
      changedRoles: ['explorer'],
    });
  });

  test('save closes a clean draft without writing files', () => {
    const save = vi.fn();
    const done = vi.fn();
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save,
      onDone: done,
    });
    panel.handleInput('s');
    expect(save).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith({ kind: 'saved', changedRoles: [] });
  });

  test.each([
    false,
    true,
  ])('partial-save retry preserves the draft (defaults reset: %s)', (reset) => {
    const base = sampleSnapshot();
    const explorer = base.roles[0];
    if (!explorer) throw new Error('Missing fixture role.');
    explorer.tools = ['read', 'write', '*', 'agent_browser_*', 'retired_tool'];
    const retry = sampleSnapshot();
    retry.contents.explorer = 'explorer-v2';
    retry.roles[0] = {
      role: 'explorer',
      filePath: '/global/.pi/agent/agents/explorer.md',
      scope: 'global',
      tools: ['read', 'write', '*', 'agent_browser_*', 'retired_tool', 'bash'],
      defaultTools: ['read', 'write'],
      disallowedTools: [],
    };
    const save = vi
      .fn()
      .mockReturnValueOnce({
        success: false,
        changedRoles: ['explorer'],
        snapshot: retry,
        error: 'designer write failed',
      })
      .mockImplementation((_snapshot, draft) => successfulSave(retry, draft));

    const panel = createToolsPanel({
      snapshot: base,
      discoveredTools: sampleDiscovered,
      save,
      onDone: vi.fn(),
      maxHeight: () => 5,
    });
    panel.handleInput('\r');
    panel.handleInput('j');
    panel.handleInput('j');
    panel.handleInput(' '); // add registered bash
    panel.handleInput('q');
    panel.handleInput('s'); // save -> partial failure
    expect(panel.render(100).length).toBeLessThanOrEqual(5);
    expect(panel.render(100).join('\n')).toContain('designer write failed');
    expect(panel.render(100).join('\n')).toContain('Already changed: explorer');

    expect(panel.getState().draft[0]?.tools).toEqual(retry.roles[0]?.tools);
    if (reset) panel.handleInput('r');
    panel.handleInput('s'); // retry save
    expect(save.mock.calls[1]?.[0]).toBe(retry);
    expect(save.mock.calls[1]?.[1][0]?.tools).toEqual(
      reset ? ['read', 'write'] : retry.roles[0]?.tools,
    );
  });

  test('handles pagination for long tool lists', () => {
    const manyTools: ToolsPanelDiscoveredTool[] = Array.from(
      { length: 25 },
      (_, i) => ({
        name: `tool_${i.toString().padStart(2, '0')}`,
        active: true,
      }),
    );
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: manyTools,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer
    const text = panel.render(80).join('\n');
    expect(text).toContain('Showing 1–10 of 25');

    // Scroll down 12 times
    for (let i = 0; i < 12; i++) panel.handleInput('\x1b[B');
    const scrolled = panel.render(80).join('\n');
    expect(scrolled).toContain('tool_12');
  });
});
