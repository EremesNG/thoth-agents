import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type SkillInstallHarness = 'opencode' | 'codex' | 'claude';

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

interface InstallRequiredSkillOptions {
  homeDir?: string;
}

const SKILLS_CLI_AGENT: Record<SkillInstallHarness, string> = {
  opencode: 'opencode',
  codex: 'codex',
  claude: 'claude-code',
};

const GLOBAL_SKILL_ROOT: Record<SkillInstallHarness, readonly string[]> = {
  opencode: ['.config', 'opencode', 'skills'],
  codex: ['.codex', 'skills'],
  claude: ['.claude', 'skills'],
};

export const REQUIRED_SKILLS: readonly RequiredSkill[] = [
  {
    name: 'simplify',
    repo: 'https://github.com/brianlovin/claude-config',
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

export function getRequiredSkillPath(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  homeDir = homedir(),
): string {
  return join(
    homeDir,
    ...GLOBAL_SKILL_ROOT[harness],
    skill.skillName,
    'SKILL.md',
  );
}

export function isRequiredSkillInstalled(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  options: InstallRequiredSkillOptions = {},
): boolean {
  return existsSync(getRequiredSkillPath(skill, harness, options.homeDir));
}

export function getRequiredSkillInstallCommand(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
): { command: 'npx'; args: string[] } {
  return {
    command: 'npx',
    args: [
      'skills',
      'add',
      skill.repo,
      '--skill',
      skill.skillName,
      '--global',
      '--agent',
      SKILLS_CLI_AGENT[harness],
      '--yes',
    ],
  };
}

/** Install one mandatory skill into the selected harness's global skill root. */
export function installRequiredSkill(
  skill: RequiredSkill,
  harness: SkillInstallHarness,
  options: InstallRequiredSkillOptions = {},
): RequiredSkillInstallResult {
  const skillPath = getRequiredSkillPath(skill, harness, options.homeDir);
  if (isRequiredSkillInstalled(skill, harness, options)) {
    return { skill, harness, status: 'already-installed', skillPath };
  }

  const { command, args } = getRequiredSkillInstallCommand(skill, harness);
  try {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.status === 0) {
      return { skill, harness, status: 'installed', skillPath };
    }
    if (isRequiredSkillInstalled(skill, harness, options)) {
      return { skill, harness, status: 'already-installed', skillPath };
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
