import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import type { CustomSkill } from './custom-skills';
import { CUSTOM_SKILLS, getCustomSkillsDir } from './custom-skills';

export interface SkillManifestEntry {
  hash: string;
  installedAt: string;
}

export interface SkillManifest {
  pluginVersion: string;
  skills: Record<string, SkillManifestEntry>;
  sharedHash: string;
}

export type SkillUpdateReason =
  | 'manifest-missing'
  | 'version-change'
  | 'shared-hash-mismatch'
  | 'new-skill'
  | 'hash-mismatch'
  | 'missing-install';

export interface SkillUpdateEntry {
  skill: CustomSkill;
  sourceHash: string;
  targetPath: string;
  reasons: SkillUpdateReason[];
}

export interface SkillUpdateCheck {
  pluginVersion: string;
  sharedHash: string;
  manifest: SkillManifest | null;
  versionChanged: boolean;
  sharedChanged: boolean;
  needsUpdate: boolean;
  skillsNeedingUpdate: SkillUpdateEntry[];
  removedSkills: string[];
}

const SHARED_SKILL_DIRECTORY = '_shared';
const SKILLS_SOURCE_ROOT = join('src', 'skills');
const MANIFEST_FILE_NAME = '.skill-manifest.json';

function getManifestPath(): string {
  return join(getCustomSkillsDir(), MANIFEST_FILE_NAME);
}

function listFilesRecursive(dirPath: string): string[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const files: string[] = [];
  const entries = readdirSync(dirPath).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function readPackageVersion(packageRoot: string): string {
  const packageJsonPath = join(packageRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
    version?: unknown;
  };

  if (
    typeof packageJson.version !== 'string' ||
    packageJson.version.length === 0
  ) {
    throw new Error(`Invalid package version in ${packageJsonPath}`);
  }

  return packageJson.version;
}

export function readManifest(): SkillManifest | null {
  const manifestPath = getManifestPath();
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillManifest;
  } catch (error) {
    console.warn(`Failed to read skill manifest: ${manifestPath}`, error);
    return null;
  }
}

export function writeManifest(manifest: SkillManifest): void {
  const manifestPath = getManifestPath();
  mkdirSync(getCustomSkillsDir(), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function computeSkillHash(skillDirPath: string): string {
  const hash = createHash('sha256');

  for (const filePath of listFilesRecursive(skillDirPath)) {
    hash.update(`${relative(skillDirPath, filePath)}\n`);
    hash.update(readFileSync(filePath));
    hash.update('\n');
  }

  return hash.digest('hex');
}

export function findRemovedSkills(manifest: SkillManifest): string[] {
  const currentSkillNames = new Set(CUSTOM_SKILLS.map((skill) => skill.name));

  return Object.keys(manifest.skills).filter(
    (skillName) => !currentSkillNames.has(skillName),
  );
}

export function checkSkillsNeedUpdate(packageRoot: string): SkillUpdateCheck {
  const manifest = readManifest();
  const pluginVersion = readPackageVersion(packageRoot);
  const sharedHash = computeSkillHash(
    join(packageRoot, SKILLS_SOURCE_ROOT, SHARED_SKILL_DIRECTORY),
  );
  const versionChanged =
    manifest !== null && manifest.pluginVersion !== pluginVersion;
  const sharedChanged = manifest !== null && manifest.sharedHash !== sharedHash;
  const removedSkills = manifest ? findRemovedSkills(manifest) : [];

  const skillsNeedingUpdate = CUSTOM_SKILLS.flatMap((skill) => {
    const sourcePath = join(packageRoot, skill.sourcePath);
    const targetPath = join(getCustomSkillsDir(), skill.name);
    const sourceHash = computeSkillHash(sourcePath);
    const manifestEntry = manifest?.skills[skill.name];
    const reasons: SkillUpdateReason[] = [];

    if (!manifest) {
      reasons.push('manifest-missing');
    }

    if (versionChanged) {
      reasons.push('version-change');
    }

    if (sharedChanged) {
      reasons.push('shared-hash-mismatch');
    }

    if (!manifestEntry) {
      reasons.push('new-skill');
    } else if (manifestEntry.hash !== sourceHash) {
      reasons.push('hash-mismatch');
    }

    if (!existsSync(targetPath)) {
      reasons.push('missing-install');
    }

    if (reasons.length === 0) {
      return [];
    }

    return [
      {
        skill,
        sourceHash,
        targetPath,
        reasons,
      },
    ];
  });

  return {
    pluginVersion,
    sharedHash,
    manifest,
    versionChanged,
    sharedChanged,
    needsUpdate: skillsNeedingUpdate.length > 0 || removedSkills.length > 0,
    skillsNeedingUpdate,
    removedSkills,
  };
}
