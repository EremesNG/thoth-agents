import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Plugin } from '@opencode/plugin';
import type { RpcHandlers } from '@opencode/plugin/promise/rpc';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { OpenCodeDependencies } from './context';
import { ToolsOverrideStore } from './tool-overrides';
import {
  type ToolRpcInput,
  type ToolRpcMethod,
  type ToolRpcOutput,
  toolRpc,
} from './tool-rpc';
import { registerToolRpc } from './tool-rpc-handlers';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
async function host() {
  const dir = mkdtempSync(join(tmpdir(), 'thoth-tool-rpc-'));
  directories.push(dir);
  const store = new ToolsOverrideStore({
    cwd: dir,
    configDir: join(dir, 'config'),
  });
  const toolState = {
    store,
    state: store.resolve(),
    refresh: vi.fn(() => {
      toolState.state = store.resolve();
    }),
  };
  const deps = {
    toolState,
    agents: {
      explorer: { permission: { edit: 'deny', read: 'allow', task: 'deny' } },
      librarian: {},
      oracle: {},
      designer: {},
      worker: {},
    },
  } as unknown as OpenCodeDependencies;
  let handlers: RpcHandlers<typeof toolRpc>;
  const ctx = {
    tool: {
      list: vi.fn(async () => [
        { id: 'write-id', name: 'write', options: { permission: 'edit' } },
        { id: 'patch-id', name: 'patch', options: { permission: 'edit' } },
        { id: 'read', name: 'read' },
      ]),
    },
    agent: { reload: vi.fn(async () => {}) },
    rpc: {
      register: vi.fn(async (_contract, registered) => {
        handlers = registered;
      }),
    },
  };
  await registerToolRpc(ctx as unknown as Plugin.Context, deps);
  async function call<M extends ToolRpcMethod>(
    method: M,
    input: ToolRpcInput<M>,
  ): Promise<ToolRpcOutput<M>> {
    const output = await (
      handlers[method] as (input: ToolRpcInput<M>) => Promise<ToolRpcOutput<M>>
    )(input);
    toolRpc.methods[method].output.parse(output);
    z.json().parse(output);
    return output;
  }
  return { ctx, deps, store, call };
}

it('groups inventory by permission action, evaluates shipped defaults, and exposes locked subagent without a session', async () => {
  const { call } = await host();
  const output = await call('state', {});
  expect(output.ok).toBe(true);
  if (!output.ok) return;
  expect([...output.value.specialists].sort()).toEqual([
    'designer',
    'explorer',
    'librarian',
    'oracle',
    'worker',
  ]);
  expect(output.value.inventory).toEqual([
    { action: 'edit', tools: ['patch-id', 'write-id'], locked: false },
    { action: 'read', tools: ['read'], locked: false },
    { action: 'subagent', tools: [], locked: true },
  ]);
  expect(
    output.value.roles.find(({ role }) => role === 'explorer'),
  ).toMatchObject({
    role: 'explorer',
    effectiveScope: 'default',
    global: { present: false, revision: 'missing', overrides: [] },
    actions: [
      {
        action: 'edit',
        baseEffect: 'deny',
        effect: 'deny',
        origin: 'default',
        locked: false,
      },
      {
        action: 'read',
        baseEffect: 'allow',
        effect: 'allow',
        origin: 'default',
        locked: false,
      },
      {
        action: 'subagent',
        baseEffect: 'deny',
        effect: 'deny',
        origin: 'default',
        locked: true,
      },
    ],
  });
});

it('saves ordered rules, shows zero-match patterns, replaces global per role, and resets to inheritance', async () => {
  const { call, ctx, deps } = await host();
  const global = await call('save', {
    scope: 'global',
    role: 'explorer',
    baseRevision: 'missing',
    overrides: [
      { action: '*', effect: 'allow' },
      { action: 'offline_*', effect: 'deny' },
    ],
  });
  expect(global.ok).toBe(true);
  if (!global.ok) return;
  const explorer = global.value.roles.find(({ role }) => role === 'explorer');
  expect(explorer).toMatchObject({
    effectiveScope: 'global',
    global: {
      present: true,
      overrides: [
        { action: '*', effect: 'allow', matchCount: 3 },
        { action: 'offline_*', effect: 'deny', matchCount: 0 },
      ],
    },
    actions: [
      { action: 'edit', baseEffect: 'deny', effect: 'allow', origin: 'global' },
      {
        action: 'read',
        baseEffect: 'allow',
        effect: 'allow',
        origin: 'global',
      },
      {
        action: 'subagent',
        baseEffect: 'deny',
        effect: 'deny',
        origin: 'default',
      },
    ],
  });
  const project = await call('save', {
    scope: 'project',
    role: 'explorer',
    baseRevision: 'missing',
    overrides: [],
  });
  expect(project.ok).toBe(true);
  if (!project.ok) return;
  const local = project.value.roles.find(({ role }) => role === 'explorer');
  expect(local).toMatchObject({
    effectiveScope: 'project',
    project: { present: true, overrides: [] },
    actions: expect.arrayContaining([
      expect.objectContaining({
        action: 'edit',
        effect: 'deny',
        origin: 'default',
      }),
    ]),
  });
  const reset = await call('reset', {
    scope: 'project',
    role: 'explorer',
    baseRevision: local?.project.revision ?? '',
  });
  expect(reset.ok).toBe(true);
  if (reset.ok)
    expect(
      reset.value.roles.find(({ role }) => role === 'explorer'),
    ).toMatchObject({ effectiveScope: 'global', project: { present: false } });
  expect(deps.toolState.refresh).toHaveBeenCalledTimes(3);
  expect(ctx.agent.reload).toHaveBeenCalledTimes(3);
});

