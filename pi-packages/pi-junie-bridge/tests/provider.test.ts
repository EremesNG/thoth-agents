import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Api,
  type AssistantMessageEvent,
  type Model,
  normalizeContext,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import { afterEach, expect, test, vi } from 'vitest';
import { projectModels, readCatalog, refreshCatalog } from '../src/catalog.js';
import {
  type NativeToolActivity,
  renderNativeActivity,
} from '../src/native-display.js';
import { createPermissionGate } from '../src/permissions.js';
import {
  createJunieProvider,
  type ProviderOptions,
  projectPrompt,
} from '../src/provider.js';
import { createSessionStore } from '../src/session-store.js';

/** Test seam: the post-terminal settings read can be stalled on demand. */
const displayRead = vi.hoisted(() => ({
  stall: undefined as Promise<never> | undefined,
}));
vi.mock('../src/junie-usage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/junie-usage.js')>();
  return {
    ...actual,
    readJunieModel: (options: Parameters<typeof actual.readJunieModel>[0]) =>
      displayRead.stall ?? actual.readJunieModel(options),
  };
});

const fixture = fileURLToPath(
  new URL('./fixtures/fake-junie.cjs', import.meta.url),
);
const model: Model<Api> = {
  id: 'mix.auto',
  name: 'Auto',
  provider: 'junie',
  api: 'junie-bridge',
  baseUrl: 'junie-bridge://junie',
  contextWindow: 32000,
  maxTokens: 8192,
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const mcpRegistration = [
  {
    type: 'http',
    name: 'pi',
    url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/),
    headers: [
      {
        name: 'x-pi-junie-token',
        value: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ],
  },
];
const context = normalizeContext({
  messages: [{ role: 'user', content: 'Hello', timestamp: 1 }],
});
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  displayRead.stall = undefined;
  for (const close of cleanup.splice(0).reverse()) await close();
});
function setup(
  env: NodeJS.ProcessEnv = {},
  bounds: Partial<ProviderOptions> = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'junie-provider-')),
    transcript = join(dir, 'wire.jsonl');
  const store = createSessionStore(join(dir, 'sessions'));
  const options = {
    command: { file: process.execPath, args: [fixture] },
    env: { FAKE_STREAM: '1', FAKE_TRANSCRIPT: transcript, ...env },
    ...bounds,
    getSession: bounds.getSession ?? (() => ({ id: 'pi-1', cwd: dir })),
    sessionStore: store,
    agentDir: dir,
  };
  const provider = createJunieProvider(options);
  cleanup.push(async () => {
    await provider.close();
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  return {
    provider,
    dir,
    store,
    restart: () => {
      const next = createJunieProvider(options);
      cleanup.push(() => next.close());
      return next;
    },
    wire: () =>
      readFileSync(transcript, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
  };
}
async function turn(
  provider: ReturnType<typeof createJunieProvider>,
  options: SimpleStreamOptions = {},
  input = context,
) {
  const stream = provider.streamSimple(model, input, {
      sessionId: 'pi-1',
      ...options,
    }),
    events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  const terminals = events.filter(
    (event) => event.type === 'done' || event.type === 'error',
  );
  expect(terminals).toHaveLength(1);
  expect(events.at(-1)).toBe(terminals[0]);
  return { events, message: await stream.result() };
}
function junieSettings(
  home: string,
  settings: unknown = {
    formatVersion: 1,
    model: { modelId: 'gpt-6.1-terra', effortWireId: 'low' },
  },
) {
  const session = join(home, 'sessions', 'fake-session');
  mkdirSync(session, { recursive: true });
  writeFileSync(
    join(session, 'settings.json'),
    typeof settings === 'string' ? settings : JSON.stringify(settings),
  );
}
function junieHome() {
  const home = mkdtempSync(join(tmpdir(), 'junie-model-'));
  cleanup.push(async () => {
    rmSync(home, { recursive: true, force: true });
  });
  return home;
}

test('per-turn display line shows the real Junie model and only the ACP cost attributed to that turn, after the terminal event', async () => {
  const displays: NativeToolActivity[] = [];
  let terminal = false;
  const home = junieHome();
  junieSettings(home);
  const { provider, restart, wire } = setup(
    { JUNIE_HOME: home, FAKE_RICH: '1' },
    {
      onNativeEvent: (event, id) => {
        expect(id).toBe('pi-1');
        // The per-turn line never precedes the terminal Pi event.
        if (event.usageLine) expect(terminal).toBe(true);
        displays.push(event);
      },
    },
  );
  const collect = async (active: typeof provider, input: typeof context) => {
    const stream = active.streamSimple(model, input, { sessionId: 'pi-1' });
    const events: AssistantMessageEvent[] = [];
    for await (const event of stream) {
      events.push(event);
      if (event.type === 'done' || event.type === 'error') terminal = true;
    }
    return { message: await stream.result() };
  };
  const first = await collect(provider, context);
  expect(first.message.stopReason).toBe('stop');
  // Each line belongs to its own turn: a newer turn drops a pending one, so the
  // display writes here wait for the line before the next turn starts.
  await until(() => displays.filter((event) => event.usageLine).length === 1);
  const next = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Again', timestamp: 2 },
    ],
  });
  const second = await collect(provider, next);
  expect(second.message.usage.cost.total).toBeCloseTo(0.15, 10);
  await until(() => displays.filter((event) => event.usageLine).length === 2);
  await provider.close();
  const resumed = restart();
  const third = await collect(
    resumed,
    normalizeContext({
      messages: [
        ...next.messages,
        second.message,
        { role: 'user', content: 'Once more', timestamp: 3 },
      ],
    }),
  );
  await until(() => displays.filter((event) => event.usageLine).length === 3);
  await resumed.close();
  expect(displays.map((event) => event.usageLine).filter(Boolean)).toEqual([
    'Junie · mix.auto → gpt-6.1-terra (low) · $0.2500',
    'Junie · mix.auto → gpt-6.1-terra (low) · $0.1500',
    // A resumed session re-reports cumulative usage: no cost is re-attributed.
    'Junie · mix.auto → gpt-6.1-terra (low)',
  ]);
  expect(wire().some((event) => event.method === 'session/resume')).toBe(true);
  // Display only: never assistant text, Pi context or prompts sent to Junie.
  for (const message of [first.message, second.message, third.message]) {
    expect(JSON.stringify(message)).not.toContain('gpt-6.1-terra');
    expect(JSON.stringify(message)).not.toContain('Junie ·');
  }
  const projected = JSON.stringify(
    projectPrompt(
      normalizeContext({
        messages: [
          ...next.messages,
          second.message,
          { role: 'user', content: 'Once more', timestamp: 3 },
        ],
      }),
      { prompted: false },
    ),
  );
  expect(projected).toContain('Hello from Junie');
  expect(projected).not.toContain('gpt-6.1-terra');
  expect(
    JSON.stringify(wire().filter((event) => event.method === 'session/prompt')),
  ).not.toContain('gpt-6.1-terra');
});

test.each([
  'no-usage',
  'zero-cost',
])('display line omits the cost segment when the turn attributes no ACP cost (%s)', async (kind) => {
  const displays: NativeToolActivity[] = [];
  const home = junieHome();
  junieSettings(home);
  const { provider } = setup(
    {
      JUNIE_HOME: home,
      ...(kind === 'zero-cost' ? { FAKE_STATS: 'free' } : {}),
    },
    { onNativeEvent: (event) => displays.push(event) },
  );
  const { message } = await turn(provider);
  expect(message.usage.cost.total).toBe(0);
  await until(() => displays.some((event) => event.usageLine));
  await provider.close();
  expect(displays.map((event) => event.usageLine)).toEqual([
    'Junie · mix.auto → gpt-6.1-terra (low)',
  ]);
});

