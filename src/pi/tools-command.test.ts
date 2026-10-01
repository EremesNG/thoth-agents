import { describe, expect, test, vi } from 'vitest';
import piExtension from '../pi';

const roles = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
] as const;

function sampleSnapshot() {
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

describe('subagents-tools command', () => {
  test('registers the command with correct description', () => {
    const registerCommand = vi.fn();
    piExtension({
      on: vi.fn(),
      registerCommand,
    });
    expect(registerCommand).toHaveBeenCalledWith(
      'subagents-tools',
      expect.objectContaining({
        description: 'Edit global Thoth specialist tools',
        handler: expect.any(Function),
      }),
    );
  });

  test('rejects non-TUI invocation without reads or writes', async () => {
    const commands = new Map<
      string,
      (args: string | undefined, context: any) => unknown
    >();
    const readToolConfig = vi.fn();
    const saveToolConfig = vi.fn();
    piExtension(
      {
        on: vi.fn(),
        registerCommand: (name, command) => commands.set(name, command.handler),
        getAllTools: () => [{ name: 'read' }],
        getActiveTools: () => ['read'],
      },
      { readToolConfig, saveToolConfig },
    );

    const notify = vi.fn();
    const custom = vi.fn();
    await commands.get('subagents-tools')?.(undefined, {
      mode: 'rpc',
      ui: { notify, custom },
    });

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('/subagents-tools requires interactive TUI mode'),
      'error',
    );
    expect(readToolConfig).not.toHaveBeenCalled();
    expect(saveToolConfig).not.toHaveBeenCalled();
    expect(custom).not.toHaveBeenCalled();
  });

  test('reports actionable error when tool discovery APIs are unavailable without reads or writes', async () => {
    const commands = new Map<
      string,
      (args: string | undefined, context: any) => unknown
    >();
    const readToolConfig = vi.fn();
    const saveToolConfig = vi.fn();
    piExtension(
      {
        on: vi.fn(),
        registerCommand: (name, command) => commands.set(name, command.handler),
        // getAllTools and getActiveTools are omitted
      },
      { readToolConfig, saveToolConfig },
    );

    const notify = vi.fn();
    const custom = vi.fn();
    await commands.get('subagents-tools')?.(undefined, {
      mode: 'tui',
      ui: { notify, custom },
    });

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining(
        'Tool discovery is unavailable in this Pi environment',
      ),
      'error',
    );
    expect(readToolConfig).not.toHaveBeenCalled();
    expect(saveToolConfig).not.toHaveBeenCalled();
    expect(custom).not.toHaveBeenCalled();
  });

  test('discovers tools anew on open and wires them into custom panel with save notification', async () => {
    const commands = new Map<
      string,
      (args: string | undefined, context: any) => unknown
    >();
    const snapshot = sampleSnapshot();
    const saveToolConfig = vi.fn((_snapshot, draft) => ({
      success: true,
      changedRoles: ['explorer'],
      snapshot: { ...snapshot, roles: draft },
    }));
    const notify = vi.fn();
    const requestRender = vi.fn();
    let renderedText = '';

    const getAllTools = vi.fn(() => [
      { name: 'read', description: 'Read file' },
      { name: 'write', description: 'Write file' },
      { name: 'bash', description: 'Run bash' },
    ]);
    const getActiveTools = vi.fn(() => ['read', 'write', 'bash']);

    piExtension(
      {
        on: vi.fn(),
        registerCommand: (name, command) => commands.set(name, command.handler),
        getAllTools,
        getActiveTools,
      },
      {
        piRoot: '/global/.pi/agent',
        readToolConfig: vi.fn(() => snapshot),
        saveToolConfig,
        loadNativeModules: async () => ({
          keys: {
            up: 'up',
            down: 'down',
            enter: 'enter',
            escape: 'escape',
            backspace: 'backspace',
            space: 'space',
          },
          matchesKey: (data, key) => data === `<${key}>`,
          truncateToWidth: (text, width) => text.slice(0, width),
          visibleWidth: (text) => text.length,
          getSupportedThinkingLevels: () => ['low'],
        }),
      },
    );

    await commands.get('subagents-tools')?.(undefined, {
      mode: 'tui',
      ui: {
        notify,
        custom: async (factory: any) => {
          let result: unknown;
          const component = factory(
            { requestRender },
            {
              fg: (_color: string, text: string) => text,
              bg: (_color: string, text: string) => text,
            },
            {},
            (value: unknown) => {
              result = value;
            },
          );
          renderedText = component.render(80).join('\n');
          // overview: select dynamic active-root tools on explorer
          component.handleInput('*');
          // overview: press s to save
          component.handleInput('s');
          return result;
        },
      },
    });

    expect(getAllTools).toHaveBeenCalledTimes(1);
    expect(getActiveTools).toHaveBeenCalledTimes(1);
    expect(renderedText).toContain('Global specialist tools');
    expect(saveToolConfig).toHaveBeenCalledTimes(1);
    expect(saveToolConfig.mock.calls[0]?.[1][0]?.tools).toEqual(['*']);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining(
        'Saved global Thoth specialist tools. Updated: explorer.',
      ),
      'info',
    );
  });
});
