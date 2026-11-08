import * as fs from 'node:fs';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from '../harness/core/owned-skills';
import {
  getPiOwnedSkillEntries,
  inspectPiPackageSkills,
  resolveOwnedSkillPackageRoot,
  syncOpenCodeOwnedSkills,
} from './owned-skills';

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
}));
vi.mock('node:path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:path')>()),
}));

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

beforeEach(() => {
  vi.stubEnv('OPENCODE_CONFIG_DIR', '');
  vi.stubEnv('XDG_CONFIG_HOME', '');
  vi.stubEnv('XDG_DATA_HOME', '');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

  test('uses package skills without copying trees into the global root', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);

    const result = syncOpenCodeOwnedSkills({ packageRoot, homeDir });

    expect(result).toMatchObject({ success: true, status: 'installed' });
    expect(result.notices).toEqual([]);
    expect(existsSync(join(homeDir, '.config', 'opencode', 'skills'))).toBe(
      false,
    );
  });

  test('preserves pre-existing copies because historical sync recorded no ownership', () => {
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
    expect(existsSync(join(staleRoot, 'obsolete.txt'))).toBe(true);
    expect(existsSync(join(staleRoot, 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(staleRoot, 'SKILL.md'), 'utf8')).toBe(
      `stale${String.fromCharCode(10)}`,
    );
    expect(result.notices?.join(' ')).toContain('shadow the packaged skills');
    expect(result.notices?.join(' ')).toContain(
      '--move-legacy-opencode-skills',
    );
    const preview = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      dryRun: true,
    });
    expect(preview.notices).toEqual(result.notices);
    expect(readFileSync(join(staleRoot, 'SKILL.md'), 'utf8')).toBe(
      `stale${String.fromCharCode(10)}`,
    );
  });

  test('confirmed move preserves bytes under a hidden backup and leaves unrelated skills', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const source = join(homeDir, '.config', 'opencode', 'skills', 'thoth-sdd');
    mkdirSync(source, { recursive: true });
    const bytes = Buffer.from([0, 255, 10, 13, 65]);
    writeFileSync(join(source, 'SKILL.md'), bytes);
    const result = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      moveLegacyOpenCodeSkills: true,
    });
    expect(existsSync(source)).toBe(false);
    expect(result.legacyMoves).toHaveLength(1);
    const moved = result.legacyMoves?.[0];
    expect(moved?.status).toBe('moved');
    expect(moved?.destinationPath).toContain('.opencode-legacy-skills');
    if (!moved) throw new Error('Expected moved skill');
    expect(readFileSync(join(moved.destinationPath, 'SKILL.md'))).toEqual(
      bytes,
    );
  });

  test.each([
    'EPERM',
    'EXDEV',
  ])('failed %s rename leaves the original bytes intact and warns', (code) => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const source = join(homeDir, '.config', 'opencode', 'skill', 'thoth-sdd');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), 'original');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error(code), { code });
    });
    const result = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      moveLegacyOpenCodeSkills: true,
    });
    expect(readFileSync(join(source, 'SKILL.md'), 'utf8')).toBe('original');
    expect(result.legacyMoves?.[0]?.status).toBe('failed');
    expect(result.notices?.join(' ')).toContain(code);
  });

  test('distinct resolved/legacy and singular/plural sources retain same-name copies separately', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const config = join(homeDir, 'custom');
    vi.stubEnv('OPENCODE_CONFIG_DIR', config);
    for (const root of [config, join(homeDir, '.config', 'opencode')]) {
      for (const directory of ['skill', 'skills']) {
        const source = join(root, directory, 'thoth-sdd');
        mkdirSync(source, { recursive: true });
        writeFileSync(join(source, 'SKILL.md'), source);
      }
    }
    const preview = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      dryRun: true,
      moveLegacyOpenCodeSkills: true,
    });
    expect(preview.legacyMoves).toHaveLength(4);
    if (!preview.backupRoot) throw new Error('Expected backup root');
    expect(existsSync(preview.backupRoot)).toBe(false);
    const result = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      moveLegacyOpenCodeSkills: true,
    });
    expect(
      new Set(result.legacyMoves?.map((move) => move.destinationPath)).size,
    ).toBe(4);
    for (const move of result.legacyMoves ?? []) {
      expect(move.status).toBe('moved');
      expect(readFileSync(join(move.destinationPath, 'SKILL.md'), 'utf8')).toBe(
        move.sourcePath,
      );
    }
  });

  test('same-realpath aliases are moved once', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const root = join(homeDir, '.config', 'opencode');
    const source = join(root, 'skills', 'thoth-sdd');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), 'same');
    symlinkSync(
      join(root, 'skills'),
      join(root, 'skill'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(
      syncOpenCodeOwnedSkills({
        packageRoot,
        homeDir,
        moveLegacyOpenCodeSkills: true,
      }).legacyMoves,
    ).toHaveLength(1);
  });

  test('pre-existing run directories are not reused and existing destinations are not overwritten', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const source = join(homeDir, '.config', 'opencode', 'skills', 'thoth-sdd');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), 'original');
    const mkdir = fs.mkdirSync;
    let collisions = 0;
    vi.spyOn(fs, 'mkdirSync').mockImplementation(((
      directory: string,
      options: unknown,
    ) => {
      if ((options as { mode?: number })?.mode === 0o700 && collisions++ === 0)
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      const result = mkdir(
        directory,
        options as fs.MakeDirectoryOptions & { recursive: true },
      );
      if (String(directory).endsWith('resolved-skills')) {
        mkdirSync(join(directory, 'thoth-sdd'));
        writeFileSync(join(directory, 'thoth-sdd', 'SKILL.md'), 'keep');
      }
      return result;
    }) as typeof fs.mkdirSync);
    const result = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      moveLegacyOpenCodeSkills: true,
    });
    expect(collisions).toBe(2);
    expect(result.legacyMoves?.[0]?.status).toBe('failed');
    expect(readFileSync(join(source, 'SKILL.md'), 'utf8')).toBe('original');
    const move = result.legacyMoves?.[0];
    if (!move) throw new Error('Expected planned move');
    expect(readFileSync(join(move.destinationPath, 'SKILL.md'), 'utf8')).toBe(
      'keep',
    );
  });

  test('refuses a computed backup path that lost the dot segment before writing', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const source = join(homeDir, '.config', 'opencode', 'skills', 'thoth-sdd');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), 'original');
    const resolve = path.resolve;
    vi.spyOn(path, 'resolve').mockImplementation((...parts) =>
      parts.includes('.opencode-legacy-skills')
        ? join(homeDir, 'unsafe')
        : resolve(...parts),
    );
    const result = syncOpenCodeOwnedSkills({
      packageRoot,
      homeDir,
      moveLegacyOpenCodeSkills: true,
    });
    expect(result.notices?.join(' ')).toContain('missing the required hidden');
    expect(existsSync(join(homeDir, 'unsafe'))).toBe(false);
    expect(readFileSync(join(source, 'SKILL.md'), 'utf8')).toBe('original');
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

  test('does not require a writable global root for package skills', () => {
    const packageRoot = temporaryRoot('thoth-owned-package-');
    const homeDir = temporaryRoot('thoth-owned-home-');
    writeCanonicalBundle(packageRoot);
    const configRoot = join(homeDir, '.config', 'opencode');
    mkdirSync(configRoot, { recursive: true });
    const skillRoot = join(configRoot, 'skills');
    writeFileSync(skillRoot, 'occupied\n');

    const result = syncOpenCodeOwnedSkills({ packageRoot, homeDir });

    expect(result).toMatchObject({ success: true, status: 'installed' });
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
