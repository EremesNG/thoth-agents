import { describe, expect, test, vi } from 'vitest';
import type { ToolsConfigSnapshot } from '../../src/tools-panel/config.js';
import { createToolsPanel } from '../../src/tools-panel/panel.js';

function setup(
  scope: 'global' | 'project' = 'global',
  entries = ['read*', 'legacy', 'legacy'],
) {
  const role = {
    role: 'explorer',
    filePath: '/global/explorer.md',
    scope: 'global' as const,
    tools: ['read', ...entries],
    disallowedTools: [],
    overlay:
      scope === 'project'
        ? { add: [...entries], remove: ['write*'] }
        : undefined,
  };
  const snapshot: ToolsConfigSnapshot = {
    cwd: '/project',
    piRoot: '/global',
    initialScope: scope,
    roles: [role],
    globalRoles: [{ ...role, overlay: undefined }],
    contents: {},
  };
  const save = vi.fn((base, draft) => ({
    success: true,
    changedRoles: ['explorer'],
    snapshot: { ...base, roles: draft },
  }));
  const panel = createToolsPanel({
    snapshot,
    discoveredTools: [
      { name: 'read', active: true },
      { name: 'write', active: true },
      { name: 'write_file', active: true },
    ],
    save,
    onDone: vi.fn(),
  });
  panel.handleInput('\r');
  for (let i = 0; i < 3; i++) panel.handleInput('j');
  return { panel, save };
}

const replace = (panel: ReturnType<typeof createToolsPanel>, value: string) => {
  panel.handleInput('e');
  panel.handleInput('\x15');
  panel.handleInput(value);
  panel.handleInput('\r');
};

describe('editing manual tool entries', () => {
  test.each([
    'add',
    'remove',
  ] as const)('edits the Project %s lane without changing its other entries or base', (lane) => {
    const { panel, save } = setup('project');
    if (lane === 'remove') for (let i = 0; i < 3; i++) panel.handleInput('j');
    panel.render(240); // populate derived rows before the edit
    replace(panel, 'write_file*');
    const role = panel.getState().draft[0];
    expect(role?.tools).toEqual(['read', 'read*', 'legacy', 'legacy']);
    expect(role?.overlay).toEqual(
      lane === 'add'
        ? { add: ['write_file*', 'legacy', 'legacy'], remove: ['write*'] }
        : { add: ['read*', 'legacy', 'legacy'], remove: ['write_file*'] },
    );
    expect(panel.render(240).join('\n')).toContain(
      `${lane} · write_file* · 1 match`,
    );
    panel.handleInput('\r');
    expect(panel.render(240).join('\n')).toContain('pending: 1 change');
    panel.handleInput('s');
    expect(save.mock.calls[0]?.[0].editScope).toBe('project');
    expect(save.mock.calls[0]?.[1][0].overlay).toEqual(role?.overlay);
  });

  test.each([
    'global',
    'project',
  ] as const)('%s unchanged value is allowed, even with preserved duplicates, and is not dirty', (scope) => {
    const { panel, save } = setup(scope);
    panel.handleInput('j'); // first legacy entry (another legacy follows)
    panel.handleInput('e');
    panel.handleInput('\r');
    expect(panel.render(240).join('\n')).toContain('Choose tools');
    panel.handleInput('\r');
    expect(panel.render(240).join('\n')).toContain('pending: none');
    panel.handleInput('s');
    expect(save).not.toHaveBeenCalled();
  });

  test.each([
    'global',
    'project',
  ] as const)('%s rejects a duplicate of another entry', (scope) => {
    const { panel } = setup(scope);
    const before = panel.getState().draft;
    replace(panel, 'legacy');
    expect(panel.render(240).join('\n')).toContain(
      'Duplicate Subagent tool name: legacy',
    );
    expect(panel.getState().draft).toEqual(before);
  });

  test.each([
    'global',
    'project',
  ] as const)('%s rejects empty edits and Esc cancels without mutation', (scope) => {
    const { panel } = setup(scope);
    const before = panel.getState().draft;
    replace(panel, '');
    expect(panel.render(240).join('\n')).toContain('use d/Delete');
    expect(panel.getState().draft).toEqual(before);
    panel.handleInput('write*');
    panel.handleInput('\x1b');
    expect(panel.render(240).join('\n')).toContain('Choose tools');
    expect(panel.getState().draft).toEqual(before);
    panel.handleInput('\r');
    expect(panel.render(240).join('\n')).toContain('pending: none');
  });

  test.each([
    '@active',
    'invalid name',
    'subagent_run',
  ])('validates only the candidate and rejects %s', (value) => {
    const { panel } = setup();
    const before = panel.getState().draft;
    replace(panel, value);
    expect(panel.render(240).join('\n')).toContain('Edit tool entry');
    expect(panel.getState().draft).toEqual(before);
  });

  test('only shows e edit on editable rows; registered tool keys and picker Enter retain their meaning', () => {
    const { panel } = setup('project');
    expect(panel.render(240).join('\n')).toContain('e edit');
    panel.handleInput('g');
    expect(panel.render(240).join('\n')).not.toContain('e edit');
    panel.handleInput('e');
    expect(panel.render(240).join('\n')).toContain('Choose tools');
    panel.handleInput(' ');
    expect(panel.getState().draft[0]?.overlay?.remove).toEqual([
      'write*',
      'read',
    ]);
    panel.handleInput('\r');
    expect(panel.getState().screen).toBe('overview');
  });

  test('edits one duplicate by index rather than replacing every matching value', () => {
    const { panel } = setup();
    panel.handleInput('j');
    panel.handleInput('j');
    replace(panel, 'new_tool');
    expect(panel.getState().draft[0]?.tools).toEqual([
      'read',
      'read*',
      'legacy',
      'new_tool',
    ]);
  });

  test('prefills the input with its cursor at the end', () => {
    const { panel } = setup();
    panel.handleInput('e');
    expect(panel.render(240).join('\n')).toContain('read*');
    panel.handleInput('_extra');
    panel.handleInput('\r');
    expect(panel.getState().draft[0]?.tools[1]).toBe('read*_extra');
  });
  test('edits a global glob at its index, refreshes cached counts and saves losslessly', () => {
    const { panel, save } = setup();
    expect(panel.render(240).join('\n')).toContain('read* · 1 match');
    replace(panel, 'write*');
    expect(panel.getState().draft[0]?.tools).toEqual([
      'read',
      'write*',
      'legacy',
      'legacy',
    ]);
    expect(panel.render(240).join('\n')).toContain('write* · 2 matches');
    panel.handleInput('\r'); // Enter retains picker-back behavior
    expect(panel.render(240).join('\n')).toContain('pending: 1 change');
    panel.handleInput('s');
    expect(save.mock.calls[0]?.[1][0].tools).toEqual([
      'read',
      'write*',
      'legacy',
      'legacy',
    ]);
  });
});
