import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { claudeCodeAdapter } from './adapters/claude-code';
import { generateIntegrationPackages } from './generate-integration-packages';

function listFiles(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path)];
  });
}

describe('generateIntegrationPackages', () => {
  const packageVersion = (
    JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

  test('writes native Codex and Claude marketplace packages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-integration-packages-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: packageVersion })}\n`,
      );

      const result = generateIntegrationPackages({ projectRoot: dir });
      const codexRoot = join(dir, 'integrations', 'codex');
      const claudeRoot = join(dir, 'integrations', 'claude-code');
      const canonicalClaudeAgents = claudeCodeAdapter
        .render({ projectRoot: dir })
        .artifacts.filter((artifact) => artifact.path.startsWith('agents/'));
      const codexMarketplace = JSON.parse(
        readFileSync(
          join(dir, '.agents', 'plugins', 'marketplace.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      const claudeMarketplace = JSON.parse(
        readFileSync(join(dir, '.claude-plugin', 'marketplace.json'), 'utf8'),
      ) as Record<string, unknown>;
      const codexManifest = JSON.parse(
        readFileSync(join(codexRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
      ) as Record<string, unknown>;
      const claudeManifest = JSON.parse(
        readFileSync(join(claudeRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
      ) as Record<string, unknown>;

      expect(result.written).toEqual(
        expect.arrayContaining([
          join(dir, '.agents', 'plugins', 'marketplace.json'),
          join(dir, '.claude-plugin', 'marketplace.json'),
          join(codexRoot, '.codex-plugin', 'plugin.json'),
          join(claudeRoot, '.claude-plugin', 'plugin.json'),
        ]),
      );
      expect(codexMarketplace).toMatchObject({
        name: 'thoth-agents',
        plugins: [
          {
            name: 'thoth-agents',
            source: { source: 'local', path: './integrations/codex' },
            policy: {
              installation: 'AVAILABLE',
              authentication: 'ON_INSTALL',
            },
            category: 'Productivity',
          },
        ],
      });
      expect(claudeMarketplace).toMatchObject({
        $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
        name: 'thoth-agents',
        plugins: [
          {
            name: 'thoth-agents',
            version: packageVersion,
            source: './integrations/claude-code',
            category: 'productivity',
          },
        ],
      });
      expect(codexManifest).toMatchObject({
        name: 'thoth-agents',
        version: packageVersion,
      });
      expect(claudeManifest).toMatchObject({
        name: 'thoth-agents',
        version: packageVersion,
      });
      expect(existsSync(join(claudeRoot, 'agents', 'orchestrator.md'))).toBe(
        true,
      );
      expect(canonicalClaudeAgents).toHaveLength(10);
      for (const artifact of canonicalClaudeAgents) {
        expect(readFileSync(join(claudeRoot, artifact.path), 'utf8')).toBe(
          artifact.content,
        );
      }
      expect(existsSync(join(claudeRoot, 'settings.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('replaces stale integration output without provider-owned assets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-integration-packages-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: packageVersion })}\n`,
      );
      const codexRoot = join(dir, 'integrations', 'codex');
      const claudeRoot = join(dir, 'integrations', 'claude-code');
      mkdirSync(codexRoot, { recursive: true });
      mkdirSync(claudeRoot, { recursive: true });
      writeFileSync(join(codexRoot, 'stale.txt'), 'stale');
      writeFileSync(join(claudeRoot, 'stale.txt'), 'stale');

      generateIntegrationPackages({ projectRoot: dir });

      expect(existsSync(join(codexRoot, 'stale.txt'))).toBe(false);
      expect(existsSync(join(claudeRoot, 'stale.txt'))).toBe(false);
      expect(readFileSync(join(codexRoot, '.mcp.json'), 'utf8')).not.toContain(
        'thoth_mem',
      );
      expect(readFileSync(join(claudeRoot, '.mcp.json'), 'utf8')).not.toContain(
        'thoth_mem',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('keeps committed marketplace packages synchronized with the generator', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-integration-sync-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: packageVersion })}\n`,
      );
      generateIntegrationPackages({ projectRoot: dir });

      for (const relativeRoot of [
        join('integrations', 'codex'),
        join('integrations', 'claude-code'),
      ]) {
        const generatedRoot = join(dir, relativeRoot);
        const committedRoot = join(process.cwd(), relativeRoot);
        const generatedFiles = listFiles(generatedRoot).sort();
        expect(listFiles(committedRoot).sort()).toEqual(generatedFiles);
        for (const path of generatedFiles) {
          expect(readFileSync(join(committedRoot, path), 'utf8')).toBe(
            readFileSync(join(generatedRoot, path), 'utf8'),
          );
        }
      }

      for (const path of [
        join('.agents', 'plugins', 'marketplace.json'),
        join('.claude-plugin', 'marketplace.json'),
      ]) {
        expect(readFileSync(join(process.cwd(), path), 'utf8')).toBe(
          readFileSync(join(dir, path), 'utf8'),
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
