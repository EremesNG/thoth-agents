import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const PI_SPECIALIST_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
] as const;
export interface PiSpecialistSyncOptions {
  packageRoot: string;
  piRoot: string;
  dryRun?: boolean;
  projectRoots?: readonly string[];
}
export interface PiSpecialistSyncResult {
  success: boolean;
  changed: string[];
  conflicts: string[];
  diagnostics: string[];
  error?: string;
}

function field(content: string, name: string): string | undefined {
  const match = content.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}
function preserveOverrides(next: string, current: string): string {
  const values = ['model', 'effort']
    .map((name) => [name, field(current, name)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  if (values.length === 0) return next;
  const end = next.indexOf('\n---', 4);
  if (end < 0) return next;
  let frontmatter = next.slice(0, end);
  for (const [name, value] of values) {
    const pattern = new RegExp(`^${name}:.*$`, 'm');
    frontmatter = pattern.test(frontmatter)
      ? frontmatter.replace(pattern, `${name}: ${value}`)
      : `${frontmatter}\n${name}: ${value}`;
  }
  return `${frontmatter}${next.slice(end)}`;
}
function atomicWrite(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  try {
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

export function syncPiSpecialists(
  options: PiSpecialistSyncOptions,
): PiSpecialistSyncResult {
  const changed: string[] = [];
  const conflicts: string[] = [];
  const diagnostics: string[] = [];
  for (const root of options.projectRoots ?? [])
    if (existsSync(root))
      diagnostics.push(
        `Project-local Pi specialists may shadow package-owned global definitions: ${root}`,
      );
  try {
    const prepared: Array<{ target: string; content: string }> = [];
    for (const name of PI_SPECIALIST_NAMES) {
      const source = join(options.packageRoot, 'pi', 'agents', `${name}.md`);
      const target = join(options.piRoot, 'agents', `${name}.md`);
      if (!existsSync(source))
        throw new Error(`Missing package-owned Pi specialist asset: ${source}`);
      let content = readFileSync(source, 'utf8');
      if (
        field(content, 'name') !== name ||
        field(content, 'managed-by') !== 'thoth-agents'
      )
        throw new Error(`Invalid package-owned Pi specialist asset: ${source}`);
      if (existsSync(target)) {
        const current = readFileSync(target, 'utf8');
        if (field(current, 'managed-by') !== 'thoth-agents') {
          conflicts.push(target);
          continue;
        }
        content = preserveOverrides(content, current);
        if (content === current) continue;
      }
      prepared.push({ target, content });
    }
    if (conflicts.length > 0)
      return {
        success: false,
        changed,
        conflicts,
        diagnostics,
        error:
          'Unowned canonical Pi specialist definitions block synchronization.',
      };
    if (!options.dryRun)
      for (const item of prepared) {
        atomicWrite(item.target, item.content);
        changed.push(item.target);
      }
    else changed.push(...prepared.map(({ target }) => target));
    return { success: true, changed, conflicts, diagnostics };
  } catch (error) {
    return {
      success: false,
      changed,
      conflicts,
      diagnostics,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
