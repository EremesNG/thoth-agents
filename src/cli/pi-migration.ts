import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { THOTH_OWNED_SKILL_NAMES } from '../harness/core/owned-skills';
import { PI_ROOT_END, PI_ROOT_START } from '../harness/writers/pi-agent';

export interface PiLegacyMigrationOptions {
  packageRoot: string;
  piRoot: string;
  dryRun?: boolean;
}
export interface PiLegacyMigrationResult {
  success: boolean;
  changed: string[];
  manualActions: string[];
  error?: string;
}

function files(root: string, current = root): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name);
      return entry.isDirectory()
        ? files(root, path)
        : [path.slice(root.length + 1).replaceAll('\\', '/')];
    })
    .sort();
}
function identicalTrees(left: string, right: string): boolean {
  const leftFiles = files(left);
  const rightFiles = files(right);
  return (
    leftFiles.length === rightFiles.length &&
    leftFiles.every(
      (name, index) =>
        name === rightFiles[index] &&
        readFileSync(join(left, name)).equals(readFileSync(join(right, name))),
    )
  );
}
function removeRootBlock(content: string): string | undefined {
  const start = content.indexOf(PI_ROOT_START);
  const end = content.indexOf(PI_ROOT_END, start + PI_ROOT_START.length);
  if (start < 0 && end < 0) return undefined;
  if (
    start < 0 ||
    end < 0 ||
    content.indexOf(PI_ROOT_START, start + 1) >= 0 ||
    content.indexOf(PI_ROOT_END, end + 1) >= 0
  )
    throw new Error('Legacy Pi root block ownership is ambiguous.');
  const after = end + PI_ROOT_END.length;
  return `${content.slice(0, start)}${content.slice(after).replace(/^\r?\n/, '')}`;
}

export function migrateLegacyPiResources(
  options: PiLegacyMigrationOptions,
): PiLegacyMigrationResult {
  const changed: string[] = [];
  const manualActions: string[] = [];
  const appendPath = join(options.piRoot, 'APPEND_SYSTEM.md');
  let nextRoot: string | undefined;
  try {
    if (existsSync(appendPath))
      nextRoot = removeRootBlock(readFileSync(appendPath, 'utf8'));
  } catch (error) {
    manualActions.push(error instanceof Error ? error.message : String(error));
  }
  const retire: Array<{ source: string; backup: string }> = [];
  for (const name of THOTH_OWNED_SKILL_NAMES) {
    const source = join(options.piRoot, 'skills', name);
    if (!existsSync(source)) continue;
    const canonical = join(options.packageRoot, 'skills', name);
    const backup = `${source}.thoth-agents-legacy.bak`;
    if (
      !statSync(source).isDirectory() ||
      !identicalTrees(source, canonical) ||
      existsSync(backup)
    ) {
      manualActions.push(
        `Legacy Pi skill ${name} is modified or has ambiguous backup ownership; remove it manually after review.`,
      );
      continue;
    }
    retire.push({ source, backup });
  }
  if (options.dryRun)
    return {
      success: true,
      changed: [
        ...(nextRoot === undefined ? [] : [appendPath]),
        ...retire.map(({ source }) => source),
      ],
      manualActions,
    };
  try {
    if (nextRoot !== undefined) {
      mkdirSync(dirname(appendPath), { recursive: true });
      copyFileSync(appendPath, `${appendPath}.thoth-agents-legacy.bak`);
      const temporary = `${appendPath}.tmp-${process.pid}`;
      writeFileSync(temporary, nextRoot);
      renameSync(temporary, appendPath);
      changed.push(appendPath);
    }
    for (const item of retire) {
      renameSync(item.source, item.backup);
      changed.push(item.source);
    }
    return { success: true, changed, manualActions };
  } catch (error) {
    try {
      for (const item of retire)
        if (existsSync(item.backup) && !existsSync(item.source))
          renameSync(item.backup, item.source);
      if (existsSync(`${appendPath}.thoth-agents-legacy.bak`))
        copyFileSync(`${appendPath}.thoth-agents-legacy.bak`, appendPath);
    } catch {}
    return {
      success: false,
      changed,
      manualActions,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
