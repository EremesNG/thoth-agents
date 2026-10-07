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
const defaultPackages = ['thoth-agents', '@thoth-agents/*', 'thoth-mem'];

describe('createOwnershipResolver', () => {
  it('owns the package root and nested directories', () => {
    const read = fsOf({ '/r/pkg/package.json': pkg('@thoth-agents/x') });
    const owned = createOwnershipResolver(defaultPackages, read);
    expect(owned('/r/pkg')).toBe(true);
    expect(owned('/r/pkg/src/deep')).toBe(true);
  });

  it('accepts the unscoped thoth-agents name', () => {
    const owned = createOwnershipResolver(
      defaultPackages,
      fsOf({ '/n/package.json': pkg('thoth-agents') }),
    );
    expect(owned('/n')).toBe(true);
  });

  it.each([
    { name: 'custom-package', respected: true },
    { name: '@scope/anything', respected: true },
    { name: '@thoth-agents/tool', respected: true },
    { name: 'custom-package-extra', respected: false },
    { name: 'unlisted-package', respected: false },
    { name: '@scopex/anything', respected: false },
    { name: '@thoth-agentsx/foo', respected: false },
    { name: '@scope/', respected: false },
    { name: 'thoth-mem', respected: false },
    { name: '@other/tool', respected: false },
    { name: '@unlisted/tool', respected: false },
    { name: '@third/tool', respected: false },
  ])('matches configured package patterns for $name', ({ name, respected }) => {
    const owned = createOwnershipResolver(
      [
        'custom-package',
        '@scope/*',
        '@thoth-agents/*',
        'thoth-*',
        '@other*',
        '@*/tool',
        '@third/**',
      ],
      fsOf({ '/n/package.json': pkg(name) }),
    );
    expect(owned('/n')).toBe(respected);
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
      defaultPackages,
      fsOf({
        '/p/src/package.json': entry,
        '/p/package.json': pkg('@thoth-agents/parent'),
      }),
    );
    expect(owned('/p/src')).toBe(false);
  });

  it('is third-party when no manifest exists', () => {
    expect(createOwnershipResolver(defaultPackages, fsOf({}))('/a/b')).toBe(
      false,
    );
  });

  it('caches positive and negative results per directory', () => {
    const read = fsOf({ '/r/package.json': pkg('@thoth-agents/x') });
    const owned = createOwnershipResolver(defaultPackages, read);
    expect(owned('/r/src')).toBe(true);
    const reads = read.mock.calls.length;
    expect(owned('/r/src')).toBe(true);
    expect(owned('/r')).toBe(true);
    expect(read.mock.calls.length).toBe(reads);

    const missing = fsOf({});
    const none = createOwnershipResolver(defaultPackages, missing);
    none('/q/w');
    const n = missing.mock.calls.length;
    none('/q/w');
    expect(missing.mock.calls.length).toBe(n);
  });
});
