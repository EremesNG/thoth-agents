import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from './core/owned-skills';
import { generateIntegrationPackages } from './generate-integration-packages';

function runInit(script: string, project: string, cwd = process.cwd()) {
  return spawnSync(process.execPath, [script, '--project', project, '--json'], {
    cwd,
    encoding: 'utf8',
  });
}

function frontmatter(skillsRoot: string, skillName: string): string {
  const skill = readFileSync(join(skillsRoot, skillName, 'SKILL.md'), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(skill)?.[1];
  expect(match, `${skillName} frontmatter`).toBeDefined();
  return match ?? '';
}

function field(source: string, name: string): string {
  const raw = new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm')
    .exec(source)?.[1]
    .trim();
  expect(raw, `${name} field`).toBeDefined();
  if (!raw) return '';
  const quote = raw[0];
  return (quote === '"' || quote === "'") && raw.endsWith(quote)
    ? raw.slice(1, -1)
    : raw;
}

function filesBelow(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? filesBelow(root, path) : relative(root, path);
  });
}

describe('bundled thoth-init', () => {
  test('initializes the minimum .thoth governance graph offline and idempotently', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-bundle-'));
    const project = mkdtempSync(join(tmpdir(), 'thoth-project-'));
    const unrelatedCwd = mkdtempSync(join(tmpdir(), 'thoth-cwd-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });
      mkdirSync(join(project, 'openspec', 'memory'), { recursive: true });
      writeFileSync(
        join(project, 'openspec', 'memory', 'constitution.md'),
        '# Legacy governance remains untouched\n',
      );

      const script = join(
        packageRoot,
        'plugin',
        'skills',
        'thoth-init',
        'scripts',
        'init.mjs',
      );
      const first = runInit(script, project, unrelatedCwd);

      expect(first.status, first.stderr).toBe(0);
      const firstReport = JSON.parse(first.stdout);
      expect(firstReport).toMatchObject({
        status: 'ready',
        project,
      });
      for (const reportedPath of [
        ...firstReport.created,
        ...firstReport.managed,
        ...firstReport.preserved,
      ]) {
        expect(reportedPath).toContain(join(project, '.thoth'));
      }
      for (const path of [
        join('.thoth', 'changes'),
        join('.thoth', 'changes', 'archive'),
        join('.thoth', 'specs'),
        join('.thoth', 'constitution.md'),
        join('.thoth', '.thoth-agents.json'),
      ]) {
        expect(existsSync(join(project, path)), path).toBe(true);
      }
      expect(
        JSON.parse(
          readFileSync(join(project, '.thoth', '.thoth-agents.json'), 'utf8'),
        ),
      ).toEqual({
        schemaVersion: 1,
        initializedBy: 'thoth-agents',
        workflow: 'thoth-work',
      });
      expect(
        readFileSync(join(project, '.thoth', 'constitution.md'), 'utf8'),
      ).toContain('Native runtime authority');
      const constitutionValidation = spawnSync(
        process.execPath,
        [
          join(
            packageRoot,
            'plugin',
            'skills',
            'thoth-constitution',
            'scripts',
            'validate.mjs',
          ),
          '--constitution',
          join(project, '.thoth', 'constitution.md'),
          '--json',
        ],
        { cwd: unrelatedCwd, encoding: 'utf8' },
      );
      expect(constitutionValidation.status, constitutionValidation.stderr).toBe(
        0,
      );
      expect(
        readFileSync(
          join(project, 'openspec', 'memory', 'constitution.md'),
          'utf8',
        ),
      ).toBe('# Legacy governance remains untouched\n');

      const second = runInit(script, project, unrelatedCwd);
      expect(second.status, second.stderr).toBe(0);
      expect(JSON.parse(second.stdout)).toMatchObject({
        status: 'ready',
        created: [],
        managed: [],
      });
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
      rmSync(unrelatedCwd, { recursive: true, force: true });
    }
  });

  test('preserves an existing constitution byte-for-byte', () => {
    const project = mkdtempSync(join(tmpdir(), 'thoth-preserve-'));
    const script = join(
      process.cwd(),
      'skills',
      'thoth-init',
      'scripts',
      'init.mjs',
    );
    const constitutionPath = join(project, '.thoth', 'constitution.md');

    try {
      mkdirSync(join(project, '.thoth'));
      writeFileSync(constitutionPath, '# Project-owned constitution\r\n');
      const result = runInit(script, project);

      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(constitutionPath, 'utf8')).toBe(
        '# Project-owned constitution\r\n',
      );
      expect(JSON.parse(result.stdout).preserved).toContain(constitutionPath);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test('preflights conflicting and linked topology before writing', () => {
    const script = join(
      process.cwd(),
      'skills',
      'thoth-init',
      'scripts',
      'init.mjs',
    );
    const collisionProject = mkdtempSync(join(tmpdir(), 'thoth-collision-'));
    const linkedProject = mkdtempSync(join(tmpdir(), 'thoth-linked-'));
    const linkedTarget = mkdtempSync(join(tmpdir(), 'thoth-linked-target-'));

    try {
      mkdirSync(join(collisionProject, '.thoth'));
      writeFileSync(join(collisionProject, '.thoth', 'changes'), 'collision\n');
      const collision = runInit(script, collisionProject);
      expect(collision.status).not.toBe(0);
      expect(collision.stderr).toContain('must be a directory');
      expect(readdirSync(join(collisionProject, '.thoth'))).toEqual([
        'changes',
      ]);

      symlinkSync(linkedTarget, join(linkedProject, '.thoth'), 'junction');
      const linked = runInit(script, linkedProject);
      expect(linked.status).not.toBe(0);
      expect(linked.stderr).toContain('must be a directory');
      expect(readdirSync(linkedTarget)).toEqual([]);
    } finally {
      rmSync(collisionProject, { recursive: true, force: true });
      rmSync(linkedProject, { recursive: true, force: true });
      rmSync(linkedTarget, { recursive: true, force: true });
    }
  });
});

describe('canonical workflow bundle contracts', () => {
  test('publishes the five Agent Skills from canonical and generated roots', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-skill-metadata-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });
      expect(THOTH_OWNED_SKILL_NAMES).toEqual([
        'thoth-init',
        'thoth-work',
        'thoth-constitution',
        'thoth-archive',
        'plan-reviewer',
      ]);

      for (const skillsRoot of [
        join(process.cwd(), 'skills'),
        join(packageRoot, 'plugin', 'skills'),
      ]) {
        expect(
          readdirSync(skillsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort(),
        ).toEqual([...THOTH_OWNED_SKILL_NAMES].sort());
        for (const skillName of THOTH_OWNED_SKILL_NAMES) {
          const metadata = frontmatter(skillsRoot, skillName);
          expect(field(metadata, 'name')).toBe(skillName);
          expect(field(metadata, 'description').length).toBeGreaterThan(0);
          expect(field(metadata, 'license')).toBe('MIT');
          expect(field(metadata, 'compatibility').length).toBeLessThanOrEqual(
            500,
          );
        }
      }
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('keeps generated assets byte-identical and relative references resolvable', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'thoth-contracts-'));

    try {
      writeFileSync(
        join(packageRoot, 'package.json'),
        `${JSON.stringify({ name: 'thoth-agents', version: '0.3.0' })}\n`,
      );
      generateIntegrationPackages({ projectRoot: packageRoot });
      const canonicalRoot = join(process.cwd(), 'skills');
      const generatedRoot = join(packageRoot, 'plugin', 'skills');

      for (const skillName of THOTH_OWNED_SKILL_NAMES) {
        const canonicalSkillRoot = join(canonicalRoot, skillName);
        const generatedSkillRoot = join(generatedRoot, skillName);
        const canonicalFiles = filesBelow(canonicalSkillRoot).sort();
        expect(filesBelow(generatedSkillRoot).sort()).toEqual(canonicalFiles);
        for (const file of canonicalFiles) {
          expect(readFileSync(join(generatedSkillRoot, file))).toEqual(
            readFileSync(join(canonicalSkillRoot, file)),
          );
        }

        const skill = readFileSync(
          join(canonicalSkillRoot, 'SKILL.md'),
          'utf8',
        );
        const relativeAssets = [
          ...skill.matchAll(/`<skill-dir>\/([^`]+)`/g),
          ...skill.matchAll(/\]\((?!https?:)([^)#]+)(?:#[^)]+)?\)/g),
        ].map((match) => match[1]);
        for (const asset of relativeAssets) {
          expect(existsSync(join(canonicalSkillRoot, asset)), asset).toBe(true);
        }
      }

      const initSkill = readFileSync(
        join(canonicalRoot, 'thoth-init', 'SKILL.md'),
        'utf8',
      );
      expect(initSkill).toContain('node "<skill-dir>/scripts/init.mjs"');
      expect(initSkill).toContain('`.thoth/changes/archive/`');
      expect(initSkill).toMatch(/Existing `openspec\/`.*remains\s+untouched/s);
      const workSkill = readFileSync(
        join(canonicalRoot, 'thoth-work', 'SKILL.md'),
        'utf8',
      );
      expect(workSkill).toContain('`.thoth/changes/<id>/work.yaml`');
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });
});
