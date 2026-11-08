import {
  type ActionOverride,
  SPECIALIST_ROLES,
  type SpecialistRole,
  type ToolsDocument,
} from './types.js';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseActionOverrides(value: unknown): ActionOverride[] {
  if (!Array.isArray(value)) throw new Error('Expected an overrides array');
  return value.map((entry) => {
    if (
      !object(entry) ||
      typeof entry.action !== 'string' ||
      !entry.action.trim()
    )
      throw new Error('Action must be a non-empty pattern');
    if (
      entry.effect !== 'allow' &&
      entry.effect !== 'ask' &&
      entry.effect !== 'deny'
    )
      throw new Error('Effect must be allow, ask or deny');
    return { action: entry.action.trim(), effect: entry.effect };
  });
}

export function validateSpecialistRole(role: string): SpecialistRole {
  const canonical = SPECIALIST_ROLES.find((name) => name === role);
  if (!canonical) throw new Error(`Unknown specialist role: ${role}`);
  return canonical;
}

/** Unknown roles warn and are ignored; malformed known roles invalidate the file. */
export function parseToolsDocument(
  value: unknown,
  warnings: string[] = [],
): ToolsDocument {
  if (!object(value) || value.version !== 1 || !object(value.roles))
    throw new Error('Expected version 1 and a roles object');
  const roles: ToolsDocument['roles'] = {};
  for (const [role, entry] of Object.entries(value.roles)) {
    const canonical = SPECIALIST_ROLES.find((name) => name === role);
    if (!canonical) {
      warnings.push(`Unknown specialist role ignored: ${role}`);
      continue;
    }
    if (!object(entry)) throw new Error(`Invalid overrides for ${role}`);
    roles[canonical] = { overrides: parseActionOverrides(entry.overrides) };
  }
  return { version: 1, roles };
}
