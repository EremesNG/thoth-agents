import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  PI_SPECIALIST_ROLES,
  piSpecialistName,
} from '../harness/pi-specialists';
import {
  assertSafePiManagedPath,
  writePiManagedText,
} from './pi-managed-write';

const OBSOLETE_PI_SPECIALIST_NAMES = ['thoth-quick', 'thoth-deep'] as const;

export const PI_SPECIALIST_NAMES = PI_SPECIALIST_ROLES.map(piSpecialistName);
export interface PiSpecialistSyncOptions {
  packageRoot: string;
  piRoot: string;
  dryRun?: boolean;
  projectRoots?: readonly string[];
  /** Test-only seam for exercising replacement races before retirement. */
  beforeRetireForTest?: () => void;
}
export interface PiSpecialistSyncResult {
  success: boolean;
  changed: string[];
  conflicts: string[];
  diagnostics: string[];
  error?: string;
}

function field(content: string, name: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    content,
  )?.[1];
  const match = frontmatter?.match(new RegExp(`^${name}:[\\t ]*(.+)$`, 'm'));
  return match?.[1]?.trim();
}
function isSentinel(value: string, sentinel: string): boolean {
  return (
    value === sentinel || value === `"${sentinel}"` || value === `'${sentinel}'`
  );
}

function replaceField(
  frontmatter: string,
  name: string,
  value: string | undefined,
): string {
  const pattern = new RegExp(`^${name}:.*\\r?\\n?`, 'm');
  if (value === undefined) return frontmatter.replace(pattern, '');
  return pattern.test(frontmatter)
    ? frontmatter.replace(pattern, `${name}: ${value}\n`)
    : `${frontmatter}\n${name}: ${value}`;
}

function preserveOverrides(next: string, current: string): string {
  const end = next.indexOf('\n---', 4);
  if (end < 0) return next;
  let frontmatter = next.slice(0, end);

  // Bounded migration from the old thoth-managed schema. `default` formerly
  // meant parent inheritance; pi-subagents requires the explicit native model
  // sentinel so a global subagents.defaultModel cannot intercept that intent.
  const oldModel = field(current, 'model');
  const transitionalModelInherit = isSentinel(
    field(current, 'thoth-model-inherit') ?? '',
    'true',
  );
  if (oldModel || transitionalModelInherit)
    frontmatter = replaceField(
      frontmatter,
      'model',
      !oldModel || isSentinel(oldModel, 'default') ? '"inherit"' : oldModel,
    );

  const thinking = field(current, 'thinking');
  const oldEffort = field(current, 'effort');
  const transitionalThinkingInherit = isSentinel(
    field(current, 'thoth-thinking-inherit') ?? '',
    'true',
  );
  if (thinking)
    frontmatter = replaceField(
      frontmatter,
      'thinking',
      isSentinel(thinking, 'default') || isSentinel(thinking, 'inherit')
        ? undefined
        : thinking,
    );
  else if (oldEffort)
    frontmatter = replaceField(
      frontmatter,
      'thinking',
      isSentinel(oldEffort, 'default') || isSentinel(oldEffort, 'inherit')
        ? undefined
        : oldEffort,
    );
  else if (transitionalThinkingInherit || field(current, 'defaultContext'))
    // In the native schema omission intentionally leaves thinking unpinned.
    frontmatter = replaceField(frontmatter, 'thinking', undefined);

  return `${frontmatter}${next.slice(end)}`;
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
    const retired: Array<{ target: string; content: string }> = [];

    // Preflight every write and retirement before mutating anything. A role
    // filename alone is never ownership evidence.
    for (const name of PI_SPECIALIST_NAMES) {
      const target = join(options.piRoot, 'agents', `${name}.md`);
      assertSafePiManagedPath(target);
      if (existsSync(target)) {
        const current = readFileSync(target, 'utf8');
        if (field(current, 'managed-by') !== 'thoth-agents')
          conflicts.push(target);
      }
    }
    for (const name of OBSOLETE_PI_SPECIALIST_NAMES) {
      const target = join(options.piRoot, 'agents', `${name}.md`);
      assertSafePiManagedPath(target);
      if (!existsSync(target)) continue;
      const current = readFileSync(target, 'utf8');
      if (field(current, 'managed-by') !== 'thoth-agents')
        conflicts.push(target);
      else retired.push({ target, content: current });
    }
    if (conflicts.length > 0)
      return {
        success: false,
        changed,
        conflicts,
        diagnostics,
        error:
          'Unowned canonical or obsolete Pi specialist definitions block synchronization; remove or rename them explicitly before retrying.',
      };

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
        content = preserveOverrides(content, current);
        if (content === current) continue;
      }
      prepared.push({ target, content });
    }
    if (!options.dryRun) {
      // Write the complete current roster before retiring obsolete assets so an
      // interrupted run remains recoverable by an idempotent retry.
      for (const item of prepared) {
        writePiManagedText(item.target, item.content);
        changed.push(item.target);
      }
      options.beforeRetireForTest?.();
      for (const retiredItem of retired) {
        const { target, content } = retiredItem;
        assertSafePiManagedPath(target);
        const current = existsSync(target)
          ? readFileSync(target, 'utf8')
          : undefined;
        if (
          current !== content ||
          field(current ?? '', 'managed-by') !== 'thoth-agents'
        )
          throw new Error(
            `Managed Pi obsolete role changed before retirement and was preserved: ${target}`,
          );
        rmSync(target);
        changed.push(target);
      }
    } else
      changed.push(
        ...prepared.map(({ target }) => target),
        ...retired.map(({ target }) => target),
      );
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
