import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { installRecommendedSkill, type RecommendedSkill } from './skills';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

const testSkill: RecommendedSkill = {
  name: 'simplify',
  repo: 'https://example.test/simplify',
  skillName: 'simplify',
  description: 'test skill',
};

describe('recommended skill install helper', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  test('returns already-installed without invoking skills add when global skill exists', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-skill-home-'));
    mkdirSync(join(homeDir, '.agents', 'skills', 'simplify'), {
      recursive: true,
    });
    writeFileSync(
      join(homeDir, '.agents', 'skills', 'simplify', 'SKILL.md'),
      '',
    );

    const result = installRecommendedSkill(testSkill, { homeDir });

    expect(result.status).toBe('already-installed');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test('returns failed when skills add fails and the skill is still absent', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-skill-home-'));
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
    } as ReturnType<typeof spawnSync>);

    const result = installRecommendedSkill(testSkill, { homeDir });

    expect(result.status).toBe('failed');
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['skills', 'add', '--skill', 'simplify']),
      { stdio: 'inherit' },
    );
  });
});
