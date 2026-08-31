import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { syncCodexLocalSetup } from '../../scripts/setup-codex-local';
import { CODEX_ROLE_NAMES } from '../cli/codex-paths';

const temporaryRoots: string[] = [];
const packageVersion = (
  JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

function temporaryHome(): string {
  const root = mkdtempSync(join(tmpdir(), 'thoth-agents-codex-local-'));
  temporaryRoots.push(root);
  return join(root, 'home');
}

function personalMarketplace(homeDirectory: string): string {
  const path = join(homeDirectory, '.agents', 'plugins', 'marketplace.json');
  mkdirSync(join(homeDirectory, '.agents', 'plugins'), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        name: 'personal',
        plugins: [
          {
            name: 'thoth-agents',
            source: {
              source: 'local',
              path: './plugins/thoth-agents',
            },
            policy: {
              installation: 'AVAILABLE',
              authentication: 'ON_INSTALL',
            },
            category: 'Productivity',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Codex local development setup', () => {
  test('exposes the local synchronization through the package command', () => {
    const packageManifest = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageManifest.scripts?.['setup:codex:local']).toBe(
      'pnpm run build && tsx scripts/setup-codex-local.ts',
    );
  });

  test('synchronizes the personal plugin payload and the standalone Codex agent pack', () => {
    const homeDirectory = temporaryHome();
    const marketplacePath = personalMarketplace(homeDirectory);
    const marketplaceBefore = readFileSync(marketplacePath, 'utf8');
    const pluginTarget = join(homeDirectory, 'plugins', 'thoth-agents');
    const codexHome = join(homeDirectory, '.codex');
    mkdirSync(pluginTarget, { recursive: true });
    writeFileSync(join(pluginTarget, 'stale.txt'), 'stale\n');
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(join(codexHome, 'AGENTS.md'), '# User instructions\n');

    const sourceManifestPath = join(
      process.cwd(),
      'plugin',
      '.codex-plugin',
      'plugin.json',
    );
    const sourceManifestBefore = readFileSync(sourceManifestPath, 'utf8');

    const result = syncCodexLocalSetup({
      repositoryRoot: process.cwd(),
      homeDirectory,
      codexHome,
      cachebuster: '20260831T120000Z',
      inspectPluginState: false,
    });

    expect(result).toMatchObject({
      pluginTarget: resolve(pluginTarget),
      marketplaceName: 'personal',
      pluginId: 'thoth-agents@personal',
      version: `${packageVersion}+codex.local-20260831T120000Z`,
    });
    expect(readFileSync(marketplacePath, 'utf8')).toBe(marketplaceBefore);
    expect(readFileSync(sourceManifestPath, 'utf8')).toBe(sourceManifestBefore);
    expect(() =>
      readFileSync(join(pluginTarget, 'stale.txt'), 'utf8'),
    ).toThrow();

    for (const manifestPath of [
      '.codex-plugin/plugin.json',
      '.claude-plugin/plugin.json',
    ]) {
      const manifest = JSON.parse(
        readFileSync(join(pluginTarget, manifestPath), 'utf8'),
      ) as { version?: string };
      expect(manifest.version).toBe(result.version);
    }

    const rootInstructions = readFileSync(join(codexHome, 'AGENTS.md'), 'utf8');
    expect(rootInstructions).toContain('# User instructions');
    expect(rootInstructions).toContain(
      '<!-- thoth-agents:codex-root:start -->',
    );
    for (const role of CODEX_ROLE_NAMES) {
      expect(
        readFileSync(
          join(codexHome, 'agents', `thoth-agents-${role}.toml`),
          'utf8',
        ),
      ).toContain(`name = "${role}"`);
    }
    expect(readFileSync(join(codexHome, 'config.toml'), 'utf8')).toContain(
      'default_mode_request_user_input = true',
    );
  });

  test('rejects an ambiguous public and personal plugin selection before writing', () => {
    const homeDirectory = temporaryHome();
    personalMarketplace(homeDirectory);
    const pluginTarget = join(homeDirectory, 'plugins', 'thoth-agents');
    mkdirSync(pluginTarget, { recursive: true });
    writeFileSync(join(pluginTarget, 'stale.txt'), 'preserve me\n');

    expect(() =>
      syncCodexLocalSetup({
        repositoryRoot: process.cwd(),
        homeDirectory,
        cachebuster: '20260831T120000Z',
        pluginStateExecutor: () => ({
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            installed: [
              {
                pluginId: 'thoth-agents@thoth-plugins',
                enabled: true,
              },
              {
                pluginId: 'thoth-agents@personal',
                enabled: true,
              },
            ],
          }),
        }),
      }),
    ).toThrow(/public and personal thoth-agents plugins are both enabled/i);

    expect(readFileSync(join(pluginTarget, 'stale.txt'), 'utf8')).toBe(
      'preserve me\n',
    );
    expect(() =>
      readFileSync(join(homeDirectory, '.codex', 'AGENTS.md'), 'utf8'),
    ).toThrow();
  });

  test('reports that the personal plugin still needs to be selected', () => {
    const homeDirectory = temporaryHome();
    personalMarketplace(homeDirectory);

    const result = syncCodexLocalSetup({
      repositoryRoot: process.cwd(),
      homeDirectory,
      cachebuster: '20260831T120000Z',
      pluginStateExecutor: () => ({
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          installed: [
            {
              pluginId: 'thoth-agents@thoth-plugins',
              enabled: true,
            },
          ],
        }),
      }),
    });

    expect(result.warnings).toEqual([
      'The personal plugin thoth-agents@personal is not enabled; install it from the personal marketplace after synchronization.',
    ]);
  });

  test('rejects a plugin target whose parent escapes through a link', () => {
    const homeDirectory = temporaryHome();
    personalMarketplace(homeDirectory);
    const outside = join(dirname(homeDirectory), 'outside-plugins');
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(homeDirectory, 'plugins'), 'junction');

    expect(() =>
      syncCodexLocalSetup({
        repositoryRoot: process.cwd(),
        homeDirectory,
        cachebuster: '20260831T120000Z',
        inspectPluginState: false,
      }),
    ).toThrow(/plugin target boundary must be a real directory/i);
    expect(() =>
      readFileSync(
        join(outside, 'thoth-agents', '.codex-plugin', 'plugin.json'),
      ),
    ).toThrow();
  });
});
