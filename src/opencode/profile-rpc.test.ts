import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from '@opencode/plugin';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { registerAgents } from './agents';
import { loadOpenCodeDependencies, type OpenCodeDependencies } from './context';
import {
  type ProfileRpcInput,
  type ProfileRpcMethod,
  type ProfileRpcOutput,
  profileRpc,
} from './profile-rpc';
import { registerProfileRpc } from './profile-rpc-handlers';
import { registerProfileRuntime } from './profile-runtime';
import { ModelProfileStore, PROFILE_ROLES } from './profiles';

type Handlers = {
  [M in ProfileRpcMethod]: (
    input: ProfileRpcInput<M>,
  ) => Promise<ProfileRpcOutput<M>>;
};
const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
async function setup(shared?: {
  storage: Map<string, unknown>;
  global: string;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-rpc-'));
  directories.push(dir);
  const roster = {
    orchestrator: { model: 'p/base', variant: 'high' },
    worker: { model: 'p/base' },
  };
  const store = new ModelProfileStore({
    cwd: dir,
    roster,
    paths: {
      global: shared?.global ?? path.join(dir, 'g.json'),
      project: path.join(dir, '.opencode', 'thoth', 'profiles.json'),
    },
  });
  if (!shared)
    store.create('global', 'fast', {
      agents: { orchestrator: { model: 'p/fast', variant: 'low' } },
    });
  const storage = shared?.storage ?? new Map<string, unknown>();
  const switchModel = vi.fn(async () => {});
  const reload = vi.fn(async () => {});
  const refresh = vi.fn();
  let handlers!: Handlers;
  const ctx = {
    storage: {
      get: async (k: string) => storage.get(k),
      set: async (k: string, v: unknown) => {
        storage.set(k, v);
      },
      remove: async (k: string) => {
        storage.delete(k);
      },
      scan: async ({ prefix, after }: { prefix: string; after?: string }) => {
        const keys = [...storage.keys()]
          .filter((key) => key.startsWith(prefix) && (!after || key > after))
          .sort();
        const key = keys[0];
        return {
          entries: key ? [{ key, value: storage.get(key) }] : [],
          ...(keys.length > 1 ? { next: key } : {}),
        };
      },
    },
    session: {
      switchModel,
      get: vi.fn(async () => ({
        model: { providerID: 'p', id: 'base', variant: 'high' },
      })),
    },
    agent: {
      reload,
      get: vi.fn(async () => ({
        data: { model: { providerID: 'p', id: 'fast' } },
      })),
    },
    provider: {
      list: vi.fn(async () => ({ data: [{ id: 'p', name: 'Provider' }] })),
    },
    model: {
      list: vi.fn(async () => ({
        data: ['base', 'fast'].map((id) => ({
          providerID: 'p',
          id,
          name: id,
          enabled: true,
          variants: [{ id: 'high' }, { id: 'low' }],
        })),
      })),
    },
    rpc: {
      register: vi.fn(async (_definition: unknown, value: Handlers) => {
        // OpenCode parses Standard Schema outputs before the HTTP layer
        // requires JSON values. Optional Zod keys can still contain undefined.
        handlers = Object.fromEntries(
          Object.entries(value).map(([method, run]) => [
            method,
            async (input: never) => {
              const output = await run(input);
              const parsed =
                await profileRpc.methods[method as ProfileRpcMethod].output[
                  '~standard'
                ].validate(output);
              expect(parsed.issues).toBeUndefined();
              if (parsed.issues) throw new Error('Invalid RPC output');
              z.json().parse(parsed.value);
              return parsed.value;
            },
          ]),
        ) as Handlers;
      }),
    },
  };
  await registerProfileRpc(
    ctx as unknown as Plugin.Context,
    {
      directory: dir,
      profileState: { store, roster, refresh },
    } as unknown as OpenCodeDependencies,
  );
  return { handlers, store, storage, switchModel, reload, refresh, ctx };
}

it.each([
  undefined,
  's',
])('encodes a full agents profile and mixed provider catalog (session: %s)', async (sessionID) => {
  const { handlers, store, ctx } = await setup();
  const variants = ['low', 'medium', 'xhigh'];
  store.create('global', 'agents', {
    agents: Object.fromEntries(
      PROFILE_ROLES.map((role, index) => [
        role,
        { model: 'openai/gpt-6.1-sol', variant: variants[index % 3] },
      ]),
    ),
  });
  store.setGlobalActive('agents');
  ctx.provider.list.mockResolvedValue({
    data: [
      { id: 'openai', name: 'OpenAI' },
      { id: 'opencode', name: 'OpenCode' },
      { id: 'empty', name: 'No enabled models' },
    ],
  });
  ctx.model.list.mockResolvedValue({
    data: [
      {
        providerID: 'openai',
        id: 'gpt-6.1-sol',
        name: 'GPT 6.1 Sol',
        enabled: true,
        variants: variants.map((id) => ({ id })),
      },
      {
        providerID: 'opencode',
        id: 'free',
        name: 'Free model',
        enabled: true,
        variants: [],
      },
      {
        providerID: 'empty',
        id: 'disabled',
        name: 'Disabled model',
        enabled: false,
        variants: [],
      },
    ],
  });
  const result = await handlers.state(sessionID ? { sessionID } : {});
  expect(result).toMatchObject({
    ok: true,
    value: {
      selections: { global: 'agents' },
      effective: { name: 'agents', selectedBy: 'global' },
      providers: [
        {
          id: 'openai',
          models: [{ id: 'gpt-6.1-sol', variants }],
        },
        { id: 'opencode', models: [{ id: 'free', variants: [] }] },
        { id: 'empty', models: [] },
      ],
    },
  });
  if (!result.ok) throw new Error('Expected state');
  expect(result.value.selections).toEqual({ global: 'agents' });
  expect(Object.hasOwn(result.value, 'orchestrator')).toBe(!!sessionID);
});

it('activates a session selection durably and switches its orchestrator without reloading defaults', async () => {
  const { handlers, storage, switchModel, reload, store } = await setup();
  const result = await handlers.activate({
    sessionID: 's',
    scope: 'session',
    name: 'fast',
  });
  expect(result.ok && result.value.effective.selectedBy).toBe('session');
  expect(storage.get('model-profiles/session/s')).toMatchObject({
    name: 'fast',
    projectDir: path.dirname(path.dirname(path.dirname(store.paths.project))),
  });
  expect(switchModel).toHaveBeenCalledWith({
    sessionID: 's',
    model: { providerID: 'p', id: 'fast', variant: 'low' },
  });
  expect(reload).not.toHaveBeenCalled();
});

it.each([
  'global',
  'project',
] as const)('persists %s activation, refreshes defaults before reload, and switches the current session', async (scope) => {
  const { handlers, store, refresh, reload, switchModel } = await setup();
  const result = await handlers.activate({
    sessionID: 's',
    scope,
    name: 'fast',
  });
  expect(result.ok && result.value.effective.selectedBy).toBe(scope);
  expect(store.read(scope).active).toBe('fast');
  expect(refresh).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
  expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
    reload.mock.invocationCallOrder[0],
  );
  expect(switchModel).toHaveBeenCalledWith({
    sessionID: 's',
    model: { providerID: 'p', id: 'fast', variant: 'low' },
  });
});

