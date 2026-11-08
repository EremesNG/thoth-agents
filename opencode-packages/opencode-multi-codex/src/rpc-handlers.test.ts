import type { Plugin } from '@opencode/plugin';
import { describe, expect, it, vi } from 'vitest';
import type { CredentialSnapshot } from './accounts/registry.js';
import { AccountRegistry } from './accounts/registry.js';
import type { QuotaState } from './quota/quota.js';
import { SessionAccountOverrides } from './request/overrides.js';
import { registerCodexRpc } from './rpc-handlers.js';

function expectStrictJson(value: unknown): void {
  function visit(item: unknown, path: string): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean')
      return;
    if (typeof item === 'number') {
      expect(Number.isFinite(item), path).toBe(true);
      return;
    }
    expect(typeof item, path).toBe('object');
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index++)
        visit(item[index], `${path}[${index}]`);
      return;
    }
    expect(Object.getPrototypeOf(item), path).toBe(Object.prototype);
    for (const [key, child] of Object.entries(item as object))
      visit(child, `${path}.${key}`);
  }
  visit(value, 'output');
  expect(JSON.parse(JSON.stringify(value))).toStrictEqual(value);
}

async function fixture() {
  let saved: unknown;
  const snapshot = vi.fn(
    async (): Promise<CredentialSnapshot> => ({
      activeCredentialID: 'one',
      credentials: [
        { id: 'one', label: 'First' },
        { id: 'two', label: 'Second' },
      ],
    }),
  );
  const registry = new AccountRegistry(
    {
      get: async () => saved,
      set: async (_key, value) => {
        saved = value;
      },
    } as ConstructorParameters<typeof AccountRegistry>[0],
    {
      snapshot,
    },
  );
  const refreshProviders = vi.fn(async () => undefined);
  const overrides = new SessionAccountOverrides();
  const getQuota = vi.fn(
    async (accountNumber: number): Promise<QuotaState> => ({
      accountNumber,
      state: 'stale' as const,
      snapshot: { primary: { usedPercent: 25, resetAt: 123456 } },
    }),
  );
  const ctx = {
    rpc: { register: vi.fn() },
    integration: {
      list: async () => ({
        data: [
          {
            id: 'openai',
            connections: (await snapshot()).credentials.map((credential) => ({
              type: 'credential',
              ...credential,
            })),
          },
        ],
      }),
      connection: { active: async () => ({ type: 'credential', id: 'one' }) },
    },
  } as unknown as Plugin.Context;
  const config: { warning?: string } = {
    warning: 'Automatic switching is disabled.',
  };
  const blockedUntil = vi.fn((): number | null => 999999);
  const handlers = await registerCodexRpc(ctx, {
    registry,
    refreshProviders,
    requests: { overrides },
    quota: { getQuota },
    config,
    blockedUntil,
  });
  return {
    handlers,
    refreshProviders,
    overrides,
    getQuota,
    ctx,
    snapshot,
    config,
    blockedUntil,
  };
}

