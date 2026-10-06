import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionToolContext,
  ExtensionUIContext,
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import {
  getPublishedToolDefinition,
  getToolDefinitionRegistryVersion,
} from '@thoth-agents/pi-core';
import { expect, it, vi } from 'vitest';
import {
  buildResult,
  type QuestionResult,
  selectOption,
} from '../src/answers.js';
import type { QuestionUIFactory } from '../src/custom-ui.js';
import registerQuestions, { createQuestionTool } from '../src/index.js';

const params = {
  title: 'Planning',
  questions: [
    {
      id: 'plan',
      header: 'Plan',
      prompt: 'Choose',
      options: [{ value: 'safe', label: 'Safe', recommended: true }],
    },
  ],
};

function context(
  hasUI = true,
  ui: Partial<ExtensionUIContext> = {},
): ExtensionToolContext {
  return {
    hasUI,
    ui: {
      select: vi.fn(async (_title: string, options: string[]) => options[0]),
      input: vi.fn(async () => 'Text'),
      ...ui,
    },
  } as unknown as ExtensionToolContext;
}

const custom: ExtensionUIContext['custom'] = async (factory) =>
  new Promise((resolve) => {
    factory(
      undefined as never,
      undefined as never,
      undefined as never,
      resolve,
    );
  });

function extensionHost() {
  let tool: ReturnType<typeof createQuestionTool> | undefined;
  let active = ['read', 'ask_user_question', 'bash'];
  const handlers = new Map<
    string,
    (event: unknown, ctx: ExtensionContext) => unknown
  >();
  const pi = {
    registerTool: (definition: ReturnType<typeof createQuestionTool>) => {
      tool = definition;
    },
    on: (
      event: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown,
    ) => {
      handlers.set(event, handler);
    },
    getActiveTools: () => active,
    setActiveTools: (names: string[]) => {
      active = names;
    },
  } as unknown as ExtensionAPI;
  registerQuestions(pi);
  return {
    get activeTools() {
      return active;
    },
    get tool() {
      if (!tool) throw new Error('ask_user_question not registered');
      return tool;
    },
    async emit(event: string, ctx = context()) {
      await handlers.get(event)?.({}, ctx);
    },
  };
}

function questionnaireHost(...keys: string[]) {
  return vi.fn(async (factory: QuestionUIFactory) => {
    let result: QuestionResult | undefined;
    const component = await factory(
      { requestRender() {}, terminal: { rows: 40 } } as unknown as TUI,
      {
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
      } as Theme,
      {} as KeybindingsManager,
      (value) => {
        result = value;
      },
    );
    for (const key of keys) component.handleInput?.(key);
    return result;
  });
}

it('the default questionnaire submits through the custom UI without RPC dialogs', async () => {
  const host = questionnaireHost('1');
  const ctx = context(true, {
    custom: host as ExtensionUIContext['custom'],
  });
  const result = await extensionHost().tool.execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  expect(host).toHaveBeenCalled();
  expect(result.details).toMatchObject({
    cancelled: false,
    answers: {
      plan: { status: 'answered', values: ['safe'], labels: ['Safe'] },
    },
  });
  expect(ctx.ui.select).not.toHaveBeenCalled();
  expect(ctx.ui.input).not.toHaveBeenCalled();
});

it('the definition exposes the accepted call and result renderers with self-owned shell', () => {
  const { tool } = extensionHost();
  expect(tool.renderShell).toBe('self');
  expect(tool.renderCall).toBeTypeOf('function');
  expect(tool.renderResult).toBeTypeOf('function');
});

it('publishes the full registered definition on UI session start and withdraws on shutdown', async () => {
  const host = extensionHost();
  expect(getPublishedToolDefinition('ask_user_question')).toBeUndefined();
  try {
    await host.emit('session_start');
    expect(getPublishedToolDefinition('ask_user_question')).toBe(host.tool);
    expect(getPublishedToolDefinition('ask_user_question')).toMatchObject({
      renderShell: 'self',
      renderCall: expect.any(Function),
      renderResult: expect.any(Function),
    });
  } finally {
    await host.emit('session_shutdown');
  }
  expect(getPublishedToolDefinition('ask_user_question')).toBeUndefined();
});