it.each([
  'session',
  'project',
  'global',
] as const)('clears %s and switches to the newly effective default', async (scope) => {
  const { handlers, store, storage, switchModel, reload } = await setup();
  await handlers.activate({ sessionID: 's', scope, name: 'fast' });
  reload.mockClear();
  switchModel.mockClear();
  const result = await handlers.clear({ sessionID: 's', scope });
  expect(result.ok && result.value.effective.selectedBy).toBe('default');
  expect(storage.get('model-profiles/session/s')).toBeUndefined();
  expect(store.read('global').active).toBeUndefined();
  expect(store.read('project').active).toBeUndefined();
  expect(switchModel).toHaveBeenCalledWith({
    sessionID: 's',
    model: { providerID: 'p', id: 'base', variant: 'high' },
  });
  expect(reload).toHaveBeenCalledTimes(scope === 'session' ? 0 : 1);
});

it('preserves session precedence when activating or clearing a masked global selection', async () => {
  const { handlers, store, switchModel } = await setup();
  await handlers.activate({
    sessionID: 's',
    scope: 'session',
    name: 'default',
  });
  const result = await handlers.activate({
    sessionID: 's',
    scope: 'global',
    name: 'fast',
  });
  expect(store.read('global').active).toBe('fast');
  expect(result.ok && result.value.effective).toMatchObject({
    name: 'default',
    selectedBy: 'session',
  });
  expect(switchModel).toHaveBeenLastCalledWith({
    sessionID: 's',
    model: { providerID: 'p', id: 'base', variant: 'high' },
  });
});

