/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCodexPluginPackage } from './generate-codex-plugin';

describe('generateCodexPluginPackage', () => {
  const packageVersion = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as {
    version?: unknown;
  };

  if (typeof packageVersion.version !== 'string') {
    throw new Error('Expected root package.json version to be a string.');
  }

  test('writes deterministic repo-local plugin bundle and marketplace metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-plugin-generate-'));
    try {
      const result = generateCodexPluginPackage({ projectRoot: dir });

      expect(result.written).toContain(
        join(
          dir,
          'plugins',
          'EremesNG',
          'thoth-agents',
          '.codex-plugin',
          'plugin.json',
        ),
      );
      expect(
        existsSync(
          join(
            dir,
            'plugins',
            'EremesNG',
            'thoth-agents',
            '.codex-plugin',
            '.thoth-agents-plugin-assets.json',
          ),
        ),
      ).toBe(true);
      expect(
        readFileSync(
          join(
            dir,
            'plugins',
            'EremesNG',
            'thoth-agents',
            '.codex-plugin',
            'plugin.json',
          ),
          'utf8',
        ),
      ).toBe(
        `{\n  "name": "thoth-agents",\n  "version": "${packageVersion.version}",\n  "description": "Delegate-first OpenCode plugin with seven agents, thoth-mem persistence, and bundled SDD skills.",\n  "skills": "./skills/",\n  "mcpServers": "./.mcp.json"\n}\n`,
      );
      expect(
        existsSync(
          join(dir, 'plugins', 'EremesNG', 'thoth-agents', 'plugin.json'),
        ),
      ).toBe(false);

      const marketplace = JSON.parse(
        readFileSync(
          join(dir, '.agents', 'plugins', 'marketplace.json'),
          'utf8',
        ),
      );
      expect(marketplace.plugins).toEqual([
        expect.objectContaining({
          name: 'thoth-agents',
          category: 'Productivity',
          source: {
            source: 'local',
            path: './plugins/EremesNG/thoth-agents',
          },
        }),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('materializes manifest-relative payload directories at plugin root and removes stale generated files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-plugin-generate-'));
    const pluginRoot = join(dir, 'plugins', 'EremesNG', 'thoth-agents');
    try {
      const skillSource = join(dir, 'src', 'skills', 'sdd-apply');
      mkdirSync(skillSource, { recursive: true });
      writeFileSync(join(skillSource, 'SKILL.md'), '# Apply\n');

      mkdirSync(pluginRoot, { recursive: true });
      writeFileSync(join(pluginRoot, 'stale.txt'), 'stale');
      writeFileSync(join(pluginRoot, 'plugin.json'), '{"stale":true}\n');

      generateCodexPluginPackage({ projectRoot: dir });

      const manifest = JSON.parse(
        readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
      );

      expect(manifest.skills).toBe('./skills/');
      expect(manifest.mcpServers).toBe('./.mcp.json');
      expect(manifest.hooks).toBeUndefined();
      expect(
        existsSync(join(pluginRoot, 'skills', 'sdd-apply', 'SKILL.md')),
      ).toBe(true);
      expect(existsSync(join(pluginRoot, '.mcp.json'))).toBe(true);
      expect(existsSync(join(pluginRoot, 'hooks', 'hooks.json'))).toBe(false);
      expect(existsSync(join(pluginRoot, 'stale.txt'))).toBe(false);
      expect(existsSync(join(pluginRoot, 'plugin.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
