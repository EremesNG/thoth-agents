import type { Plugin } from '@opencode/plugin';
import { describe, expect, it, vi } from 'vitest';
import { AccountRegistry } from './accounts/registry.js';
import { SessionAccountOverrides } from './request/overrides.js';
import { registerCodexRpc } from './rpc-handlers.js';

async function fixture() {
  let saved: unknown;
  const registry = new AccountRegistry(
    {
      get: async () => saved,
      set: async (_key, value) => {
        saved = value;
      },
    } as ConstructorParameters<typeof AccountRegistry>[0],
    {
      snapshot: async () => ({
        activeCredentialID: 'one',
        credentials: [
          { id: 'one', label: 'First' },
          { id: 'two', label: 'Second' },
        ],
      }),
    },
  );
  const refreshProviders = vi.fn(async () => undefined);
  const overrides = new SessionAccountOverrides();
  const getQuota = vi.fn(async (accountNumber: number) => ({
    accountNumber,
    state: 'stale' as const,
    snapshot: { primary: { usedPercent: 25, resetAt: 123456 } },
  }));
  const ctx = {
    rpc: { register: vi.fn() },
    integration: {
      list: async () => ({
        data: [
          {
            id: 'openai',
            connections: [
              { type: 'credential', id: 'one', label: 'First' },
              { type: 'credential', id: 'two', label: 'Second' },
            ],
          },
        ],
      }),
      connection: { active: async () => ({ type: 'credential', id: 'one' }) },
    },
  } as unknown as Plugin.Context;
  const handlers = await registerCodexRpc(ctx, {
    registry,
    refreshProviders,
    requests: { overrides },
    quota: { getQuota },
    config: { warning: 'Automatic switching is disabled.' },
    blockedUntil: () => 999999,
  });
  return { handlers, refreshProviders, overrides, getQuota, ctx };
}

describe('multi-codex RPC', () => {
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