it.each([
  'session',
  'global',
  'project',
] as const)('rejects unavailable models at %s without changing any state', async (scope) => {
  const { handlers, store, storage, refresh, reload, switchModel } =
    await setup();
  store.create('global', 'missing', {
    agents: { worker: { model: 'absent/model' } },
  });
  const before = store.read('global');
  const result = await handlers.activate({
    sessionID: 's',
    scope,
    name: 'missing',
  });
  expect(result).toMatchObject({
    ok: false,
    error: {
      code: 'MODEL_UNAVAILABLE',
      message: expect.stringContaining('Nothing changed'),
    },
  });
  expect(store.read('global')).toEqual(before);
  expect(store.read('project').active).toBeUndefined();
  expect(storage.size).toBe(0);
  expect(refresh).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(switchModel).not.toHaveBeenCalled();
});

it.each([
  { operation: 'activate', scope: 'global', variant: false },
  { operation: 'activate', scope: 'project', variant: false },
  { operation: 'clear', scope: 'global', variant: false },
  { operation: 'clear', scope: 'project', variant: false },
  { operation: 'activate', scope: 'global', variant: true },
  { operation: 'activate', scope: 'project', variant: true },
  { operation: 'clear', scope: 'global', variant: true },
  { operation: 'clear', scope: 'project', variant: true },
] as const)('rejects session-masked unavailable defaults on $scope $operation (variant: $variant) without effects', async ({
  operation,
  scope,
  variant,
}) => {
  const h = await setup();
  expect(
    await h.handlers.activate({
      sessionID: 's',
      scope: 'session',
      name: 'fast',
    }),
  ).toMatchObject({ ok: true });
  const unavailable = {
    agents: {
      worker: variant
        ? { model: 'p/base', variant: 'unknown' }
        : { model: 'missing/model' },
    },
  };
  h.store.create('global', 'target', { agents: {} });
  h.store.create('project', 'target', unavailable);
  if (operation === 'clear') {
    // Clearing a project pin exposes global active (with project shadowing);
    // clearing global active must still validate an unchanged project pin.
    h.store.setGlobalActive(scope === 'project' ? 'target' : 'fast');
    h.store.setProjectPin(scope === 'project' ? 'fast' : 'target');
  }
  const fileContents = () =>
    [h.store.paths.global, h.store.paths.project].map((file) =>
      fs.readFileSync(file, 'utf8'),
    );
  const beforeFiles = fileContents();
  const beforeStorage = structuredClone([...h.storage]);
  const set = vi.spyOn(h.ctx.storage, 'set');
  const remove = vi.spyOn(h.ctx.storage, 'remove');
  h.refresh.mockClear();
  h.reload.mockClear();
  h.switchModel.mockClear();

  const result =
    operation === 'activate'
      ? await h.handlers.activate({ sessionID: 's', scope, name: 'target' })
      : await h.handlers.clear({ sessionID: 's', scope });

  expect(result).toMatchObject({
    ok: false,
    error: {
      code: 'MODEL_UNAVAILABLE',
      message: expect.stringContaining('target'),
    },
  });
  if (result.ok) throw new Error('Expected unavailable defaults');
  expect(result.error.message).toContain('worker');
  expect(result.error.message).toContain(
    variant ? 'p/base#unknown' : 'missing/model',
  );
  expect(fileContents()).toEqual(beforeFiles);
  expect([...h.storage]).toEqual(beforeStorage);
  expect(set).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(h.refresh).not.toHaveBeenCalled();
  expect(h.reload).not.toHaveBeenCalled();
  expect(h.switchModel).not.toHaveBeenCalled();
});

it.each([
  { operation: 'activate', scope: 'global' },
  { operation: 'activate', scope: 'project' },
  { operation: 'clear', scope: 'global' },
  { operation: 'clear', scope: 'project' },
] as const)('rejects unavailable session results despite valid defaults on $scope $operation', async ({
  operation,
  scope,
}) => {
  const h = await setup();
  expect(
    await h.handlers.activate({
      sessionID: 's',
      scope: 'session',
      name: 'fast',
    }),
  ).toMatchObject({ ok: true });
  // A draft can become unavailable after the session selected it.
  h.store.save('global', 'fast', {
    agents: { worker: { model: 'missing/model' } },
  });
  const before = [
    h.store.read('global'),
    h.store.read('project'),
    [...h.storage],
  ];
  h.switchModel.mockClear();
  const result =
    operation === 'activate'
      ? await h.handlers.activate({ sessionID: 's', scope, name: 'default' })
      : await h.handlers.clear({ sessionID: 's', scope });
  expect(result).toMatchObject({
    ok: false,
    error: {
      code: 'MODEL_UNAVAILABLE',
      message: expect.stringContaining('fast'),
    },
  });
  expect([
    h.store.read('global'),
    h.store.read('project'),
    [...h.storage],
  ]).toEqual(before);
  expect(h.refresh).not.toHaveBeenCalled();
  expect(h.reload).not.toHaveBeenCalled();
  expect(h.switchModel).not.toHaveBeenCalled();
});

