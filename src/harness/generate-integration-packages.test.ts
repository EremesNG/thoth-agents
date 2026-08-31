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
import { THOTH_OWNED_SKILL_NAMES } from './core/owned-skills';
import {
  formatIntegrationDiagnostic,
  generateIntegrationPackages,
  getIntegrationDiagnosticExitCode,
  prepareIntegrationDiagnostics,
} from './generate-integration-packages';

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

  test('writes one shared native Codex and Claude plugin bundle without package marketplaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-integration-packages-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: packageVersion })}\n`,
      );

      const result = generateIntegrationPackages({ projectRoot: dir });
      const pluginRoot = join(dir, 'plugin');
      const canonicalClaudeAgents = claudeCodeAdapter
        .render({ projectRoot: dir })
        .artifacts.filter((artifact) => artifact.path.startsWith('agents/'));
      const codexManifest = JSON.parse(
        readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
      ) as Record<string, unknown>;
      const claudeManifest = JSON.parse(
        readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
      ) as Record<string, unknown>;

      expect(result.written).toEqual(
        expect.arrayContaining([
          join(pluginRoot, '.codex-plugin', 'plugin.json'),
          join(pluginRoot, '.claude-plugin', 'plugin.json'),
        ]),
      );
      expect(result.written).not.toContain(
        join(dir, '.agents', 'plugins', 'marketplace.json'),
      );
      expect(result.written).not.toContain(
        join(dir, '.claude-plugin', 'marketplace.json'),
      );
      expect(
        existsSync(join(dir, '.agents', 'plugins', 'marketplace.json')),
      ).toBe(false);
      expect(existsSync(join(dir, '.claude-plugin', 'marketplace.json'))).toBe(
        false,
      );
      const packageFiles = (
        JSON.parse(
          readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
        ) as {
          files: string[];
        }
      ).files;
      expect(packageFiles).not.toContain('.agents/plugins/marketplace.json');
      expect(packageFiles).not.toContain('.claude-plugin/marketplace.json');
      expect(codexManifest).toMatchObject({
        name: 'thoth-agents',
        version: packageVersion,
        skills: './skills/',
        mcpServers: './codex.mcp.json',
      });
      expect(claudeManifest).toMatchObject({
        name: 'thoth-agents',
        version: packageVersion,
      });
      expect(existsSync(join(pluginRoot, 'agents', 'orchestrator.md'))).toBe(
        true,
      );
      expect(canonicalClaudeAgents).toHaveLength(7);
      for (const artifact of canonicalClaudeAgents) {
        expect(readFileSync(join(pluginRoot, artifact.path), 'utf8')).toBe(
          artifact.content,
        );
      }
      expect(existsSync(join(pluginRoot, 'settings.json'))).toBe(true);
      expect(existsSync(join(pluginRoot, '.mcp.json'))).toBe(true);
      expect(existsSync(join(pluginRoot, 'codex.mcp.json'))).toBe(true);
      for (const skill of THOTH_OWNED_SKILL_NAMES) {
        expect(
          existsSync(join(pluginRoot, 'skills', skill, 'SKILL.md')),
          `Shared bundle ${skill}`,
        ).toBe(true);
      }
      expect(
        existsSync(
          join(
            pluginRoot,
            'skills',
            'plan-reviewer',
            'templates',
            'plan-review.md',
          ),
        ),
      ).toBe(true);
      for (const skill of [
        'simplify',
        'tdd',
        'progressive-context-router',
        'architectural-grilling',
      ]) {
        expect(
          existsSync(join(pluginRoot, 'skills', skill, 'SKILL.md')),
          `Shared bundle ${skill}`,
        ).toBe(false);
      }
      expect(
        listFiles(pluginRoot).some((path) =>
          path.includes(join('thoth-init', 'assets', 'codex-agents')),
        ),
      ).toBe(false);
      expect(listFiles(pluginRoot).some((path) => path.endsWith('.toml'))).toBe(
        false,
      );
      expect(
        existsSync(
          join(pluginRoot, 'skills', 'thoth-init', 'scripts', 'init.mjs'),
        ),
      ).toBe(true);
      const initContract = readFileSync(
        join(pluginRoot, 'skills', 'thoth-init', 'SKILL.md'),
        'utf8',
      );
      const initScript = readFileSync(
        join(pluginRoot, 'skills', 'thoth-init', 'scripts', 'init.mjs'),
        'utf8',
      );
      expect(initContract).toContain('Every write stays\ninside `openspec/`');
      expect(initContract).not.toContain('--harness');
      expect(initScript).not.toContain("'.agents'");
      expect(initScript).not.toContain('OWNED_SKILL_NAMES');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('replaces stale shared output and removes legacy integration bundles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-integration-packages-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: packageVersion })}\n`,
      );
      const pluginRoot = join(dir, 'plugin');
      const codexRoot = join(dir, 'integrations', 'codex');
      const claudeRoot = join(dir, 'integrations', 'claude-code');
      for (const root of [pluginRoot, codexRoot, claudeRoot]) {
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'stale.txt'), 'stale');
      }

      generateIntegrationPackages({ projectRoot: dir });

      expect(existsSync(join(pluginRoot, 'stale.txt'))).toBe(false);
      expect(existsSync(codexRoot)).toBe(false);
      expect(existsSync(claudeRoot)).toBe(false);
      expect(existsSync(join(dir, 'integrations'))).toBe(false);
      expect(
        readFileSync(join(pluginRoot, 'codex.mcp.json'), 'utf8'),
      ).not.toContain('thoth_mem');
      expect(readFileSync(join(pluginRoot, '.mcp.json'), 'utf8')).not.toContain(
        'thoth_mem',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('preserves unrelated content under the legacy integrations root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-integration-packages-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: packageVersion })}\n`,
      );
      const unrelatedFile = join(dir, 'integrations', 'custom', 'keep.txt');
      mkdirSync(join(dir, 'integrations', 'custom'), { recursive: true });
      writeFileSync(unrelatedFile, 'keep');

      generateIntegrationPackages({ projectRoot: dir });

      expect(readFileSync(unrelatedFile, 'utf8')).toBe('keep');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('keeps the committed shared plugin synchronized with the generator', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-integration-sync-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: packageVersion })}\n`,
      );
      generateIntegrationPackages({ projectRoot: dir });

      const relativeRoot = 'plugin';
      const generatedRoot = join(dir, relativeRoot);
      const committedRoot = join(process.cwd(), relativeRoot);
      const generatedFiles = listFiles(generatedRoot).sort();
      expect(listFiles(committedRoot).sort()).toEqual(generatedFiles);
      for (const path of generatedFiles) {
        expect(readFileSync(join(committedRoot, path), 'utf8')).toBe(
          readFileSync(join(generatedRoot, path), 'utf8'),
        );
      }
      expect(existsSync(join(process.cwd(), 'integrations'))).toBe(false);

      expect(
        existsSync(
          join(process.cwd(), '.agents', 'plugins', 'marketplace.json'),
        ),
      ).toBe(false);
      expect(
        existsSync(join(process.cwd(), '.claude-plugin', 'marketplace.json')),
      ).toBe(false);
      expect(
        existsSync(join(dir, '.agents', 'plugins', 'marketplace.json')),
      ).toBe(false);
      expect(existsSync(join(dir, '.claude-plugin', 'marketplace.json'))).toBe(
        false,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('presents recoverable capability gaps once without failing the build', () => {
    const report = prepareIntegrationDiagnostics([
      {
        severity: 'error',
        code: 'codex.context.parent_injection.unvalidated',
        message: 'Parent context is not machine-enforced.',
        fallback: 'instruction-only',
      },
      {
        severity: 'warning',
        code: 'codex.context.parent_injection.unvalidated',
        message: 'Duplicate governance diagnostic.',
        fallback: 'instruction-only',
      },
      {
        severity: 'warning',
        code: 'codex.permission.memory.enforcement_gap',
        message: 'Per-agent permission enforcement is unavailable.',
        fallback: 'instruction-only',
      },
    ]);

    expect(report).toEqual([
      {
        level: 'capability-gap',
        code: 'codex.context.parent_injection.unvalidated',
        message: 'Parent context is not machine-enforced.',
        fallback: 'instruction-only',
        fatal: false,
      },
      {
        level: 'capability-gap',
        code: 'codex.permission.memory.enforcement_gap',
        message: 'Per-agent permission enforcement is unavailable.',
        fallback: 'instruction-only',
        fatal: false,
      },
    ]);
    expect(getIntegrationDiagnosticExitCode(report)).toBe(0);
    expect(formatIntegrationDiagnostic(report[0])).toBe(
      'capability-gap (non-fatal): codex.context.parent_injection.unvalidated — Parent context is not machine-enforced. [fallback: instruction-only]',
    );
  });

  test('reserves fatal errors and a nonzero exit code for diagnostics without recovery', () => {
    const report = prepareIntegrationDiagnostics([
      {
        severity: 'error',
        code: 'integration.artifact.write_failed',
        message: 'A required artifact could not be written.',
        fallback: 'none',
      },
    ]);

    expect(report).toEqual([
      {
        level: 'error',
        code: 'integration.artifact.write_failed',
        message: 'A required artifact could not be written.',
        fallback: 'none',
        fatal: true,
      },
    ]);
    expect(getIntegrationDiagnosticExitCode(report)).toBe(1);
    expect(formatIntegrationDiagnostic(report[0])).toBe(
      'error: integration.artifact.write_failed — A required artifact could not be written.',
    );
  });
});
