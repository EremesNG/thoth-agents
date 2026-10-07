import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
) as Record<string, any>;

describe('pi package manifest', () => {
  it('depends on pi-core through the workspace and has no semantic-release', () => {
    expect(packageJson.dependencies['@thoth-agents/pi-core']).toMatch(
      /^(workspace:\^|\^\d+\.\d+\.\d+)$/,
    );
    expect(packageJson.scripts.release).toBeUndefined();
    expect(Object.keys(packageJson.devDependencies).join(' ')).not.toContain(
      'semantic-release',
    );
  });

  it('is the public Thoth Agents fork of the Pi subagents package', () => {
    expect(packageJson.name).toBe('@thoth-agents/pi-subagents');
    expect(packageJson.version).toMatch(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/,
    );
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.keywords).toEqual(
      expect.arrayContaining(['pi-package', 'pi-extension', 'subagents']),
    );
  });

  it('declares pi resources for install and gallery discovery', () => {
    expect(packageJson.pi).toMatchObject({
      extensions: ['./index.ts'],
      skills: ['./skills'],
    });
    expect(packageJson.description).toMatch(/subagents/i);
  });

  it('does not bundle pi core runtime packages', () => {
    expect(packageJson.peerDependencies).toMatchObject({
      '@earendil-works/pi-coding-agent': '>=0.99.0',
      typebox: '*',
    });
    expect(packageJson.peerDependenciesMeta).toMatchObject({
      '@earendil-works/pi-coding-agent': { optional: true },
      typebox: { optional: true },
    });
    expect(packageJson.dependencies?.typebox).toBeUndefined();
  });

  it('pins one development Pi SDK generation and Node minimum', () => {
    expect(packageJson.devDependencies).toMatchObject({
      '@earendil-works/pi-agent-core': '1.0.2',
      '@earendil-works/pi-ai': '1.0.2',
      '@earendil-works/pi-coding-agent': '1.0.2',
      '@earendil-works/pi-tui': '1.0.2',
    });
    expect(packageJson.engines.node).toBe('>=22.19.0');
  });

  it('limits the npm package to runtime resources and docs', () => {
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        'index.ts',
        'src',
        'skills',
        'scripts/verify-package-files.mjs',
        'README.md',
        'LICENSE',
      ]),
    );
    expect(packageJson.files).not.toContain('node_modules');
    expect(packageJson.files).not.toContain('test');
    expect(packageJson.files).not.toContain('.releaserc.json');
    expect(packageJson.publishConfig).toEqual({ access: 'public' });
  });
});