it('rejects unavailable variants and unavailable fallback revealed by clear without mutation', async () => {
  const { handlers, store, storage } = await setup();
  store.create('global', 'bad', {
    agents: { orchestrator: { model: 'p/fast', variant: 'unknown' } },
  });
  expect(
    await handlers.activate({ sessionID: 's', scope: 'global', name: 'bad' }),
  ).toMatchObject({ ok: false, error: { code: 'MODEL_UNAVAILABLE' } });
  store.setGlobalActive('bad');
  await handlers.activate({ sessionID: 's', scope: 'session', name: 'fast' });
  expect(
    await handlers.clear({ sessionID: 's', scope: 'session' }),
  ).toMatchObject({ ok: false, error: { code: 'MODEL_UNAVAILABLE' } });
  expect(storage.get('model-profiles/session/s')).toMatchObject({
    name: 'fast',
    projectDir: expect.any(String),
  });
});

it('returns portable state with shadowed entries, revision tokens, roles, default, selection provenance and catalog', async () => {
  const { handlers, store, ctx } = await setup();
  store.create('project', 'fast', { agents: { worker: { model: 'p/fast' } } });
  store.setProjectPin('fast');
  const result = await handlers.state({ sessionID: 's' });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.profiles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'fast',
        source: 'global',
        shadowed: true,
        revision: expect.any(String),
      }),
      expect.objectContaining({
        name: 'fast',
        source: 'project',
        shadowed: false,
      }),
    ]),
  );
  expect(result.value.defaultProfile.agents.orchestrator).toEqual({
    model: 'p/base',
    variant: 'high',
  });
  expect(result.value.effective).toMatchObject({
    name: 'fast',
    selectedBy: 'project',
    source: 'project',
  });
  expect(result.value.roles).toHaveLength(6);
  expect(result.value.orchestrator).toEqual({
    model: 'p/base',
    variant: 'high',
  });
  expect(result.value.providers[0]).toMatchObject({
    id: 'p',
    models: expect.arrayContaining([
      { id: 'fast', name: 'fast', variants: ['high', 'low'] },
    ]),
  });
  expect(profileRpc.methods.state.output.safeParse(result).success).toBe(true);
  expect(ctx.rpc.register).toHaveBeenCalledWith(profileRpc, expect.any(Object));
  expect(profileRpc.events).toEqual({});
});

it('creates and saves full drafts, returning a typed conflict when the baseline is stale', async () => {
  const { handlers, store } = await setup();
  const created = await handlers.create({
    scope: 'project',
    name: 'draft',
    profile: { agents: {} },
  });
  expect(created.ok).toBe(true);
  if (!created.ok) return;
  const changed = { agents: { worker: { model: 'p/fast' } } };
  const saved = await handlers.save({
    scope: 'project',
    name: 'draft',
    profile: changed,
    baseRevision: created.value.revision,
  });
  expect(saved.ok).toBe(true);
  expect(store.lookup('draft')?.profile).toEqual(changed);
  expect(
    await handlers.save({
      scope: 'project',
      name: 'draft',
      profile: { agents: {} },
      baseRevision: created.value.revision,
    }),
  ).toMatchObject({ ok: false, error: { code: 'PROFILE_CONFLICT' } });
  expect(store.lookup('draft')?.profile).toEqual(changed);
});

it('keeps all resolving session selections effective after rename, including later scan pages', async () => {
  const { handlers, storage, store } = await setup();
  for (const sessionID of ['s', 'other'])
    expect(
      await handlers.activate({ sessionID, scope: 'session', name: 'fast' }),
    ).toMatchObject({ ok: true });
  storage.set('model-profiles/session/unrelated', 'default');
  storage.set('other-plugin-key', 'fast');
  store.setGlobalActive('fast');
  store.setProjectPin('fast');
  expect(
    await handlers.rename({
      scope: 'global',
      name: 'fast',
      newName: 'renamed',
    }),
  ).toEqual({ ok: true, value: {} });
  for (const sessionID of ['s', 'other']) {
    const result = await handlers.state({ sessionID });
    expect(result).toMatchObject({
      ok: true,
      value: {
        selections: { session: 'renamed' },
        effective: {
          name: 'renamed',
          source: 'global',
          selectedBy: 'session',
          profile: {
            agents: { orchestrator: { model: 'p/fast', variant: 'low' } },
          },
        },
        warnings: [],
      },
    });
  }
  expect(storage.get('model-profiles/session/unrelated')).toBe('default');
  expect(storage.get('other-plugin-key')).toBe('fast');
  expect(store.read('global').active).toBe('renamed');
  expect(store.read('project').active).toBe('renamed');
  expect(
    await handlers.delete({ scope: 'global', name: 'renamed' }),
  ).toMatchObject({ ok: true });
  for (const sessionID of ['s', 'other'])
    expect(await handlers.state({ sessionID })).toMatchObject({
      ok: true,
      value: {
        effective: { name: 'default', selectedBy: 'default' },
        warnings: [],
      },
    });
});