test.each([
  'missing',
  'malformed',
  'no-model',
])('emits no display line when the Junie session settings are %s', async (kind) => {
  const displays: NativeToolActivity[] = [];
  const debug: string[] = [];
  const home = junieHome();
  if (kind === 'malformed') junieSettings(home, '{');
  else if (kind === 'no-model') junieSettings(home, { formatVersion: 1 });
  const { provider } = setup(
    { JUNIE_HOME: home, FAKE_RICH: '1' },
    {
      onNativeEvent: (event) => displays.push(event),
      debug: (message) => debug.push(message),
    },
  );
  const { message } = await turn(provider);
  expect(message.stopReason).toBe('stop');
  await until(() => debug.length > 0);
  await provider.close();
  expect(displays.map((event) => event.usageLine).filter(Boolean)).toEqual([]);
  expect(debug.join('\n')).toContain('Junie local model unavailable');
});

test('streams a Pi turn and configures safe mode, model and effort before prompting in the Pi cwd', async () => {
  const { provider, dir, wire } = setup();
  const { events, message } = await turn(provider, { reasoning: 'high' });
  expect(events.map((event) => event.type)).toEqual([
    'start',
    'text_start',
    'text_delta',
    'text_end',
    'done',
  ]);
  expect(message).toMatchObject({
    stopReason: 'stop',
    content: [{ type: 'text', text: 'Hello from Junie' }],
  });
  expect(wire().map((m) => [m.method, m.params])).toEqual([
    ['initialize', expect.any(Object)],
    ['session/new', { cwd: dir, mcpServers: mcpRegistration }],
    [
      'session/set_config_option',
      { sessionId: 'fake-session', configId: 'brave_mode', value: 'off' },
    ],
    [
      'session/set_config_option',
      { sessionId: 'fake-session', configId: 'model', value: 'mix.auto' },
    ],
    [
      'session/set_config_option',
      { sessionId: 'fake-session', configId: 'effort', value: 'high' },
    ],
    [
      'session/prompt',
      { sessionId: 'fake-session', prompt: [{ type: 'text', text: 'Hello' }] },
    ],
  ]);
});

test.each([
  ['end_turn', 'stop'],
  ['max_tokens', 'length'],
  ['max_turn_requests', 'error'],
  ['refusal', 'error'],
  ['cancelled', 'aborted'],
  ['unexpected', 'error'],
])('maps ACP stop reason %s into one Pi terminal %s', async (reason, want) => {
  const { provider } = setup({ FAKE_STOP: reason });
  const { message } = await turn(provider);
  expect(message.stopReason).toBe(want);
  if (want === 'error') expect(message.errorMessage).toContain(reason);
});

test('projects thoughts, native tool logs and context usage; costs are cumulative USD deltas per message', async () => {
  const { provider, wire } = setup({ FAKE_RICH: '1' });
  const first = await turn(provider);
  const next = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Next', timestamp: 2 },
    ],
  });
  const second = await turn(provider, { reasoning: 'medium' }, next);
  expect(first.message.content).toEqual([
    { type: 'thinking', thinking: 'Let me think' },
    { type: 'text', text: 'Hello from Junie' },
  ]);
  expect(
    first.events
      .filter((e) => e.type.startsWith('thinking'))
      .map((e) => e.type),
  ).toEqual(['thinking_start', 'thinking_delta', 'thinking_end']);
  expect(first.message.usage).toMatchObject({
    input: 0,
    totalTokens: 120,
    cost: { total: 0.25 },
  });
  expect(second.message.usage.cost.total).toBeCloseTo(0.15);
  expect(model.contextWindow).toBe(64000);
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(1);
  expect(
    wire()
      .filter(
        (m) =>
          m.method === 'session/set_config_option' &&
          m.params.configId === 'effort',
      )
      .map((m) => m.params.value),
  ).toEqual(['low', 'medium']);
  expect(first.events.some((e) => e.type.startsWith('toolcall'))).toBe(false);
});

test('idle usage after done is attributed once to the next message even without another usage update', async () => {
  const { provider, store, wire } = setup({ FAKE_LATE_USAGE: '1' });
  const first = await turn(provider);
  expect(first.message.usage.cost.total).toBeCloseTo(0.25);
  await vi.waitFor(() =>
    expect(wire().some((m) => m.method === 'fixture/late_usage_sent')).toBe(
      true,
    ),
  );
  expect(store.load('pi-1')?.cost).toBeCloseTo(0.25);
  expect(first.message.usage.cost.total).toBeCloseTo(0.25);
  let input = context;
  let previous = first.message;
  for (const expected of [0.05, 0.1, 0]) {
    input = normalizeContext({
      messages: [
        ...input.messages,
        previous,
        { role: 'user', content: 'Next', timestamp: 2 },
      ],
    });
    const next = await turn(provider, {}, input);
    expect(next.message.stopReason).toBe('stop');
    expect(next.message.usage.cost.total).toBeCloseTo(expected);
    previous = next.message;
  }
  expect(store.load('pi-1')?.cost).toBeCloseTo(0.4);
});

test.each([
  'resume',
  'reseed',
])('late usage preserves the attributed baseline across %s', async (mode) => {
  const { provider, restart, store, wire } = setup({ FAKE_LATE_USAGE: '1' });
  const first = await turn(provider);
  await vi.waitFor(() =>
    expect(wire().some((m) => m.method === 'fixture/late_usage_sent')).toBe(
      true,
    ),
  );
  expect(store.load('pi-1')?.cost).toBeCloseTo(0.25);
  const messages = [
    ...context.messages,
    first.message,
    { role: 'user' as const, content: 'Next', timestamp: 2 },
  ];
  let nextProvider = provider;
  if (mode === 'resume') {
    await provider.close();
    nextProvider = restart();
  } else {
    messages[0] = { role: 'user', content: 'Edited history', timestamp: 1 };
  }
  const second = await turn(nextProvider, {}, normalizeContext({ messages }));
  expect(second.message.stopReason).toBe('stop');
  expect(second.message.usage.cost.total).toBeCloseTo(
    mode === 'resume' ? 0.05 : 0.25,
  );
  expect(store.load('pi-1')?.cost).toBeCloseTo(mode === 'resume' ? 0.3 : 0.25);
});

