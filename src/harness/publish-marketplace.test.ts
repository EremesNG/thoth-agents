import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { publishMarketplace } from '../../scripts/publish-marketplace.mjs';

const CENTRAL_SOURCE = resolve(
  process.env.THOTH_PLUGINS_ROOT ?? join(process.cwd(), '..', 'thoth-plugins'),
);
const temporaryRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function initializeWorkingRepository(root: string): void {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Marketplace Test']);
  git(root, ['config', 'user.email', 'marketplace-test@example.invalid']);
}

function initializeBareRepository(root: string, path: string): void {
  git(root, ['init', '--bare', '--initial-branch=main', path]);
}

function commitAll(root: string, message: string): void {
  git(root, ['add', '.']);
  git(root, ['commit', '-m', message]);
}

interface Fixture {
  root: string;
  centralRemote: string;
  pluginRemote: string;
  pluginWork: string;
  initialRegistry: {
    plugins: Array<{ name: string; version: string; ref: string }>;
  };
}

function createFixture(version = '0.3.12', createTag = true): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'thoth-agents-marketplace-release-'));
  temporaryRoots.push(root);

  const centralWork = join(root, 'central-work');
  cpSync(CENTRAL_SOURCE, centralWork, {
    recursive: true,
    filter: (source) => !['.git', 'node_modules'].includes(basename(source)),
  });
  initializeWorkingRepository(centralWork);
  commitAll(centralWork, 'central fixture');
  const centralRemote = join(root, 'central.git');
  initializeBareRepository(root, centralRemote);
  git(centralWork, ['remote', 'add', 'origin', centralRemote]);
  git(centralWork, ['push', '-u', 'origin', 'main']);

  const pluginWork = join(root, 'plugin-work');
  mkdirSync(join(pluginWork, 'plugin', '.codex-plugin'), { recursive: true });
  mkdirSync(join(pluginWork, 'plugin', '.claude-plugin'), { recursive: true });
  const requiredSkills = [
    'plan-reviewer',
    'thoth-archive',
    'thoth-constitution',
    'thoth-init',
    'thoth-sdd',
  ];
  for (const skill of requiredSkills) {
    mkdirSync(join(pluginWork, 'plugin', 'skills', skill), { recursive: true });
  }
  writeFileSync(
    join(pluginWork, 'package.json'),
    `${JSON.stringify({ name: 'thoth-agents', version }, null, 2)}\n`,
  );
  const manifest = `${JSON.stringify({ name: 'thoth-agents', version }, null, 2)}\n`;
  writeFileSync(
    join(pluginWork, 'plugin', '.codex-plugin', 'plugin.json'),
    manifest,
  );
  writeFileSync(
    join(pluginWork, 'plugin', '.claude-plugin', 'plugin.json'),
    manifest,
  );
  for (const skill of requiredSkills) {
    writeFileSync(
      join(pluginWork, 'plugin', 'skills', skill, 'SKILL.md'),
      `# ${skill}\n`,
    );
  }
  initializeWorkingRepository(pluginWork);
  commitAll(pluginWork, 'plugin fixture');
  if (createTag) git(pluginWork, ['tag', `v${version}`]);
  const pluginRemote = join(root, 'plugin.git');
  initializeBareRepository(root, pluginRemote);
  git(pluginWork, ['remote', 'add', 'origin', pluginRemote]);
  git(pluginWork, ['push', '-u', 'origin', 'main']);
  if (createTag) git(pluginWork, ['push', 'origin', `v${version}`]);

  return {
    root,
    centralRemote,
    pluginRemote,
    pluginWork,
    initialRegistry: JSON.parse(
      readFileSync(join(centralWork, 'catalog', 'plugins.json'), 'utf8'),
    ) as Fixture['initialRegistry'],
  };
}

