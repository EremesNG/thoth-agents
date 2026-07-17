import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_SKILL_REGISTRY } from '../harness/core/skills';
import { getConfigDir } from './paths';
import {
  checkSkillsNeedUpdate,
  computeSkillHash,
  type SkillManifest,
  type SkillUpdateCheck,
  type SkillUpdateEntry,
  type SkillUpdateReason,
  writeManifest,
} from './skill-manifest';

/**
 * A custom skill bundled in this repository.
 * Unlike npx-installed skills, these are copied from src/skills/ to the OpenCode skills directory
 */
export interface CustomSkill {
  /** Skill name (folder name) */
  name: string;
  /** Human-readable description */
  description: string;
  /** List of agents that should auto-allow this skill */
  allowedAgents: string[];
  /** Source path in this repo (relative to project root) */
  sourcePath: string;
}

const SHARED_SKILL_DIRECTORY = '_shared';
const SHARED_SKILL_SOURCE_PATH = `src/skills/${SHARED_SKILL_DIRECTORY}`;

/**
 * Registry of custom skills bundled in this repository.
 */
export const CUSTOM_SKILLS: CustomSkill[] = BUNDLED_SKILL_REGISTRY.map(
  (skill) => ({
    name: skill.name,
    description: skill.description,
    allowedAgents: [...skill.allowedRoles],
    sourcePath: skill.sourcePath,
  }),
);

export interface UpdatedCustomSkill {
  skill: CustomSkill;
  reasons: SkillUpdateReason[];
}

export interface FailedCustomSkill {
  skill: CustomSkill;
  reasons: SkillUpdateReason[];
}

export interface InstallCustomSkillsReport {
  success: boolean;
  updatedSkills: UpdatedCustomSkill[];
  skippedSkills: CustomSkill[];
  failedSkills: FailedCustomSkill[];
  removedSkills: string[];
}

/**
 * Get the target directory for custom skills installation.
 */
export function getCustomSkillsDir(): string {
  return join(getConfigDir(), 'skills');
}