test.each([
  true,
  false,
])('headless launch and prompt guidance survive continuation and resume (headless: %s)', async (headless) => {
  const { provider, dir, wire, restart } = setup(
    { FAKE_RECORD_ARGV: '1' },
    { getSession: () => ({ cwd: dir, headless }) },
  );
  const first = await turn(provider);
  const next = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Next', timestamp: 2 },
    ],
  });
  const second = await turn(provider, {}, next);
  await provider.close();
  const resumed = normalizeContext({
    messages: [
      ...next.messages,
      second.message,
      { role: 'user', content: 'Resume', timestamp: 3 },
    ],
  });
  expect((await turn(restart(), {}, resumed)).message.stopReason).toBe('stop');
  const entries = wire();
  const argv = entries
    .filter((m) => m.method === 'fixture/argv')
    .map((m) => m.params);
  expect(argv).toHaveLength(2);
  for (const args of argv) {
    const index = args.indexOf('--config-location');
    if (headless)
      expect(args[index + 1]).toBe(
        join(dir, 'junie-bridge', 'native-tool-hooks.json'),
      );
    else expect(index).toBe(-1);
  }
  expect(entries.filter((m) => m.method === 'session/new')).toHaveLength(1);
  expect(entries.filter((m) => m.method === 'session/resume')).toHaveLength(1);
  const prompts = entries.filter((m) => m.method === 'session/prompt');
  expect(prompts).toHaveLength(3);
  for (const prompt of prompts) {
    const text = JSON.stringify(prompt.params.prompt);
    if (headless)
      for (const name of ['pi/bash', 'pi/edit', 'pi/write'])
        expect(text).toContain(name);
    else expect(text).not.toContain('pi/bash');
  }
});

test('unsafe batch hook path reaches Pi as an error terminal without launching', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-provider-refusal-'));
  const agentDir = join(dir, '100% real');
  const launchJob = vi.fn();
  const provider = createJunieProvider({
    agentDir,
    sessionStore: createSessionStore(join(dir, 'sessions')),
    getSession: () => ({ cwd: dir, headless: true }),
    command: { file: 'junie.bat', args: [] },
    platform: 'win32',
    launchJob,
  });
  try {
    const { events, message } = await turn(provider);
    expect(events.at(-1)?.type).toBe('error');
    expect(message.stopReason).toBe('error');
    expect(message.errorMessage).toMatch(/JUNIE_BRIDGE_LAUNCHER.*junie\.exe/i);
    expect(launchJob).not.toHaveBeenCalled();
  } finally {
    await provider.close();
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}, 5000);

test('headless resume failure reconnects with the native tool hook', async () => {
  const { provider, restart, wire, dir } = setup(
    { FAKE_RECORD_ARGV: '1', FAKE_RESUME_FAIL: '1' },
    { getSession: () => ({ cwd: dir, headless: true }) },
  );
  const first = await turn(provider);
  await provider.close();
  const next = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Next', timestamp: 2 },
    ],
  });
  expect((await turn(restart(), {}, next)).message.stopReason).toBe('stop');
  const args = wire()
    .filter((m) => m.method === 'fixture/argv')
    .map((m) => m.params);
  expect(args).toHaveLength(3);
  for (const argv of args) expect(argv).toContain('--config-location');
});

test('seeds history only on a fresh session and sends latest user base64 images unchanged', async () => {
  const { provider, wire } = setup();
  const input = normalizeContext({
    systemPrompt: 'Be concise',
    messages: [
      { role: 'user', content: 'Earlier question', timestamp: 1 },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look here' },
          { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
        ],
        timestamp: 2,
      },
    ],
  });
  const first = await turn(provider, {}, input);
  const next = normalizeContext({
    messages: [
      ...input.messages,
      first.message,
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look here' },
          { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
        ],
        timestamp: 3,
      },
    ],
  });
  await turn(provider, {}, next);
  const prompts = wire()
    .filter((m) => m.method === 'session/prompt')
    .map((m) => m.params.prompt);
  expect(prompts[0][0]).toMatchObject({
    type: 'text',
    text: expect.stringContaining('Earlier question'),
  });
  expect(prompts[0][0].text).toContain('Be concise');
  expect(prompts[0].slice(1)).toEqual([
    { type: 'text', text: 'Look here' },
    { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
  ]);
  expect(prompts[1]).toEqual([
    { type: 'text', text: 'Look here' },
    { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
  ]);
});

test.each([
  [{ FAKE_AUTH: '1' }, {}, /run `junie` and log in/],
  [{ FAKE_INIT_AUTH: '1' }, {}, /run `junie` and log in/],
  [{ FAKE_HANG: '1' }, { startupTimeoutMs: 100 }, /startup.*timed out/i],
  [{ FAKE_HANG_NEW: '1' }, { startupTimeoutMs: 800 }, /startup.*timed out/i],
  [
    { FAKE_HANG_PROMPT: '1' },
    { inactivityTimeoutMs: 100 },
    /inactivity.*timed out/i,
  ],
  [{ FAKE_PROMPT_ERROR: '1' }, {}, /fixture prompt error/],
])(
  'fails explicitly and once for agent failure %j',
  async (env, bounds, error) => {
    const { provider } = setup(env, bounds);
    const { message } = await turn(provider);
    expect(message.stopReason).toBe('error');
    expect(message.errorMessage).toMatch(error);
  },
  10000,
);

test('missing Junie yields actionable installation guidance and one terminal', async () => {
  const provider = createJunieProvider({
    launcherPath: join(tmpdir(), 'no-such-junie-executable'),
  });
  cleanup.push(() => provider.close());
  const { message } = await turn(provider);
  expect(message.errorMessage).toMatch(
    /Junie launcher not found.*install Junie/i,
  );
});

test('Pi abort sends session/cancel and produces exactly one aborted terminal', async () => {
  const { provider, wire } = setup({ FAKE_HANG_PROMPT: '1' }),
    controller = new AbortController();
  const stream = provider.streamSimple(model, context, {
    signal: controller.signal,
  });
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) {
    events.push(event);
    if (event.type === 'text_delta') controller.abort();
  }
  expect(events.filter((e) => e.type === 'error' || e.type === 'done')).toEqual(
    [expect.objectContaining({ type: 'error', reason: 'aborted' })],
  );
  expect(wire().filter((m) => m.method === 'session/cancel')).toEqual([
    expect.objectContaining({ params: { sessionId: 'fake-session' } }),
  ]);
});

test('inactivity bound resets on agent progress instead of limiting total turn duration', async () => {
  const { provider } = setup(
    { FAKE_PROGRESS: '1' },
    { inactivityTimeoutMs: 120 },
  );
  const { message } = await turn(provider);
  expect(message.stopReason).toBe('stop');
  expect(message.content[0]).toMatchObject({
    type: 'text',
    text: expect.stringContaining('progress'),
  });
});

test('a pre-aborted Pi turn never launches Junie', async () => {
  const { provider } = setup(),
    controller = new AbortController();
  controller.abort();
  const { message } = await turn(provider, { signal: controller.signal });
  expect(message.stopReason).toBe('aborted');
});

test('shutdown interrupts an active stream with one aborted terminal', async () => {
  const { provider } = setup({ FAKE_HANG_PROMPT: '1' });
  const stream = provider.streamSimple(model, context),
    events: AssistantMessageEvent[] = [];
  for await (const event of stream) {
    events.push(event);
    if (event.type === 'text_delta') await provider.close();
  }
  expect(events.filter((e) => e.type === 'done' || e.type === 'error')).toEqual(
    [expect.objectContaining({ reason: 'aborted' })],
  );
});

test('abort during startup cannot leak a late-starting connection', async () => {
  const { provider } = setup(
      { FAKE_HANG_NEW: '1' },
      { startupTimeoutMs: 1500 },
    ),
    controller = new AbortController();
  const result = turn(provider, { signal: controller.signal });
  controller.abort();
  expect((await result).message.stopReason).toBe('aborted');
  await provider.close();
});

test('two overlapping turns in one Pi session reject the second without stealing first-stream updates', async () => {
  const { provider } = setup({ FAKE_PROGRESS: '1' });
  const first = turn(provider),
    second = await turn(provider);
  expect(second.message.stopReason).toBe('error');
  expect(second.message.errorMessage).toMatch(/already active/);
  expect((await first).message.stopReason).toBe('stop');
});

