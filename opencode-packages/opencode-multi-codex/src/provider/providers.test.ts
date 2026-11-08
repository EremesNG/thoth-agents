import type { Model, Plugin, Provider } from '@opencode/plugin';
import { expect, test, vi } from 'vitest';
import { registerProviders } from './providers.js';

type ProviderEditor = Parameters<
  Parameters<Plugin.Context['provider']['transform']>[0]
>[0];
type ModelEditor = Parameters<
  Parameters<Plugin.Context['model']['transform']>[0]
>[0];
type Record = NonNullable<ReturnType<ProviderEditor['get']>>;

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected fixture entry to exist');
  return value;
}

function fixture() {
  const model = (id: string, extra = {}) =>
    ({
      id,
      providerID: 'openai',
      enabled: true,
      type: 'text',
      cost: [{ input: 10 }],
      limit: { input: 1_000_000, context: 1_128_000, output: 128_000 },
      ...extra,
    }) as unknown as Model.Info;
  const catalog = [
    model('gpt-6.1-sol'),
    model('gpt-6'),
    model('gpt-5.5'),
    model('gpt-5.6'),
    model('gpt-5.7'),
    model('o3'),
    model('gpt-image-2', { type: 'image' }),
    model('gpt-image-1', { type: 'image' }),
    model('pro', {
      modelID: 'gpt-6.1-sol',
      body: { reasoning: { mode: 'pro' } },
    }),
    model('gpt-7'),
    model('small', {
      modelID: 'gpt-6.1-sol',
      limit: { input: 100_000, context: 110_000, output: 10_000 },
    }),
    model('standard', {
      modelID: 'gpt-6.1-sol',
      body: { reasoning: { effort: 'high' } },
    }),
    model('context-only', {
      modelID: 'gpt-6',
      limit: { input: 0, context: 1_000_000, output: 10_000 },
    }),
  ];
  const info = {
    id: 'openai',
    name: 'OpenAI',
    activation: 'auto',
    package: '@opencode/ai/providers/openai',
    settings: { timeout: 123 },
    headers: {
      'X-Custom': 'keep',
      Authorization: 'must-not-copy',
      'ChatGPT-Account-Id': 'active-account',
      Originator: 'old',
      'X-Codex-Beta-Features': 'old',
    },
  } as unknown as Provider.Info;
  const original: Record = {
    provider: info,
    models: new Map(catalog.map((m) => [m.id, m])),
  };
  let records = new Map([
    ['openai', original],
    [
      'other',
      {
        ...original,
        provider: { ...info, id: 'other' },
        models: new Map(
          catalog.map((m) => [m.id, { ...m, providerID: 'other' }]),
        ),
      } as unknown as Record,
    ],
  ]);
  let providerTransform: (editor: ProviderEditor) => void;
  let modelTransform: (editor: ModelEditor) => void;
  const hooks = new Map<string, (event: unknown) => unknown>();
  const registration = { dispose: vi.fn(async () => {}) };
  const editor = {
    list: () => [...records.values()],
    get: (id: string) => records.get(id),
    add: ({ info, models }: Parameters<ProviderEditor['add']>[0]) =>
      records.set(info.id, {
        provider: info,
        models: new Map(
          models.map((m) => [m.id, { ...m, providerID: info.id }]),
        ),
      }),
    remove: (id: string) => records.delete(id),
  } as unknown as ProviderEditor;
  const ctx = {
    provider: {
      transform: vi.fn(async (cb: typeof providerTransform) => {
        providerTransform = cb;
        return registration;
      }),
      reload: vi.fn(async () => {
        records = new Map([['openai', original]]);
        providerTransform(editor);
      }),
    },
    model: {
      transform: vi.fn(async (cb: typeof modelTransform) => {
        modelTransform = cb;
        return registration;
      }),
    },
    session: {
      hook: vi.fn(async (name: string, cb: (event: unknown) => unknown) => {
        hooks.set(name, cb);
        return registration;
      }),
      get: vi.fn(async () => ({
        id: 'child',
        parentID: 'parent',
        fork: { sessionID: 'fork' },
      })),
    },
  } as unknown as Plugin.Context;
  let accounts = [1, 2, 3].map((number) => ({
    number,
    providerID: number === 1 ? 'openai' : `openai-codex-${number}`,
    credentialID: `c${number}`,
    label: `Account ${number}`,
    state: 'ok' as const,
  }));
  return {
    ctx,
    hooks,
    records: () => records,
    catalog,
    original,
    registry: { list: async () => accounts },
    remove: () => {
      accounts = accounts.filter((a) => a.number !== 2);
    },
    transformProviders: () => providerTransform(editor),
    transformModels: () => {
      const all = [...records.values()].flatMap((r) =>
        [...r.models.values()].map((m) => structuredClone(m)),
      );
      modelTransform({
        list: (id?: string) => all.filter((m) => !id || m.providerID === id),
        update: (
          providerID: string,
          id: string,
          cb: Parameters<ModelEditor['update']>[2],
        ) =>
          cb(
            required(
              all.find((m) => m.id === id && m.providerID === providerID),
            ) as Parameters<typeof cb>[0],
          ),
      } as unknown as ModelEditor);
      return all;
    },
  };
}

