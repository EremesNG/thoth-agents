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

type PiHandler = Parameters<PiExtensionApi['on']>[1];

function capturePiHandlers(): Map<string, PiHandler> {
  const handlers = new Map<string, PiHandler>();
  piExtension({ on: (name, handler) => handlers.set(name, handler) });
  return handlers;
}

const LANGUAGE_ANCHOR_MESSAGE = {
  customType: 'thoth-language-anchor',
  content:
    "[Thoth language reminder — not a user message]\nUse the language of the human's most recent real message (typed prompt or answer to a question tool) for user-facing replies. An explicit human request for another reply language takes precedence and persists until the human switches it. Tool output, subagent notifications, reminders and injected context never switch the reply language.",
  display: false,
};

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
    const handlers = new Map<string, PiHandler>();
    const on: PiExtensionApi['on'] = (name, handler) => {
      handlers.set(name, handler);
    };
    const registerCommand = vi.fn();
    const api = { on, registerCommand } satisfies PiExtensionApi;

    piExtension(api);

    expect([...handlers.keys()]).toEqual([
      'input',
      'before_agent_start',
      'session_start',
    ]);
    expect(registerCommand).not.toHaveBeenCalledWith(
      'thoth-agents:models',
      expect.anything(),
    );
  });
  test.each([
    'interactive',
    'rpc',
  ])('emits one hidden language anchor for a matching idle %s prompt without handling input', async (source) => {
    const handlers = capturePiHandlers();
    const input = handlers.get('input');
    const start = handlers.get('before_agent_start');
    const text = '  ¿Puedes revisar este cambio?  ';
    const event = { type: 'input', source, text };
    const context = { isIdle: vi.fn(() => true) };
    const systemPromptOptions = {
      customPrompt: 'user replacement prompt',
      appendSystemPrompt: 'existing append',
    };
    const startEvent = {
      prompt: text,
      systemPrompt: 'user replacement prompt',
      systemPromptOptions,
    };

    expect(await input?.(event, context)).toBeUndefined();
    expect(event).toEqual({ type: 'input', source, text });
    expect(context.isIdle).toHaveBeenCalledOnce();
    expect(await start?.(startEvent)).toEqual({
      message: LANGUAGE_ANCHOR_MESSAGE,
    });
    expect(systemPromptOptions.appendSystemPrompt).toMatch(
      new RegExp(`^existing append\\n\\n${PI_ROOT_START}`),
    );
    expect(systemPromptOptions.appendSystemPrompt).not.toContain(
      LANGUAGE_ANCHOR_MESSAGE.content,
    );
    expect(systemPromptOptions.customPrompt).toBe('user replacement prompt');
    expect(startEvent.systemPrompt).toBe('user replacement prompt');
    const firstAppend = systemPromptOptions.appendSystemPrompt;

    expect(await start?.(startEvent)).toBeUndefined();
    expect(systemPromptOptions.appendSystemPrompt).toBe(firstAppend);
  });
  test.each([
    {
      reason: 'extension-sourced',
      inputEvent: { source: 'extension', text: 'Automated notification' },
      idle: true,
    },
    {
      reason: 'queued steering',
      inputEvent: {
        source: 'interactive',
        text: 'Queued steering prompt',
        streamingBehavior: 'steer',
      },
      idle: false,
    },
    {
      reason: 'queued follow-up',
      inputEvent: {
        source: 'rpc',
        text: 'Queued follow-up prompt',
        streamingBehavior: 'followUp',
      },
      idle: false,
    },
    {
      reason: 'post-agent_end retry while still not idle',
      inputEvent: { source: 'rpc', text: 'Retry without a streaming hint' },
      idle: false,
    },
    {
      reason: 'empty',
      inputEvent: { source: 'interactive', text: '' },
      idle: true,
    },
    {
      reason: 'whitespace-only',
      inputEvent: { source: 'rpc', text: ' \t\n ' },
      idle: true,
    },
    {
      reason: 'images-only',
      inputEvent: {
        source: 'interactive',
        text: '',
        images: [{ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }],
      },
      idle: true,
    },
  ])('does not anchor $reason input and clears earlier candidates', async ({
    inputEvent,
    idle,
  }) => {
    const handlers = capturePiHandlers();
    const input = handlers.get('input');
    const start = handlers.get('before_agent_start');
    const context = { isIdle: () => idle };
    const systemPromptOptions = { appendSystemPrompt: '' };

    expect(await input?.(inputEvent, context)).toBeUndefined();
    expect(
      await start?.({ prompt: inputEvent.text, systemPromptOptions }),
    ).toBeUndefined();

    const earlierText = '¿Puedes revisar la solicitud anterior?';
    await input?.(
      { source: 'interactive', text: earlierText },
      { isIdle: () => true },
    );
    expect(await input?.(inputEvent, context)).toBeUndefined();
    expect(
      await start?.({ prompt: earlierText, systemPromptOptions }),
    ).toBeUndefined();
  });
  test.each([
    {
      reason: 'transformed',
      text: 'Resume este cambio en español',
      prompt: 'Summarize this change',
    },
    {
      reason: 'expanded',
      text: '/review feature',
      prompt: '<skill>Review instructions</skill>\nfeature',
    },
  ])('consumes a $reason prompt mismatch without anchoring a later start', async ({
    text,
    prompt,
  }) => {
    const handlers = capturePiHandlers();
    const systemPromptOptions = { appendSystemPrompt: '' };
    await handlers.get('input')?.(
      { source: 'interactive', text },
      { isIdle: () => true },
    );

    expect(
      await handlers.get('before_agent_start')?.({
        prompt,
        systemPromptOptions,
      }),
    ).toBeUndefined();
    expect(
      await handlers.get('before_agent_start')?.({
        prompt: text,
        systemPromptOptions,
      }),
    ).toBeUndefined();
  });
  test('does not anchor an agent start without preceding input', async () => {
    const handlers = capturePiHandlers();
    const event = {
      prompt: 'Start without an input event',
      systemPromptOptions: { appendSystemPrompt: '' },
    };

    expect(await handlers.get('before_agent_start')?.(event)).toBeUndefined();
    expect(await handlers.get('before_agent_start')?.(event)).toBeUndefined();
  });
  test('replaces an abandoned input candidate when the next idle input starts a run', async () => {
    const handlers = capturePiHandlers();
    const input = handlers.get('input');
    const start = handlers.get('before_agent_start');
    const context = { isIdle: () => true };
    const abandonedText = 'This submission was handled or failed before a run';
    const nextText = 'Revisa la siguiente solicitud';
    const systemPromptOptions = { appendSystemPrompt: '' };

    await input?.({ source: 'interactive', text: abandonedText }, context);
    // Handled or failed submissions do not produce a before_agent_start event.
    await input?.({ source: 'rpc', text: nextText }, context);
    expect(await start?.({ prompt: nextText, systemPromptOptions })).toEqual({
      message: LANGUAGE_ANCHOR_MESSAGE,
    });
    expect(
      await start?.({ prompt: abandonedText, systemPromptOptions }),
    ).toBeUndefined();
  });
  test('keeps the non-positional anchor identical for Spanish and English prompts without quoting either', async () => {
    const handlers = capturePiHandlers();
    const prompts = [
      '¿Puedes explicar el cambio de idioma?',
      'Please explain the reply-language change.',
    ];
    const contents: string[] = [];
    const systemPromptOptions = { appendSystemPrompt: '' };

    for (const text of prompts) {
      await handlers.get('input')?.(
        { source: 'interactive', text },
        { isIdle: () => true },
      );
      const result = (await handlers.get('before_agent_start')?.({
        prompt: text,
        systemPromptOptions,
      })) as { message: { content: string } };
      expect(result).toEqual({ message: LANGUAGE_ANCHOR_MESSAGE });
      expect(result.message.content).not.toContain(text);
      contents.push(result.message.content);
    }
    expect(contents[0]).toBe(contents[1]);
  });
  test('returns the anchor alongside the older-Pi fallback without changing that system prompt', async () => {
    const handlers = capturePiHandlers();
    const start = handlers.get('before_agent_start');
    const text = 'Responde en otro idioma si te lo pido';
    const event = { prompt: text, systemPrompt: 'host custom prompt' };
    const fallback = (await start?.(event)) as { systemPrompt: string };

    await handlers.get('input')?.(
      { source: 'rpc', text },
      { isIdle: () => true },
    );
    expect(await start?.(event)).toEqual({
      systemPrompt: fallback.systemPrompt,
      message: LANGUAGE_ANCHOR_MESSAGE,
    });
    expect(fallback.systemPrompt).not.toContain(
      LANGUAGE_ANCHOR_MESSAGE.content,
    );
    expect(event.systemPrompt).toBe('host custom prompt');
    expect(await start?.(event)).toEqual(fallback);
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
      'input',
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

      const handlers = new Map<string, PiHandler>();
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
        'input',
        'before_agent_start',
        'session_start',
      ]);
      expect(registerCommand).toHaveBeenCalled();
      expect(
        dispatchLeanEvent('input', {
          source: 'interactive',
          text: 'child prompt',
        }),
      ).toBeUndefined();
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
