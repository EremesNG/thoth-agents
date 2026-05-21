/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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
import {
  CUSTOM_SKILLS,
  findPackageRoot,
  getCustomSkillsDir,
  installCustomSkills,
  removeObsoleteSkills,
} from './custom-skills';
import {
  computeSkillHash,
  readManifest,
  writeManifest,
} from './skill-manifest';

function createTestPackageRoot(version = '1.0.0'): string {
  const packageRoot = mkdtempSync(join(tmpdir(), 'custom-skills-package-'));

  writeFileSync(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'test-package', version }),
  );

  const sharedDir = join(packageRoot, 'src', 'skills', '_shared');
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(join(sharedDir, 'convention.md'), 'shared content\n');

  for (const skill of CUSTOM_SKILLS) {
    const skillDir = join(packageRoot, skill.sourcePath);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `# ${skill.name}\n\nSkill content for ${skill.name}.\n`,
    );
  }

  return packageRoot;
}

describe('CUSTOM_SKILLS', () => {
  const originalEnv = { ...process.env };
  let tmpConfigRoot: string;
  let packageRoot: string;

  beforeEach(() => {
    tmpConfigRoot = mkdtempSync(join(tmpdir(), 'custom-skills-config-'));
    process.env = { ...originalEnv };
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = tmpConfigRoot;
    packageRoot = createTestPackageRoot();
  });

  afterEach(() => {
    process.env = { ...originalEnv };

    if (existsSync(tmpConfigRoot)) {
      rmSync(tmpConfigRoot, { recursive: true, force: true });
    }

    if (existsSync(packageRoot)) {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test('registers the executing-plans skill for orchestrator use', () => {
    expect(CUSTOM_SKILLS).toContainEqual({
      name: 'executing-plans',
      description:
        'Execute SDD task lists with real-time progress tracking, sub-agent dispatch, and verification checkpoints',
      allowedAgents: ['orchestrator'],
      sourcePath: 'src/skills/executing-plans',
    });
  });

  test('registers the sdd-init skill for orchestrator use', () => {
    expect(CUSTOM_SKILLS).toContainEqual({
      name: 'sdd-init',
      description: 'Initialize OpenSpec structure and SDD project context',
      allowedAgents: ['orchestrator'],
      sourcePath: 'src/skills/sdd-init',
    });
  });

  test('registers the thoth-mem-agents skill for orchestrator and subagents', () => {
    expect(CUSTOM_SKILLS).toContainEqual({
      name: 'thoth-mem-agents',
      description:
        'Orchestrator/subagent thoth-mem workflow contract for parent session_id/project ownership, prompt-save prohibitions, and safe durable memory usage',
      allowedAgents: [
        'orchestrator',
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'quick',
        'deep',
      ],
      sourcePath: 'src/skills/thoth-mem-agents',
    });
  });

  test('bundled thoth-mem-agents skill encodes critical ownership rules', () => {
    const skillPath = join(
      import.meta.dir,
      '..',
      'skills',
      'thoth-mem-agents',
      'SKILL.md',
    );
    const skill = readFileSync(skillPath, 'utf-8');

    expect(skill).toContain('Subagents MUST NOT call them.');
    expect(skill).toContain('Do not call `mem_context`');
    expect(skill).toContain('You do not own durable memory of your own.');
    expect(skill).toContain('Writable subagent calls `mem_context`');
    expect(skill).toContain('Never save a subagent prompt.');
  });

  test('findPackageRoot walks up from a bundled dist directory', () => {
    expect(findPackageRoot(join(packageRoot, 'dist'))).toBe(packageRoot);
  });

  test('findPackageRoot walks up from a bundled CLI dist directory', () => {
    expect(findPackageRoot(join(packageRoot, 'dist', 'cli'))).toBe(packageRoot);
  });

  test('findPackageRoot walks up from a source directory in development', () => {
    expect(findPackageRoot(join(packageRoot, 'src', 'cli'))).toBe(packageRoot);
  });

  test('findPackageRoot returns null when no package root markers exist', () => {
    const unrelatedDir = mkdtempSync(
      join(tmpdir(), 'custom-skills-unrelated-'),
    );

    try {
      expect(findPackageRoot(unrelatedDir)).toBeNull();
    } finally {
      rmSync(unrelatedDir, { recursive: true, force: true });
    }
  });

  test('installCustomSkills installs bundled skills and writes the manifest', () => {
    const report = installCustomSkills(packageRoot);

    expect(report.success).toBe(true);
    expect(report.updatedSkills).toHaveLength(CUSTOM_SKILLS.length);
    expect(report.skippedSkills).toHaveLength(0);
    expect(
      readFileSync(
        join(
          tmpConfigRoot,
          'opencode',
          'skills',
          'requirements-interview',
          'SKILL.md',
        ),
        'utf-8',
      ),
    ).toContain('Skill content for requirements-interview');
    expect(
      existsSync(join(tmpConfigRoot, 'opencode', 'skills', '_shared')),
    ).toBe(true);
    expect(readManifest()?.pluginVersion).toBe('1.0.0');
  });

  test('installCustomSkills skips reinstalling unchanged bundled skills', () => {
    const firstReport = installCustomSkills(packageRoot);
    const secondReport = installCustomSkills(packageRoot);

    expect(firstReport.success).toBe(true);
    expect(secondReport.success).toBe(true);
    expect(secondReport.updatedSkills).toHaveLength(0);
    expect(secondReport.skippedSkills).toHaveLength(CUSTOM_SKILLS.length);
  });

  test('installCustomSkills reinstalls only changed bundled skills', () => {
    const initialReport = installCustomSkills(packageRoot);
    expect(initialReport.success).toBe(true);

    const changedSkill = CUSTOM_SKILLS[0];
    if (!changedSkill) {
      throw new Error('Expected at least one custom skill');
    }

    writeFileSync(
      join(packageRoot, changedSkill.sourcePath, 'SKILL.md'),
      `# ${changedSkill.name}\n\nUpdated content.\n`,
    );

    const report = installCustomSkills(packageRoot);

    expect(report.success).toBe(true);
    expect(report.updatedSkills).toHaveLength(1);
    expect(report.updatedSkills[0]?.skill.name).toBe(changedSkill.name);
    expect(report.updatedSkills[0]?.reasons).toContain('hash-mismatch');
    expect(report.skippedSkills).toHaveLength(CUSTOM_SKILLS.length - 1);
  });

  test('installCustomSkills removes stale files from reinstalled skill directories', () => {
    const changedSkill = CUSTOM_SKILLS[0];
    if (!changedSkill) {
      throw new Error('Expected at least one custom skill');
    }

    const extraSourceFile = join(
      packageRoot,
      changedSkill.sourcePath,
      'extra.md',
    );
    writeFileSync(extraSourceFile, 'temporary content\n');

    const initialReport = installCustomSkills(packageRoot);
    expect(initialReport.success).toBe(true);

    const installedExtraFile = join(
      getCustomSkillsDir(),
      changedSkill.name,
      'extra.md',
    );
    expect(existsSync(installedExtraFile)).toBe(true);

    rmSync(extraSourceFile, { force: true });
    writeFileSync(
      join(packageRoot, changedSkill.sourcePath, 'SKILL.md'),
      `# ${changedSkill.name}\n\nUpdated content after cleanup.\n`,
    );

    const report = installCustomSkills(packageRoot);

    expect(report.success).toBe(true);
    expect(report.updatedSkills).toHaveLength(1);
    expect(report.updatedSkills[0]?.skill.name).toBe(changedSkill.name);
    expect(existsSync(installedExtraFile)).toBe(false);
  });

  test('removeObsoleteSkills deletes obsolete installed skill directories', () => {
    const obsoleteSkillDir = join(getCustomSkillsDir(), 'obsolete-skill');
    mkdirSync(obsoleteSkillDir, { recursive: true });
    writeFileSync(join(obsoleteSkillDir, 'SKILL.md'), '# obsolete\n');

    const removedSkills = removeObsoleteSkills(['obsolete-skill']);

    expect(removedSkills).toEqual(['obsolete-skill']);
    expect(existsSync(obsoleteSkillDir)).toBe(false);
  });

  test('installCustomSkills removes obsolete skills and rewrites the manifest', () => {
    const initialReport = installCustomSkills(packageRoot);
    expect(initialReport.success).toBe(true);

    const obsoleteSkillDir = join(getCustomSkillsDir(), 'obsolete-skill');
    mkdirSync(obsoleteSkillDir, { recursive: true });
    writeFileSync(join(obsoleteSkillDir, 'SKILL.md'), '# obsolete\n');

    const manifest = readManifest();
    if (!manifest) {
      throw new Error('Expected manifest after initial install');
    }

    const firstSkill = CUSTOM_SKILLS[0];
    if (!firstSkill) {
      throw new Error('Expected at least one custom skill');
    }

    writeManifest({
      ...manifest,
      skills: {
        ...manifest.skills,
        'obsolete-skill': {
          hash: 'obsolete-hash',
          installedAt: '2026-03-25T00:00:00.000Z',
        },
        [firstSkill.name]: {
          hash: computeSkillHash(join(packageRoot, firstSkill.sourcePath)),
          installedAt: '2026-03-25T00:00:00.000Z',
        },
      },
    });

    const report = installCustomSkills(packageRoot);

    expect(report.success).toBe(true);
    expect(report.updatedSkills).toHaveLength(0);
    expect(report.skippedSkills).toHaveLength(CUSTOM_SKILLS.length);
    expect(report.removedSkills).toEqual(['obsolete-skill']);
    expect(existsSync(obsoleteSkillDir)).toBe(false);
    expect(readManifest()?.skills['obsolete-skill']).toBeUndefined();
  });
});
