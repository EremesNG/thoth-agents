import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionToolContext,
  ExtensionUIContext,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import type { Component, TUI } from '@earendil-works/pi-tui';
import {
  getPublishedToolDefinition,
  getQuestionService,
  getToolDefinitionRegistryVersion,
} from '@thoth-agents/pi-core';
import { expect, it, vi } from 'vitest';
import {
  buildResult,
  selectOption,
  setCustomText,
  setOptionNote,
  setQuestionNote,
  toggleOption,
} from '../src/answers.js';
import registerQuestions, { createQuestionTool } from '../src/index.js';
import { createQuestionServiceProvider } from '../src/question-service.js';

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

function questionContext(
  keys: string[] = [],
  onRender?: (text: string) => void,
): ExtensionToolContext {
  const theme = {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as Theme;
  let focused: Component | undefined;
  let factory: ExtensionUIContext['getEditorComponent'] extends () => infer R
    ? R
    : never;
  let text = '';
  const baseFactory = () => ({
    render: () => ['Editor'],
    invalidate() {},
    handleInput() {},
    getText: () => text,
    setText: (value: string) => {
      text = value;
    },
  });
  factory = baseFactory;
  const listeners = new Set<
    Parameters<ExtensionUIContext['onTerminalInput']>[0]
  >();
  let sent = false;
  const tui = {
    terminal: { rows: 40, columns: 120 },
    hasOverlay: () => false,
    getFocusedComponent: () => focused,
    setFocus: (component: Component) => {
      focused = component;
    },
    requestRender() {
      if (sent || !keys.length) return;
      sent = true;
      queueMicrotask(() => {
        onRender?.(focused?.render(100).join('\n') ?? '');
        for (const key of keys) {
          const consumed = [...listeners].some(
            (listener) => listener(key)?.consume,
          );
          if (!consumed) focused?.handleInput?.(key);
        }
      });
    },
  } as unknown as TUI;
  return context(true, {
    theme,
    custom: vi.fn(),
    getEditorComponent: () => factory,
    setEditorComponent(next) {
      factory = next;
      focused = next?.(tui, theme as never, {} as never);
    },
    setWidget() {},
    onTerminalInput(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
  });
}

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

it('the default questionnaire submits through the editor slot without RPC dialogs', async () => {
  const ctx = questionContext(['1']);
  const result = await extensionHost().tool.execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  expect(ctx.ui.custom).not.toHaveBeenCalled();
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

it('missing editor-slot hooks run the RPC fallback without opening custom UI', async () => {
  const custom = vi.fn(async () => undefined);
  const ctx = context(true, { custom: custom as ExtensionUIContext['custom'] });
  const result = await createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  expect(custom).not.toHaveBeenCalled();
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
  const ctx = questionContext();
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
  const ctx = questionContext();
  const result = await tool.execute('call', params, undefined, undefined, ctx);
  expect(result.details).toMatchObject({
    cancelled: false,
    answers: { plan: { values: ['safe'] } },
  });
  expect(ctx.ui.select).not.toHaveBeenCalled();
});

it('Esc in the default questionnaire cancels with recorded answers and never starts RPC', async () => {
  const ctx = questionContext(['1', '\x1b']);
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
  const ctx = questionContext();
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

it('unrelated UI factory errors are not silently converted into fallback', async () => {
  const tool = createQuestionTool(() => () => {
    throw new Error('UI factory failure');
  });
  const ctx = questionContext();
  await expect(
    tool.execute('call', params, undefined, undefined, ctx),
  ).rejects.toThrow('UI factory failure');
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

it('tells models to pass labels in the conversation language', () => {
  const tool = createQuestionTool();
  const guidelines = tool.promptGuidelines?.join(' ');
  expect(guidelines).toContain('same turn');
  expect(guidelines).toContain(
    'Reasoning/thinking is not shown as answer text',
  );
  expect(guidelines).toContain(
    'normal visible response text BEFORE calling this tool',
  );
  expect(guidelines).toContain('secondary fallback');
  expect(guidelines).toContain('short markdown summary');
  expect(guidelines).toContain(
    'never the main place for long proposals or tables',
  );
  expect(guidelines?.indexOf('BEFORE calling')).toBeLessThan(
    guidelines?.indexOf('secondary fallback') ?? 0,
  );
  expect(tool.description).toContain('visible response text before');
  expect(guidelines).toContain('self-contained');
  expect(guidelines).toContain('`context`');
  expect(guidelines).toContain('`preview`');
  expect(tool.promptGuidelines?.join(' ')).toContain('labels');
  expect(tool.promptGuidelines?.join(' ')).toContain("user's language");
});

const confirmWithLabels = {
  labels: { yes: 'Sí', no: 'No, gracias' },
  questions: [
    { id: 'go', header: 'Seguir', prompt: '¿Seguimos?', type: 'confirm' },
  ],
};

it('applies labels end to end through the native questionnaire', async () => {
  initTheme('dark');
  let rendered = '';
  const result = await extensionHost().tool.execute(
    'call',
    confirmWithLabels as never,
    undefined,
    undefined,
    questionContext(['1'], (text) => {
      rendered = text;
    }),
  );
  expect(rendered).toContain('Sí');
  expect(rendered).toContain('No, gracias');
  expect(rendered).not.toContain('Yes');
  expect(result.details.answers.go).toMatchObject({
    values: ['yes'],
    labels: ['Sí'],
  });
});

it('applies labels in the sequential fallback', async () => {
  const select = vi.fn(async (_title: string, options: string[]) => options[1]);
  const result = await extensionHost().tool.execute(
    'call',
    confirmWithLabels as never,
    undefined,
    undefined,
    context(true, { select: select as ExtensionUIContext['select'] }),
  );
  expect(select.mock.calls[0][1].slice(0, 2)).toEqual(['Sí', 'No, gracias']);
  expect(result.details.answers.go).toMatchObject({
    values: ['no'],
    labels: ['No, gracias'],
  });
});

it('the tool schema keeps all 46 label overrides as plain optional strings', () => {
  const schema = createQuestionTool().parameters;
  const labels = schema.properties.labels;
  expect(schema.required).toEqual(['questions']);
  expect(labels).not.toHaveProperty('required');
  expect(Object.keys(labels.properties).sort()).toEqual(
    [
      'askUser',
      'yes',
      'no',
      'typeSomething',
      'yourAnswer',
      'submit',
      'backToEdit',
      'cancel',
      'review',
      'reviewHeading',
      'required',
      'unanswered',
      'requiredPending',
      'skipped',
      'skip',
      'done',
      'recommended',
      'preview',
      'noDescription',
      'typeOwn',
      'noTextYet',
      'note',
      'noteForQuestion',
      'noteFor',
      'cancelled',
      'cancelledKept',
      'error',
      'answered',
      'move',
      'pick',
      'select',
      'toggle',
      'next',
      'optionNote',
      'questionNote',
      'clear',
      'scrollPreview',
      'scrollPrompt',
      'scrollContext',
      'more',
      'switchTab',
      'save',
      'newline',
      'keepDraft',
      'collapse',
      'expand',
    ].sort(),
  );
  for (const property of Object.values(labels.properties)) {
    expect(property).toEqual({ type: 'string' });
  }
  expect(labels).toHaveProperty(
    'description',
    expect.stringContaining('language of the conversation'),
  );
  expect(labels).toHaveProperty(
    'description',
    expect.stringContaining('Omitted keys stay English'),
  );
  expect(labels).toHaveProperty(
    'description',
    expect.stringContaining('Option values and ids are never localized'),
  );
});

it('maps service answers by stable id through the dock', async () => {
  const provider = createQuestionServiceProvider(
    (session) => (_tui, _theme, _keys, done) => {
      queueMicrotask(() =>
        done(buildResult(selectOption(session.state, 'approval', 'allow'))),
      );
      return { render: () => [], invalidate() {} };
    },
  );
  const result = await provider.ask(
    questionContext(),
    {
      questions: [
        {
          id: 'approval',
          header: 'Approval',
          prompt: 'Allow?',
          type: 'single',
          allowCustom: false,
          options: [{ value: 'allow', label: 'Allow' }],
        },
      ],
    },
    {},
  );
  expect(result).toEqual({
    status: 'answered',
    answers: {
      approval: { status: 'answered', values: ['allow'], labels: ['Allow'] },
    },
  });
});

it('registers a service only for UI sessions and withdraws only its own provider', async () => {
  const first = extensionHost();
  const second = extensionHost();
  expect(getQuestionService()).toBeUndefined();
  await first.emit('session_start', context(false));
  expect(getQuestionService()).toBeUndefined();
  try {
    await first.emit('session_start');
    const provider = getQuestionService();
    expect(provider?.ask).toBeTypeOf('function');
    await first.emit('session_start');
    expect(getQuestionService()).toBe(provider);
    await second.emit('session_start');
    expect(getQuestionService()).not.toBe(provider);
    await first.emit('session_shutdown');
    expect(getQuestionService()?.ask).toBeTypeOf('function');
  } finally {
    await first.emit('session_shutdown');
    await second.emit('session_shutdown');
  }
  expect(getQuestionService()).toBeUndefined();
});

const serviceRequest = {
  questions: [
    {
      id: 'approval',
      header: 'Approval',
      prompt: 'Allow?',
      type: 'single' as const,
      allowCustom: false,
      options: [
        { value: 'allow', label: 'Allow' },
        { value: 'deny', label: 'Decline' },
      ],
    },
  ],
};

it('the service default UI preserves allowCustom=false and returns an option answer', async () => {
  let rendered = '';
  const ctx = questionContext(['3', '2'], (text) => {
    rendered = text;
  });
  const result = await createQuestionServiceProvider().ask(
    ctx,
    serviceRequest,
    {},
  );
  expect(rendered).not.toContain('Type something.');
  expect(result).toMatchObject({
    status: 'answered',
    answers: { approval: { values: ['deny'], labels: ['Decline'] } },
  });
});

it('the service reports unavailable without opening select/input for unmountable or missing UI', async () => {
  const rpc = questionContext();
  rpc.ui.setEditorComponent = vi.fn();
  for (const ctx of [context(), context(false), rpc, undefined]) {
    const result = await createQuestionServiceProvider().ask(
      ctx,
      serviceRequest,
      {},
    );
    expect(result).toMatchObject({
      status: 'unavailable',
      answers: { approval: { values: [] } },
    });
    if (ctx) {
      expect(ctx.ui.select).not.toHaveBeenCalled();
      expect(ctx.ui.input).not.toHaveBeenCalled();
    }
  }
  expect(
    await createQuestionServiceProvider(() => undefined).ask(
      questionContext(),
      serviceRequest,
      {},
    ),
  ).toMatchObject({ status: 'unavailable' });
});

it('the service cancels an already aborted request without invoking the UI hook or mounting', async () => {
  const controller = new AbortController();
  controller.abort();
  const hook = vi.fn(() => undefined);
  const ctx = questionContext();
  const mount = vi.spyOn(ctx.ui, 'setEditorComponent');
  expect(
    await createQuestionServiceProvider(hook).ask(ctx, serviceRequest, {
      signal: controller.signal,
    }),
  ).toMatchObject({ status: 'cancelled' });
  expect(hook).not.toHaveBeenCalled();
  expect(mount).not.toHaveBeenCalled();
});

it('the service disposes the dock on abort and preserves recorded answers', async () => {
  const controller = new AbortController();
  const dispose = vi.fn();
  const provider = createQuestionServiceProvider((session) => () => {
    session.onStateChange(selectOption(session.state, 'approval', 'allow'));
    return { render: () => [], invalidate() {}, dispose };
  });
  const ctx = questionContext();
  const original = ctx.ui.getEditorComponent();
  const pending = provider.ask(ctx, serviceRequest, {
    signal: controller.signal,
  });
  expect(ctx.ui.getEditorComponent()).not.toBe(original);
  controller.abort();
  expect(await pending).toMatchObject({
    status: 'cancelled',
    answers: { approval: { values: ['allow'] } },
  });
  expect(dispose).toHaveBeenCalledOnce();
  expect(ctx.ui.getEditorComponent()).toBe(original);
});

it('the service maps user cancellation and disposes a late asynchronous mount after abort', async () => {
  expect(
    await createQuestionServiceProvider().ask(
      questionContext(['']),
      serviceRequest,
      {},
    ),
  ).toMatchObject({ status: 'cancelled' });
  const controller = new AbortController();
  const dispose = vi.fn();
  let finishMount!: (component: Component & { dispose(): void }) => void;
  const provider = createQuestionServiceProvider(
    () => () =>
      new Promise((resolve) => {
        finishMount = resolve;
      }),
  );
  const pending = provider.ask(questionContext(), serviceRequest, {
    signal: controller.signal,
  });
  controller.abort();
  expect(await pending).toMatchObject({ status: 'cancelled' });
  finishMount({ render: () => [], invalidate() {}, dispose });
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
});

it('the service maps custom text, notes, multi answers and skipped ids without tool-only option notes', async () => {
  const provider = createQuestionServiceProvider(
    (session) => (_tui, _theme, _keys, done) => {
      let state = toggleOption(session.state, 'choices', 'one');
      state = setCustomText(state, 'choices', 'Other');
      state = setQuestionNote(state, 'choices', 'Explanation');
      state = setOptionNote(state, 'choices', 'one', 'Tool-only annotation');
      queueMicrotask(() => done(buildResult(state)));
      return { render: () => [], invalidate() {} };
    },
  );
  const result = await provider.ask(
    questionContext(),
    {
      questions: [
        {
          id: 'choices',
          header: 'Choices',
          prompt: 'Pick',
          type: 'multi',
          options: [{ value: 'one', label: 'One' }],
        },
        {
          id: 'later',
          header: 'Later',
          prompt: 'Anything else?',
          type: 'text',
        },
      ],
    },
    {},
  );
  expect(result).toEqual({
    status: 'answered',
    answers: {
      choices: {
        status: 'answered',
        values: ['one'],
        labels: ['One'],
        customText: 'Other',
        note: 'Explanation',
      },
      later: { status: 'skipped', values: [], labels: [] },
    },
  });
});
