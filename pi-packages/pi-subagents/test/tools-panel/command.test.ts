import { afterEach, expect, test, vi } from 'vitest';
import { registerToolsCommand } from '../../src/tools-panel/command.js';
import { toolsPanelRegistryKey } from '../../src/tools-panel/registry.js';

const shared = globalThis as any;
afterEach(() => {
  delete shared[toolsPanelRegistryKey];
});
const snapshot = {
  cwd: '/project',
  piRoot: '/global',
  contents: { worker: 'before' },
  roles: [
    {
      role: 'worker',
      filePath: '/global/agents/worker.md',
      scope: 'global' as const,
      tools: ['read'],
      disallowedTools: [],
    },
  ],
};
function setup(oldRootOrder?: string) {
  const commands = new Map<string, any>();
  const registered: Array<{ name: string; description: string }> = [];
  const handlers = new Map<string, any>();
  const pi = {
    registerCommand: vi.fn((name, command) => {
      registered.push({ name, description: command.description });
      commands.set(name, command);
    }),
    on: (name: string, handler: any) => handlers.set(name, handler),
    getCommands: vi.fn(() =>
      registered.map((command, index) => ({
        ...command,
        name:
          registered.length > 1 ? `${command.name}:${index + 1}` : command.name,
      })),
    ),
    getAllTools: vi.fn(() => [{ name: 'read' }, { name: 'inactive' }]),
    getActiveTools: vi.fn(() => ['read']),
  };
  const read = vi.fn(() => snapshot);
  const save = vi.fn((base, draft) => ({
    success: true,
    changedRoles: ['worker'],
    snapshot: { ...base, roles: draft },
  }));
  const oldRoot = () =>
    pi.registerCommand('subagents-tools', {
      description: 'Edit global Thoth specialist tools',
      handler: vi.fn(),
    });
  if (oldRootOrder === 'root-first') oldRoot();
  const checkToolsOwnership = registerToolsCommand(pi, { read, save });
  handlers.set('session_start', (_event: unknown, ctx: any) =>
    checkToolsOwnership(ctx),
  );
  if (oldRootOrder === 'subagents-first') oldRoot();
  return { pi, commands, handlers, read, save };
}

test('registers ownership and a generic tools command', () => {
  const { pi } = setup();
  expect(pi.registerCommand).toHaveBeenCalledWith(
    'subagents-tools',
    expect.objectContaining({ description: 'Edit subagent definition tools' }),
  );
  expect(shared[toolsPanelRegistryKey].capability).toEqual({
    version: 1,
    command: 'subagents-tools',
  });
});

test.each([
  'rpc',
  'json',
])('rejects %s mode without discovery, reads or writes', async (mode) => {
  const { pi, commands, read, save } = setup();
  const notify = vi.fn();
  const custom = vi.fn();
  await commands
    .get('subagents-tools')
    .handler('', { mode, ui: { notify, custom } });
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('requires interactive TUI'),
    'error',
  );
  expect(read).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(pi.getAllTools).not.toHaveBeenCalled();
  expect(custom).not.toHaveBeenCalled();
});

test('fails truthfully without inventory APIs and makes no reads or writes', async () => {
  const { pi, commands, read, save } = setup();
  (pi as any).getAllTools = undefined;
  const notify = vi.fn();
  await commands
    .get('subagents-tools')
    .handler('', { mode: 'tui', ui: { notify } });
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('Tool discovery is unavailable'),
    'error',
  );
  expect(read).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

test.each([
  'inline',
  'fullscreen',
])('tools command hosts native keys and balanced mouse reporting in %s mode', async (mode) => {
  const { commands, save } = setup();
  const write = vi.fn();
  const custom = async (factory: any) => {
    let result: unknown;
    const panel = factory(
      { mode, terminal: { rows: 40, write }, requestRender() {} },
      { fg: (_role: string, text: string) => text },
      {},
      (value: unknown) => {
        result = value;
      },
    );
    expect(write.mock.calls).toEqual(
      mode === 'fullscreen' ? [] : [['\x1b[?1000h\x1b[?1006h']],
    );
    panel.handleInput('\x1b[13u');
    expect(panel.render(100).join('\n')).toContain('Choose tools');
    panel.handleInput('\x1b[27u');
    panel.handleInput('\x1b[27u');
    return result;
  };
  await commands.get('subagents-tools').handler('', {
    cwd: '/project',
    mode: 'tui',
    ui: { custom, notify: vi.fn() },
  });
  expect(write.mock.calls).toEqual(
    mode === 'fullscreen'
      ? []
      : [['\x1b[?1000h\x1b[?1006h'], ['\x1b[?1006l\x1b[?1000l']],
  );
  expect(save).not.toHaveBeenCalled();
});

test('opens an owned centered height-aware overlay, discovers inactive tools and saves with notification', async () => {
  const { pi, commands, read, save } = setup();
  const notify = vi.fn();
  const tui = { requestRender: vi.fn(), terminal: { rows: 10 } };
  const custom = vi.fn(async (factory) => {
    let result: unknown;
    const panel = factory(
      tui,
      { fg: (_role: string, text: string) => text },
      {},
      (value: unknown) => {
        result = value;
      },
    );
    expect(panel.render(96).length).toBeLessThanOrEqual(9);
    tui.terminal.rows = 6;
    expect(panel.render(96).length).toBeLessThanOrEqual(5);
    panel.handleInput('\r');
    tui.terminal.rows = 24;
    expect(panel.render(160).join('\n')).toContain('inactive');
    expect(panel.render(160).join('\n')).toContain(
      'ask_orchestrator: child-provided',
    );
    panel.handleInput('j');
    panel.handleInput(' ');
    panel.handleInput('q');
    panel.handleInput('s');
    return result;
  });
  await commands
    .get('subagents-tools')
    .handler('', { cwd: '/project', mode: 'tui', ui: { notify, custom } });
  expect(custom).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      overlay: true,
      overlayOptions: expect.objectContaining({
        anchor: 'center',
        width: '96%',
        maxHeight: '90%',
      }),
    }),
  );
  expect(read).toHaveBeenCalledWith('/project');
  expect(pi.getAllTools).toHaveBeenCalledOnce();
  expect(pi.getActiveTools).toHaveBeenCalledOnce();
  expect(save.mock.calls[0]?.[1][0].tools).toEqual(['read', 'inactive']);
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('Updated: worker'),
    'info',
  );
});

test.each([
  'root-first',
  'subagents-first',
])('warns once about Pi 1.0.2 suffixed duplicate commands (%s)', async (order) => {
  const { pi, handlers } = setup(order);
  // The host exposes suffixed invocation names after all extensions register.
  expect(pi.getCommands().map(({ name }) => name)).toEqual([
    'subagents-tools:1',
    'subagents-tools:2',
  ]);
  expect(pi.getCommands()[0]?.description).toBe(
    order === 'root-first'
      ? 'Edit global Thoth specialist tools'
      : 'Edit subagent definition tools',
  );
  const notify = vi.fn();
  await handlers.get('session_start')({}, { ui: { notify } });
  await handlers.get('session_start')({}, { ui: { notify } });
  expect(notify).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('Upgrade thoth-agents'),
    'warning',
  );
});

test('does not warn for one owner or an unavailable command API', async () => {
  const { pi, handlers } = setup();
  const notify = vi.fn();
  await handlers.get('session_start')({}, { ui: { notify } });
  (pi as any).getCommands = undefined;
  await handlers.get('session_start')({}, { ui: { notify } });
  expect(notify).not.toHaveBeenCalled();
});
