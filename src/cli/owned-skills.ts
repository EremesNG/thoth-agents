import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THOTH_OWNED_SKILL_NAMES,
  type ThothOwnedSkillName,
} from '../harness/core/owned-skills';
import { findPackageRoot } from './package-root';

export interface OpenCodeOwnedSkillSyncOptions {
  dryRun?: boolean;
  homeDir?: string;
  packageRoot?: string;
}

export interface OpenCodeOwnedSkillSyncEntry {
  name: ThothOwnedSkillName;
  sourcePath: string;
  destinationPath: string;
}

export interface OpenCodeOwnedSkillSyncResult {
  success: boolean;
  status: 'planned' | 'installed' | 'failed';
  skills: OpenCodeOwnedSkillSyncEntry[];
  error?: string;
}

export function resolveOwnedSkillPackageRoot(moduleUrl: string): string {
  const packageRoot = findPackageRoot(dirname(fileURLToPath(moduleUrl)));
  if (!packageRoot) {
    throw new Error(
      'Unable to locate the thoth-agents package root for bundled owned skills.',
    );
  }
  return packageRoot;
}

function defaultPackageRoot(): string {
  return resolveOwnedSkillPackageRoot(import.meta.url);
}

export function getOpenCodeOwnedSkillEntries(
  options: Pick<OpenCodeOwnedSkillSyncOptions, 'homeDir' | 'packageRoot'> = {},
): OpenCodeOwnedSkillSyncEntry[] {
  const packageRoot = options.packageRoot ?? defaultPackageRoot();
  const homeDir = options.homeDir ?? homedir();
  return THOTH_OWNED_SKILL_NAMES.map((name) => ({
    name,
    sourcePath: join(packageRoot, 'skills', name),
    destinationPath: join(homeDir, '.config', 'opencode', 'skills', name),
  }));
}

function validateCanonicalSkill(entry: OpenCodeOwnedSkillSyncEntry): void {
  if (
    !existsSync(entry.sourcePath) ||
    !statSync(entry.sourcePath).isDirectory()
  ) {
    throw new Error(
      `Canonical owned skill directory is missing: ${entry.name}`,
    );
  }
  const contractPath = join(entry.sourcePath, 'SKILL.md');
  if (!existsSync(contractPath) || !statSync(contractPath).isFile()) {
    throw new Error(`Canonical owned skill contract is missing: ${entry.name}`);
  }
}

function installOwnedSkills(skills: OpenCodeOwnedSkillSyncEntry[]): void {
  const firstSkill = skills[0];
  if (!firstSkill) return;
  const globalRoot = dirname(firstSkill.destinationPath);
  mkdirSync(globalRoot, { recursive: true });
  const transactionRoot = mkdtempSync(join(globalRoot, '.thoth-agents-owned-'));
  const stagedRoot = join(transactionRoot, 'staged');
  const backupRoot = join(transactionRoot, 'backup');
  mkdirSync(stagedRoot, { recursive: true });
  mkdirSync(backupRoot, { recursive: true });

  try {
    for (const skill of skills) {
      cpSync(skill.sourcePath, join(stagedRoot, skill.name), {
        recursive: true,
        force: true,
      });
    }

    for (const skill of skills) {
      const stagedPath = join(stagedRoot, skill.name);
      const backupPath = join(backupRoot, skill.name);
      const hadExistingDestination = existsSync(skill.destinationPath);
      if (hadExistingDestination) {
        renameSync(skill.destinationPath, backupPath);
      }
      try {
        renameSync(stagedPath, skill.destinationPath);
      } catch (error) {
        if (existsSync(skill.destinationPath)) {
          rmSync(skill.destinationPath, { recursive: true, force: true });
        }
        if (hadExistingDestination && existsSync(backupPath)) {
          renameSync(backupPath, skill.destinationPath);
        }
        throw error;
      }
      if (existsSync(backupPath)) {
        rmSync(backupPath, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(transactionRoot, { recursive: true, force: true });
  }
}

export function syncOpenCodeOwnedSkills(
  options: OpenCodeOwnedSkillSyncOptions = {},
): OpenCodeOwnedSkillSyncResult {
  const skills = getOpenCodeOwnedSkillEntries(options);
  try {
    for (const skill of skills) validateCanonicalSkill(skill);
    if (options.dryRun) return { success: true, status: 'planned', skills };
    installOwnedSkills(skills);
    return { success: true, status: 'installed', skills };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      skills,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
