import * as fs from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionStore } from '../src/session-store.js';

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
test('session records survive replacement atomically, use safe hashed names, and reject corrupt records', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'junie-store-'));
  directories.push(dir);
  const store = createSessionStore(dir);
  const state = {
    sessionId: 'junie-1',
    cwd: '/project',
    model: 'mix.auto',
    digests: ['a'.repeat(64)],
    cost: 0.25,
  };
  expect(store.load('../../pi-session')).toBeNull();
  store.save('../../pi-session', state);
  expect(createSessionStore(dir).load('../../pi-session')).toEqual(state);
  const files = fs.readdirSync(dir);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^s-[a-f0-9]{64}\.json$/);
  const rename = vi.mocked(fs.renameSync).mockImplementationOnce(() => {
    throw new Error('disk failure');
  });
  expect(() =>
    store.save('../../pi-session', { ...state, sessionId: 'replacement' }),
  ).toThrow('disk failure');
  rename.mockRestore();
  expect(store.load('../../pi-session')).toEqual(state);
  expect(fs.readdirSync(dir)).toEqual(files);
  fs.writeFileSync(join(dir, files[0]), '{corrupt');
  expect(store.load('../../pi-session')).toBeNull();
  fs.writeFileSync(
    join(dir, files[0]),
    JSON.stringify({ version: 1, ...state, digests: ['invalid'] }),
  );
  expect(store.load('../../pi-session')).toBeNull();
  store.save('../../pi-session', state);
  store.delete('../../pi-session');
  expect(store.load('../../pi-session')).toBeNull();
});

test('loads legacy records that still carry removed usage telemetry fields', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'junie-store-'));
  directories.push(dir);
  const store = createSessionStore(dir);
  const state = {
    sessionId: 'junie-1',
    cwd: '/project',
    model: 'mix.auto',
    digests: ['a'.repeat(64)],
    cost: 0.25,
  };
  store.save('pi-session', state);
  const [file] = fs.readdirSync(dir);
  fs.writeFileSync(
    join(dir, file),
    JSON.stringify({
      version: 1,
      ...state,
      usageSnapshot: {
        sessionId: 'junie-1',
        models: [{ model: 'terra', cost: 1 }],
      },
      usageBaselinePending: true,
    }),
  );
  expect(store.load('pi-session')).toEqual(state);
  store.save('pi-session', store.load('pi-session')!);
  expect(store.load('pi-session')).toEqual(state);
});