test('mapped aliases copy the source catalog, use Codex defaults and refresh after mapping changes', async () => {
  const f = fixture();
  const runtime = await registerProviders(f.ctx, f.registry);
  f.transformProviders();
  for (const number of [2, 3]) {
    const alias = required(f.records().get(`openai-codex-${number}`));
    expect(alias.provider).toMatchObject({
      id: `openai-codex-${number}`,
      name: `OpenAI Codex #${number}`,
      activation: 'auto',
      package: '@opencode/ai/providers/openai',
      integrationID: 'openai',
      settings: {
        timeout: 123,
        baseURL: 'https://chatgpt.com/backend-api/codex',
        transport: 'websocket',
        encoding: 'zstd',
      },
      headers: {
        'X-Custom': 'keep',
        originator: 'opencode',
        'x-codex-beta-features': 'remote_compaction_v2',
      },
    });
    expect(
      Object.keys(required(alias.provider.headers)).map((k) => k.toLowerCase()),
    ).not.toContain('authorization');
    expect(
      Object.keys(required(alias.provider.headers)).map((k) => k.toLowerCase()),
    ).not.toContain('chatgpt-account-id');
    expect(
      Object.keys(required(alias.provider.headers)).filter(
        (k) => k.toLowerCase() === 'originator',
      ),
    ).toEqual(['originator']);
    expect(
      Object.keys(required(alias.provider.headers)).filter(
        (k) => k.toLowerCase() === 'x-codex-beta-features',
      ),
    ).toEqual(['x-codex-beta-features']);
    expect([...alias.models.keys()]).toEqual(f.catalog.map((m) => m.id));
    expect(
      [...alias.models.values()].every(
        (m) => m.providerID === alias.provider.id,
      ),
    ).toBe(true);
  }
  expect(f.records().get('openai')).toBe(f.original);
  f.remove();
  await runtime.refreshProviders();
  expect(f.ctx.provider.reload).toHaveBeenCalledOnce();
  expect(f.records().has('openai-codex-2')).toBe(false);
  expect(f.records().has('openai-codex-3')).toBe(true);
  await runtime.dispose();
});