it('never publishes headless sessions or withdraws another UI session’s definition', async () => {
  const headless = extensionHost();
  const interactive = extensionHost();
  try {
    await headless.emit('session_start', context(false));
    expect(getPublishedToolDefinition('ask_user_question')).toBeUndefined();
    await interactive.emit('session_start');
    const version = getToolDefinitionRegistryVersion();
    await headless.emit('session_start', context(false));
    await headless.emit('session_shutdown', context(false));
    expect(getPublishedToolDefinition('ask_user_question')).toBe(
      interactive.tool,
    );
    expect(getToolDefinitionRegistryVersion()).toBe(version);
  } finally {
    await headless.emit('session_shutdown', context(false));
    await interactive.emit('session_shutdown');
  }
});

it('shutdown withdraws only its own handle across overlapping extension instances', async () => {
  const older = extensionHost();
  const newer = extensionHost();
  try {
    await older.emit('session_start');
    await newer.emit('session_start');
    expect(getPublishedToolDefinition('ask_user_question')).toBe(newer.tool);
    await newer.emit('session_shutdown');
    expect(getPublishedToolDefinition('ask_user_question')).toBe(older.tool);
    await newer.emit('session_start');
    await older.emit('session_shutdown');
    expect(getPublishedToolDefinition('ask_user_question')).toBe(newer.tool);
  } finally {
    await older.emit('session_shutdown');
    await newer.emit('session_shutdown');
  }
  expect(getPublishedToolDefinition('ask_user_question')).toBeUndefined();
});

it('starts idempotently and can publish again after repeated shutdown', async () => {
  const host = extensionHost();
  try {
    await host.emit('session_start');
    const started = getToolDefinitionRegistryVersion();
    await host.emit('session_start');
    expect(getToolDefinitionRegistryVersion()).toBe(started);
    await host.emit('session_shutdown');
    const stopped = getToolDefinitionRegistryVersion();
    await host.emit('session_shutdown');
    expect(getToolDefinitionRegistryVersion()).toBe(stopped);
    await host.emit('session_start');
    expect(getPublishedToolDefinition('ask_user_question')).toBe(host.tool);
  } finally {
    await host.emit('session_shutdown');
  }
});

it('invalid questions return structured issues before interacting', async () => {
  const ctx = context();
  const result = await createQuestionTool().execute(
    'call',
    { questions: [] },
    undefined,
    undefined,
    ctx,
  );
  expect(result.details).toMatchObject({
    cancelled: false,
    error: 'invalid_questions',
    answers: {},
    questions: [],
    issues: [
      {
        path: 'questions',
        code: 'empty_questions',
        message: expect.any(String),
      },
    ],
  });
  expect(ctx.ui.select).not.toHaveBeenCalled();
});

it('forced headless calls return no_ui without opening dialogs', async () => {
  const ctx = context(false);
  const result = await createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    error: 'no_ui',
    answers: {
      plan: { status: 'skipped', values: [], labels: [] },
    },
  });
  expect(ctx.ui.select).not.toHaveBeenCalled();
  expect(ctx.ui.input).not.toHaveBeenCalled();
});

it('before_agent_start removes only the question tool without UI and preserves operator loadouts with UI', async () => {
  const host = extensionHost();
  await host.emit('before_agent_start');
  expect(host.activeTools).toEqual(['read', 'ask_user_question', 'bash']);
  await host.emit('before_agent_start', context(false));
  expect(host.activeTools).toEqual(['read', 'bash']);
  await host.emit('before_agent_start');
  expect(host.activeTools).toEqual(['read', 'bash']);
});

it('custom undefined is an unavailable sentinel and runs fallback', async () => {
  const custom = vi.fn(async () => undefined);
  const ctx = context(true, { custom: custom as ExtensionUIContext['custom'] });
  const result = await createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  expect(custom).toHaveBeenCalledWith(expect.any(Function));
  expect(result.details).toMatchObject({
    cancelled: false,
    answers: { plan: { values: ['safe'] } },
  });
  expect(ctx.ui.select).toHaveBeenCalled();
});

