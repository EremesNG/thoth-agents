import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_STORAGE_KEY,
  AccountRegistry,
  type CredentialSnapshot,
  type RegistryStorage,
} from './registry.js';

function fixture() {
  const values = new Map<string, Parameters<RegistryStorage['set']>[1]>();
  const storage: RegistryStorage = {
    get: async (key) => structuredClone(values.get(key)),
    set: async (key, value) => {
      values.set(key, structuredClone(value));
    },
  };
  let snapshot: CredentialSnapshot = {
    credentials: [
      { id: 'a', label: 'Personal' },
      { id: 'b', label: 'Work' },
    ],
    activeCredentialID: 'a',
  };
  const source = { snapshot: async () => snapshot };
  return {
    storage,
    source,
    setSnapshot: (next: CredentialSnapshot) => {
      snapshot = next;
    },
    registry: new AccountRegistry(storage, source),
  };
}

describe('account registry', () => {
  it.each<Parameters<RegistryStorage['set']>[1]>([
    null,
    {},
    { version: 2, accounts: [] },
    { version: 1, accounts: [{ number: 2, credentialID: 'b', label: 'Work' }] },
    {
      version: 1,
      accounts: [{ number: 1.5, credentialID: 'a', label: 'Bad' }],
    },
    {
      version: 1,
      accounts: [
        { number: 1, credentialID: 'a', label: 'First' },
        { number: 1, credentialID: 'b', label: 'Duplicate' },
      ],
    },
  ])('fails closed on malformed stored mappings: %j', async (saved) => {
    const f = fixture();
    await f.storage.set(ACCOUNT_STORAGE_KEY, saved);
    await expect(f.registry.list()).rejects.toThrow('Invalid account registry');
    expect(await f.storage.get(ACCOUNT_STORAGE_KEY)).toEqual(saved);
  });

  it('propagates integration and write failures and remains usable after a failure', async () => {
    const f = fixture();
    await f.registry.add();
    const saved = await f.storage.get(ACCOUNT_STORAGE_KEY);
    const brokenSource = new AccountRegistry(f.storage, {
      snapshot: async () => {
        throw new Error('offline');
      },
    });
    await expect(brokenSource.list()).rejects.toThrow('offline');
    expect(await f.storage.get(ACCOUNT_STORAGE_KEY)).toEqual(saved);
    let fail = true;
    const registry = new AccountRegistry(
      {
        ...f.storage,
        set: async (key, value) => {
          if (fail) throw new Error('disk full');
          await f.storage.set(key, value);
        },
      },
      f.source,
    );
    await expect(registry.remove(2)).rejects.toThrow('disk full');
    expect(await f.storage.get(ACCOUNT_STORAGE_KEY)).toEqual(saved);
    fail = false;
    expect(await registry.remove(2)).toEqual({ status: 'removed' });
  });
  it('serializes concurrent adds so neither mapping is lost', async () => {
    const f = fixture();
    f.setSnapshot({
      credentials: [
        { id: 'a', label: 'First' },
        { id: 'b', label: 'Second' },
        { id: 'c', label: 'Third' },
      ],
      activeCredentialID: 'a',
    });
    expect(
      await Promise.all([f.registry.add(), f.registry.add()]),
    ).toMatchObject([
      { status: 'added', account: { number: 2, credentialID: 'b' } },
      { status: 'added', account: { number: 3, credentialID: 'c' } },
    ]);
    expect(await f.registry.list()).toHaveLength(3);
  });
  it('keeps stale extra accounts and cached labels, but rebinds missing account 1 with a notice', async () => {
    const f = fixture();
    await f.registry.add();
    f.setSnapshot({
      credentials: [{ id: 'c', label: 'Replacement' }],
      activeCredentialID: 'c',
    });
    expect(await f.registry.list()).toEqual([
      {
        number: 1,
        providerID: 'openai',
        credentialID: 'c',
        label: 'Replacement',
        state: 'ok',
      },
      {
        number: 2,
        providerID: 'openai-codex-2',
        credentialID: 'b',
        label: 'Work',
        state: 'missing',
      },
    ]);
    expect(f.registry.notices).toEqual([
      {
        type: 'account-1-rebound',
        previousCredentialID: 'a',
        credentialID: 'c',
      },
    ]);
    expect(
      (await new AccountRegistry(f.storage, f.source).list())[0].credentialID,
    ).toBe('c');
    expect(await f.registry.add()).toMatchObject({
      status: 'no-unmapped-credential',
    });
    f.setSnapshot({ credentials: [] });
    expect((await f.registry.list()).map((a) => a.state)).toEqual([
      'missing',
      'missing',
    ]);
    expect(await f.registry.add()).toEqual({ status: 'no-active-credential' });
  });

  it('does not invent account 1 when no active credential exists, and can bind later', async () => {
    const f = fixture();
    f.setSnapshot({ credentials: [{ id: 'a', label: 'Personal' }] });
    expect(await f.registry.list()).toEqual([]);
    expect(await f.registry.add()).toEqual({ status: 'no-active-credential' });
    f.setSnapshot({
      credentials: [{ id: 'a', label: 'Personal' }],
      activeCredentialID: 'a',
    });
    expect((await f.registry.list())[0].credentialID).toBe('a');
  });
  it('adds unmapped credentials at stable numbers, removes only mappings, and reuses the lowest hole', async () => {
    const f = fixture();
    expect(await f.registry.add()).toMatchObject({
      status: 'added',
      account: { number: 2, credentialID: 'b', providerID: 'openai-codex-2' },
    });
    expect(await f.registry.add()).toMatchObject({
      status: 'no-unmapped-credential',
      guidance: expect.stringContaining('connect'),
    });
    expect(await f.registry.add('a')).toEqual({ status: 'already-mapped' });
    expect(await f.registry.add('unknown')).toEqual({
      status: 'credential-not-found',
    });
    f.setSnapshot({
      credentials: [
        { id: 'a', label: 'Personal' },
        { id: 'b', label: 'Work' },
        { id: 'c', label: 'Third' },
      ],
      activeCredentialID: 'a',
    });
    expect(await f.registry.add('c')).toMatchObject({
      status: 'added',
      account: { number: 3 },
    });
    const reloaded = new AccountRegistry(f.storage, f.source);
    expect(
      (await reloaded.list()).map((a) => [a.number, a.credentialID]),
    ).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    for (const n of [1, 0, -2, 2.5, Number.NaN])
      expect(await reloaded.remove(n)).toEqual({ status: 'invalid-number' });
    expect(await reloaded.remove(2)).toEqual({ status: 'removed' });
    expect(await reloaded.remove(2)).toEqual({ status: 'not-found' });
    expect(await reloaded.add()).toMatchObject({
      status: 'added',
      account: { number: 2, credentialID: 'b' },
    });
  });
  it('records the initially active credential and ignores later global activation', async () => {
    const f = fixture();
    expect(await f.registry.list()).toEqual([
      {
        number: 1,
        providerID: 'openai',
        credentialID: 'a',
        label: 'Personal',
        state: 'ok',
      },
    ]);
    f.setSnapshot({
      credentials: [
        { id: 'a', label: 'Renamed' },
        { id: 'b', label: 'Work' },
      ],
      activeCredentialID: 'b',
    });
    const reloaded = new AccountRegistry(f.storage, f.source);
    expect(await reloaded.list()).toEqual([
      {
        number: 1,
        providerID: 'openai',
        credentialID: 'a',
        label: 'Renamed',
        state: 'ok',
      },
    ]);
  });
});
