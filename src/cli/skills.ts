import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * A recommended skill to install via `npx skills add`.
 */
export interface RecommendedSkill {
  /** Human-readable name for prompts */
  name: string;
  /** GitHub repo URL for `npx skills add` */
  repo: string;
  /** Skill name within the repo (--skill flag) */
  skillName: string;
  /** Description shown to user during install */
  description: string;
  /** Optional commands to run after the skill is added */
  postInstallCommands?: string[];
}

export type RecommendedSkillInstallStatus =
  | 'installed'
  | 'already-installed'
  | 'failed';

export interface RecommendedSkillInstallResult {
  skill: RecommendedSkill;
  status: RecommendedSkillInstallStatus;
  skillPath: string;
  error?: unknown;
}

interface InstallRecommendedSkillOptions {
  homeDir?: string;
}

/**
 * List of recommended skills.
 * Add new skills here to include them in the installation flow.
 */
export const RECOMMENDED_SKILLS: RecommendedSkill[] = [
  {
    name: 'simplify',
    repo: 'https://github.com/brianlovin/claude-config',
    skillName: 'simplify',
    description: 'YAGNI code simplification expert',
  },
  {
    name: 'playwright-cli',
    repo: 'https://github.com/microsoft/playwright-cli',
    skillName: 'playwright-cli',
    description: 'Browser automation for visual checks and testing',
  },
];

export function getRecommendedSkillPath(
  skill: RecommendedSkill,
  homeDir = homedir(),
): string {
  return join(homeDir, '.agents', 'skills', skill.skillName, 'SKILL.md');
}

export function isRecommendedSkillInstalled(
  skill: RecommendedSkill,
  options: InstallRecommendedSkillOptions = {},
): boolean {
  return existsSync(getRecommendedSkillPath(skill, options.homeDir));
}

function runSkillInstallCommand(skill: RecommendedSkill): {
  success: boolean;
  error?: unknown;
} {
  const args = [
    'skills',
    'add',
    skill.repo,
    '--skill',
    skill.skillName,
    '-a',
    'opencode',
    '-y',
    '--global',
  ];

  try {
    const result = spawnSync('npx', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      return { success: false };
    }

    // Run post-install commands if any
    if (skill.postInstallCommands && skill.postInstallCommands.length > 0) {
      console.log(`Running post-install commands for ${skill.name}...`);
      for (const cmd of skill.postInstallCommands) {
        console.log(`> ${cmd}`);
        const [command, ...cmdArgs] = cmd.split(' ');
        const cmdResult = spawnSync(command, cmdArgs, { stdio: 'inherit' });
        if (cmdResult.status !== 0) {
          console.warn(`Post-install command failed: ${cmd}`);
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to install skill: ${skill.name}`, error);
    return { success: false, error };
  }
}

/**
 * Install a recommended OpenCode skill with idempotent semantics.
 */
export function installRecommendedSkill(
  skill: RecommendedSkill,
  options: InstallRecommendedSkillOptions = {},
): RecommendedSkillInstallResult {
  const skillPath = getRecommendedSkillPath(skill, options.homeDir);
  if (isRecommendedSkillInstalled(skill, options)) {
    return { skill, status: 'already-installed', skillPath };
  }

  const result = runSkillInstallCommand(skill);
  if (result.success) {
    return { skill, status: 'installed', skillPath };
  }

  if (isRecommendedSkillInstalled(skill, options)) {
    return { skill, status: 'already-installed', skillPath };
  }

  return { skill, status: 'failed', skillPath, error: result.error };
}

/**
 * Install a skill using `npx skills add`.
 * @param skill - The skill to install
 * @returns True if installation succeeded, false otherwise
 */
export function installSkill(skill: RecommendedSkill): boolean {
  return installRecommendedSkill(skill).status === 'installed';
}