it.each([
  'global',
  'project',
] as const)('rename of %s respects same-name project shadowing', async (scope) => {
  const { handlers, store } = await setup();
  store.create('project', 'fast', { agents: { worker: { model: 'p/fast' } } });
  await handlers.activate({ sessionID: 's', scope: 'session', name: 'fast' });
  expect(
    await handlers.rename({ scope, name: 'fast', newName: 'renamed' }),
  ).toMatchObject({ ok: true });
  const name = scope === 'project' ? 'renamed' : 'fast';
  expect(await handlers.state({ sessionID: 's' })).toMatchObject({
    ok: true,
    value: {
      selections: { session: name },
      effective: {
        name,
        source: 'project',
        selectedBy: 'session',
        profile: { agents: { worker: { model: 'p/fast' } } },
      },
      warnings: [],
    },
  });
});

it.each([
  'global',
  'project',
] as const)('delete of %s clears only resolving session selections like Pi', async (scope) => {
  const { handlers, store, storage } = await setup();
  store.create('project', 'fast', { agents: {} });
  for (const sessionID of ['s', 'other'])
    await handlers.activate({ sessionID, scope: 'session', name: 'fast' });
  expect(await handlers.delete({ scope, name: 'fast' })).toMatchObject({
    ok: true,
  });
  for (const sessionID of ['s', 'other']) {
    expect(storage.get(`model-profiles/session/${sessionID}`)).toEqual(
      scope === 'project'
        ? undefined
        : { name: 'fast', projectDir: expect.any(String) },
    );
    expect(await handlers.state({ sessionID })).toMatchObject({
      ok: true,
      value: {
        effective: {
          name: scope === 'project' ? 'default' : 'fast',
          selectedBy: scope === 'project' ? 'default' : 'session',
        },
        warnings: [],
      },
    });
  }
});

it('renames and deletes profiles and rejects every write to the virtual default', async () => {
  const { handlers, store } = await setup();
  expect(
    await handlers.rename({
      scope: 'global',
      name: 'fast',
      newName: 'renamed',
    }),
  ).toEqual({ ok: true, value: {} });
  expect(store.lookup('fast')).toBeUndefined();
  expect(store.lookup('renamed')).toBeDefined();
  expect(await handlers.delete({ scope: 'global', name: 'renamed' })).toEqual({
    ok: true,
    value: {},
  });
  expect(store.lookup('renamed')).toBeUndefined();
  for (const result of [
    await handlers.create({
      scope: 'global',
      name: 'default',
      profile: { agents: {} },
    }),
    await handlers.save({
      scope: 'global',
      name: 'default',
      profile: { agents: {} },
      baseRevision: '',
    }),
    await handlers.rename({ scope: 'global', name: 'default', newName: 'x' }),
    await handlers.rename({ scope: 'global', name: 'x', newName: 'default' }),
    await handlers.delete({ scope: 'global', name: 'default' }),
  ])
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
});

it('reload reapplies the registered transform from refreshed mutable defaults', async () => {
  const h = await setup();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-reload-'));
  directories.push(directory);
  vi.stubEnv('OPENCODE_CONFIG_DIR', path.join(directory, 'config'));
  const ctx = {
    ...h.ctx,
    location: { directory },
  } as unknown as Plugin.Context;
  const deps = loadOpenCodeDependencies(ctx);
  const modelUpdates: unknown[] = [];
  let transform!: Parameters<Plugin.Context['agent']['transform']>[0];
  const editor = {
    update: (_id: string, run: (agent: Record<string, unknown>) => void) => {
      const agent = {};
      run(agent);
      modelUpdates.push(agent);
    },
    default: () => {},
    remove: () => {},
  } as unknown as Parameters<typeof transform>[0];
  ctx.agent.transform = async (callback) => {
    transform = callback;
    return { dispose: async () => {} };
  };
  h.reload.mockImplementation(async () => {
    await transform(editor);
  });
  await registerAgents(ctx, deps);
  await registerProfileRpc(ctx, deps);
  deps.profileState.store.create('global', 'complete', {
    agents: Object.fromEntries(
      [
        'orchestrator',
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'worker',
      ].map((role) => [role, { model: 'p/fast', variant: 'low' }]),
    ),
  });
  // Use the handlers registered with the real dependencies.
  const handlers = h.ctx.rpc.register.mock.calls.at(-1)?.[1];
  expect(
    await handlers?.activate({
      sessionID: 's',
      scope: 'global',
      name: 'complete',
    }),
  ).toMatchObject({ ok: true });
  expect(modelUpdates).toHaveLength(6);
  for (const agent of modelUpdates)
    expect(agent).toMatchObject({
      model: { providerID: 'p', id: 'fast', variant: 'low' },
    });
});

