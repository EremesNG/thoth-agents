import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getRequiredSkillInstallCommand,
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
  codex: ['.agents', 'skills'],
  claude: ['.claude', 'skills'],
  pi: ['.pi', 'agent', 'skills'],
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
        repo: 'https://github.com/EremesNG/skills',
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

  test('returns the existing OpenCode agent-compatible global skill path', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-skill-home-'));
    const skillPath = join(
      homeDir,
      '.agents',
      'skills',
      'simplify',
      'SKILL.md',
    );
    mkdirSync(join(skillPath, '..'), { recursive: true });
    writeFileSync(skillPath, '');

    const result = installRequiredSkill(testSkill, 'opencode', { homeDir });

    expect(result).toMatchObject({
      status: 'already-installed',
      skillPath,
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test.each([
    ['opencode', 'opencode'],
    ['codex', 'codex'],
    ['claude', 'claude-code'],
    ['pi', 'pi'],
  ] as const)('targets %s explicitly through the skills CLI', (harness, cliAgent) => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-skill-home-'));
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
    } as ReturnType<typeof spawnSync>);

    const result = installRequiredSkill(testSkill, harness, {
      homeDir,
      platform: 'linux',
    });

    expect(result.status).toBe('failed');
    const expectedArgs = [
      '--yes',
      'skills',
      'add',
      testSkill.repo,
      '--skill',
      testSkill.skillName,
      '--global',
      '--agent',
      cliAgent,
      '--yes',
      ...(harness === 'pi' ? ['--copy'] : []),
    ];
    expect(
      getRequiredSkillInstallCommand(testSkill, harness, {
        platform: 'linux',
      }),
    ).toEqual({
      command: 'npx',
      args: expectedArgs,
    });
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      getRequiredSkillInstallCommand(testSkill, harness, {
        platform: 'linux',
      }).args,
      { stdio: 'inherit' },
    );
  });

  test('routes the complete npx command through cmd.exe on Windows', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-skill-home-'));
    const commandShell = 'C:\\Windows\\System32\\cmd.exe';
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
    } as ReturnType<typeof spawnSync>);

    const result = installRequiredSkill(testSkill, 'codex', {
      homeDir,
      platform: 'win32',
      commandShell,
    });

    const expectedCommand = {
      command: commandShell,
      args: [
        '/d',
        '/s',
        '/c',
        'npx --yes skills add https://example.test/simplify --skill simplify --global --agent codex --yes',
      ],
    };

    expect(result.status).toBe('failed');
    expect(
      getRequiredSkillInstallCommand(testSkill, 'codex', {
        platform: 'win32',
        commandShell,
      }),
    ).toEqual(expectedCommand);
    expect(spawnSync).toHaveBeenCalledWith(
      expectedCommand.command,
      expectedCommand.args,
      { stdio: 'inherit' },
    );
  });
});
