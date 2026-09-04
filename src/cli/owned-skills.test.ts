import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from '../harness/core/owned-skills';
import {
  getPiOwnedSkillEntries,
  inspectPiPackageSkills,
  resolveOwnedSkillPackageRoot,
  syncOpenCodeOwnedSkills,
} from './owned-skills';

const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function writeCanonicalBundle(packageRoot: string): void {
  for (const skillName of THOTH_OWNED_SKILL_NAMES) {
    const skillRoot = join(packageRoot, 'skills', skillName);
    mkdirSync(join(skillRoot, 'references'), { recursive: true });
    writeFileSync(
      join(skillRoot, 'SKILL.md'),
      `---\nname: ${skillName}\ndescription: Test ${skillName}\n---\n`,
    );
    writeFileSync(
      join(skillRoot, 'references', 'contract.md'),
      `${skillName} contract\n`,
    );
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('OpenCode owned skill synchronization', () => {
  test('resolves the package root from an emitted dist chunk location', () => {
    const packageRoot = temporaryRoot('thoth-owned-release-layout-');
    const chunkPath = join(packageRoot, 'dist', 'chunk-TEST.js');
    mkdirSync(join(packageRoot, 'dist'));
    writeFileSync(
      join(packageRoot, 'package.json'),
      `${JSON.stringify({ name: 'thoth-agents' })}\n`,
    );

    expect(resolveOwnedSkillPackageRoot(pathToFileURL(chunkPath).href)).toBe(
      packageRoot,
    );
  });

  test('plans exactly five canonical global skills without writing', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);

    const result = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      dryRun: true,
    });

    expect(result).toMatchObject({
      success: true,
      status: 'planned',
      skills: THOTH_OWNED_SKILL_NAMES.map((name) => ({
        name,
        sourcePath: join(packageRoot, 'skills', name),
        destinationPath: join(homeDir, '.config', 'opencode', 'skills', name),
      })),
    });
    expect(existsSync(join(homeDir, '.config', 'opencode', 'skills'))).toBe(
      false,
    );
  });

  test('installs every canonical skill tree into the global root', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);

    const result = syncOpenCodeOwnedSkills({ packageRoot, homeDir });

    expect(result).toMatchObject({ success: true, status: 'installed' });
    for (const skillName of THOTH_OWNED_SKILL_NAMES) {
      expect(
        existsSync(
          join(
            homeDir,
            '.config',
            'opencode',
            'skills',
            skillName,
            'references',
            'contract.md',
          ),
        ),
        skillName,
      ).toBe(true);
    }
  });

  test('replaces stale owned skill trees instead of merging them', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const staleRoot = join(
      homeDir,
      '.config',
      'opencode',
      'skills',
      'thoth-sdd',
    );
    mkdirSync(staleRoot, { recursive: true });
    writeFileSync(join(staleRoot, 'SKILL.md'), 'stale\n');
    writeFileSync(join(staleRoot, 'obsolete.txt'), 'obsolete\n');

    const result = syncOpenCodeOwnedSkills({ packageRoot, homeDir });

    expect(result.success).toBe(true);
    expect(existsSync(join(staleRoot, 'obsolete.txt'))).toBe(false);
    expect(existsSync(join(staleRoot, 'references', 'contract.md'))).toBe(true);
  });

  test('rejects an incomplete canonical bundle before destination writes', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    rmSync(join(packageRoot, 'skills', 'plan-reviewer'), {
      recursive: true,
      force: true,
    });

    const result = syncOpenCodeOwnedSkills({ packageRoot, homeDir });

    expect(result).toMatchObject({
      success: false,
      status: 'failed',
      error: 'Canonical owned skill directory is missing: plan-reviewer',
    });
    expect(existsSync(join(homeDir, '.config', 'opencode', 'skills'))).toBe(
      false,
    );
  });

  test('reports an unwritable global skill root without replacing it', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const configRoot = join(homeDir, '.config', 'opencode');
    mkdirSync(configRoot, { recursive: true });
    const skillRoot = join(configRoot, 'skills');
    writeFileSync(skillRoot, 'occupied\n');

    const result = syncOpenCodeOwnedSkills({ packageRoot, homeDir });

    expect(result).toMatchObject({ success: false, status: 'failed' });
    expect(existsSync(skillRoot)).toBe(true);
  });

  test('Pi discovers owned skills from the package manifest without global copies', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    writeCanonicalBundle(packageRoot);
    const entries = getPiOwnedSkillEntries({ packageRoot });
    expect(entries).toHaveLength(5);
    expect(
      entries.every((entry) => entry.destinationPath === entry.sourcePath),
    ).toBe(true);
    expect(inspectPiPackageSkills({ packageRoot })).toMatchObject({
      success: true,
      state: 'available',
      skills: entries,
    });
  });

  test('Pi package skill inspection rejects malformed and symlinked contracts', () => {
    const malformedRoot = temporaryRoot('thoth-pi-skill-malformed-');
    writeCanonicalBundle(malformedRoot);
    writeFileSync(
      join(malformedRoot, 'skills', 'thoth-sdd', 'SKILL.md'),
      '# missing frontmatter\n',
    );
    expect(
      inspectPiPackageSkills({ packageRoot: malformedRoot }),
    ).toMatchObject({
      success: false,
      state: 'unavailable',
      issues: [expect.objectContaining({ name: 'thoth-sdd', state: 'drift' })],
    });

    const symlinkRoot = temporaryRoot('thoth-pi-skill-symlink-');
    const outside = temporaryRoot('thoth-pi-skill-outside-');
    writeCanonicalBundle(symlinkRoot);
    writeCanonicalBundle(outside);
    const linkedSkill = join(symlinkRoot, 'skills', 'plan-reviewer');
    rmSync(linkedSkill, { recursive: true, force: true });
    symlinkSync(
      join(outside, 'skills', 'plan-reviewer'),
      linkedSkill,
      'junction',
    );
    expect(inspectPiPackageSkills({ packageRoot: symlinkRoot })).toMatchObject({
      success: false,
      state: 'unavailable',
      issues: [
        expect.objectContaining({ name: 'plan-reviewer', state: 'drift' }),
      ],
    });
  });

  test.each([
    {
      case: 'body fields bait a wrong initial frontmatter block',
      content:
        '---\nname: wrong\ndescription: wrong\n---\nname: plan-reviewer\ndescription: body bait\n',
    },
    {
      case: 'the initial frontmatter block is not closed',
      content:
        '---\nname: plan-reviewer\ndescription: valid\nname: plan-reviewer\ndescription: body bait\n',
    },
    {
      case: 'description is empty inside frontmatter',
      content:
        '---\nname: plan-reviewer\ndescription:\n---\ndescription: body bait\n',
    },
    {
      case: 'the expected name only appears in the body',
      content:
        '---\nname: wrong\ndescription: valid\n---\nname: plan-reviewer\n',
    },
    {
      case: 'name is missing from frontmatter',
      content: '---\ndescription: valid\n---\nname: plan-reviewer\n',
    },
  ])('rejects a Pi skill when $case', ({ content }) => {
    const packageRoot = temporaryRoot('thoth-pi-skill-frontmatter-');
    writeCanonicalBundle(packageRoot);
    writeFileSync(
      join(packageRoot, 'skills', 'plan-reviewer', 'SKILL.md'),
      content,
    );

    expect(inspectPiPackageSkills({ packageRoot })).toMatchObject({
      success: false,
      state: 'unavailable',
      issues: [
        expect.objectContaining({ name: 'plan-reviewer', state: 'drift' }),
      ],
    });
  });

  test('ignores duplicate and misleading skill fields after closed frontmatter', () => {
    const packageRoot = temporaryRoot('thoth-pi-skill-body-fields-');
    writeCanonicalBundle(packageRoot);
    writeFileSync(
      join(packageRoot, 'skills', 'plan-reviewer', 'SKILL.md'),
      '---\nname: plan-reviewer\ndescription: Valid metadata\n---\nname: wrong\ndescription:\n',
    );

    expect(inspectPiPackageSkills({ packageRoot })).toMatchObject({
      success: true,
      state: 'available',
      issues: [],
    });
  });
});