function cloneCentral(fixture: Fixture, name: string): string {
  const checkout = join(fixture.root, name);
  git(fixture.root, ['clone', '--quiet', fixture.centralRemote, checkout]);
  return checkout;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('thoth-agents marketplace publication', () => {
  test('wires catalog publication after the existing version tag push', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts['release:marketplace']).toBe(
      'node scripts/publish-marketplace.mjs',
    );
    for (const level of ['patch', 'minor', 'major']) {
      expect(manifest.scripts[`release:${level}`]).toBe(
        `npm version ${level} --ignore-scripts=false && git push --follow-tags && pnpm run release:marketplace`,
      );
    }
  });

  test('publishes only thoth-agents and retries without another version or commit', async () => {
    const fixture = createFixture();
    const packageBefore = readFileSync(
      join(fixture.pluginWork, 'package.json'),
      'utf8',
    );
    expect(
      await publishMarketplace({
        projectRoot: fixture.pluginWork,
        pluginName: 'thoth-agents',
        centralRepository: fixture.centralRemote,
        pluginRepository: fixture.pluginRemote,
      }),
    ).toMatchObject({ status: 'published', version: '0.3.12' });

    const checkout = cloneCentral(fixture, 'published-checkout');
    const registry = JSON.parse(
      readFileSync(join(checkout, 'catalog', 'plugins.json'), 'utf8'),
    ) as Fixture['initialRegistry'];
    expect(
      registry.plugins.find(({ name }) => name === 'thoth-agents'),
    ).toMatchObject({
      version: '0.3.12',
      ref: 'v0.3.12',
    });
    expect(registry.plugins.find(({ name }) => name === 'thoth-mem')).toEqual(
      fixture.initialRegistry.plugins.find(({ name }) => name === 'thoth-mem'),
    );
    expect(
      git(checkout, [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        'HEAD',
      ])
        .split(/\r?\n/u)
        .sort(),
    ).toEqual([
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'catalog/plugins.json',
    ]);
    const commit = git(checkout, ['rev-parse', 'HEAD']);

    expect(
      await publishMarketplace({
        projectRoot: fixture.pluginWork,
        pluginName: 'thoth-agents',
        centralRepository: fixture.centralRemote,
        pluginRepository: fixture.pluginRemote,
      }),
    ).toMatchObject({ status: 'current', version: '0.3.12' });
    const retry = cloneCentral(fixture, 'retry-checkout');
    expect(git(retry, ['rev-parse', 'HEAD'])).toBe(commit);
    expect(readFileSync(join(fixture.pluginWork, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
  }, 20_000);

  test('fails clearly when the package tag is not visible', async () => {
    const fixture = createFixture('0.3.13', false);
    await expect(
      publishMarketplace({
        projectRoot: fixture.pluginWork,
        pluginName: 'thoth-agents',
        centralRepository: fixture.centralRemote,
        pluginRepository: fixture.pluginRemote,
      }),
    ).rejects.toThrow(/tag v0\.3\.13 is not visible/u);
  });

  test('rejects a central main race through a normal non-force push', async () => {
    const fixture = createFixture();
    await expect(
      publishMarketplace({
        projectRoot: fixture.pluginWork,
        pluginName: 'thoth-agents',
        centralRepository: fixture.centralRemote,
        pluginRepository: fixture.pluginRemote,
        beforePush: async () => {
          const racer = cloneCentral(fixture, 'racer');
          git(racer, ['config', 'user.name', 'Marketplace Racer']);
          git(racer, ['config', 'user.email', 'racer@example.invalid']);
          writeFileSync(join(racer, 'race.txt'), 'advance central main\n');
          commitAll(racer, 'advance central main');
          git(racer, ['push', 'origin', 'main']);
        },
      }),
    ).rejects.toThrow(/central main advanced|push was rejected/u);

    const checkout = cloneCentral(fixture, 'race-checkout');
    const registry = JSON.parse(
      readFileSync(join(checkout, 'catalog', 'plugins.json'), 'utf8'),
    ) as Fixture['initialRegistry'];
    expect(
      registry.plugins.find(({ name }) => name === 'thoth-agents'),
    ).toEqual(
      fixture.initialRegistry.plugins.find(
        ({ name }) => name === 'thoth-agents',
      ),
    );
  }, 20_000);
});
