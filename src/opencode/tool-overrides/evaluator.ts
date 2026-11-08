import type { PermissionRule } from '../permission-rules.js';
import type {
  ActionOverride,
  EffectiveToolOverrides,
  ToolEffect,
  ToolScope,
} from './types.js';
import { matchAction } from './wildcard.js';

/** Rules to append to the shipped array; an empty override list is a no-op. */
export function appendOverrideRules(
  overrides: readonly ActionOverride[],
): PermissionRule[] {
  if (!overrides.length) return [];
  return [
    ...overrides.map((override) => ({ ...override, resource: '*' })),
    { action: 'subagent', resource: '*', effect: 'deny' },
  ];
}

/** Role-level preview at resource '*'; session rules are intentionally not involved. */
export function evaluateAction(
  base: readonly PermissionRule[],
  effective: EffectiveToolOverrides | undefined,
  action: string,
  platform: string = process.platform,
): { effect: ToolEffect; origin: 'default' | ToolScope } {
  let result: { effect: ToolEffect; origin: 'default' | ToolScope } = {
    effect: 'ask',
    origin: 'default',
  };
  for (const rule of base) {
    if (
      matchAction(action, rule.action, platform) &&
      matchAction('*', rule.resource, platform)
    )
      result = { effect: rule.effect, origin: 'default' };
  }
  if (effective) {
    const rules = appendOverrideRules(effective.overrides);
    for (const [index, rule] of rules.entries()) {
      if (matchAction(action, rule.action, platform))
        result = {
          effect: rule.effect,
          origin: index === rules.length - 1 ? 'default' : effective.origin,
        };
    }
  }
  return result;
}

/** Inherit removes every exact entry, leaving broader patterns intact. */
export function removeActionOverride(
  overrides: readonly ActionOverride[],
  action: string,
): ActionOverride[] {
  return overrides
    .filter((entry) => entry.action !== action)
    .map((entry) => ({ ...entry }));
}

/** Explicit choices go last so broader patterns cannot supersede the edit. */
export function setActionOverride(
  overrides: readonly ActionOverride[],
  value: ActionOverride,
): ActionOverride[] {
  return [...removeActionOverride(overrides, value.action), { ...value }];
}