it('returns typed conflicts and invalid requests without reloading or changing files', async () => {
  const { call, store, ctx } = await host();
  const saved = store.save(
    'global',
    'worker',
    [{ action: 'read', effect: 'deny' }],
    'missing',
  );
  for (const method of ['save', 'reset'] as const) {
    const result = await call(method, {
      scope: 'global',
      role: 'explorer',
      baseRevision: 'missing',
      overrides: [],
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'TOOLS_CONFLICT' },
    });
  }
  expect(
    await call('save', {
      scope: 'global',
      role: 'explorer',
      baseRevision: saved.revision,
      overrides: [{ action: 'subagent', effect: 'allow' }],
    }),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  expect(
    await call('save', {
      scope: 'global',
      role: 'explorer',
      baseRevision: saved.revision,
      overrides: [{ action: ' ', effect: 'deny' }],
    }),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  expect(
    await call('reset', {
      scope: 'session',
      role: 'orchestrator',
      baseRevision: '',
    } as never),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  expect(store.read('global').revision).toBe(saved.revision);
  expect(ctx.agent.reload).not.toHaveBeenCalled();
});

it('requires a concrete shipped base effect on every action row', async () => {
  const { call } = await host();
  const output = await call('state', {});
  if (!output.ok) throw new Error(output.error.message);
  for (const role of output.value.roles) {
    for (const action of role.actions) {
      expect(['allow', 'ask', 'deny']).toContain(action.baseEffect);
    }
  }
  expect(
    output.value.roles.find(({ role }) => role === 'librarian')?.actions[0]
      ?.baseEffect,
  ).toBe('ask');
  const row = output.value.roles[0]?.actions[0];
  if (!row) throw new Error('Missing action row');
  for (const baseEffect of [undefined, 'default']) {
    Object.assign(row, { baseEffect });
    expect(toolRpc.methods.state.output.safeParse(output).success).toBe(false);
  }
});

it('uses effective IDs for namespaced tools without permission metadata', async () => {
  const { ctx, call } = await host();
  ctx.tool.list.mockResolvedValueOnce([
    { id: 'server_lookup', name: 'lookup' },
  ] as never);
  const result = await call('state', {});
  expect(result.ok && result.value.inventory).toContainEqual({
    action: 'server_lookup',
    tools: ['server_lookup'],
    locked: false,
  });
});

it('serializes calls through reload and recovers after a reload error', async () => {
  const { ctx, call, deps } = await host();
  let finish = () => {};
  const reloading = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started = () => {};
  const reloadStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  ctx.agent.reload.mockImplementationOnce(async () => {
    started();
    await reloading;
    throw new Error('reload failed');
  });
  const save = call('save', {
    scope: 'global',
    role: 'explorer',
    baseRevision: 'missing',
    overrides: [{ action: 'edit', effect: 'allow' }],
  });
  await reloadStarted;
  const reset = call('reset', {
    scope: 'global',
    role: 'explorer',
    baseRevision: 'missing',
  });
  expect(deps.toolState.state.effective.explorer).toMatchObject({
    origin: 'global',
  });
  expect(ctx.tool.list).not.toHaveBeenCalled();
  finish();
  expect(await save).toMatchObject({
    ok: false,
    error: { code: 'OPERATION_FAILED', message: 'reload failed' },
  });
  expect(await reset).toMatchObject({
    ok: false,
    error: { code: 'TOOLS_CONFLICT' },
  });
  const state = await call('state', {});
  expect(
    state.ok &&
      state.value.roles.find(({ role }) => role === 'explorer')?.effectiveScope,
  ).toBe('global');
});

it('exposes invalid-file warnings and returns JSON-safe inventory errors', async () => {
  const { store, ctx, call } = await host();
  mkdirSync(dirname(store.paths.project), { recursive: true });
  writeFileSync(store.paths.project, '{broken');
  const state = await call('state', {});
  expect(state.ok && state.value.warnings.length).toBeGreaterThan(0);
  ctx.tool.list.mockRejectedValueOnce(new Error('inventory offline'));
  expect(await call('state', {})).toMatchObject({
    ok: false,
    error: { code: 'OPERATION_FAILED', message: 'inventory offline' },
  });
  expect((await call('state', {})).ok).toBe(true);
});