it('clearing selections reveals project then global then virtual default', async () => {
  const { handlers, store, storage } = await setup();
  store.create('project', 'pinned', { agents: {} });
  store.setGlobalActive('fast');
  store.setProjectPin('pinned');
  storage.set('model-profiles/session/s', 'default');
  const session = await handlers.clear({ sessionID: 's', scope: 'session' });
  expect(session.ok && session.value.effective).toMatchObject({
    name: 'pinned',
    selectedBy: 'project',
  });
  const project = await handlers.clear({ sessionID: 's', scope: 'project' });
  expect(project.ok && project.value.effective).toMatchObject({
    name: 'fast',
    selectedBy: 'global',
  });
  const global = await handlers.clear({ sessionID: 's', scope: 'global' });
  expect(global.ok && global.value.effective).toMatchObject({
    name: 'default',
    selectedBy: 'default',
  });
});

it('serializes concurrent draft saves and rejects the second stale revision', async () => {
  const { handlers } = await setup();
  const state = await handlers.state({ sessionID: 's' });
  if (!state.ok) throw new Error('Expected state');
  const input = {
    scope: 'global' as const,
    name: 'fast',
    baseRevision: state.value.profiles[0].revision,
  };
  const [first, second] = await Promise.all([
    handlers.save({ ...input, profile: { agents: {} } }),
    handlers.save({
      ...input,
      profile: { agents: { worker: { model: 'p/fast' } } },
    }),
  ]);
  expect(first.ok).toBe(true);
  expect(second).toMatchObject({
    ok: false,
    error: { code: 'PROFILE_CONFLICT' },
  });
});

it('reports dangling selections with warnings and captures inherited host agent defaults', async () => {
  const { handlers, storage, ctx } = await setup();
  storage.set('model-profiles/session/s', 'deleted');
  ctx.session.get.mockResolvedValue(
    {} as Awaited<ReturnType<typeof ctx.session.get>>,
  );
  const result = await handlers.state({ sessionID: 's' });
  if (!result.ok) throw new Error('Expected state');
  expect(result.value.effective.selectedBy).toBe('default');
  expect(result.value.warnings).toEqual([
    expect.stringContaining('Missing session'),
  ]);
  expect(result.value.orchestrator).toEqual({ model: 'p/fast' });
});

it('captures the actual session model, not the selected profile', async () => {
  const { handlers, store } = await setup();
  store.setGlobalActive('fast');
  expect(await handlers.capture({ sessionID: 's' })).toEqual({
    ok: true,
    value: { model: 'p/base', variant: 'high' },
  });
});

it('resolves state without a session through project, global and default without consulting session APIs', async () => {
  const { handlers, store, storage, ctx } = await setup();
  storage.set('model-profiles/session/s', 'default');
  store.create('project', 'pinned', { agents: {} });
  store.setGlobalActive('fast');
  store.setProjectPin('pinned');
  for (const [name, selectedBy] of [
    ['pinned', 'project'],
    ['fast', 'global'],
    ['default', 'default'],
  ]) {
    const result = await handlers.state({});
    expect(result).toMatchObject({
      ok: true,
      value: { effective: { name, selectedBy } },
    });
    if (!result.ok) throw new Error('Expected state');
    expect(result.value.selections).not.toHaveProperty('session');
    expect(result.value).not.toHaveProperty('orchestrator');
    expect(profileRpc.methods.state.output.safeParse(result).success).toBe(
      true,
    );
    if (selectedBy === 'project') store.setProjectPin(undefined);
    else store.setGlobalActive(undefined);
  }
  expect(ctx.session.get).not.toHaveBeenCalled();
  expect(ctx.agent.get).not.toHaveBeenCalled();
});

