import { describe, expect, it, vi } from 'vitest';
import { createOwnershipResolver } from './ownership.ts';

function fsOf(files: Record<string, string | Error>) {
  return vi.fn((path: string) => {
    const norm = path.split('\\').join('/');
    const entry = files[norm];
    if (entry === undefined) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    if (entry instanceof Error) throw entry;
    return entry;
  });
}

const pkg = (name: unknown) => JSON.stringify({ name });

describe('createOwnershipResolver', () => {
  it('owns the package root and nested directories', () => {
    const read = fsOf({ '/r/pkg/package.json': pkg('@thoth-agents/x') });
    const owned = createOwnershipResolver(read);
    expect(owned('/r/pkg')).toBe(true);
    expect(owned('/r/pkg/src/deep')).toBe(true);
  });

  it('accepts the unscoped thoth-agents name', () => {
    const owned = createOwnershipResolver(
      fsOf({ '/n/package.json': pkg('thoth-agents') }),
    );
    expect(owned('/n')).toBe(true);
  });

  it.each([
    ['foreign name', pkg('pi-mcp-adapter')],
    ['lookalike', pkg('thoth-agents-evil')],
    ['no name', '{}'],
    ['malformed', '{oops'],
    ['null manifest', 'null'],
    ['unreadable', Object.assign(new Error('x'), { code: 'EACCES' })],
  ])('treats the nearest %s manifest as third-party', (_label, entry) => {
    const owned = createOwnershipResolver(
      fsOf({
        '/p/src/package.json': entry,
        '/p/package.json': pkg('@thoth-agents/parent'),
      }),
    );
    expect(owned('/p/src')).toBe(false);
  });

  it('is third-party when no manifest exists', () => {
    expect(createOwnershipResolver(fsOf({}))('/a/b')).toBe(false);
  });

  it('caches positive and negative results per directory', () => {
    const read = fsOf({ '/r/package.json': pkg('@thoth-agents/x') });
    const owned = createOwnershipResolver(read);
    expect(owned('/r/src')).toBe(true);
    const reads = read.mock.calls.length;
    expect(owned('/r/src')).toBe(true);
    expect(owned('/r')).toBe(true);
    expect(read.mock.calls.length).toBe(reads);

    const missing = fsOf({});
    const none = createOwnershipResolver(missing);
    none('/q/w');
    const n = missing.mock.calls.length;
    none('/q/w');
    expect(missing.mock.calls.length).toBe(n);
  });
});
