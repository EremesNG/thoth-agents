import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PI_ROOT_END, PI_ROOT_START } from './harness/writers/pi-agent';
import piExtension, { type PiExtensionApi } from './pi';

const PI_SPECIALIST_ROLES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
] as const;

function seedPackageSpecialists(packageRoot: string): void {
  mkdirSync(join(packageRoot, 'pi', 'agents'), { recursive: true });
  for (const role of PI_SPECIALIST_ROLES)
    writeFileSync(
      join(packageRoot, 'pi', 'agents', `${role}.md`),
      `---\nname: ${role}\nmanaged-by: thoth-agents\n---\n`,
    );
}

describe('native Pi extension', () => {
  beforeEach(() => vi.stubEnv('PI_SUBAGENT_CHILD', ''));
  afterEach(() => vi.unstubAllEnvs());

  test('does not infer session ownership from the obsolete child-process marker', () => {
    vi.stubEnv('PI_SUBAGENT_CHILD', '1');
    const handlers = new Map<
      string,
      (event: Record<string, unknown>, context?: unknown) => unknown
    >();
    const on: PiExtensionApi['on'] = (name, handler) => {
      handlers.set(name, handler);
    };
    const registerCommand = vi.fn();
    const api = { on, registerCommand } satisfies PiExtensionApi;

    piExtension(api);

    expect([...handlers.keys()]).toEqual([
      'before_agent_start',
      'session_start',
    ]);
    expect(registerCommand).toHaveBeenCalledWith(
      'thoth-agents:models',
      expect.objectContaining({
        description: 'Edit global Thoth specialist models',
        handler: expect.any(Function),
      }),
    );
  });
  test('registers one bounded adaptive-root block per turn without import side effects', async () => {
    const handlers = new Map<string, (event: unknown) => unknown>();
    const api = {
      on: vi.fn((name: string, handler: (event: unknown) => unknown) =>
        handlers.set(name, handler),
      ),
    };
    piExtension(api);
    expect([...handlers.keys()]).toEqual([
      'before_agent_start',
      'session_start',
    ]);
    const injectRoot = handlers.get('before_agent_start');
    const first = (await injectRoot?.({ systemPrompt: 'host prompt' })) as {
      systemPrompt: string;
    };
    const second = (await injectRoot?.({
      systemPrompt: first.systemPrompt,
    })) as {
      systemPrompt: string;
    };
    expect(
      second.systemPrompt.match(new RegExp(PI_ROOT_START, 'g')),
    ).toHaveLength(1);
    expect(
      second.systemPrompt.match(new RegExp(PI_ROOT_END, 'g')),
    ).toHaveLength(1);
    expect(second.systemPrompt).toContain('host prompt');
  });
  test('registers the root-only models command and rejects non-TUI invocation without reads or writes', async () => {
    const commands = new Map<
      string,
      (args: string | undefined, context: any) => unknown
    >();
    const readModelConfig = vi.fn();
    const saveModelConfig = vi.fn();
    piExtension(
      {
        on: vi.fn(),
        registerCommand: (name, command) => commands.set(name, command.handler),
      },
      { readModelConfig, saveModelConfig },
    );
    const notify = vi.fn();
    const custom = vi.fn();
    await commands.get('thoth-agents:models')?.(undefined, {
      mode: 'rpc',
      ui: { notify, custom },
      modelRegistry: { getAll: vi.fn() },
    });
    expect(commands.has('thoth-agents:models')).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('requires interactive TUI mode'),
      'error',
    );
    expect(readModelConfig).not.toHaveBeenCalled();
    expect(saveModelConfig).not.toHaveBeenCalled();
    expect(custom).not.toHaveBeenCalled();
  });

  test('wires the host catalog and native input/render helpers into the custom panel', async () => {
    const commands = new Map<
      string,
      (args: string | undefined, context: any) => unknown
    >();
    const roles = ['explorer', 'librarian', 'oracle', 'designer', 'worker'];
    const snapshot = {
      piRoot: '/global/pi',
      roles: roles.map((role) => ({
        role,
        model: 'inherit',
        effort: { kind: 'inherit' as const },
      })),
      contents: Object.fromEntries(roles.map((role) => [role, role])),
    };
    const saveModelConfig = vi.fn((_snapshot, draft) => ({
      success: true,
      changedRoles: ['explorer'],
      snapshot: { ...snapshot, roles: draft },
    }));
    const notify = vi.fn();
    const requestRender = vi.fn();
    let rendered = '';
    piExtension(
      {
        on: vi.fn(),
        registerCommand: (name, command) => commands.set(name, command.handler),
      },
      {
        piRoot: '/global/pi',
        readModelConfig: vi.fn(() => snapshot),
        saveModelConfig,
        loadNativeModules: async () => ({
          keys: {
            up: 'up',
            down: 'down',
            enter: 'enter',
            escape: 'escape',
            backspace: 'backspace',
          },
          matchesKey: (data, key) => data === `<${key}>`,
          truncateToWidth: (text, width) => text.slice(0, width),
          visibleWidth: (text) => text.length,
          getSupportedThinkingLevels: () => ['low', 'max'],
        }),
      },
    );
    await commands.get('thoth-agents:models')?.(undefined, {
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
          rendered = component.render(80).join('\n');
          component.handleInput('<enter>');
          component.handleInput('<down>');
          component.handleInput('<enter>');
          component.handleInput('<down>');
          component.handleInput('<down>');
          component.handleInput('<enter>');
          component.handleInput('s');
          return result;
        },
      },
      modelRegistry: {
        getAll: () => [{ provider: 'openai', id: 'gpt-5.4', name: 'GPT 5.4' }],
      },
    });
    expect(rendered).toContain('Global specialist models');
    expect(saveModelConfig).toHaveBeenCalledTimes(1);
    expect(saveModelConfig.mock.calls[0]?.[1][0]).toMatchObject({
      model: 'openai/gpt-5.4',
      effort: { kind: 'effort', value: 'max' },
      availableEfforts: ['low', 'max'],
    });
    expect(requestRender).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('Saved global Thoth specialist models'),
      'info',
    );
  });

  test('session start converges package specialists without rejecting the session', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-extension-'));
    try {
      const packageRoot = join(root, 'package');
      seedPackageSpecialists(packageRoot);
      const handlers = new Map<
        string,
        (event: Record<string, unknown>) => unknown
      >();
      piExtension(
        { on: (name, handler) => handlers.set(name, handler) },
        { packageRoot, piRoot: join(root, 'home') },
      );
      await expect(
        Promise.resolve(handlers.get('session_start')?.({})),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('j0k3r lean child resources filter lifecycle hooks after Thoth activation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-lean-session-'));
    try {
      const packageRoot = join(root, 'package');
      const piRoot = join(root, 'home');
      seedPackageSpecialists(packageRoot);

      const handlers = new Map<
        string,
        (event: Record<string, unknown>, context?: unknown) => unknown
      >();
      const on: PiExtensionApi['on'] = (name, handler) => {
        handlers.set(name, handler);
      };
      const registerCommand = vi.fn();
      const api = { on, registerCommand } satisfies PiExtensionApi;
      const leanExtensionEvents = new Set([
        'tool_call',
        'tool_result',
        'user_bash',
      ]);
      const dispatchLeanEvent = (
        name: string,
        event: Record<string, unknown>,
      ): unknown => {
        if (!leanExtensionEvents.has(name)) return undefined;
        return handlers.get(name)?.(event);
      };

      piExtension(api, { packageRoot, piRoot });

      expect([...handlers.keys()]).toEqual([
        'before_agent_start',
        'session_start',
      ]);
      expect(registerCommand).toHaveBeenCalled();
      expect(
        dispatchLeanEvent('before_agent_start', {
          systemPrompt: 'child prompt',
        }),
      ).toBeUndefined();
      expect(dispatchLeanEvent('session_start', {})).toBeUndefined();
      expect(existsSync(join(piRoot, 'agents'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
