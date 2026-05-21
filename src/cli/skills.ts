import { spawnSync } from 'node:child_process';

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

/**
 * Install a skill using `npx skills add`.
 * @param skill - The skill to install
 * @returns True if installation succeeded, false otherwise
 */
export function installSkill(skill: RecommendedSkill): boolean {
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
      return false;
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

    return true;
  } catch (error) {
    console.error(`Failed to install skill: ${skill.name}`, error);
    return false;
  }
}
