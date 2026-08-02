import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveExecutingPackageVersion } from './package-version';

describe('resolveExecutingPackageVersion', () => {
  const fixtureRoots: string[] = [];

  function createFixture(
    metadata: string | Record<string, unknown> | null,
    layout: 'source' | 'published' = 'source',
  ): string {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-package-version-'));
    fixtureRoots.push(packageRoot);
    const modulePath =
      layout === 'source'
        ? join(packageRoot, 'src', 'cli', 'package-version.ts')
        : join(packageRoot, 'dist', 'cli', 'index.js');
    mkdirSync(join(modulePath, '..'), { recursive: true });
    if (metadata !== null) {
      writeFileSync(
        join(packageRoot, 'package.json'),
        typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      );
    }
    return pathToFileURL(modulePath).href;
  }

  afterEach(() => {
    for (const fixtureRoot of fixtureRoots.splice(0)) {
      if (existsSync(fixtureRoot)) {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    }
  });

  test('resolves a stable version from a source layout', () => {
    const moduleUrl = createFixture({
      name: 'thoth-agents',
      version: '0.4.8',
    });

    expect(resolveExecutingPackageVersion({ moduleUrl })).toEqual({
      ok: true,
      version: '0.4.8',
      packageRoot: expect.any(String),
    });
  });

  test('resolves a prerelease version from a published layout', () => {
    const moduleUrl = createFixture(
      { name: 'thoth-agents', version: '0.4.8-beta.1' },
      'published',
    );

    expect(resolveExecutingPackageVersion({ moduleUrl })).toEqual({
      ok: true,
      version: '0.4.8-beta.1',
      packageRoot: expect.any(String),
    });
  });

  test.each([
    {
      name: 'missing package metadata',
      metadata: null,
      code: 'package-root-not-found',
    },
    {
      name: 'malformed package metadata',
      metadata: '{ malformed',
      code: 'package-metadata-malformed',
    },
    {
      name: 'mismatched package identity',
      metadata: { name: 'another-package', version: '0.4.8' },
      code: 'package-name-mismatch',
    },
    {
      name: 'missing package version',
      metadata: { name: 'thoth-agents' },
      code: 'package-version-invalid',
    },
    {
      name: 'empty package version',
      metadata: { name: 'thoth-agents', version: '  ' },
      code: 'package-version-invalid',
    },
    {
      name: 'invalid package version',
      metadata: { name: 'thoth-agents', version: 'latest' },
      code: 'package-version-invalid',
    },
  ])('returns a typed failure for $name', ({ metadata, code }) => {
    const result = resolveExecutingPackageVersion({
      moduleUrl: createFixture(metadata),
    });

    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(result).not.toHaveProperty('version');
  });
});
