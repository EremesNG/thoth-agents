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
import { describe, expect, test } from 'vitest';
import { generateCodexPluginPackage } from './generate-codex-plugin';

describe('generateCodexPluginPackage v0.3', () => {
  const packageVersion = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as { version: string };

  test('writes the adaptive agent plugin and marketplace metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-plugin-v03-'));
    try {
      const result = generateCodexPluginPackage({ projectRoot: dir });
      const pluginRoot = join(dir, 'plugins', 'EremesNG', 'thoth-agents');
      const manifest = JSON.parse(
        readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
      ) as Record<string, unknown>;
      const marketplace = JSON.parse(
        readFileSync(
          join(dir, '.agents', 'plugins', 'marketplace.json'),
          'utf8',
        ),
      ) as { plugins: unknown[] };

      expect(result.written).toContain(
        join(pluginRoot, '.codex-plugin', 'plugin.json'),
      );
      expect(manifest).toEqual({
        name: 'thoth-agents',
        version: packageVersion.version,
        description:
          'Adaptive multi-harness agent pack with ten roles and Spec Kit-compatible SDD coordination.',
        mcpServers: './.mcp.json',
      });
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
      expect(existsSync(join(pluginRoot, 'skills'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('replaces stale output and omits legacy skills and empty hooks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-plugin-v03-'));
    const pluginRoot = join(dir, 'plugins', 'EremesNG', 'thoth-agents');
    try {
      mkdirSync(pluginRoot, { recursive: true });
      writeFileSync(join(pluginRoot, 'stale.txt'), 'stale');

      generateCodexPluginPackage({ projectRoot: dir });
      const manifest = JSON.parse(
        readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
      ) as Record<string, unknown>;

      expect(manifest.skills).toBeUndefined();
      expect(manifest.hooks).toBeUndefined();
      expect(manifest.mcpServers).toBe('./.mcp.json');
      expect(existsSync(join(pluginRoot, '.mcp.json'))).toBe(true);
      expect(readFileSync(join(pluginRoot, '.mcp.json'), 'utf8')).not.toContain(
        'thoth_mem',
      );
      expect(existsSync(join(pluginRoot, 'skills'))).toBe(false);
      expect(existsSync(join(pluginRoot, 'hooks', 'hooks.json'))).toBe(false);
      expect(existsSync(join(pluginRoot, 'stale.txt'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
