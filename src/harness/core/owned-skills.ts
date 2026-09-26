export const THOTH_OWNED_SKILL_NAMES = [
  'thoth-init',
  'thoth-work',
  'thoth-constitution',
  'thoth-archive',
  'plan-reviewer',
] as const;

export type ThothOwnedSkillName = (typeof THOTH_OWNED_SKILL_NAMES)[number];
