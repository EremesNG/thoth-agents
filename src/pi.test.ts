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
    expect(registerCommand).not.toHaveBeenCalledWith(
      'thoth-agents:models',
      expect.anything(),
    );
  });
  test('appends the adaptive-root block without forcing or replacing a custom prompt', async () => {
    const handlers = new Map<
      string,
      (event: Record<string, unknown>) => unknown
    >();
    piExtension({ on: (name, handler) => handlers.set(name, handler) });
    const systemPromptOptions = {
      customPrompt: 'user replacement prompt',
      appendSystemPrompt: '',
    };
    const event = {
      systemPrompt: 'user replacement prompt',
      systemPromptOptions,
    };

    expect(await handlers.get('before_agent_start')?.(event)).toBeUndefined();
    expect(systemPromptOptions.appendSystemPrompt).toContain(PI_ROOT_START);
    expect(systemPromptOptions.appendSystemPrompt).toContain(PI_ROOT_END);
    expect(systemPromptOptions.appendSystemPrompt).toContain('<pi-runtime>');
    expect(systemPromptOptions.customPrompt).toBe('user replacement prompt');
    expect(systemPromptOptions).not.toHaveProperty('forceSystemPrompt');
    expect(event.systemPrompt).toBe('user replacement prompt');
  });
  test('preserves an existing system-prompt append before the adaptive-root block', async () => {
    const handlers = new Map<
      string,
      (event: Record<string, unknown>) => unknown
    >();
    piExtension({ on: (name, handler) => handlers.set(name, handler) });
    const systemPromptOptions = { appendSystemPrompt: 'existing append\n' };

    expect(
      await handlers.get('before_agent_start')?.({
        systemPrompt: 'host prompt',
        systemPromptOptions,
      }),
    ).toBeUndefined();
    expect(
      systemPromptOptions.appendSystemPrompt.startsWith(
        `existing append\n\n\n${PI_ROOT_START}`,
      ),
    ).toBe(true);
    expect(systemPromptOptions.appendSystemPrompt).toContain(PI_ROOT_END);
    expect(systemPromptOptions.appendSystemPrompt).not.toContain('host prompt');
  });
  test('appends the adaptive-root block exactly once across turns in the same session', async () => {
    const handlers = new Map<
      string,
      (event: Record<string, unknown>) => unknown
    >();
    piExtension({ on: (name, handler) => handlers.set(name, handler) });
    const injectRoot = handlers.get('before_agent_start');
    const systemPromptOptions = { appendSystemPrompt: '' };

    expect(
      await injectRoot?.({ systemPrompt: 'host prompt', systemPromptOptions }),
    ).toBeUndefined();
    const firstAppend = systemPromptOptions.appendSystemPrompt;
    // Another extension can add instructions after Thoth without losing them next turn.
    systemPromptOptions.appendSystemPrompt += '\n\nother extension append';
    const expectedAppend = systemPromptOptions.appendSystemPrompt;
    expect(
      await injectRoot?.({
        systemPrompt: `host prompt\n\n${firstAppend}`,
        systemPromptOptions,
      }),
    ).toBeUndefined();
    expect(
      systemPromptOptions.appendSystemPrompt.match(
        new RegExp(PI_ROOT_START, 'g'),
      ),
    ).toHaveLength(1);
    expect(
      systemPromptOptions.appendSystemPrompt.match(
        new RegExp(PI_ROOT_END, 'g'),
      ),
    ).toHaveLength(1);
    expect(systemPromptOptions.appendSystemPrompt).toBe(expectedAppend);
  });
  test('falls back to one returned adaptive-root block when older Pi omits prompt options', async () => {
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
