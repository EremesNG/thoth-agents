import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from '../harness/core/owned-skills';
import {
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
});
