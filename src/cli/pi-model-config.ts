import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  isPiSpecialistRole,
  PI_SPECIALIST_ROLES,
  type PiSpecialistRole,
  piSpecialistName,
} from '../harness/pi-specialists';
import type { ModelRoleInput } from './operations/types';
import { resolvePiEffort } from './pi-effort';
import {
  assertSafePiManagedPath,
  writePiManagedText,
} from './pi-managed-write';

export interface PiModelSnapshot {
  piRoot: string;
  roles: ModelRoleInput[];
  contents: Partial<Record<PiSpecialistRole, string>>;
}
export interface PiModelSaveResult {
  success: boolean;
  changedRoles: PiSpecialistRole[];
  /** Reflects only successful writes; use this snapshot to retry the same draft. */
  snapshot: PiModelSnapshot;
  error?: string;
}

function frontmatter(content: string): string {
  return /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1] ?? '';
}
function field(content: string, name: string): string | undefined {
  const value = new RegExp(`^${name}:[\\t ]*(.+)$`, 'm')
    .exec(frontmatter(content))?.[1]
    ?.trim();
  if (value?.startsWith('"')) return JSON.parse(value) as string;
  return value?.replace(/^'(.*)'$/, '$1');
}
function replaceField(
  content: string,
  name: string,
  value: string | undefined,
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  );
  const index = lines
    .slice(1, end)
    .findIndex((line) => line.startsWith(`${name}:`));
  if (value === undefined) {
    if (index >= 0) lines.splice(index + 1, 1);
  } else if (index >= 0) lines[index + 1] = `${name}: ${JSON.stringify(value)}`;
  else lines.splice(1, 0, `${name}: ${JSON.stringify(value)}`);
  return lines.join(newline);
}
function readOwned(piRoot: string, role: PiSpecialistRole): string {
  if (!isPiSpecialistRole(role))
    throw new Error(`Unsupported Pi specialist: ${role}`);
  const path = join(piRoot, 'agents', `${piSpecialistName(role)}.md`);
  assertSafePiManagedPath(path);
  const content = readFileSync(path, 'utf8');
  for (const name of ['name', 'managed-by', 'model', 'thinking']) {
    if (
      [...frontmatter(content).matchAll(new RegExp(`^${name}:`, 'gm'))].length >
      1
    ) {
      throw new Error(`Duplicate ${name} in managed Pi definition: ${path}`);
    }
  }
  if (
    field(content, 'name') !== piSpecialistName(role) ||
    field(content, 'managed-by') !== 'thoth-agents'
  ) {
    throw new Error(`Not an owned Thoth specialist: ${path}`);
  }
  return content;
}
export function readPiModelConfig(
  piRoot: string,
  roles: readonly PiSpecialistRole[] = PI_SPECIALIST_ROLES,
): PiModelSnapshot {
  const snapshot: PiModelSnapshot = {
    piRoot: resolve(piRoot),
    roles: [],
    contents: {},
  };
  for (const role of roles) {
    const content = readOwned(snapshot.piRoot, role);
    snapshot.contents[role] = content;
    const thinking = field(content, 'thinking');
    snapshot.roles.push({
      role,
      model: field(content, 'model') ?? 'inherit',
      effort: thinking
        ? { kind: 'effort', value: thinking }
        : { kind: 'inherit' },
    });
  }
  return snapshot;
}
export function savePiModelConfig(
  snapshot: PiModelSnapshot,
  roles: readonly ModelRoleInput[],
): PiModelSaveResult {
  const changedRoles: PiSpecialistRole[] = [];
  const nextSnapshot: PiModelSnapshot = {
    ...snapshot,
    roles: structuredClone(snapshot.roles),
    contents: { ...snapshot.contents },
  };
  try {
    // Preflight every selected target before making the first write.
    const seen = new Set<string>();
    for (const input of roles) {
      if (!isPiSpecialistRole(input.role))
        throw new Error(`Unsupported Pi specialist: ${input.role}`);
      if (seen.has(input.role))
        throw new Error(`Duplicate Pi specialist: ${input.role}`);
      seen.add(input.role);
      if (!input.model.trim() || /[\r\n]/.test(input.model))
        throw new Error(`Invalid model for ${input.role}`);
      const effort = resolvePiEffort(input);
      if (!effort.ok) throw new Error(effort.message);
      if (
        readOwned(snapshot.piRoot, input.role) !== snapshot.contents[input.role]
      ) {
        throw new Error(
          `Pi specialist changed since opening: ${input.role}. Reopen the editor before saving.`,
        );
      }
    }
    for (const input of roles) {
      const role = input.role as PiSpecialistRole;
      const current = snapshot.contents[role];
      if (current === undefined)
        throw new Error(`Missing specialist snapshot: ${role}`);
      const original = snapshot.roles.find((item) => item.role === role);
      if (
        original?.model === input.model &&
        JSON.stringify(original.effort) === JSON.stringify(input.effort)
      )
        continue;
      let next = replaceField(current, 'model', input.model);
      next = replaceField(
        next,
        'thinking',
        input.effort?.kind === 'effort' ? input.effort.value : undefined,
      );
      if (readOwned(snapshot.piRoot, role) !== current)
        throw new Error(
          `Pi specialist changed before saving: ${role}. Reopen the editor.`,
        );
      if (
        writePiManagedText(
          join(snapshot.piRoot, 'agents', `${piSpecialistName(role)}.md`),
          next,
        )
      )
        changedRoles.push(role);
      nextSnapshot.contents[role] = next;
      nextSnapshot.roles = nextSnapshot.roles.map((value) =>
        value.role === role
          ? {
              role,
              model: input.model,
              effort: input.effort ?? { kind: 'inherit' },
            }
          : value,
      );
    }
    return { success: true, changedRoles, snapshot: nextSnapshot };
  } catch (error) {
    return {
      success: false,
      changedRoles,
      snapshot: nextSnapshot,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
