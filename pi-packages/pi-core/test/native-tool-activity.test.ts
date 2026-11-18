import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginNativeTool,
  clearNativeTools,
  listNativeTools,
} from '../src/index.js';

const registryKey = Symbol.for('thoth.pi-core.native-tool-activity.v1');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;

afterEach(() => {
  delete shared[registryKey];
  vi.useRealTimers();
});

describe('native tool activity', () => {
  it('records a start and removes it on idempotent release', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1234);
    const release = beginNativeTool('session', 'call', 'run_command');
    expect(listNativeTools('session')).toEqual([
      { key: 'call', name: 'run_command', since: 1234 },
    ]);
    release();
    release();
    expect(listNativeTools('session')).toEqual([]);
  });

  it('isolates sessions and clearing one does not invalidate another', () => {
    const first = beginNativeTool('a', 'same', 'first');
    const second = beginNativeTool('b', 'same', 'second');
    beginNativeTool('a', 'other', 'third');
    clearNativeTools('a');
    expect(listNativeTools('a')).toEqual([]);
    expect(listNativeTools('b')).toEqual([
      { key: 'same', name: 'second', since: expect.any(Number) },
    ]);
    first();
    second();
    expect(listNativeTools('b')).toEqual([]);
  });

  it('refreshes duplicate starts and stale releases cannot remove a new start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const old = beginNativeTool('a', 'key', 'old');
    vi.setSystemTime(200);
    const current = beginNativeTool('a', 'key', 'new');
    old();
    expect(listNativeTools('a')).toEqual([
      { key: 'key', name: 'new', since: 200 },
    ]);
    clearNativeTools('a');
    const afterClear = beginNativeTool('a', 'key', 'after clear');
    current();
    expect(listNativeTools('a')[0]?.name).toBe('after clear');
    afterClear();
    expect(listNativeTools('a')).toEqual([]);
  });

  it('ignores blank identifiers and returns independent snapshots', () => {
    beginNativeTool('', 'key', 'x')();
    beginNativeTool(' \t', 'key', 'x')();
    beginNativeTool('a', ' ', 'x')();
    expect(listNativeTools('a')).toEqual([]);
    expect(listNativeTools(' ')).toEqual([]);
    clearNativeTools(' ');
    beginNativeTool('a', 'key', 'original');
    const snapshot = listNativeTools('a');
    (snapshot[0] as { name: string }).name = 'modified';
    expect(listNativeTools('a')[0]?.name).toBe('original');
  });

  it('reuses a compatible pre-existing registry without replacing it', () => {
    const existing = {
      version: 1,
      sessions: new Map([
        ['a', new Map([['old', { key: 'old', name: 'existing', since: 1 }]])],
      ]),
    };
    shared[registryKey] = existing;
    const release = beginNativeTool('a', 'new', 'added');
    expect(listNativeTools('a')).toEqual([
      { key: 'old', name: 'existing', since: 1 },
      { key: 'new', name: 'added', since: expect.any(Number) },
    ]);
    release();
    expect(shared[registryKey]).toBe(existing);
    expect(listNativeTools('a')).toEqual([
      { key: 'old', name: 'existing', since: 1 },
    ]);
  });

  it.each([
    null,
    {},
    { version: 2, sessions: new Map() },
    { version: 1, sessions: [] },
    {
      version: 1,
      sessions: new Map([
        ['a', new Map([['wrong', { key: 'other', name: 'x', since: 1 }]])],
      ]),
    },
    Object.defineProperty({}, 'version', {
      get() {
        throw new Error('foreign');
      },
    }),
  ])('leaves incompatible slots untouched (%#)', (foreign) => {
    shared[registryKey] = foreign;
    expect(listNativeTools('a')).toEqual([]);
    expect(() => {
      beginNativeTool('a', 'key', 'name')();
      clearNativeTools('a');
    }).not.toThrow();
    expect(shared[registryKey]).toBe(foreign);
  });

  it('tolerates a throwing global accessor', () => {
    const get = () => {
      throw new Error('foreign');
    };
    Object.defineProperty(shared, registryKey, { get, configurable: true });
    expect(listNativeTools('a')).toEqual([]);
    expect(() => {
      beginNativeTool('a', 'key', 'name')();
      clearNativeTools('a');
    }).not.toThrow();
    expect(Object.getOwnPropertyDescriptor(shared, registryKey)?.get).toBe(get);
  });
});
