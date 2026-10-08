import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
) as Record<string, any>;

describe('pi package manifest', () => {
  it('builds with pi-core through the workspace and has no semantic-release', () => {
    expect(packageJson.dependencies?.['@thoth-agents/pi-core']).toBeUndefined();
    expect(packageJson.devDependencies['@thoth-agents/pi-core']).toMatch(
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
      extensions: ['./dist/index.ts'],
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
      expect.arrayContaining(['dist', 'skills', 'README.md', 'LICENSE']),
    );
    expect(packageJson.main).toBe('./dist/index.ts');
    expect(packageJson.files).not.toContain('index.ts');
    expect(packageJson.files).not.toContain('src');
    expect(packageJson.files).not.toContain('node_modules');
    expect(packageJson.files).not.toContain('test');
    expect(packageJson.files).not.toContain('.releaserc.json');
    expect(packageJson.publishConfig).toEqual({ access: 'public' });
  });

  it('verifies a source-free package and rejects a missing bundle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-files-'));
    try {
      for (const resource of [
        'dist/index.ts',
        'README.md',
        'LICENSE',
        'skills/subagents-configuration/SKILL.md',
      ]) {
        const destination = path.join(root, resource);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, 'fixture');
      }
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: '@thoth-agents/pi-subagents' }),
      );
      fs.mkdirSync(path.join(root, 'scripts'));
      const script = path.join(root, 'scripts/verify-package-files.mjs');
      fs.copyFileSync(
        path.join(process.cwd(), 'scripts/verify-package-files.mjs'),
        script,
      );
      const complete = spawnSync(process.execPath, [script], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(complete.status, complete.stderr).toBe(0);

      fs.unlinkSync(path.join(root, 'dist/index.ts'));
      const incomplete = spawnSync(process.execPath, [script], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(incomplete.status).toBe(1);
      expect(incomplete.stderr).toContain('dist/index.ts');
      expect(incomplete.stderr).toContain('Refusing to pack/publish');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