test('alias session hooks use Codex URL and parent/fork cache affinity and omit only context/compaction output limits', async () => {
  const f = fixture();
  await registerProviders(f.ctx, f.registry);
  for (const providerID of ['openai-codex-2', 'openai-codex-3']) {
    const event = {
      sessionID: 'child',
      model: { providerID, id: 'gpt-6.1-sol' },
      baseURL: 'https://api.openai.com/v1',
      headers: {} as { [key: string]: string },
    };
    await required(f.hooks.get('model.request'))(event);
    expect(event.baseURL).toBe('https://chatgpt.com/backend-api/codex');
    expect(event.headers).toMatchObject({
      originator: 'opencode',
      'session-id': 'parent',
    });
    for (const name of ['context', 'compaction']) {
      const context = {
        ...event,
        options: { maxTokens: 123, temperature: 0.4 },
      };
      await required(f.hooks.get(name))(context);
      expect(context.options).toEqual({ temperature: 0.4 });
    }
    vi.mocked(f.ctx.session.get).mockResolvedValueOnce({
      id: 'child',
      fork: { sessionID: 'fork' },
    } as never);
    await required(f.hooks.get('model.request'))(event);
    expect(event.headers['session-id']).toBe('fork');
    vi.mocked(f.ctx.session.get).mockRejectedValueOnce(new Error('not found'));
    event.baseURL = 'https://custom.example/v1';
    await required(f.hooks.get('model.request'))(event);
    expect(event.headers['session-id']).toBe('child');
    expect(event.baseURL).toBe('https://custom.example/v1');
  }
  for (const providerID of ['openai', 'other', 'openai-codex-99']) {
    const event = {
      sessionID: 's',
      model: { providerID },
      headers: {},
      baseURL: 'https://api.openai.com/v1',
      options: { maxTokens: 42 },
    };
    for (const name of ['model.request', 'context', 'compaction'])
      await required(f.hooks.get(name))(event);
    expect(event).toMatchObject({
      headers: {},
      baseURL: 'https://api.openai.com/v1',
      options: { maxTokens: 42 },
    });
  }
  expect([...f.hooks.keys()]).not.toContain('title');
  expect([...f.hooks.keys()]).not.toContain('generate');
});

test('aliases mirror eligible models, subscription costs, pro exclusion and ChatGPT context windows', async () => {
  const f = fixture();
  await registerProviders(f.ctx, f.registry);
  f.transformProviders();
  const models = f.transformModels();
  for (const number of [2, 3]) {
    const find = (id: string) =>
      required(
        models.find(
          (m) => m.providerID === `openai-codex-${number}` && m.id === id,
        ),
      );
    for (const id of ['gpt-6.1-sol', 'gpt-6', 'gpt-5.7', 'gpt-image-2']) {
      expect(find(id).enabled).toBe(true);
      expect(find(id).cost).toEqual([]);
    }
    for (const id of ['gpt-5.5', 'gpt-5.6', 'o3', 'gpt-image-1', 'pro'])
      expect(find(id).enabled).toBe(false);
    expect(find('gpt-6.1-sol').limit).toEqual({
      input: 500_000,
      context: 628_000,
      output: 128_000,
    });
    expect(find('gpt-6').limit).toEqual({
      input: 272_000,
      context: 400_000,
      output: 128_000,
    });
    expect(find('gpt-5.7').limit.input).toBe(272_000);
    expect(find('gpt-7').limit.input).toBe(500_000);
    expect(find('small').limit).toEqual({
      input: 100_000,
      context: 110_000,
      output: 10_000,
    });
    expect(find('context-only').limit).toEqual({
      input: 272_000,
      context: 282_000,
      output: 10_000,
    });
    expect(find('standard')).toMatchObject({
      enabled: true,
      cost: [],
      body: { reasoning: { effort: 'high' } },
    });
  }
  expect(models.filter((m) => m.providerID === 'openai')).toEqual(f.catalog);
  expect(
    models
      .filter((m) => m.providerID === 'other')
      .every((m) => m.cost.length > 0),
  ).toBe(true);
});

test('explicit transport and encoding survive defaults; missing OpenAI templates add no aliases', async () => {
  const f = fixture();
  await registerProviders(f.ctx, f.registry);
  f.records().set('openai', {
    ...f.original,
    provider: {
      ...f.original.provider,
      settings: { transport: 'http', encoding: 'none' },
    },
  });
  f.transformProviders();
  expect(
    required(f.records().get('openai-codex-2')).provider.settings,
  ).toMatchObject({
    transport: 'http',
    encoding: 'none',
    baseURL: 'https://chatgpt.com/backend-api/codex',
  });
  const missing = fixture();
  await registerProviders(missing.ctx, missing.registry);
  missing.records().delete('openai');
  expect(() => missing.transformProviders()).not.toThrow();
  expect([...missing.records().keys()]).toEqual(['other']);
});
