import { randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THOTH_OWNED_SKILL_NAMES,
  type ThothOwnedSkillName,
} from '../harness/core/owned-skills';
import { findPackageRoot } from './package-root';
import { getConfigDir } from './paths';

export interface OpenCodeOwnedSkillSyncOptions {
  dryRun?: boolean;
  moveLegacyOpenCodeSkills?: boolean;
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
  notices?: string[];
  backupRoot?: string;
  legacyMoves?: LegacyOpenCodeSkillMove[];
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
    destinationPath: join(getConfigDir(homeDir), 'skills', name),
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

export interface LegacyOpenCodeSkillMove {
  sourcePath: string;
  destinationPath: string;
  status: 'planned' | 'moved' | 'failed';
}

export function getLegacyOpenCodeSkillBackupRoot(homeDir = homedir()): string {
  return resolve(
    process.env.XDG_DATA_HOME || join(homeDir, '.local', 'share'),
    'thoth-agents',
    '.opencode-legacy-skills',
  );
}

export function inspectLegacyOpenCodeSkills(
  homeDir = homedir(),
): Array<{ name: ThothOwnedSkillName; sourcePath: string; label: string }> {
  const seen = new Set<string>();
  const copies: Array<{
    name: ThothOwnedSkillName;
    sourcePath: string;
    label: string;
  }> = [];
  for (const [label, root] of [
    ['resolved', getConfigDir(homeDir)],
    ['legacy', join(homeDir, '.config', 'opencode')],
  ]) {
    for (const directory of ['skills', 'skill']) {
      for (const name of THOTH_OWNED_SKILL_NAMES) {
        const sourcePath = join(root, directory, name);
        if (!existsSync(sourcePath)) continue;
        const real = realpathSync(sourcePath);
        if (seen.has(real)) continue;
        seen.add(real);
        copies.push({ name, sourcePath, label: `${label}-${directory}` });
      }
    }
  }
  return copies;
}

function planOrMoveLegacySkills(
  options: OpenCodeOwnedSkillSyncOptions,
): Pick<
  OpenCodeOwnedSkillSyncResult,
  'notices' | 'backupRoot' | 'legacyMoves'
> {
  const backupRoot = getLegacyOpenCodeSkillBackupRoot(options.homeDir);
  const copies = inspectLegacyOpenCodeSkills(options.homeDir);
  const notices: string[] = [];
  const legacyMoves: LegacyOpenCodeSkillMove[] = [];
  if (!copies.length) return { backupRoot, notices, legacyMoves };
  const confirmed = options.moveLegacyOpenCodeSkills && !options.dryRun;
  let run = join(backupRoot, '<new-run>');
  if (confirmed) {
    try {
      if (!resolve(backupRoot).split(sep).includes('.opencode-legacy-skills'))
        throw new Error(
          'Backup path is missing the required hidden .opencode-legacy-skills segment',
        );
      mkdirSync(backupRoot, { recursive: true });
      let created = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        run = join(
          backupRoot,
          `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(8).toString('hex')}`,
        );
        try {
          mkdirSync(run, { mode: 0o700 });
          created = true;
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      if (!created)
        throw new Error('Unable to create an exclusive backup run directory');
    } catch (error) {
      notices.push(`Legacy skill move refused: ${String(error)}`);
      notices.push(
        ...copies.map(({ sourcePath }) =>
          legacyOpenCodeSkillNotice(sourcePath),
        ),
      );
      return { backupRoot, notices, legacyMoves };
    }
  }
  for (const copy of copies) {
    const destinationPath = join(run, copy.label, copy.name);
    const move: LegacyOpenCodeSkillMove = {
      sourcePath: copy.sourcePath,
      destinationPath,
      status: 'planned',
    };
    legacyMoves.push(move);
    if (!confirmed) {
      notices.push(legacyOpenCodeSkillNotice(copy.sourcePath));
      notices.push(
        `Planned move: ${copy.sourcePath} -> ${destinationPath} (backup root: ${backupRoot})`,
      );
      continue;
    }
    try {
      mkdirSync(dirname(destinationPath), { recursive: true });
      // lstat catches even dangling links; the exclusive private run is never reused.
      try {
        lstatSync(destinationPath);
        throw new Error(
          `Backup destination already exists: ${destinationPath}`,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      renameSync(copy.sourcePath, destinationPath);
      move.status = 'moved';
      notices.push(
        `Moved legacy OpenCode skill: ${copy.sourcePath} -> ${destinationPath} (backup: ${run})`,
      );
    } catch (error) {
      move.status = 'failed';
      notices.push(
        `Legacy skill move failed; original left intact: ${copy.sourcePath}: ${String(error)}. ${legacyOpenCodeSkillNotice(copy.sourcePath)}`,
      );
    }
  }
  return { backupRoot, notices, legacyMoves };
}

export function legacyOpenCodeSkillNotice(path: string): string {
  return `Warning: legacy OpenCode skill copies shadow the packaged skills: ${path}. Confirm the backup move interactively or pass --move-legacy-opencode-skills to install/update.`;
}

export function syncOpenCodeOwnedSkills(
  options: OpenCodeOwnedSkillSyncOptions = {},
): OpenCodeOwnedSkillSyncResult {
  const skills = getOpenCodeOwnedSkillEntries(options);
  try {
    for (const skill of skills) validateCanonicalSkill(skill);
    return {
      success: true,
      status: options.dryRun ? 'planned' : 'installed',
      skills,
      ...planOrMoveLegacySkills(options),
    };
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