/**
 * Recursively copy a directory.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      const destDir = dirname(destPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      copyFileSync(srcPath, destPath);
    }
  }
}

function installSharedSkillAssets(packageRoot: string): boolean {
  const sharedSourcePath = join(packageRoot, SHARED_SKILL_SOURCE_PATH);
  const sharedTargetPath = join(getCustomSkillsDir(), SHARED_SKILL_DIRECTORY);

  if (!existsSync(sharedSourcePath)) {
    console.error(`Custom skill shared assets not found: ${sharedSourcePath}`);
    return false;
  }

  rmSync(sharedTargetPath, { recursive: true, force: true });
  copyDirRecursive(sharedSourcePath, sharedTargetPath);
  return true;
}

export function findPackageRoot(startDir: string): string | null {
  let currentDir = startDir;
  const filesystemRoot = parse(startDir).root;

  while (true) {
    if (
      existsSync(join(currentDir, 'package.json')) &&
      existsSync(join(currentDir, 'src', 'skills'))
    ) {
      return currentDir;
    }

    if (currentDir === filesystemRoot) {
      return null;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function resolvePackageRoot(packageRoot?: string): string {
  if (packageRoot) {
    return packageRoot;
  }

  const moduleDir = fileURLToPath(new URL('.', import.meta.url));

  return (
    findPackageRoot(moduleDir) ??
    fileURLToPath(new URL('../..', import.meta.url))
  );
}

export function checkCustomSkillsNeedUpdate(
  packageRoot?: string,
): SkillUpdateCheck {
  return checkSkillsNeedUpdate(resolvePackageRoot(packageRoot));
}

function installCustomSkillFiles(
  skill: CustomSkill,
  packageRoot: string,
): boolean {
  const sourcePath = join(packageRoot, skill.sourcePath);
  const targetPath = join(getCustomSkillsDir(), skill.name);

  if (!existsSync(sourcePath)) {
    console.error(`Custom skill source not found: ${sourcePath}`);
    return false;
  }

  rmSync(targetPath, { recursive: true, force: true });
  copyDirRecursive(sourcePath, targetPath);
  return true;
}

export function removeObsoleteSkills(removedSkillNames: string[]): string[] {
  const removedSkills: string[] = [];

  for (const skillName of removedSkillNames) {
    const targetPath = join(getCustomSkillsDir(), skillName);

    try {
      console.log(`Removing obsolete bundled skill: ${skillName}`);
      rmSync(targetPath, { recursive: true, force: true });
      removedSkills.push(skillName);
    } catch (error) {
      console.warn(`Failed to remove obsolete bundled skill: ${skillName}`);
      console.warn(error);
    }
  }

  return removedSkills;
}

function buildManifest(
  packageRoot: string,
  updatedSkills: UpdatedCustomSkill[],
  previousManifest: SkillManifest | null,
  pluginVersion: string,
  sharedHash: string,
): SkillManifest {
  const installedAt = new Date().toISOString();
  const updatedSkillNames = new Set(
    updatedSkills.map(({ skill }) => skill.name),
  );
  const skills = Object.fromEntries(
    CUSTOM_SKILLS.map((skill) => {
      const previousEntry = previousManifest?.skills[skill.name];
      const nextInstalledAt = updatedSkillNames.has(skill.name)
        ? installedAt
        : (previousEntry?.installedAt ?? installedAt);

      return [
        skill.name,
        {
          hash: computeSkillHash(join(packageRoot, skill.sourcePath)),
          installedAt: nextInstalledAt,
        },
      ];
    }),
  );

  return {
    pluginVersion,
    sharedHash,
    skills,
  };
}

function pruneRemovedSkillsFromManifest(
  manifest: SkillManifest,
  removedSkills: string[],
): SkillManifest {
  const removedSkillNames = new Set(removedSkills);

  return {
    ...manifest,
    skills: Object.fromEntries(
      Object.entries(manifest.skills).filter(
        ([skillName]) => !removedSkillNames.has(skillName),
      ),
    ),
  };
}

export function installCustomSkills(
  packageRoot = resolvePackageRoot(),
): InstallCustomSkillsReport {
  const updateCheck = checkSkillsNeedUpdate(packageRoot);

  if (!updateCheck.needsUpdate) {
    return {
      success: true,
      updatedSkills: [],
      skippedSkills: [...CUSTOM_SKILLS],
      failedSkills: [],
      removedSkills: [],
    };
  }

  const removedSkills = removeObsoleteSkills(updateCheck.removedSkills);

  if (removedSkills.length > 0 && updateCheck.manifest) {
    writeManifest(
      pruneRemovedSkillsFromManifest(updateCheck.manifest, removedSkills),
    );
  }

  if (updateCheck.skillsNeedingUpdate.length === 0) {
    writeManifest(
      buildManifest(
        packageRoot,
        [],
        updateCheck.manifest,
        updateCheck.pluginVersion,
        updateCheck.sharedHash,
      ),
    );

    return {
      success: true,
      updatedSkills: [],
      skippedSkills: [...CUSTOM_SKILLS],
      failedSkills: [],
      removedSkills,
    };
  }

  if (!installSharedSkillAssets(packageRoot)) {
    return {
      success: false,
      updatedSkills: [],
      skippedSkills: [],
      failedSkills: updateCheck.skillsNeedingUpdate.map(
        ({ skill, reasons }) => ({
          skill,
          reasons,
        }),
      ),
      removedSkills,
    };
  }

  const updatesBySkillName = new Map<string, SkillUpdateEntry>(
    updateCheck.skillsNeedingUpdate.map((entry) => [entry.skill.name, entry]),
  );
  const updatedSkills: UpdatedCustomSkill[] = [];
  const skippedSkills: CustomSkill[] = [];
  const failedSkills: FailedCustomSkill[] = [];

  for (const skill of CUSTOM_SKILLS) {
    const pendingUpdate = updatesBySkillName.get(skill.name);

    if (!pendingUpdate) {
      skippedSkills.push(skill);
      continue;
    }

    if (installCustomSkillFiles(skill, packageRoot)) {
      updatedSkills.push({
        skill,
        reasons: pendingUpdate.reasons,
      });
      continue;
    }

    failedSkills.push({
      skill,
      reasons: pendingUpdate.reasons,
    });
  }

  if (failedSkills.length > 0) {
    return {
      success: false,
      updatedSkills,
      skippedSkills,
      failedSkills,
      removedSkills,
    };
  }

  writeManifest(
    buildManifest(
      packageRoot,
      updatedSkills,
      updateCheck.manifest,
      updateCheck.pluginVersion,
      updateCheck.sharedHash,
    ),
  );

  return {
    success: true,
    updatedSkills,
    skippedSkills,
    failedSkills,
    removedSkills,
  };
}

/**
 * Install a custom skill by copying from src/skills/ to the OpenCode skills directory
 * @param skill - The custom skill to install
 * @param projectRoot - Root directory of thoth-agents project
 * @returns True if installation succeeded, false otherwise
 */
export function installCustomSkill(skill: CustomSkill): boolean {
  try {
    const packageRoot = resolvePackageRoot();

    if (!installSharedSkillAssets(packageRoot)) {
      return false;
    }

    return installCustomSkillFiles(skill, packageRoot);
  } catch (error) {
    console.error(`Failed to install custom skill: ${skill.name}`, error);
    return false;
  }
}
