import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getRequiredSkillPath,
  installRequiredSkill,
  REQUIRED_SKILLS,
  type RequiredSkill,
  type SkillInstallHarness,
} from './skills';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

const testSkill: RequiredSkill = {
  name: 'simplify',
  repo: 'https://example.test/simplify',
  skillName: 'simplify',
  description: 'test skill',
};

const expectedPaths: Record<SkillInstallHarness, string[]> = {
  opencode: ['.config', 'opencode', 'skills'],
  codex: ['.codex', 'skills'],
  claude: ['.claude', 'skills'],
};

describe('required skill install helper', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  test('defines the exact mandatory skill set without prescribing a QA CLI', () => {
    expect(
      REQUIRED_SKILLS.map(({ name, repo, skillName }) => ({
        name,
        repo,
        skillName,
      })),
    ).toEqual([
      {
        name: 'simplify',
        repo: 'https://github.com/brianlovin/claude-config',
        skillName: 'simplify',
      },
      {
        name: 'tdd',
        repo: 'https://github.com/mattpocock/skills',
        skillName: 'tdd',
      },
      {
        name: 'progressive-context-router',
        repo: 'https://github.com/EremesNG/skills',
        skillName: 'progressive-context-router',
      },
      {
        name: 'architectural-grilling',
        repo: 'https://github.com/EremesNG/skills',
        skillName: 'architectural-grilling',
      },
    ]);
    expect(REQUIRED_SKILLS.map(({ name }) => name)).not.toContain(
      'playwright-cli',
    );
  });

  test.each(
    Object.keys(expectedPaths) as SkillInstallHarness[],
  )('returns already-installed for the native global %s skill directory', (harness) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-skill-home-'));
    const skillPath = join(
      homeDir,
      ...expectedPaths[harness],
      'simplify',
      'SKILL.md',
    );
    mkdirSync(join(skillPath, '..'), { recursive: true });
    writeFileSync(skillPath, '');

    const result = installRequiredSkill(testSkill, harness, { homeDir });

    expect(result.status).toBe('already-installed');
    expect(result.skillPath).toBe(skillPath);
    expect(getRequiredSkillPath(testSkill, harness, homeDir)).toBe(skillPath);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test.each([
    ['opencode', 'opencode'],
    ['codex', 'codex'],
    ['claude', 'claude-code'],
  ] as const)('targets %s explicitly through the skills CLI', (harness, cliAgent) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-skill-home-'));
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
    } as ReturnType<typeof spawnSync>);

    const result = installRequiredSkill(testSkill, harness, { homeDir });

    expect(result.status).toBe('failed');
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      [
        'skills',
        'add',
        testSkill.repo,
        '--skill',
        testSkill.skillName,
        '--global',
        '--agent',
        cliAgent,
        '--yes',
      ],
      { stdio: 'inherit' },
    );
  });
});
