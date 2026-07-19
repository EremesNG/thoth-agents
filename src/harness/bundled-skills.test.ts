import { spawnSync } from 'node:child_process';
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
import { generateIntegrationPackages } from './generate-integration-packages';

function runInit(script: string, project: string, harness: string) {
  return spawnSync(
    process.execPath,
    [script, '--project', project, '--harness', harness, '--json'],
    { encoding: 'utf8' },
  );
}

describe('bundled thoth-init', () => {
  test('initializes Codex governance without pretending the plugin can install agents', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-bundle-'));
    const project = mkdtempSync(join(tmpdir(), 'thoth-project-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });

      mkdirSync(join(project, '.codex'), { recursive: true });
      writeFileSync(
        join(project, '.codex', 'config.toml'),
        '[features]\nunrelated_feature = true\n',
      );
      writeFileSync(join(project, 'AGENTS.md'), '# Project instructions\n');

      const script = join(
        packageRoot,
        'plugin',
        'skills',
        'thoth-init',
        'scripts',
        'init.mjs',
      );
      const first = runInit(script, project, 'codex');

      expect(first.status, first.stderr).toBe(0);
      expect(
        existsSync(join(project, 'openspec', 'memory', 'constitution.md')),
      ).toBe(true);
      expect(
        existsSync(join(project, 'openspec', 'templates', 'spec.md')),
      ).toBe(true);
      expect(
        existsSync(
          join(project, '.codex', 'agents', 'thoth-agents-oracle.toml'),
        ),
      ).toBe(false);
      expect(readFileSync(join(project, 'AGENTS.md'), 'utf8')).toBe(
        '# Project instructions\n',
      );
      expect(readFileSync(join(project, '.codex', 'config.toml'), 'utf8')).toBe(
        '[features]\nunrelated_feature = true\n',
      );

      const constitutionPath = join(
        project,
        'openspec',
        'memory',
        'constitution.md',
      );
      writeFileSync(constitutionPath, '# Project-owned constitution\n');

      const second = runInit(script, project, 'codex');
      expect(second.status, second.stderr).toBe(0);
      expect(readFileSync(constitutionPath, 'utf8')).toBe(
        '# Project-owned constitution\n',
      );
      expect(JSON.parse(second.stdout)).toMatchObject({
        harness: 'codex',
        status: 'ready',
      });
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('materializes only thoth-owned runtime skills for OpenCode', () => {
    const project = mkdtempSync(join(tmpdir(), 'thoth-opencode-'));
    const script = join(
      process.cwd(),
      'skills',
      'thoth-init',
      'scripts',
      'init.mjs',
    );

    try {
      const result = runInit(script, project, 'opencode');

      expect(result.status, result.stderr).toBe(0);
      for (const skill of [
        'thoth-init',
        'thoth-sdd',
        'thoth-constitution',
        'thoth-archive',
      ]) {
        expect(
          existsSync(join(project, '.agents', 'skills', skill, 'SKILL.md')),
          skill,
        ).toBe(true);
      }
      expect(
        readFileSync(
          join(project, '.agents', 'skills', 'thoth-sdd', 'SKILL.md'),
          'utf8',
        ),
      ).toMatch(/Never invoke the\s+thoth-agents CLI, `npx skills add`/);
      for (const skill of [
        'simplify',
        'tdd',
        'progressive-context-router',
        'architectural-grilling',
      ]) {
        expect(
          existsSync(join(project, '.agents', 'skills', skill, 'SKILL.md')),
          skill,
        ).toBe(false);
      }
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