it.each([
  'global',
  'project',
] as const)('activates and clears %s without a session, refreshing defaults but never switching a model', async (scope) => {
  const { handlers, store, storage, ctx, refresh, reload, switchModel } =
    await setup();
  const active = await handlers.activate({ scope, name: 'fast' });
  expect(active).toMatchObject({
    ok: true,
    value: { effective: { name: 'fast', selectedBy: scope } },
  });
  expect(store.read(scope).active).toBe('fast');
  const cleared = await handlers.clear({ scope });
  expect(cleared).toMatchObject({
    ok: true,
    value: { effective: { name: 'default', selectedBy: 'default' } },
  });
  expect(store.read(scope).active).toBeUndefined();
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(reload).toHaveBeenCalledTimes(2);
  expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
    reload.mock.invocationCallOrder[0],
  );
  expect(refresh.mock.invocationCallOrder[1]).toBeLessThan(
    reload.mock.invocationCallOrder[1],
  );
  expect(switchModel).not.toHaveBeenCalled();
  expect(ctx.session.get).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});

it('rejects session-only operations without a session before any effects', async () => {
  const { handlers, store, storage, refresh, reload, switchModel, ctx } =
    await setup();
  const before = store.read('global');
  const results = [
    await handlers.activate({ scope: 'session', name: 'fast' }),
    await handlers.clear({ scope: 'session' }),
    // Runtime clients may send invalid capture input despite the required type.
    await handlers.capture({} as ProfileRpcInput<'capture'>),
  ];
  for (const result of results)
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: expect.any(String) },
    });
  expect(store.read('global')).toEqual(before);
  expect(storage.size).toBe(0);
  expect(refresh).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(switchModel).not.toHaveBeenCalled();
  expect(ctx.session.get).not.toHaveBeenCalled();
});

it('maintains shared-KV session selections in their own projects on global rename', async () => {
  const a = await setup();
  const b = await setup({ storage: a.storage, global: a.store.paths.global });
  const c = await setup({ storage: a.storage, global: a.store.paths.global });
  b.store.create('project', 'fast', {
    agents: { worker: { model: 'p/base' } },
  });
  for (const [h, sessionID] of [
    [a, 'a'],
    [b, 'b'],
    [c, 'c'],
  ] as const)
    await h.handlers.activate({ sessionID, scope: 'session', name: 'fast' });
  expect(
    await a.handlers.rename({
      scope: 'global',
      name: 'fast',
      newName: 'renamed',
    }),
  ).toMatchObject({ ok: true });
  for (const [h, sessionID, name, source] of [
    [a, 'a', 'renamed', 'global'],
    [b, 'b', 'fast', 'project'],
    [c, 'c', 'renamed', 'global'],
  ] as const)
    expect(await h.handlers.state({ sessionID })).toMatchObject({
      ok: true,
      value: { effective: { name, source }, warnings: [] },
    });
});

it.each([
  'rename',
  'delete',
] as const)('isolates project %s with shared storage', async (operation) => {
  const a = await setup();
  const b = await setup({ storage: a.storage, global: a.store.paths.global });
  for (const [h, sessionID] of [
    [a, 'a'],
    [b, 'b'],
  ] as const) {
    h.store.create('project', 'fast', { agents: {} });
    await h.handlers.activate({ sessionID, scope: 'session', name: 'fast' });
  }
  expect(
    await a.handlers[operation]({
      scope: 'project',
      name: 'fast',
      newName: 'renamed',
    }),
  ).toMatchObject({ ok: true });
  expect(await b.handlers.state({ sessionID: 'b' })).toMatchObject({
    ok: true,
    value: { effective: { name: 'fast', source: 'project' }, warnings: [] },
  });
});

it.each([
  'session',
  'project',
  'global',
] as const)('rejects destination shadowing of a %s selection without any mutation', async (level) => {
  const h = await setup();
  h.store.create('project', 'target', { agents: {} });
  await h.handlers.activate({ sessionID: 's', scope: level, name: 'fast' });
  const before = [
    h.store.read('global'),
    h.store.read('project'),
    [...h.storage],
  ];
  expect(
    await h.handlers.rename({
      scope: 'global',
      name: 'fast',
      newName: 'target',
    }),
  ).toMatchObject({
    ok: false,
    error: {
      code: 'PROFILE_SHADOWED',
      message: expect.stringContaining('target'),
    },
  });
  expect([
    h.store.read('global'),
    h.store.read('project'),
    [...h.storage],
  ]).toEqual(before);
});

