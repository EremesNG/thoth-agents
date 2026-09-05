import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  getNpxCommand,
  type NpxCommand,
  type NpxCommandOptions,
} from './npx-command';

export type SkillInstallHarness = 'opencode' | 'codex' | 'claude' | 'pi';

/** An external skill required by every supported thoth-agents harness. */
export interface RequiredSkill {
  name: string;
  repo: string;
  skillName: string;
  description: string;
}

export type RequiredSkillInstallStatus =
  | 'installed'
  | 'already-installed'
  | 'failed';

export interface RequiredSkillInstallResult {
  skill: RequiredSkill;
  harness: SkillInstallHarness;
  status: RequiredSkillInstallStatus;
  skillPath: string;
  error?: unknown;
}

interface InstallRequiredSkillOptions extends NpxCommandOptions {
  homeDir?: string;
}

const SKILLS_CLI_AGENT: Record<SkillInstallHarness, string> = {
  opencode: 'opencode',
  codex: 'codex',
  claude: 'claude-code',
  pi: 'pi',
};

const GLOBAL_SKILL_ROOTS: Record<
  SkillInstallHarness,
  readonly (readonly string[])[]
> = {
  opencode: [
    ['.config', 'opencode', 'skills'],
    ['.agents', 'skills'],
  ],
  codex: [['.agents', 'skills']],
  claude: [['.claude', 'skills']],
  pi: [['.pi', 'agent', 'skills']],
};

export const REQUIRED_SKILLS: readonly RequiredSkill[] = [
  {
    name: 'simplify',
    repo: 'https://github.com/EremesNG/skills',
    skillName: 'simplify',
    description: 'YAGNI code simplification expert',
  },
  {
    name: 'tdd',
    repo: 'https://github.com/mattpocock/skills',
    skillName: 'tdd',
    description: 'Test-driven development workflow',
  },
  {
    name: 'progressive-context-router',
    repo: 'https://github.com/EremesNG/skills',
    skillName: 'progressive-context-router',
    description: 'Repository instruction and on-demand context routing',
  },
  {
    name: 'architectural-grilling',
    repo: 'https://github.com/EremesNG/skills',
    skillName: 'architectural-grilling',
    description: 'Conditional product and architecture decision interview',
  },
];

export function getRequiredSkillPaths(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  homeDir = homedir(),
): string[] {
  return GLOBAL_SKILL_ROOTS[harness].map((root) =>
    join(homeDir, ...root, skill.skillName, 'SKILL.md'),
  );
}

export function getRequiredSkillPath(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  homeDir = homedir(),
): string {
  const [primaryPath] = getRequiredSkillPaths(skill, harness, homeDir);
  if (!primaryPath) {
    throw new Error(`No global skill root is configured for ${harness}.`);
  }
  return primaryPath;
}

export function getInstalledRequiredSkillPath(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  homeDir = homedir(),
): string | undefined {
  return getRequiredSkillPaths(skill, harness, homeDir).find((path) =>
    existsSync(path),
  );
}

export function isRequiredSkillInstalled(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  options: InstallRequiredSkillOptions = {},
): boolean {
  return Boolean(
    getInstalledRequiredSkillPath(skill, harness, options.homeDir),
  );
}

export function getRequiredSkillInstallCommand(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  options: NpxCommandOptions = {},
): NpxCommand {
  return getNpxCommand(
    [
      '--yes',
      'skills',
      'add',
      skill.repo,
      '--skill',
      skill.skillName,
      '--global',
      '--agent',
      SKILLS_CLI_AGENT[harness],
      '--yes',
      ...(harness === 'pi' ? ['--copy'] : []),
    ],
    options,
  );
}

/** Install one mandatory skill into the selected harness's global skill root. */
export function installRequiredSkill(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  options: InstallRequiredSkillOptions = {},
): RequiredSkillInstallResult {
  const skillPath = getRequiredSkillPath(skill, harness, options.homeDir);
  const installedPath = getInstalledRequiredSkillPath(
    skill,
    harness,
    options.homeDir,
  );
  if (installedPath) {
    return {
      skill,
      harness,
      status: 'already-installed',
      skillPath: installedPath,
    };
  }

  const { command, args } = getRequiredSkillInstallCommand(
    skill,
    harness,
    options,
  );
  try {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.status === 0) {
      return {
        skill,
        harness,
        status: 'installed',
        skillPath:
          getInstalledRequiredSkillPath(skill, harness, options.homeDir) ??
          skillPath,
      };
    }
    const recoveredPath = getInstalledRequiredSkillPath(
      skill,
      harness,
      options.homeDir,
    );
    if (recoveredPath) {
      return {
        skill,
        harness,
        status: 'already-installed',
        skillPath: recoveredPath,
      };
    }
    return { skill, harness, status: 'failed', skillPath, error: result.error };
  } catch (error) {
    return { skill, harness, status: 'failed', skillPath, error };
  }
}

export function installRequiredSkills(
  harness: SkillInstallHarness,
  options: InstallRequiredSkillOptions = {},
): RequiredSkillInstallResult[] {
  return REQUIRED_SKILLS.map((skill) =>
    installRequiredSkill(skill, harness, options),
  );
}