test('restart resumes the saved Junie tail and sends only the new user delta with brave mode off', async () => {
  const { provider, restart, wire, dir, store } = setup();
  const first = await turn(provider);
  await provider.close();
  const next = restart();
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Next question', timestamp: 2 },
    ],
  });
  expect((await turn(next, {}, input)).message.stopReason).toBe('stop');
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(1);
  expect(
    wire()
      .filter((m) => m.method === 'session/resume')
      .map((m) => m.params),
  ).toEqual([
    { sessionId: 'fake-session', cwd: dir, mcpServers: mcpRegistration },
  ]);
  const second = wire().slice(
    wire().findIndex((m) => m.method === 'session/resume'),
  );
  expect(second[1]).toMatchObject({
    method: 'session/set_config_option',
    params: { configId: 'brave_mode', value: 'off' },
  });
  expect(
    second.find((m) => m.method === 'session/prompt').params.prompt,
  ).toEqual([{ type: 'text', text: 'Next question' }]);
  expect(store.load('pi-1')).toMatchObject({
    resumedWith: 'resume',
    digests: expect.any(Array),
  });
});

test.each([
  'edit',
  'tree',
  'compaction',
  'removed',
  'assistant edit',
])('%s divergence creates a new session seeded from Pi rather than continuing the stale tail', async (kind) => {
  const { provider, wire } = setup();
  const first = await turn(provider);
  const messages: typeof context.messages = [
    ...context.messages,
    first.message,
  ];
  if (kind === 'edit')
    messages[0] = { role: 'user', content: 'Edited question', timestamp: 1 };
  if (kind === 'tree')
    messages[0] = { role: 'user', content: 'Hello', timestamp: 99 };
  if (kind === 'compaction')
    messages.splice(0, messages.length, {
      role: 'user',
      content:
        'The conversation history before this point was compacted into the following summary:\n<summary>Important earlier decision</summary>',
      timestamp: 3,
    });
  if (kind === 'removed') messages.splice(0, 1);
  if (kind === 'assistant edit')
    messages[1] = {
      ...first.message,
      content: [{ type: 'text', text: 'Edited answer' }],
    };
  messages.push({ role: 'user', content: 'Continue from here', timestamp: 4 });
  expect(
    (await turn(provider, {}, normalizeContext({ messages }))).message
      .stopReason,
  ).toBe('stop');
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(2);
  const prompt = wire()
    .filter((m) => m.method === 'session/prompt')
    .at(-1).params.prompt;
  expect(prompt[0].text).toContain('Prior Pi context');
  expect(prompt.at(-1).text).toBe('Continue from here');
  if (kind === 'compaction')
    expect(prompt[0].text).toContain('Important earlier decision');
});

test('normal continuation sends all unseen user and tool-result deltas, but not Junie output or old history', async () => {
  const { provider, wire } = setup();
  const first = await turn(provider);
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      {
        role: 'toolResult',
        toolCallId: 'pi-tool-1',
        toolName: 'read',
        isError: false,
        content: [{ type: 'text', text: 'New tool result' }],
        timestamp: 2,
      },
      { role: 'user', content: 'First new instruction', timestamp: 3 },
      { role: 'user', content: 'Second new instruction', timestamp: 4 },
    ],
  });
  await turn(provider, {}, input);
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(1);
  const prompt = wire()
    .filter((m) => m.method === 'session/prompt')
    .at(-1).params.prompt;
  const text = prompt.map((block: { text: string }) => block.text).join('\n');
  expect(text).toContain('New tool result');
  expect(text).toContain('First new instruction');
  expect(text).toContain('Second new instruction');
  expect(text).not.toContain('Hello');
});

test.each([
  ['FAKE_RESUME_UNSUPPORTED', 'load'],
  ['FAKE_RESUME_FAIL', 'fresh'],
])('restart handles %s without failing the turn (%s)', async (flag, want) => {
  const { provider, restart, wire, store } = setup({ [flag]: '1' });
  const first = await turn(provider);
  await provider.close();
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Next question', timestamp: 2 },
    ],
  });
  expect((await turn(restart(), {}, input)).message.stopReason).toBe('stop');
  if (want === 'load') {
    expect(wire().filter((m) => m.method === 'session/load')).toHaveLength(1);
    expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(1);
    expect(store.load('pi-1')?.resumedWith).toBe('load');
    expect(
      wire()
        .filter((m) => m.method === 'session/prompt')
        .at(-1).params.prompt,
    ).toEqual([{ type: 'text', text: 'Next question' }]);
  } else {
    expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(2);
    const prompt = wire()
      .filter((m) => m.method === 'session/prompt')
      .at(-1).params.prompt;
    expect(prompt[0].text).toContain('Hello from Junie');
  }
});

test('an appended compaction summary forces reseeding and survives bounded context projection alongside other-provider turns', async () => {
  const { provider, wire } = setup();
  const first = await turn(provider);
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      {
        role: 'user',
        content:
          'The conversation history before this point was compacted into the following summary:\n<summary>Preserve decision 42</summary>',
        timestamp: 2,
      },
      {
        ...first.message,
        provider: 'other-provider',
        content: [
          { type: 'text', text: 'x'.repeat(30000) + 'Other provider decision' },
        ],
        timestamp: 3,
      },
      { role: 'user', content: 'Continue', timestamp: 4 },
    ],
  });
  await turn(provider, {}, input);
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(2);
  const seed = wire()
    .filter((m) => m.method === 'session/prompt')
    .at(-1).params.prompt[0].text;
  expect(seed).toContain('Preserve decision 42');
  expect(seed).toContain('Other provider decision');
  expect(seed).toContain('other-provider');
  expect(seed.length).toBeLessThanOrEqual(24100);
});

test('a failed prompt invalidates durable state so a later process cannot resume a dirty Junie tail', async () => {
  const { provider, store, restart, wire } = setup({ FAKE_FAIL_SECOND: '1' });
  const first = await turn(provider);
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Retry me', timestamp: 2 },
    ],
  });
  expect((await turn(provider, {}, input)).message.stopReason).toBe('error');
  expect(store.load('pi-1')).toBeNull();
  await provider.close();
  expect((await turn(restart(), {}, input)).message.stopReason).toBe('stop');
  expect(wire().filter((m) => m.method === 'session/resume')).toHaveLength(0);
  expect(
    wire()
      .filter((m) => m.method === 'session/prompt')
      .at(-1).params.prompt[0].text,
  ).toContain('Hello from Junie');
});

test('a hung resume falls back to a fresh seeded session within the startup bound', async () => {
  const { provider, restart, wire } = setup(
    { FAKE_HANG_RESUME: '1' },
    { startupTimeoutMs: 2000 },
  );
  const first = await turn(provider);
  await provider.close();
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Next', timestamp: 2 },
    ],
  });
  expect((await turn(restart(), {}, input)).message.stopReason).toBe('stop');
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(2);
  expect(
    wire()
      .filter((m) => m.method === 'session/prompt')
      .at(-1).params.prompt[0].text,
  ).toContain('Hello from Junie');
}, 10000);

