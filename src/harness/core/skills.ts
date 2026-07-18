import type { AgentRoleName } from './agent-pack';

export type SkillRegistryEntryKind = 'skill' | 'shared-support';

export interface SkillRegistryEntry {
  name: string;
  description: string;
  allowedRoles: AgentRoleName[];
  sourcePath: string;
  kind: SkillRegistryEntryKind;
  purpose:
    | 'requirements'
    | 'sdd'
    | 'review'
    | 'memory'
    | 'discovery'
    | 'support';
}

const ORCHESTRATOR_ONLY: AgentRoleName[] = ['orchestrator'];

export const SHARED_SKILL_SUPPORT: SkillRegistryEntry = {
  name: '_shared',
  description: 'Shared OpenSpec and provider-neutral persistence conventions',
  allowedRoles: [
    'orchestrator',
    'explorer',
    'librarian',
    'oracle',
    'designer',
    'quick',
    'deep',
  ],
  sourcePath: 'src/skills/_shared',
  kind: 'shared-support',
  purpose: 'support',
};

export const BUNDLED_SKILL_REGISTRY = [
  {
    name: 'requirements-interview',
    description:
      'Mandatory step-0 discovery interview to understand user intent, clarify scope, and choose the right path before implementation',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/requirements-interview',
    kind: 'skill',
    purpose: 'requirements',
  },
  {
    name: 'plan-reviewer',
    description:
      'Review SDD task plans for execution blockers and valid references',
    allowedRoles: ['orchestrator', 'oracle'],
    sourcePath: 'src/skills/plan-reviewer',
    kind: 'skill',
    purpose: 'review',
  },
  {
    name: 'sdd-init',
    description: 'Initialize OpenSpec structure and SDD project context',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-init',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-propose',
    description: 'Create change proposals for OpenSpec workflows',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-propose',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-spec',
    description: 'Write OpenSpec delta specifications',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-spec',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-clarify',
    description:
      'Resolve residual spec ambiguity in place before design, with a bounded taxonomy-driven clarification pass.',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-clarify',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-design',
    description: 'Create technical solution design artifacts for changes',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-design',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-tasks',
    description: 'Generate phased implementation task checklists',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-tasks',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-apply',
    description: 'Execute tasks and persist implementation progress',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-apply',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'executing-plans',
    description:
      'Execute SDD task lists with real-time progress tracking, sub-agent dispatch, and verification checkpoints',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/executing-plans',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-verify',
    description: 'Build verification reports and compliance matrices',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-verify',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-archive',
    description: 'Archive completed OpenSpec changes with audit trails',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-archive',
    kind: 'skill',
    purpose: 'sdd',
  },
  {
    name: 'sdd-constitution',
    description:
      'Guide a semver constitution amendment and Sync-Impact Report entry.',
    allowedRoles: ORCHESTRATOR_ONLY,
    sourcePath: 'src/skills/sdd-constitution',
    kind: 'skill',
    purpose: 'sdd',
  },
] as const satisfies readonly SkillRegistryEntry[];

export const SKILL_REGISTRY = [
  ...BUNDLED_SKILL_REGISTRY,
  SHARED_SKILL_SUPPORT,
] as const satisfies readonly SkillRegistryEntry[];

export function getSkillRegistry(): SkillRegistryEntry[] {
  return SKILL_REGISTRY.map((entry) => ({
    ...entry,
    allowedRoles: [...entry.allowedRoles],
  }));
}

export function getBundledSkillRegistry(): SkillRegistryEntry[] {
  return BUNDLED_SKILL_REGISTRY.map((entry) => ({
    ...entry,
    allowedRoles: [...entry.allowedRoles],
  }));
}
