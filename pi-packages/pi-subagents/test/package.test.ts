import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
) as Record<string, any>;
const release = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), '.releaserc.json'), 'utf8'),
);
const publishCommand = release.plugins.find(
  (plugin: unknown) =>
    Array.isArray(plugin) && plugin[0] === '@semantic-release/exec',
)?.[1].publishCmd;

describe('pi package manifest', () => {
  it('prepares versions with npm but publishes workspace dependencies through pnpm', () => {
    expect(release.plugins).toContainEqual([
      '@semantic-release/npm',
      { npmPublish: false },
    ]);
    expect(publishCommand).toContain('pnpm publish --no-git-checks');
    expect(publishCommand).toContain('NPM_TOKEN');
    expect(publishCommand).toContain('NPM_CONFIG_USERCONFIG');
    expect(packageJson.devDependencies['@semantic-release/exec']).toBe('7.1.0');
    expect(packageJson.dependencies['@thoth-agents/pi-core']).toMatch(
      /^(workspace:\^|\^\d+\.\d+\.\d+)$/,
    );
  });

  it.each([
    { token: 'test-release-token', existingAuth: false, exitCode: 0 },
    { token: 'test-release-token', existingAuth: false, exitCode: 7 },
    { token: 'test-release-token', existingAuth: true, exitCode: 0 },
    { token: '', existingAuth: true, exitCode: 0 },
  ])('preserves npmrc auth, interpolates NPM_TOKEN when needed, and cleans up ($token/$existingAuth/$exitCode)', ({
    token,
    existingAuth,
    exitCode,
  }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thoth-release-test-'));
    try {
      const source = path.join(root, 'user.npmrc');
      const report = path.join(root, 'report.json');
      const sourceContent =
        'registry=https://registry.npmjs.org/\nalways-auth=true\n';
      fs.writeFileSync(source, sourceContent);
      fs.writeFileSync(
        path.join(root, 'pnpm.cjs'),
        `
        const fs = require('node:fs');
        if (process.argv[2] === 'config') {
          console.log(JSON.stringify({
            registry: 'https://registry.npmjs.org/',
            ...(process.env.MOCK_AUTH === 'true' ? { '//registry.npmjs.org/:_authToken': 'existing-test-token' } : {})
          }));
        } else {
          const config = process.env.NPM_CONFIG_USERCONFIG;
          fs.writeFileSync(process.env.MOCK_REPORT, JSON.stringify({ args: process.argv.slice(2), config, lowerConfig: process.env.npm_config_userconfig, content: fs.readFileSync(config, 'utf8') }));
          process.exitCode = Number(process.env.MOCK_EXIT);
        }
      `,
      );
      const windows = process.platform === 'win32';
      fs.writeFileSync(
        path.join(root, windows ? 'pnpm.cmd' : 'pnpm'),
        windows
          ? `@"${process.execPath}" "%~dp0pnpm.cjs" %*\r\n`
          : `#!/bin/sh\n"${process.execPath}" "${path.join(root, 'pnpm.cjs')}" "$@"\n`,
        { mode: 0o755 },
      );
      const binPath = `${root}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ''}`;
      const result = spawnSync(publishCommand, {
        shell: true,
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: binPath,
          Path: binPath,
          NPM_TOKEN: token,
          NPM_CONFIG_USERCONFIG: source,
          npm_config_userconfig: source,
          MOCK_REPORT: report,
          MOCK_AUTH: String(existingAuth),
          MOCK_EXIT: String(exitCode),
        },
      });
      expect(result.status, result.stderr).toBe(exitCode);
      const published = JSON.parse(fs.readFileSync(report, 'utf8'));
      expect(published.args).toEqual(['publish', '--no-git-checks']);
      expect(fs.readFileSync(source, 'utf8')).toBe(sourceContent);
      if (token && !existingAuth) {
        expect(published.config).not.toBe(source);
        expect(published.lowerConfig).toBe(published.config);
        expect(published.content).toContain(sourceContent);
        expect(published.content).toContain(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: npmrc must interpolate at publish time, not in this test.
          '//registry.npmjs.org/:_authToken=${NPM_TOKEN}',
        );
        expect(published.content).not.toContain(token);
        expect(fs.existsSync(path.dirname(published.config))).toBe(false);
      } else {
        expect(published.config).toBe(source);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
        '.releaserc.json',
        'README.md',
        'LICENSE',
      ]),
    );
    expect(packageJson.files).not.toContain('node_modules');
    expect(packageJson.files).not.toContain('test');
  });
});
