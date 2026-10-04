import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, test, vi } from 'vitest';
import { STANDALONE_STAR_TOOL_EXCLUSIONS } from '../../pi-packages/pi-subagents/src/tool-patterns.ts';
import type {
  PiToolConfigSnapshot,
  PiToolSaveResult,
} from '../cli/pi-tool-config';
import { validatePiSpecialistTools } from '../cli/pi-tool-config';
import {
  createToolsPanel,
  DYNAMIC_DELEGATION_TOOLS,
  isEligibleTool,
  type ToolsPanelDiscoveredTool,
} from './tools-panel';

const roles = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
] as const;

function sampleSnapshot(): PiToolConfigSnapshot {
  return {
    piRoot: '/global/.pi/agent',
    roles: roles.map((role) => ({
      role,
      tools: ['read', 'write'],
      defaultTools: ['read', 'write'],
    })),
    contents: Object.fromEntries(
      roles.map((role) => [role, `${role}-content`]),
    ),
  };
}

const backgroundDelegationTools = [
  'bg_delegate',
  'bg_run_pi_attested',
  'bg_result',
  'fusion_reason',
  'fusion_investigate',
  'fusion_research',
  'fusion_validate',
];

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

  test('rejects root-only controls', () => {
    expect(isEligibleTool('ask_user_question')).toBe(false);
    expect(isEligibleTool('todo')).toBe(false);
    expect(isEligibleTool('TODO')).toBe(false);
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
  test('dynamic preview exclusions match the standalone * runtime contract', () => {
    expect(DYNAMIC_DELEGATION_TOOLS).toEqual(STANDALONE_STAR_TOOL_EXCLUSIONS);
  });

  test('* preview excludes background delegation tools but keeps ordinary background task tools', () => {
    const backgroundTaskTools = ['bg_run', 'bg_status', 'bg_logs', 'bg_kill'];
    const discoveredTools = [
      ...sampleDiscovered,
      ...[...backgroundDelegationTools, ...backgroundTaskTools].map((name) => ({
        name,
        active: true,
      })),
    ];
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('*');
    panel.handleInput('\r');
    const pages: string[] = [];
    for (let index = 0; index < discoveredTools.length; index++) {
      pages.push(panel.render(300).join('\n'));
      panel.handleInput('j');
    }
    const text = pages.join('\n');
    for (const name of backgroundDelegationTools) {
      expect(text).toContain(`[ ] ${name}`);
      expect(text).not.toContain(`[x] ${name}`);
    }
    for (const name of backgroundTaskTools)
      expect(text).toContain(`[x] ${name}`);
    expect(text).toContain(
      `AskClaude, AskAntigravity, ${backgroundDelegationTools.join(', ')}, ask_orchestrator.`,
    );
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
    panel.handleInput('g');
    panel.handleInput(' '); // materialize today's preview without read
    expect(panel.getState().draft[0]?.tools).toEqual([
      'write',
      'bash',
      ...backgroundTaskTools,
    ]);
  });

  test('* saves the single dynamic active-root selector without selecting inactive or delegation tools', () => {
    const save = vi.fn((_snapshot, draft) => {
      validatePiSpecialistTools(draft[0].tools);
      return successfulSave(sampleSnapshot(), draft);
    });
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: [
        ...sampleDiscovered,
        { name: 'AskClaude', active: true },
        { name: 'AskAntigravity', active: true },
        { name: '*', active: true },
        { name: '@active', active: true },
      ],
      save,
      onDone: vi.fn(),
    });
    panel.handleInput('*');
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
    const wide = panel.render(110).join('\n');
    expect(wide).toContain('› explorer *');
    expect(wide).toContain('active (dynamic)');
    expect(wide).toContain('tools currently active in the root session');
    expect(wide).toContain(
      'subagent_*, ask_user_question, todo, AskClaude, AskAntigravity',
    );
    expect(wide).not.toContain('a all active');
    expect(wide).not.toContain('@active');
    const narrow = panel.render(40);
    expect(narrow.join('\n')).toContain('active (dynamic)');
    expect(narrow.every((line) => [...line].length <= 40)).toBe(true);
    panel.handleInput('\r');
    const text = panel.render(110).join('\n');
    expect(text).toContain('[x] bash');
    expect(text).toContain('[ ] custom_inactive (inactive)');
    expect(text).toContain('[ ] AskClaude');
    expect(text).toContain('[ ] AskAntigravity');
    expect(text).not.toContain('* (unavailable)');
    expect(text).not.toContain('@active');
    expect(text).not.toContain('[ ] subagent_run');
    expect(text).not.toContain('a all active');
    panel.handleInput('\r');
    panel.handleInput('s');
    expect(save.mock.calls[0]?.[1][0]?.tools).toEqual(['*']);
  });

  test('* stays dynamic and a checkbox turns it into a current explicit active snapshot', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: [
        ...sampleDiscovered,
        { name: 'AskClaude', active: true },
        { name: 'AskAntigravity', active: true },
      ],
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('*');
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
    expect(panel.render(110).join('\n')).toContain(
      'currently active root tools',
    );
    panel.handleInput('\r');
    const selectorText = panel.render(100).join('\n');
    expect(selectorText).toContain('active (dynamic)');
    expect(selectorText).toContain('[x] bash');
    expect(selectorText).toContain('[ ] custom_inactive (inactive)');
    panel.handleInput(' '); // remove read from today's active inventory
    expect(panel.getState().draft[0]?.tools).toEqual(['write', 'bash']);
    expect(panel.render(100).join('\n')).toContain('2 selected');
  });

  test.each([
    { name: 'custom_inactive', active: false },
    { name: 'AskClaude', active: true },
    { name: 'AskAntigravity', active: true },
    ...backgroundDelegationTools.map((name) => ({ name, active: true })),
  ])('explicitly toggling $name from * adds it to the current active snapshot', (tool) => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: [...sampleDiscovered, tool],
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('*');
    panel.handleInput('\r');
    panel.handleInput('G'); // choose the inactive or delegation tool
    panel.handleInput(' ');
    expect(panel.getState().draft[0]?.tools).toEqual([
      'read',
      'write',
      'bash',
      tool.name,
    ]);
    expect(() =>
      validatePiSpecialistTools(panel.getState().draft[0]?.tools ?? []),
    ).not.toThrow();
  });

  test('* is available with zero currently active eligible tools', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: [
        { name: 'custom_inactive', active: false },
        { name: 'subagent_run', active: true },
      ],
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('*');
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
    panel.handleInput('\r');
    expect(panel.render(100).join('\n')).toContain(
      '[ ] custom_inactive (inactive)',
    );
    expect(panel.render(100).join('\n')).not.toContain('subagent_run');
  });

  test('renders global scope, five roles, ambient-root warning and override boundary', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    const text = panel.render(100).join('\n');
    expect(text).toContain('Global specialist tools');
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
      truncate: truncateToWidth,
      visibleWidth,
    });
    const initial = panel.render(80);
    expect(initial[0]).toContain('Global specialist tools');
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
    expect(panel.render(80).join('\n')).toContain('Global specialist tools');
  });

  test('keeps lines within terminal columns for narrow terminals and long tool lists', () => {
    const wideSnapshot = sampleSnapshot();
    wideSnapshot.roles[0] = {
      role: 'explorer',
      tools: [
        'very_long_tool_identifier_one',
        'very_long_tool_identifier_two',
        'very_long_tool_identifier_three',
        'very_long_tool_identifier_four',
      ],
      defaultTools: ['read', 'write'],
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
      truncate: truncateToWidth,
      visibleWidth,
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

    expect(render()).toContain('› explorer');
    panel.handleInput('G');
    expect(render()).toContain('› worker');
    expect(render()).toContain('s save');
    panel.handleInput('\r');
    panel.handleInput('G');
    expect(render()).toContain('› [x] write (unavailable)');
    expect(render()).toContain('space toggle');
    panel.handleInput('k');
    panel.handleInput('k');
    expect(render()).toContain('› [ ] tool_29');
    panel.handleInput(' ');
    expect(render()).toContain('› [x] tool_29');
    panel.handleInput('g');
    expect(render()).toContain('› [ ] tool_00');

    maxHeight = 5;
    panel.handleInput('G');
    expect(render()).toContain('› [x] write (unavailable)');
    panel.handleInput('q');
    expect(render()).toContain('› worker *');
    panel.handleInput('\x1b');
    expect(render()).toContain('d discard and close · k or esc keep editing');
    panel.handleInput('k');
    expect(render()).toContain('› worker *');
    maxHeight = 21;
    expect(render()).toContain('Ambient root tools are unchanged');
  });

  test('filters out delegation tools and root-only controls from selectable list', () => {
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
    expect(text).not.toContain('[ ] ask_user_question');
    expect(text).not.toContain('[ ] todo');
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

  test('shows unavailable role defaults after reset and lets the user remove them', () => {
    const snapshot = sampleSnapshot();
    snapshot.roles[0] = {
      role: 'explorer',
      tools: ['read'],
      defaultTools: ['read', 'default_extension'],
    };
    const panel = createToolsPanel({
      snapshot,
      discoveredTools: [{ name: 'read', active: true }],
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r');
    panel.handleInput('r');
    expect(panel.render(100).join('\n')).toContain(
      '[x] default_extension (unavailable)',
    );
    panel.handleInput('\x1b[B');
    panel.handleInput(' ');
    expect(panel.getState().draft[0]?.tools).toEqual(['read']);
  });

  test('retains saved unavailable tools with (unavailable) label and allows removing them', () => {
    const snapshotWithUnavailable = sampleSnapshot();
    snapshotWithUnavailable.roles[0] = {
      role: 'explorer',
      tools: ['read', 'write', 'legacy_mcp_tool'],
      defaultTools: ['read', 'write'],
    };
    const panel = createToolsPanel({
      snapshot: snapshotWithUnavailable,
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer
    const text = panel.render(80).join('\n');
    expect(text).toContain('legacy_mcp_tool (unavailable)');
    expect(text).toContain('[x] legacy_mcp_tool');

    // legacy_mcp_tool is index 4 (read, write, bash, custom_inactive, legacy_mcp_tool)
    for (let i = 0; i < 4; i++) panel.handleInput('\x1b[B');
    panel.handleInput(' '); // toggle off
    expect(panel.getState().draft[0]?.tools).not.toContain('legacy_mcp_tool');

    panel.handleInput(' '); // toggle back on
    expect(panel.getState().draft[0]?.tools).toContain('legacy_mcp_tool');
  });

  test('the former all-active key does not edit or persist a selector in either screen', () => {
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
    expect(panel.getState().draft).toEqual(snapshot.roles);
    panel.handleInput('\r');
    panel.handleInput('a');
    panel.handleInput('A');
    expect(panel.getState().draft).toEqual(snapshot.roles);
    panel.handleInput('\r');
    panel.handleInput('s');
    expect(save).not.toHaveBeenCalled();
  });

  test('* replaces an explicit list only when selected', () => {
    const snapshot = sampleSnapshot();
    snapshot.roles[0] = {
      role: 'explorer',
      tools: ['read', 'custom_inactive', 'saved_mcp'],
      defaultTools: ['read'],
    };
    const panel = createToolsPanel({
      snapshot,
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    expect(panel.getState().draft[0]?.tools).toEqual([
      'read',
      'custom_inactive',
      'saved_mcp',
    ]);
    panel.handleInput('*');
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
    panel.handleInput('*');
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
  });

  test('restore defaults ("r") resets tools to role defaultTools', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('\r'); // edit explorer
    panel.handleInput('*'); // select dynamic active mode
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
    panel.handleInput('r'); // restore defaults -> ['read', 'write']
    expect(panel.getState().draft[0]?.tools).toEqual(['read', 'write']);
  });

  test('select active tools and restore defaults work directly from overview screen', () => {
    const panel = createToolsPanel({
      snapshot: sampleSnapshot(),
      discoveredTools: sampleDiscovered,
      save: vi.fn(),
      onDone: vi.fn(),
    });
    panel.handleInput('*'); // select active on explorer from overview
    expect(panel.getState().draft[0]?.tools).toEqual(['*']);
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
    panel.handleInput('*'); // dirty explorer
    panel.handleInput('\x1b'); // escape
    expect(panel.render(80).join('\n')).toContain('Discard unsaved draft?');

    panel.handleInput('k'); // keep editing
    expect(panel.render(80).join('\n')).toContain('Global specialist tools');
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
    panel.handleInput('*'); // dirty explorer
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

  test('preserves draft and adopts returned retry snapshot after partial failure', () => {
    const base = sampleSnapshot();
    const retry = sampleSnapshot();
    retry.contents.explorer = 'explorer-v2';
    retry.roles[0] = {
      role: 'explorer',
      tools: ['read', 'write', 'bash'],
      defaultTools: ['read', 'write'],
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
    panel.handleInput('*'); // explorer changed to the dynamic active selector
    panel.handleInput('s'); // save -> partial failure
    expect(panel.render(100).length).toBeLessThanOrEqual(5);
    expect(panel.render(100).join('\n')).toContain('designer write failed');
    expect(panel.render(100).join('\n')).toContain('Already changed: explorer');

    panel.handleInput('s'); // retry save
    expect(save.mock.calls[1]?.[0]).toBe(retry);
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
    expect(text).toContain('Showing 1–10 of 27');

    // Scroll down 12 times
    for (let i = 0; i < 12; i++) panel.handleInput('\x1b[B');
    const scrolled = panel.render(80).join('\n');
    expect(scrolled).toContain('tool_12');
  });
});
