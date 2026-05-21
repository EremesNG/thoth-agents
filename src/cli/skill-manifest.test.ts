/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CUSTOM_SKILLS } from './custom-skills';
import {
  checkSkillsNeedUpdate,
  computeSkillHash,
  findRemovedSkills,
  readManifest,
  writeManifest,
} from './skill-manifest';

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
      continue;
    }

    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
  }
}

function createTestPackageRoot(version = '1.0.0'): string {
  const packageRoot = mkdtempSync(join(tmpdir(), 'skill-manifest-package-'));

  writeFileSync(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'test-package', version }),
  );

  const sharedDir = join(packageRoot, 'src', 'skills', '_shared');
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(join(sharedDir, 'convention.md'), 'shared content\n');

  for (const skill of CUSTOM_SKILLS) {
    const skillDir = join(packageRoot, skill.sourcePath);
    mkdirSync(join(skillDir, 'docs'), { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `# ${skill.name}\n\nSkill content for ${skill.name}.\n`,
    );
    writeFileSync(
      join(skillDir, 'docs', 'notes.md'),
      `notes for ${skill.name}\n`,
    );
  }

  return packageRoot;
}

function seedInstalledSkills(
  packageRoot: string,
  targetSkillsDir: string,
): void {
  const sourceSharedDir = join(packageRoot, 'src', 'skills', '_shared');
  copyDirRecursive(sourceSharedDir, join(targetSkillsDir, '_shared'));

  for (const skill of CUSTOM_SKILLS) {
    copyDirRecursive(
      join(packageRoot, skill.sourcePath),
      join(targetSkillsDir, skill.name),
    );
  }
}

describe('skill-manifest', () => {
  const originalEnv = { ...process.env };
  let tmpConfigRoot: string;
  let packageRoot: string;

  beforeEach(() => {
    tmpConfigRoot = mkdtempSync(join(tmpdir(), 'skill-manifest-config-'));
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

  test('readManifest returns null when no manifest exists', () => {
    expect(readManifest()).toBeNull();
  });

  test('writeManifest persists data that readManifest can load', () => {
    const manifest = {
      pluginVersion: '1.2.3',
      sharedHash: 'shared-hash',
      skills: {
        'requirements-interview': {
          hash: 'abc123',
          installedAt: '2026-03-25T00:00:00.000Z',
        },
      },
    };

    writeManifest(manifest);

    expect(readManifest()).toEqual(manifest);
  });

  test('computeSkillHash changes when nested file contents change', () => {
    const skillDir = mkdtempSync(join(tmpdir(), 'skill-hash-'));

    try {
      mkdirSync(join(skillDir, 'nested'), { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), 'hello\n');
      writeFileSync(join(skillDir, 'nested', 'notes.md'), 'notes\n');

      const originalHash = computeSkillHash(skillDir);

      writeFileSync(join(skillDir, 'nested', 'notes.md'), 'updated notes\n');

      expect(computeSkillHash(skillDir)).not.toBe(originalHash);
    } finally {
      rmSync(skillDir, { recursive: true, force: true });
    }
  });

  test('checkSkillsNeedUpdate reports all skills when the manifest is missing', () => {
    const check = checkSkillsNeedUpdate(packageRoot);

    expect(check.needsUpdate).toBe(true);
    expect(check.skillsNeedingUpdate).toHaveLength(CUSTOM_SKILLS.length);
    expect(
      check.skillsNeedingUpdate.every((entry) =>
        entry.reasons.includes('manifest-missing'),
      ),
    ).toBe(true);
  });

  test('checkSkillsNeedUpdate reports a version bump for installed skills', () => {
    const installedSkillsDir = join(tmpConfigRoot, 'opencode', 'skills');
    seedInstalledSkills(packageRoot, installedSkillsDir);

    const skills = Object.fromEntries(
      CUSTOM_SKILLS.map((skill) => [
        skill.name,
        {
          hash: computeSkillHash(join(packageRoot, skill.sourcePath)),
          installedAt: '2026-03-25T00:00:00.000Z',
        },
      ]),
    );

    writeManifest({
      pluginVersion: '0.9.0',
      sharedHash: computeSkillHash(
        join(packageRoot, 'src', 'skills', '_shared'),
      ),
      skills,
    });

    const check = checkSkillsNeedUpdate(packageRoot);

    expect(check.versionChanged).toBe(true);
    expect(check.skillsNeedingUpdate).toHaveLength(CUSTOM_SKILLS.length);
    expect(
      check.skillsNeedingUpdate.every((entry) =>
        entry.reasons.includes('version-change'),
      ),
    ).toBe(true);
  });

  test('checkSkillsNeedUpdate reports only skills missing from the manifest as new', () => {
    const installedSkillsDir = join(tmpConfigRoot, 'opencode', 'skills');
    seedInstalledSkills(packageRoot, installedSkillsDir);

    const skills = Object.fromEntries(
      CUSTOM_SKILLS.slice(1).map((skill) => [
        skill.name,
        {
          hash: computeSkillHash(join(packageRoot, skill.sourcePath)),
          installedAt: '2026-03-25T00:00:00.000Z',
        },
      ]),
    );

    writeManifest({
      pluginVersion: '1.0.0',
      sharedHash: computeSkillHash(
        join(packageRoot, 'src', 'skills', '_shared'),
      ),
      skills,
    });

    const check = checkSkillsNeedUpdate(packageRoot);

    expect(check.skillsNeedingUpdate).toHaveLength(1);
    expect(check.skillsNeedingUpdate[0]?.skill.name).toBe(
      CUSTOM_SKILLS[0]?.name,
    );
    expect(check.skillsNeedingUpdate[0]?.reasons).toContain('new-skill');
  });

  test('findRemovedSkills returns manifest skills that are no longer bundled', () => {
    const manifest = {
      pluginVersion: '1.0.0',
      sharedHash: 'shared-hash',
      skills: {
        'requirements-interview': {
          hash: 'requirements-interview-hash',
          installedAt: '2026-03-25T00:00:00.000Z',
        },
        'obsolete-skill': {
          hash: 'obsolete-hash',
          installedAt: '2026-03-25T00:00:00.000Z',
        },
      },
    };

    expect(findRemovedSkills(manifest)).toEqual(['obsolete-skill']);
  });

  test('checkSkillsNeedUpdate reports manifest skills removed from the bundle', () => {
    const installedSkillsDir = join(tmpConfigRoot, 'opencode', 'skills');
    seedInstalledSkills(packageRoot, installedSkillsDir);

    const skills = Object.fromEntries(
      CUSTOM_SKILLS.map((skill) => [
        skill.name,
        {
          hash: computeSkillHash(join(packageRoot, skill.sourcePath)),
          installedAt: '2026-03-25T00:00:00.000Z',
        },
      ]),
    );

    writeManifest({
      pluginVersion: '1.0.0',
      sharedHash: computeSkillHash(
        join(packageRoot, 'src', 'skills', '_shared'),
      ),
      skills: {
        ...skills,
        'obsolete-skill': {
          hash: 'obsolete-hash',
          installedAt: '2026-03-25T00:00:00.000Z',
        },
      },
    });

    const check = checkSkillsNeedUpdate(packageRoot);

    expect(check.needsUpdate).toBe(true);
    expect(check.skillsNeedingUpdate).toHaveLength(0);
    expect(check.removedSkills).toEqual(['obsolete-skill']);
  });
});