test('a process exiting during resume falls back through a new connection rather than failing the turn', async () => {
  const { provider, restart, wire } = setup({ FAKE_EXIT_RESUME: '1' });
  const first = await turn(provider);
  await provider.close();
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first.message,
      { role: 'user', content: 'Next', timestamp: 2 },
    ],
  });
  expect((await turn(restart(), {}, input)).message.stopReason).toBe('stop');
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(2);
});

const toolContext = normalizeContext({
  messages: [{ role: 'user', content: 'Read a file', timestamp: 1 }],
  tools: [
    {
      name: 'read',
      description: 'Read file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  ],
});
test('MCP call yields one Pi toolUse and its result continues the same Junie turn without reseeding', async () => {
  const { provider, wire } = setup({
    FAKE_MCP: '1',
    FAKE_TOKEN_USAGE: '1',
    FAKE_MCP_CONTEXT_USAGE: '1',
  });
  const first = await turn(provider, {}, toolContext);
  expect(first.message.stopReason, first.message.errorMessage).toBe('toolUse');
  const calls = first.message.content.filter(
    (block) => block.type === 'toolCall',
  );
  expect(calls).toEqual([
    {
      type: 'toolCall',
      id: expect.any(String),
      name: 'read',
      arguments: { path: '/file-1' },
    },
  ]);
  expect(
    first.message.content.filter((block) => block.type === 'text'),
  ).toEqual([]);
  expect(first.message.usage).toMatchObject({
    input: 0,
    output: 0,
    totalTokens: 0,
  });
  const call = calls[0];
  const input = normalizeContext({
    messages: [
      ...toolContext.messages,
      first.message,
      {
        role: 'toolResult',
        toolCallId: call.id,
        toolName: 'read',
        isError: false,
        content: [
          { type: 'text', text: 'file contents' },
          { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
        ],
        timestamp: 2,
      },
    ],
  });
  const second = await turn(provider, {}, input);
  expect(second.message.usage).toMatchObject({
    input: 24719,
    output: 472,
    totalTokens: 444,
    cacheRead: 11533,
    cacheWrite: 19,
  });
  expect(second.message).toMatchObject({
    stopReason: 'stop',
    content: [{ type: 'text', text: 'Tool results received in same turn' }],
  });
  expect(
    wire()
      .filter((m) => m.method === 'fixture/mcp_result')
      .map((m) => m.params),
  ).toEqual([
    {
      index: 1,
      content: [
        { type: 'text', text: 'file contents' },
        { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
      ],
      isError: false,
    },
  ]);
  expect(wire().filter((m) => m.method === 'session/prompt')).toHaveLength(1);
  await turn(
    provider,
    {},
    normalizeContext({
      messages: [
        ...input.messages,
        second.message,
        { role: 'user', content: 'Next', timestamp: 3 },
      ],
    }),
  );
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(1);
  expect(wire().filter((m) => m.method === 'session/prompt')).toHaveLength(2);
});

test.each([
  false,
  true,
])('concurrent MCP calls execute once each in arrival order, one per Pi round trip (delayed: %s)', async (delayed) => {
  const { provider, wire } = setup({
    FAKE_MCP: '2',
    ...(delayed ? { FAKE_MCP_DELAY_SECOND: '1' } : {}),
  });
  let input = toolContext;
  const executed: string[] = [],
    ids: string[] = [];
  for (let index = 1; index <= 2; index++) {
    const response = await turn(provider, {}, input);
    expect(response.message.stopReason, response.message.errorMessage).toBe(
      'toolUse',
    );
    if (delayed && index === 1)
      await expect
        .poll(() => wire().filter((m) => m.method === 'fixture/mcp_start'))
        .toHaveLength(2);
    const calls = response.message.content.filter(
      (block) => block.type === 'toolCall',
    );
    expect(calls).toHaveLength(1);
    const call = calls[0];
    ids.push(call.id);
    expect(call.arguments).toEqual({ path: '/file-' + index });
    executed.push(String(call.arguments.path));
    input = normalizeContext({
      messages: [
        ...input.messages,
        response.message,
        {
          role: 'toolResult',
          toolCallId: call.id,
          toolName: 'read',
          content: [{ type: 'text', text: 'result ' + index }],
          isError: index === 2,
          timestamp: index + 1,
        },
      ],
    });
  }
  const last = await turn(provider, {}, input);
  expect(last.message.stopReason).toBe('stop');
  expect(last.message.content).toEqual([
    { type: 'text', text: 'Tool results received in same turn' },
  ]);
  expect(executed).toEqual(['/file-1', '/file-2']);
  expect(new Set(ids).size).toBe(2);
  expect(
    wire()
      .filter((m) => m.method === 'fixture/mcp_result')
      .map((m) => [m.params.index, m.params.isError]),
  ).toEqual([
    [1, false],
    [2, true],
  ]);
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(1);
  expect(wire().filter((m) => m.method === 'session/prompt')).toHaveLength(1);
});

test('aborting while Pi executes a parked call returns MCP error and cancels Junie', async () => {
  const { provider, wire, store } = setup({ FAKE_MCP: '1' }),
    controller = new AbortController();
  const first = await turn(
    provider,
    { signal: controller.signal },
    toolContext,
  );
  expect(first.message.stopReason).toBe('toolUse');
  controller.abort();
  await expect
    .poll(() =>
      wire()
        .filter((m) => m.method === 'fixture/mcp_result')
        .map((m) => m.params.isError),
    )
    .toEqual([true]);
  expect(wire().filter((m) => m.method === 'session/cancel')).toHaveLength(1);
  expect(store.load('pi-1')).toBeNull();
});

test('an abort right after a parked continuation starts wins over the parked result', async () => {
  const { provider, wire } = setup({
    FAKE_MCP: '2',
    FAKE_MCP_DELAY_SECOND: '1',
  });
  const first = await turn(provider, {}, toolContext);
  expect(first.message.stopReason, first.message.errorMessage).toBe('toolUse');
  // Both native calls are parked before Pi continues the same Junie turn.
  await expect
    .poll(() => wire().filter((m) => m.method === 'fixture/mcp_start'))
    .toHaveLength(2);
  const call = first.message.content.find(
    (block) => block.type === 'toolCall',
  )!;
  const controller = new AbortController();
  const stream = provider.streamSimple(
    model,
    normalizeContext({
      messages: [
        ...toolContext.messages,
        first.message,
        {
          role: 'toolResult',
          toolCallId: call.id,
          toolName: call.name,
          isError: false,
          content: [{ type: 'text', text: 'result' }],
          timestamp: 2,
        },
      ],
    }),
    { sessionId: 'pi-1', signal: controller.signal },
  );
  // Abort precedence matches the pre-telemetry bridge: a synchronous abort
  // after the continuation stream is created never loses to the parked result.
  controller.abort();
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  const message = await stream.result();
  expect(message.stopReason, message.errorMessage).toBe('aborted');
  expect(
    events.filter((event) => event.type === 'done' || event.type === 'error'),
  ).toEqual([expect.objectContaining({ reason: 'aborted' })]);
});

test('MCP tools from other servers remain display-only native activity', async () => {
  const { provider } = setup({ FAKE_FOREIGN_MCP: '1' });
  const response = await turn(provider);
  expect(response.message.content).toEqual([
    { type: 'text', text: 'Hello from Junie' },
  ]);
  expect(response.message.stopReason).toBe('stop');
});

test('ACP progress while Pi executes the parked tool is retained for the continuation', async () => {
  const { provider, wire } = setup({ FAKE_MCP: '1', FAKE_MCP_PARK_TEXT: '1' });
  const first = await turn(provider, {}, toolContext);
  expect(first.message.stopReason).toBe('toolUse');
  const call = first.message.content.find(
    (block) => block.type === 'toolCall',
  )!;
  await expect
    .poll(() => wire().some((m) => m.method === 'fixture/park_text'))
    .toBe(true);
  const input = normalizeContext({
    messages: [
      ...toolContext.messages,
      first.message,
      {
        role: 'toolResult',
        toolCallId: call.id,
        toolName: call.name,
        isError: false,
        content: [],
        timestamp: 2,
      },
    ],
  });
  const next = await turn(provider, {}, input);
  expect(next.message.content).toEqual([
    {
      type: 'text',
      text: 'Progress while parked. Tool results received in same turn',
    },
  ]);
});

test('the MCP catalog follows Pi tool removal/redefinition deltas from the current context', async () => {
  const { provider } = setup({ FAKE_MCP: '1' });
  const input = normalizeContext({
    messages: [
      ...toolContext.messages,
      {
        role: 'system',
        content: '',
        timestamp: 2,
        toolsRemoved: [{ name: 'read' }],
        toolsAdded: [
          {
            name: 'read',
            description: 'Updated reader',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        ],
      },
    ],
  });
  const first = await turn(provider, {}, input);
  expect(first.message.stopReason, first.message.errorMessage).toBe('toolUse');
});

test.each([
  false,
  true,
])('brave mode is disabled before prompting restored sessions (load: %s)', async (load) => {
  const { provider, restart, wire } = setup(
    load ? { FAKE_RESUME_UNSUPPORTED: '1' } : {},
  );
  const first = await turn(provider);
  await provider.close();
  await turn(
    restart(),
    {},
    normalizeContext({
      messages: [
        ...context.messages,
        first.message,
        { role: 'user', content: 'Next', timestamp: 2 },
      ],
    }),
  );
  const frames = wire(),
    restore = frames.findIndex(
      (m) => m.method === (load ? 'session/load' : 'session/resume'),
    );
  expect(
    frames
      .slice(restore + 1)
      .find((m) => m.method === 'session/set_config_option').params,
  ).toMatchObject({ configId: 'brave_mode', value: 'off' });
});
test('reasserts brave mode off when Junie enables it and logs the correction', async () => {
  const warnings: string[] = [];
  const { provider, wire } = setup(
    { FAKE_BRAVE_UPDATE: '1' },
    { warn: (message) => warnings.push(message) },
  );
  expect((await turn(provider)).message.stopReason).toBe('stop');
  await expect
    .poll(() =>
      wire().filter(
        (m) =>
          m.method === 'session/set_config_option' &&
          m.params.configId === 'brave_mode',
      ),
    )
    .toHaveLength(2);
  expect(warnings.join('\n')).toContain('brave_mode');
});
test('native activity is coalesced display data, never assistant content or reseeded history', async () => {
  const display: NativeToolActivity[] = [];
  const { provider } = setup(
    { FAKE_NATIVE_DETAIL: '1' },
    {
      onNativeEvent: (event, id) => {
        expect(id).toBe('pi-1');
        display.push(event);
      },
    },
  );
  const { message, events } = await turn(provider);
  expect(message.content).toEqual([{ type: 'text', text: 'Hello from Junie' }]);
  expect(display).toHaveLength(1);
  const text = renderNativeActivity(display[0]);
  for (const value of [
    'edit',
    'Edit file',
    'completed',
    '/repo/file:4',
    'before',
    'after',
    'Edit finished',
  ])
    expect(text).toContain(value);
  expect(events.some((event) => event.type.startsWith('toolcall'))).toBe(false);
  const projected = JSON.stringify(
    projectPrompt(
      normalizeContext({
        messages: [
          ...context.messages,
          message,
          { role: 'user', content: 'Next', timestamp: 2 },
        ],
      }),
      { prompted: false },
    ),
  );
  expect(projected).toContain('Hello from Junie');
  expect(projected).not.toContain('Edit file');
  expect(projected).not.toContain('/repo/file');
});

test.each([
  'abort',
  'shutdown',
])('native permission dialog is cancelled on provider %s without issuing Pi tool calls', async (action) => {
  const gate = createPermissionGate();
  let shown!: () => void;
  const dialogShown = new Promise<void>((resolve) => (shown = resolve));
  let signal: AbortSignal | undefined;
  const { provider } = setup(
    { FAKE_NATIVE_PERMISSION: '1' },
    {
      onPermission: (params, abort, piSessionId) => {
        expect(piSessionId).toBe('pi-1');
        return gate.request(params, {
          signal: abort,
          ui: {
            select: async (_title, _options, settings) => {
              signal = settings?.signal;
              shown();
              return new Promise<string | undefined>(() => {});
            },
          },
        });
      },
    },
  );
  const controller = new AbortController();
  const response = turn(provider, { signal: controller.signal });
  await dialogShown;
  if (action === 'abort') controller.abort();
  else await provider.close();
  const { message } = await response;
  expect(signal?.aborted).toBe(true);
  expect(message.stopReason).toBe('aborted');
  expect(message.content.some((block) => block.type === 'toolCall')).toBe(
    false,
  );
});

test('a failed brave mode correction fails closed instead of reporting successful completion', async () => {
  const { provider } = setup(
    { FAKE_BRAVE_UPDATE: '1', FAKE_BRAVE_RESET_FAIL: '1' },
    { warn: () => {} },
  );
  const { message } = await turn(provider);
  expect(message.stopReason).toBe('error');
  expect(message.errorMessage).toContain('brave_mode');
});

test('requesting parent and child identities have distinct persistence and cwd', async () => {
  const { provider, store, dir, wire } = setup();
  expect(
    (await turn(provider, { sessionId: 'PARENT' })).message.stopReason,
  ).toBe('stop');
  expect(
    (await turn(provider, { sessionId: 'CHILD' })).message.stopReason,
  ).toBe('stop');
  expect(store.load('PARENT')).toMatchObject({ cwd: dir });
  expect(store.load('CHILD')).toMatchObject({ cwd: dir });
  expect(store.load('pi-1')).toBeNull();
  expect(wire().filter((m) => m.method === 'initialize')).toHaveLength(2);
});

test('calls without Pi identity use fresh headless ephemeral state without persistence', async () => {
  const { provider, store, wire } = setup();
  const save = vi.spyOn(store, 'save');
  expect(
    (await provider.streamSimple(model, context).result()).stopReason,
  ).toBe('stop');
  expect(
    (await provider.streamSimple(model, context).result()).stopReason,
  ).toBe('stop');
  expect(save).not.toHaveBeenCalled();
  expect(wire().filter((m) => m.method === 'initialize')).toHaveLength(2);
});

test('usage_update capacity is saved for the exact selected model on re-registration', async () => {
  const { provider, dir } = setup({ FAKE_RICH: '1' });
  await refreshCatalog({
    agentDir: dir,
    command: { file: process.execPath, args: [fixture] },
  });
  await turn(provider);
  expect(
    projectModels(readCatalog(dir)!).find((m) => m.id === model.id)
      ?.contextWindow,
  ).toBe(64000);
});

const shortModel: Model<Api> = {
  ...model,
  id: 'gemini-3.7-flash',
  name: 'Gemini 3.7 Flash',
};

test('selecting a short Pi model id sends the ACP value and records capacity for the ACP value', async () => {
  const { provider, dir, wire } = setup({ FAKE_RICH: '1' });
  await refreshCatalog({
    agentDir: dir,
    command: { file: process.execPath, args: [fixture] },
  });
  const message = await provider
    .streamSimple(shortModel, context, { sessionId: 'pi-1' })
    .result();
  expect(message.stopReason).toBe('stop');
  // Pi keeps the short id in its own transcript.
  expect(message.model).toBe('gemini-3.7-flash');
  expect(
    wire()
      .filter(
        (m) =>
          m.method === 'session/set_config_option' &&
          m.params.configId === 'model',
      )
      .map((m) => m.params.value),
  ).toEqual(['v1:12:jetbrains-ai:gemini-3.7-flash']);
  expect(shortModel.contextWindow).toBe(64000);
  expect(
    readCatalog(dir)?.models.find((m) => m.id === 'gemini-3.7-flash')
      ?.contextWindow,
  ).toBe(64000);
});

test('a durable record that stored the full ACP model value still resumes when Pi selects the short id', async () => {
  const { provider, restart, dir, store, wire } = setup();
  await refreshCatalog({
    agentDir: dir,
    command: { file: process.execPath, args: [fixture] },
  });
  const first = await provider
    .streamSimple(shortModel, context, { sessionId: 'pi-1' })
    .result();
  expect(first.stopReason).toBe('stop');
  // The record keeps the ACP value: old and new builds read the same model.
  expect(store.load('pi-1')?.model).toBe('v1:12:jetbrains-ai:gemini-3.7-flash');
  await provider.close();
  const input = normalizeContext({
    messages: [
      ...context.messages,
      first,
      { role: 'user', content: 'Next', timestamp: 2 },
    ],
  });
  const resumed = restart();
  const second = await resumed
    .streamSimple(shortModel, input, { sessionId: 'pi-1' })
    .result();
  expect(second.stopReason).toBe('stop');
  expect(wire().filter((m) => m.method === 'session/new')).toHaveLength(1);
  expect(wire().filter((m) => m.method === 'session/resume')).toHaveLength(1);
  // Either form of the same model matches a saved session.
  const saved = store.load('pi-1');
  if (!saved) throw new Error('session record missing');
  store.save('pi-1', { ...saved, model: 'gemini-3.7-flash' });
  await resumed.close();
  const again = restart();
  const third = await again
    .streamSimple(
      shortModel,
      normalizeContext({
        messages: [
          ...input.messages,
          second,
          { role: 'user', content: 'Again', timestamp: 3 },
        ],
      }),
      { sessionId: 'pi-1' },
    )
    .result();
  expect(third.stopReason).toBe('stop');
  expect(wire().filter((m) => m.method === 'session/resume')).toHaveLength(2);
});

test('prompt response maps billed tokens independently of context occupancy and cumulative USD cost', async () => {
  const { provider } = setup({
    FAKE_RICH: '1',
    FAKE_TOKEN_USAGE: '1',
    FAKE_INVALID_CONTEXT_USAGE: '1',
  });
  const { message } = await turn(provider);
  expect(message.usage).toMatchObject({
    input: 24719,
    output: 472,
    totalTokens: 120,
    cacheRead: 11533,
    cacheWrite: 19,
    cost: { total: 0.25 },
  });
});

test('prompt totalTokens keeps the terminal usage when no context update was observed', async () => {
  const { provider } = setup({ FAKE_TOKEN_USAGE: '1' });
  const { message } = await turn(provider);
  expect(message.usage).toMatchObject({
    input: 24719,
    output: 472,
    totalTokens: 25191,
    cacheRead: 11533,
    cacheWrite: 19,
  });
});

const stalledRead = () => new Promise<never>(() => {});
const nextTurnContext = (
  message: Awaited<ReturnType<typeof turn>>['message'],
) =>
  normalizeContext({
    messages: [
      ...context.messages,
      message,
      { role: 'user', content: 'Next', timestamp: 2 },
    ],
  });

test('a stalled post-terminal settings read never blocks the next turn and emits nothing', async () => {
  const displays: NativeToolActivity[] = [];
  const home = junieHome();
  junieSettings(home);
  const { provider } = setup(
    { JUNIE_HOME: home, FAKE_RICH: '1' },
    { onNativeEvent: (event) => displays.push(event) },
  );
  displayRead.stall = stalledRead();
  const first = await turn(provider);
  expect(first.message.stopReason).toBe('stop');
  // The read never resolves, so any wait on the line would deadlock the turn.
  const second = await turn(provider, {}, nextTurnContext(first.message));
  expect(second.message.stopReason).toBe('stop');
  expect(displays.filter((event) => event.usageLine)).toEqual([]);
});

/** Timers created by the second turn of an established session, and the ones
 * still pending when that turn ended. */
async function secondTurnTimers(stalled: boolean) {
  const home = junieHome();
  junieSettings(home);
  const { provider } = setup({ JUNIE_HOME: home, FAKE_RICH: '1' });
  displayRead.stall = stalled ? stalledRead() : undefined;
  try {
    const first = await turn(provider);
    expect(first.message.stopReason).toBe('stop');
    const setSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const second = await turn(provider, {}, nextTurnContext(first.message));
      expect(second.message.stopReason).toBe('stop');
      const created = setSpy.mock.results.map((result) => result.value);
      const cleared = new Set(clearSpy.mock.calls.map((call) => call[0]));
      return {
        created: created.length,
        pending: created.filter((handle) => !cleared.has(handle)),
      };
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  } finally {
    displayRead.stall = undefined;
  }
}

test('a pending display line schedules no timer of its own', async () => {
  const control = await secondTurnTimers(false);
  const stalled = await secondTurnTimers(true);
  // Fire and forget: a pending line adds no bound, no grace and no timer at all,
  // and the turn leaves nothing scheduled behind it.
  expect(stalled.created).toBe(control.created);
  expect(control.pending).toEqual([]);
  expect(stalled.pending).toEqual([]);
});

test('abort wins immediately while a display line is pending', async () => {
  const displays: NativeToolActivity[] = [];
  const home = junieHome();
  junieSettings(home);
  const { provider } = setup(
    { JUNIE_HOME: home, FAKE_RICH: '1' },
    { onNativeEvent: (event) => displays.push(event) },
  );
  displayRead.stall = stalledRead();
  const first = await turn(provider);
  expect(first.message.stopReason).toBe('stop');
  const controller = new AbortController();
  const startedAt = performance.now();
  const stream = provider.streamSimple(model, nextTurnContext(first.message), {
    sessionId: 'pi-1',
    signal: controller.signal,
  });
  controller.abort();
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  const message = await stream.result();
  expect(message.stopReason).toBe('aborted');
  expect(
    events.filter((event) => event.type === 'done' || event.type === 'error'),
  ).toEqual([expect.objectContaining({ reason: 'aborted' })]);
  // The never-resolving read cannot delay the abort: nothing waits for it.
  expect(performance.now() - startedAt).toBeLessThan(3000);
  expect(displays.filter((event) => event.usageLine)).toEqual([]);
});

test('close never waits for a pending display line and drops it', async () => {
  const displays: NativeToolActivity[] = [];
  const home = junieHome();
  junieSettings(home);
  const { provider } = setup(
    { JUNIE_HOME: home, FAKE_RICH: '1' },
    { onNativeEvent: (event) => displays.push(event) },
  );
  let release!: (model: { modelId: string; effortWireId?: string }) => void;
  displayRead.stall = new Promise<never>((resolve) => {
    release = resolve as unknown as typeof release;
  });
  const { message } = await turn(provider);
  expect(message.stopReason).toBe('stop');
  const startedAt = performance.now();
  await provider.close();
  // A never-resolving read cannot hold close: it is not awaited at all.
  expect(performance.now() - startedAt).toBeLessThan(3000);
  // The abandoned read settles after close; its line must never land.
  release({ modelId: 'gpt-6.1-terra', effortWireId: 'low' });
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(displays.filter((event) => event.usageLine)).toEqual([]);
});

/** Bounded poll: telemetry lands after the terminal event, off the turn. */
async function until(condition: () => boolean, ms = 5000) {
  const deadline = performance.now() + ms;
  while (!condition() && performance.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
}

test.each([
  'cancelled',
  'refusal',
])('a %s turn disposed at its terminal event never appends a stale display line after the next turn', async (reason) => {
  const displays: string[] = [];
  const home = junieHome();
  junieSettings(home);
  const { provider } = setup(
    {
      JUNIE_HOME: home,
      FAKE_RICH: '1',
      FAKE_STOP_SEQUENCE: `${reason},end_turn`,
      // The disposed turn restarts the fixture process; the count survives it.
      FAKE_STOP_SEQUENCE_FILE: join(home, 'prompt-sequence'),
    },
    {
      onNativeEvent: (event) => {
        if (event.usageLine) displays.push(event.usageLine);
      },
    },
  );
  let release!: (model: { modelId: string; effortWireId?: string }) => void;
  displayRead.stall = new Promise<never>((resolve) => {
    release = resolve as unknown as typeof release;
  });
  const disposed = await turn(provider);
  expect(disposed.message.stopReason).toBe(
    reason === 'cancelled' ? 'aborted' : 'error',
  );
  // The session was disposed with the terminal event; a deferred read of that
  // turn belongs to a dead session instance and must never emit.
  displayRead.stall = undefined;
  // The next turn reports a different Junie model, so a stale line is visible.
  junieSettings(home, {
    formatVersion: 1,
    model: { modelId: 'gpt-6.1-luna', effortWireId: 'low' },
  });
  const next = await turn(provider, {}, nextTurnContext(disposed.message));
  expect(next.message.stopReason).toBe('stop');
  await until(() => displays.length > 0);
  const fresh = 'Junie · mix.auto → gpt-6.1-luna (low) · $0.2500';
  expect(displays).toEqual([fresh]);
  // Releasing the disposed turn's read emits nothing: order stays intact.
  release({ modelId: 'gpt-6.1-terra', effortWireId: 'low' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(displays).toEqual([fresh]);
});

test('a line that resolves after a newer turn started emits nothing', async () => {
  const displays: string[] = [];
  const home = junieHome();
  junieSettings(home);
  const { provider } = setup(
    { JUNIE_HOME: home },
    {
      onNativeEvent: (event) => {
        if (event.usageLine) displays.push(event.usageLine);
      },
    },
  );
  let release!: (model: { modelId: string; effortWireId?: string }) => void;
  displayRead.stall = new Promise<never>((resolve) => {
    release = resolve as unknown as typeof release;
  });
  const first = await turn(provider);
  expect(first.message.stopReason).toBe('stop');
  // A new continuation bumps the generation the pending line belongs to.
  displayRead.stall = undefined;
  const second = await turn(provider, {}, nextTurnContext(first.message));
  expect(second.message.stopReason).toBe('stop');
  await until(() => displays.length > 0);
  const fresh = ['Junie · mix.auto → gpt-6.1-terra (low)'];
  expect(displays).toEqual(fresh);
  // Late resolution of the older line never lands: display order is preserved.
  release({ modelId: 'gpt-6.1-luna', effortWireId: 'low' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(displays).toEqual(fresh);
});

test('mid-turn id collisions preserve wire-keyed capacity and reject the next ambiguous selection', async () => {
  let changed = false;
  const { provider, dir, wire } = setup(
    { FAKE_RICH: '1' },
    {
      onCatalogUpdate: (catalog) => {
        if (changed) return;
        changed = true;
        const selected = catalog.models[0];
        selected.id = selected.value;
        delete selected.contextWindow;
        catalog.models.push({
          id: 'v1:99:jetbrains-ai:gemini-3.7-flash',
          value: 'v1:99:jetbrains-ai:gemini-3.7-flash',
          name: 'Other Gemini',
        });
        writeFileSync(
          join(dir, 'junie-bridge/models.json'),
          JSON.stringify(catalog),
        );
      },
    },
  );
  await refreshCatalog({
    agentDir: dir,
    command: { file: process.execPath, args: [fixture] },
  });
  const first = await provider
    .streamSimple(shortModel, context, { sessionId: 'pi-1' })
    .result();
  expect(first.stopReason).toBe('stop');
  expect(changed).toBe(true);
  expect(readCatalog(dir)?.models[0].contextWindow).toBe(64000);
  expect(readCatalog(dir)?.models[2].contextWindow).toBeUndefined();
  const before = wire();
  const ambiguous = await provider
    .streamSimple(shortModel, context, { sessionId: 'pi-1' })
    .result();
  expect(ambiguous.stopReason).toBe('error');
  expect(ambiguous.errorMessage).toMatch(/ambiguous.*gemini-3\.7-flash/i);
  expect(wire()).toEqual(before);

  // Removing the conflicting value leaves the selected Pi Model stale, but
  // its tail is now unique and resolves without guessing.
  const catalog = readCatalog(dir)!;
  catalog.models.pop();
  writeFileSync(join(dir, 'junie-bridge/models.json'), JSON.stringify(catalog));
  const next = await provider
    .streamSimple(shortModel, context, { sessionId: 'pi-1' })
    .result();
  expect(next.stopReason).toBe('stop');
  expect(
    wire()
      .filter(
        (m) =>
          m.method === 'session/set_config_option' &&
          m.params.configId === 'model',
      )
      .map((m) => m.params.value),
  ).toEqual([
    'v1:12:jetbrains-ai:gemini-3.7-flash',
    'v1:12:jetbrains-ai:gemini-3.7-flash',
  ]);
});

test.each([
  'removed-model',
  'gemini-3.7-flash',
])('an unresolvable persisted model %s does not block a valid new selection', async (savedModel) => {
  const { provider, restart, dir, store } = setup();
  const catalog = await refreshCatalog({
    agentDir: dir,
    command: { file: process.execPath, args: [fixture] },
  });
  const first = await provider
    .streamSimple(model, context, { sessionId: 'pi-1' })
    .result();
  expect(first.stopReason).toBe('stop');
  await provider.close();
  const saved = store.load('pi-1')!;
  store.save('pi-1', { ...saved, model: savedModel });
  catalog.models[0].id = catalog.models[0].value;
  catalog.models.push({
    id: 'v1:99:jetbrains-ai:gemini-3.7-flash',
    value: 'v1:99:jetbrains-ai:gemini-3.7-flash',
    name: 'Other Gemini',
  });
  writeFileSync(join(dir, 'junie-bridge/models.json'), JSON.stringify(catalog));
  const next = await restart()
    .streamSimple(model, context, { sessionId: 'pi-1' })
    .result();
  expect(next.stopReason).toBe('stop');
  expect(store.load('pi-1')?.model).toBe('mix.auto');
});
