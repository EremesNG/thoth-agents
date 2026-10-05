import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function manifest(relativePath: string) {
  return JSON.parse(
    fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
  );
}

const sdkVersions = {
  '@earendil-works/pi-coding-agent': '1.0.2',
  '@earendil-works/pi-tui': '1.0.2',
  '@earendil-works/pi-ai': '1.0.2',
};

describe('Pi ecosystem package manifests', () => {
  it('ships a public TS-source library and its dependent extension on one SDK generation', () => {
    const core = manifest('../package.json');
    const todo = manifest('../../pi-todo/package.json');

    for (const [name, pkg] of [
      ['@thoth-agents/pi-core', core],
      ['@thoth-agents/pi-todo', todo],
    ] as const) {
      expect(pkg).toMatchObject({
        name,
        version: '0.1.0',
        type: 'module',
        license: 'MIT',
        engines: { node: '>=22.19.0' },
        peerDependencies: { '@earendil-works/pi-coding-agent': '>=0.99.0' },
        devDependencies: {
          ...sdkVersions,
          typescript: '^5.8.0',
          vitest: '^4.1.9',
        },
        scripts: { typecheck: 'tsc --noEmit', test: 'vitest run' },
        publishConfig: { access: 'public' },
      });
      expect(pkg.private).not.toBe(true);
      expect(pkg.keywords).toContain('pi-package');
      expect(pkg.files).not.toContain('test');
      expect(pkg.files).not.toContain('node_modules');
      expect(
        pkg.files.some(
          (entry: string) =>
            entry.startsWith('!') && entry.endsWith('*.test.ts'),
        ),
      ).toBe(true);
    }

    expect(core.main).toBe('./src/index.ts');
    expect(core.exports).toBe('./src/index.ts');
    expect(core.files).toEqual([
      'src/**/*.ts',
      '!src/**/*.test.ts',
      'README.md',
      'LICENSE',
    ]);
    expect(core.dependencies).toBeUndefined();
    expect(core.pi?.extensions).toBeUndefined();
    expect(core.peerDependenciesMeta).toEqual({
      '@earendil-works/pi-coding-agent': { optional: true },
    });
    expect(todo.dependencies).toEqual({
      '@thoth-agents/pi-core': 'workspace:^',
    });
    expect(todo.peerDependencies).toEqual({
      '@earendil-works/pi-coding-agent': '>=0.99.0',
      '@earendil-works/pi-tui': '>=0.99.0',
      '@earendil-works/pi-ai': '>=0.99.0',
      typebox: '*',
    });
    expect(todo.devDependencies.typebox).toBe('^1.3.4');
    expect(todo.pi).toEqual({ extensions: ['./index.ts'] });
    expect(todo.keywords).toContain('pi-extension');
    expect(todo.files).toContain('index.ts');
  });
});
