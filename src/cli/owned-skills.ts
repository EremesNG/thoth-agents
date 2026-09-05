import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
export interface PiPackageSkillInspectionResult {
  success: boolean;
  state: 'available' | 'unavailable';
  skills: OpenCodeOwnedSkillSyncEntry[];
  issues: Array<{
    name: ThothOwnedSkillName;
    state: 'missing' | 'drift';
    message: string;
  }>;
  error?: string;
}

interface SkillFrontmatter {
  name: string;
  description: string;
}

function parseSkillFrontmatter(content: string): SkillFrontmatter | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return undefined;
  const closingDelimiter = lines.findIndex(
    (line, index) => index > 0 && line === '---',
  );
  if (closingDelimiter < 0) return undefined;

  const values = new Map<string, string>();
  for (const line of lines.slice(1, closingDelimiter)) {
    const field = /^(name|description):\s*(.*)$/.exec(line);
    if (!field) continue;
    const [, key, rawValue] = field;
    if (!key || rawValue === undefined || values.has(key)) return undefined;
    const value = rawValue.trim();
    values.set(
      key,
      (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value,
    );
  }

  const name = values.get('name');
  const description = values.get('description');
  if (!name || !description || description.startsWith('#')) return undefined;
  return { name, description };
}

function inspectPiPackageSkill(
  entry: OpenCodeOwnedSkillSyncEntry,
): PiPackageSkillInspectionResult['issues'][number] | undefined {
  if (!existsSync(entry.sourcePath))
    return {
      name: entry.name,
      state: 'missing',
      message: `Package-declared Pi skill directory is missing: ${entry.name}`,
    };
  const root = lstatSync(entry.sourcePath);
  if (!root.isDirectory() || root.isSymbolicLink())
    return {
      name: entry.name,
      state: 'drift',
      message: `Package-declared Pi skill directory is not a regular directory: ${entry.name}`,
    };
  const contractPath = join(entry.sourcePath, 'SKILL.md');
  if (!existsSync(contractPath))
    return {
      name: entry.name,
      state: 'missing',
      message: `Package-declared Pi skill contract is missing: ${entry.name}`,
    };
  const contract = lstatSync(contractPath);
  if (!contract.isFile() || contract.isSymbolicLink())
    return {
      name: entry.name,
      state: 'drift',
      message: `Package-declared Pi skill contract is not a regular file: ${entry.name}`,
    };
  const content = readFileSync(contractPath, 'utf8');
  const frontmatter = parseSkillFrontmatter(content);
  if (!frontmatter || frontmatter.name !== entry.name)
    return {
      name: entry.name,
      state: 'drift',
      message: `Package-declared Pi skill contract is malformed: ${entry.name}`,
    };
  return undefined;
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

export function getPiOwnedSkillEntries(options: {
  packageRoot: string;
}): OpenCodeOwnedSkillSyncEntry[] {
  const packageRoot = options.packageRoot;
  return THOTH_OWNED_SKILL_NAMES.map((name) => ({
    name,
    sourcePath: join(packageRoot, 'skills', name),
    destinationPath: join(packageRoot, 'skills', name),
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

export function inspectPiPackageSkills(options: {
  packageRoot: string;
}): PiPackageSkillInspectionResult {
  const skills = getPiOwnedSkillEntries(options);
  try {
    const issues = skills.flatMap((skill) => {
      const issue = inspectPiPackageSkill(skill);
      return issue ? [issue] : [];
    });
    if (issues.length > 0)
      return {
        success: false,
        state: 'unavailable',
        skills,
        issues,
        error: issues.map(({ message }) => message).join('; '),
      };
    return {
      success: true,
      state: 'available',
      skills,
      issues: [],
    };
  } catch (error) {
    return {
      success: false,
      state: 'unavailable',
      skills,
      issues: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