describe('multi-codex RPC', () => {
  it.each([
    undefined,
    NaN,
    Infinity,
    new Date(),
    1n,
    () => undefined,
  ])('detects non-JSON values in the output assertion (%s)', (invalid) => {
    expect(() => expectStrictJson({ nested: invalid })).toThrow();
  });
  it('preserves finite quota values and omits an unknown window reset', async () => {
    const f = await fixture();
    f.getQuota.mockResolvedValue({
      accountNumber: 1,
      state: 'fresh',
      fetchedAt: 123,
      snapshot: {
        primary: { usedPercent: 25 },
        secondary: { usedPercent: 50, resetAt: 456 },
      },
    });
    const result = await f.handlers.refreshQuota({ number: 1 });
    expectStrictJson(result);
    if (!result.ok) throw new Error('Expected account state');
    expect(result.value.accounts[0]?.quota).toStrictEqual({
      state: 'fresh',
      fetchedAt: 123,
      primary: { remainingPercent: 75 },
      secondary: { remainingPercent: 50, resetAt: 456 },
    });
  });
  it('keeps all methods JSON-safe with unknown quota, missing credentials and optional state', async () => {
    const f = await fixture();
    delete f.config.warning;
    f.blockedUntil.mockReturnValue(null);
    f.getQuota.mockImplementation(async (accountNumber) => ({
      accountNumber,
      state: 'unavailable',
    }));
    const outputs = [
      await f.handlers.state({}),
      await f.handlers.add({}),
      await f.handlers.add({}),
      await f.handlers.switch({ sessionID: 'parent', number: 2 }),
      await f.handlers.switch({ sessionID: 'parent', number: null }),
      await f.handlers.refreshQuota({}),
      await f.handlers.remove({ number: 2 }),
      await f.handlers.remove({ number: 99 }),
      await f.handlers.remove({ number: 1 }),
    ];
    expect(outputs[0]).toMatchObject({
      ok: true,
      value: {
        notices: [],
        sessionOverride: null,
        accounts: [{ blockedUntil: null, quota: { state: 'unavailable' } }],
      },
    });
    expect(outputs[1]).toMatchObject({ ok: true });
    expect(outputs[2]).toMatchObject({
      ok: true,
      value: { guidance: expect.any(String), unmappedCredentials: [] },
    });
    f.snapshot.mockResolvedValue({ credentials: [] });
    const missing = await f.handlers.state({});
    expect(missing).toMatchObject({
      ok: true,
      value: { accounts: [{ credentialState: 'missing' }] },
    });
    outputs.push(missing, await f.handlers.add({}));
    for (const output of outputs) expectStrictJson(output);
  });
  it.each([
    NaN,
    Infinity,
    -Infinity,
  ])('omits non-finite quota values (%s) and uses a nullable block', async (invalid) => {
    const f = await fixture();
    f.blockedUntil.mockReturnValue(invalid);
    f.getQuota.mockResolvedValue({
      accountNumber: 1,
      state: 'stale',
      fetchedAt: invalid,
      snapshot: {
        primary: { usedPercent: invalid },
        secondary: { usedPercent: 40, resetAt: invalid },
      },
    });
    const result = await f.handlers.state({});
    expectStrictJson(result);
    expect(result).toMatchObject({
      ok: true,
      value: {
        accounts: [
          {
            blockedUntil: null,
            quota: { state: 'stale', secondary: { remainingPercent: 60 } },
          },
        ],
      },
    });
    if (!result.ok) throw new Error('Expected account state');
    expect(result.value.accounts[0]?.quota).toStrictEqual({
      state: 'stale',
      secondary: { remainingPercent: 60 },
    });
  });
  it('returns strict JSON with absent quota fields omitted', async () => {
    const f = await fixture();
    const result = await f.handlers.state({});
    expectStrictJson(result);
    expect(result).toMatchObject({
      ok: true,
      value: {
        accounts: [
          {
            quota: {
              state: 'stale',
              primary: { remainingPercent: 75, resetAt: 123456 },
            },
          },
        ],
      },
    });
  });
  it('includes configuration warnings in status notices', async () => {
    const f = await fixture();
    expect(await f.handlers.state({})).toMatchObject({
      ok: true,
      value: { notices: ['Automatic switching is disabled.'] },
    });
  });
  it('requests freshness-aware quota refresh, awaits mutations, and serializes concurrent calls', async () => {
    const f = await fixture();
    f.refreshProviders.mockImplementationOnce(async () => {
      throw new Error('reload failed');
    });
    expect(await f.handlers.add({})).toMatchObject({
      ok: false,
      error: { code: 'OPERATION_FAILED', message: 'reload failed' },
    });
    const [refreshed, removed] = await Promise.all([
      f.handlers.refreshQuota({}),
      f.handlers.remove({ number: 2 }),
    ]);
    expect(refreshed).toMatchObject({
      ok: true,
      value: { accounts: [{ number: 1 }, { number: 2 }] },
    });
    expect(removed).toMatchObject({
      ok: true,
      value: { accounts: [{ number: 1 }] },
    });
    expect(f.getQuota).toHaveBeenCalledWith(1);
    expect(f.getQuota).toHaveBeenCalledWith(2);
    expect(f.refreshProviders).toHaveBeenCalledTimes(3);
    expect(await f.handlers.refreshQuota({ number: 99 })).toMatchObject({
      ok: false,
    });
  });
  it('unmaps extras only, validates raw requests, and keeps serving after failures', async () => {
    const f = await fixture();
    await f.handlers.add({});
    expect(await f.handlers.remove({ number: 1 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(await f.handlers.remove({ number: 2.5 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(await f.handlers.remove({ number: 99 })).toMatchObject({
      ok: false,
      error: { code: 'OPERATION_FAILED' },
    });
    expect(await f.handlers.remove({ number: 2 })).toMatchObject({
      ok: true,
      value: { unmappedCredentials: [{ id: 'two' }] },
    });
    expect(f.refreshProviders).toHaveBeenCalledTimes(2);
    expect(await f.handlers.state({})).toMatchObject({
      ok: true,
      value: { accounts: [{ number: 1 }] },
    });
  });
  it('switches only the named session, clears to pinned default, and rejects missing accounts', async () => {
    const f = await fixture();
    await f.handlers.add({});
    expect(
      await f.handlers.switch({ sessionID: 'parent', number: 2 }),
    ).toMatchObject({ ok: true, value: { sessionOverride: 2 } });
    expect(f.overrides.get('child')).toBeUndefined();
    expect(
      await f.handlers.switch({ sessionID: 'parent', number: 99 }),
    ).toMatchObject({ ok: false, error: { code: 'OPERATION_FAILED' } });
    expect(f.overrides.get('parent')).toBe(2);
    expect(
      await f.handlers.switch({ sessionID: 'parent', number: null }),
    ).toMatchObject({ ok: true, value: { sessionOverride: null } });
    expect(f.refreshProviders).toHaveBeenCalledTimes(3);
  });
  it('adds a selected credential, then gives native connect guidance when none remain', async () => {
    const f = await fixture();
    expect(await f.handlers.add({ credentialID: 'two' })).toMatchObject({
      ok: true,
      value: { accounts: [{ number: 1 }, { number: 2 }] },
    });
    expect(f.refreshProviders).toHaveBeenCalledOnce();
    expect(await f.handlers.add({})).toMatchObject({
      ok: true,
      value: {
        guidance:
          "add another ChatGPT account in OpenCode's connect dialog (provider OpenAI), then run /codex-add",
      },
    });
  });
  it('returns credential-safe account state, quota and exact-session override', async () => {
    const f = await fixture();
    f.overrides.set('parent', 1);
    const result = await f.handlers.state({ sessionID: 'parent' });
    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionOverride: 1,
        accounts: [
          {
            number: 1,
            providerID: 'openai',
            credentialState: 'ok',
            blockedUntil: 999999,
            quota: {
              state: 'stale',
              primary: { remainingPercent: 75, resetAt: 123456 },
            },
          },
        ],
        unmappedCredentials: [{ id: 'two', label: 'Second' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('accessToken');
    expect(f.getQuota).toHaveBeenCalledWith(1, { refresh: false });
    expect(await f.handlers.state({ sessionID: 'child' })).toMatchObject({
      ok: true,
      value: { sessionOverride: null },
    });
    expect(f.ctx.rpc.register).toHaveBeenCalledOnce();
  });
  it('rejects blank sessions and credentials, absent switch choices and unsafe account numbers', async () => {
    const f = await fixture();
    for (const input of [{ sessionID: '' }, { sessionID: '  ' }]) {
      expect(await f.handlers.state(input)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_REQUEST' },
      });
    }
    expect(await f.handlers.add({ credentialID: ' ' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(
      await f.handlers.switch({
        sessionID: 'parent',
        number: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(f.refreshProviders).not.toHaveBeenCalled();
  });
});