it('global delete preserves foreign local selections and clears foreign global selections', async () => {
  const a = await setup();
  const b = await setup({ storage: a.storage, global: a.store.paths.global });
  const c = await setup({ storage: a.storage, global: a.store.paths.global });
  b.store.create('project', 'fast', { agents: {} });
  for (const [h, sessionID] of [
    [b, 'b'],
    [c, 'c'],
  ] as const)
    await h.handlers.activate({ sessionID, scope: 'session', name: 'fast' });
  expect(
    await a.handlers.delete({ scope: 'global', name: 'fast' }),
  ).toMatchObject({ ok: true });
  expect(await b.handlers.state({ sessionID: 'b' })).toMatchObject({
    ok: true,
    value: {
      selections: { session: 'fast' },
      effective: { source: 'project' },
    },
  });
  expect(await c.handlers.state({ sessionID: 'c' })).toMatchObject({
    ok: true,
    value: { effective: { name: 'default' }, warnings: [] },
  });
  expect(c.storage.has('model-profiles/session/c')).toBe(false);
});

it('rejects a project rename that shadows an untouched global destination selection', async () => {
  const h = await setup();
  h.store.create('project', 'local', { agents: {} });
  await h.handlers.activate({ sessionID: 's', scope: 'session', name: 'fast' });
  const before = [h.store.read('project'), [...h.storage]];
  expect(
    await h.handlers.rename({
      scope: 'project',
      name: 'local',
      newName: 'fast',
    }),
  ).toMatchObject({ ok: false, error: { code: 'PROFILE_SHADOWED' } });
  expect([h.store.read('project'), [...h.storage]]).toEqual(before);
});

it('guards destination shadowing in another stored session project, including its pin', async () => {
  const a = await setup();
  const b = await setup({ storage: a.storage, global: a.store.paths.global });
  b.store.create('project', 'target', { agents: {} });
  await b.handlers.activate({ sessionID: 'b', scope: 'session', name: 'fast' });
  b.store.setProjectPin('fast');
  const before = [
    a.store.read('global'),
    b.store.read('project'),
    [...a.storage],
  ];
  expect(
    await a.handlers.rename({
      scope: 'global',
      name: 'fast',
      newName: 'target',
    }),
  ).toMatchObject({ ok: false, error: { code: 'PROFILE_SHADOWED' } });
  expect([
    a.store.read('global'),
    b.store.read('project'),
    [...a.storage],
  ]).toEqual(before);
});

it('injection reads structured selections after a shared-KV rename without changing models', async () => {
  const a = await setup();
  const b = await setup({ storage: a.storage, global: a.store.paths.global });
  const profile = { agents: { worker: { model: 'p/fast', variant: 'low' } } };
  a.store.save('global', 'fast', profile);
  await b.handlers.activate({ sessionID: 'b', scope: 'session', name: 'fast' });
  let inject!: (event: {
    tool: string;
    sessionID: string;
    input: unknown;
  }) => Promise<void>;
  await registerProfileRuntime(
    {
      ...b.ctx,
      tool: {
        hook: async (_name: string, callback: typeof inject) => {
          inject = callback;
        },
      },
    } as unknown as Plugin.Context,
    {
      directory: path.dirname(
        path.dirname(path.dirname(b.store.paths.project)),
      ),
      profileState: { store: b.store, roster: {} },
    } as unknown as OpenCodeDependencies,
  );
  for (const rename of [false, true]) {
    if (rename)
      expect(
        await a.handlers.rename({
          scope: 'global',
          name: 'fast',
          newName: 'renamed',
        }),
      ).toMatchObject({ ok: true });
    const input: Record<string, unknown> = { agent: 'worker' };
    await inject({ tool: 'subagent', sessionID: 'b', input });
    expect(input.model).toBe('p/fast#low');
  }
});

it('retargets a foreign project pin that used the renamed global profile', async () => {
  const a = await setup();
  const b = await setup({ storage: a.storage, global: a.store.paths.global });
  await b.handlers.activate({
    sessionID: 'b',
    scope: 'session',
    name: 'default',
  });
  b.store.setProjectPin('fast');
  expect(
    await a.handlers.rename({
      scope: 'global',
      name: 'fast',
      newName: 'renamed',
    }),
  ).toMatchObject({ ok: true });
  expect(b.store.read('project').active).toBe('renamed');
  expect(await b.handlers.state({})).toMatchObject({
    ok: true,
    value: { effective: { name: 'renamed', source: 'global' }, warnings: [] },
  });
});

it('rejects global active retargeting that would unshadow its original project profile', async () => {
  const h = await setup();
  h.store.create('project', 'fast', { agents: {} });
  h.store.setGlobalActive('fast');
  const before = [h.store.read('global'), h.store.read('project')];
  expect(
    await h.handlers.rename({
      scope: 'global',
      name: 'fast',
      newName: 'renamed',
    }),
  ).toMatchObject({ ok: false, error: { code: 'PROFILE_SHADOWED' } });
  expect([h.store.read('global'), h.store.read('project')]).toEqual(before);
});