it('custom cancellation is explicit, retains answers, and never starts fallback', async () => {
  const initial = createQuestionTool((session) => {
    const state = selectOption(session.state, 'plan', 'safe');
    return (_tui, _theme, _keys, done) => {
      done(buildResult(state, { cancelled: true }));
      return { render: () => [], invalidate: () => {} };
    };
  });
  const ctx = context(true, { custom });
  const result = await initial.execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    answers: { plan: { values: ['safe'] } },
  });
  expect(ctx.ui.select).not.toHaveBeenCalled();
});

it('custom submission returns its structured result without re-asking', async () => {
  const tool = createQuestionTool((session) => (_tui, _theme, _keys, done) => {
    done(buildResult(selectOption(session.state, 'plan', 'safe')));
    return { render: () => [], invalidate: () => {} };
  });
  const ctx = context(true, { custom });
  const result = await tool.execute('call', params, undefined, undefined, ctx);
  expect(result.details).toMatchObject({
    cancelled: false,
    answers: { plan: { values: ['safe'] } },
  });
  expect(ctx.ui.select).not.toHaveBeenCalled();
});

it('Esc in the default questionnaire cancels with recorded answers and never starts RPC', async () => {
  const ctx = context(true, {
    custom: questionnaireHost('1', '\x1b') as ExtensionUIContext['custom'],
  });
  const result = await createQuestionTool().execute(
    'call',
    {
      ...params,
      questions: [
        ...params.questions,
        { ...params.questions[0], id: 'followup' },
      ],
    },
    undefined,
    undefined,
    ctx,
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    answers: {
      plan: { status: 'answered', values: ['safe'] },
      followup: { status: 'skipped', values: [] },
    },
  });
  expect(result.details.error).toBeUndefined();
  expect(ctx.ui.select).not.toHaveBeenCalled();
  expect(ctx.ui.input).not.toHaveBeenCalled();
});

it('a pre-aborted tool call does not ask through either UI path', async () => {
  const controller = new AbortController();
  controller.abort();
  const ctx = context(true, { custom: vi.fn() });
  const result = await createQuestionTool().execute(
    'call',
    params,
    controller.signal,
    undefined,
    ctx,
  );
  expect(result.details).toMatchObject({ cancelled: true, error: 'aborted' });
  expect(ctx.ui.custom).not.toHaveBeenCalled();
  expect(ctx.ui.select).not.toHaveBeenCalled();
});

it('an aborted custom dialog settles and keeps progress reported through the hook', async () => {
  const controller = new AbortController();
  const tool = createQuestionTool((session) => (_tui, _theme, _keys, _done) => {
    session.onStateChange(selectOption(session.state, 'plan', 'safe'));
    controller.abort();
    return { render: () => [], invalidate: () => {} };
  });
  const ctx = context(true, { custom });
  const result = await tool.execute(
    'call',
    params,
    controller.signal,
    undefined,
    ctx,
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    error: 'aborted',
    answers: {
      plan: { values: ['safe'] },
    },
  });
  expect(ctx.ui.select).not.toHaveBeenCalled();
}, 200);

it('unrelated custom host errors are not silently converted into fallback', async () => {
  const tool = createQuestionTool(() => () => ({
    render: () => [],
    invalidate: () => {},
  }));
  const ctx = context(true, {
    custom: vi.fn(async () => {
      throw new Error('Custom host failure');
    }),
  });
  await expect(
    tool.execute('call', params, undefined, undefined, ctx),
  ).rejects.toThrow('Custom host failure');
  expect(ctx.ui.select).not.toHaveBeenCalled();
});

it('registers ask_user_question and uses sequential fallback when the custom host is unavailable', async () => {
  const { tool } = extensionHost();
  expect(tool.name).toBe('ask_user_question');
  const result = await tool.execute(
    'call',
    params,
    undefined,
    undefined,
    context(),
  );
  expect(result.details).toMatchObject({
    cancelled: false,
    answers: {
      plan: { status: 'answered', values: ['safe'], labels: ['Safe'] },
    },
  });
});
