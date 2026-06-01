import type { AgentRoleName } from './agent-pack';

export type SddPipelineType = 'direct' | 'accelerated' | 'full';

export type SddPhaseId =
  | 'requirements-interview'
  | 'init'
  | 'explore'
  | 'proposal'
  | 'spec'
  | 'design'
  | 'tasks'
  | 'plan-review'
  | 'implementation-confirmation'
  | 'apply'
  | 'verify'
  | 'archive';

export interface SddPhaseContract {
  id: SddPhaseId;
  order: number;
  requiredFor: SddPipelineType[];
  prerequisites: SddPhaseId[];
  producesArtifact: boolean;
  gate?: 'oracle-review' | 'user-confirmation';
  owner:
    | 'orchestrator'
    | 'read-only-agent'
    | 'write-capable-agent'
    | 'oracle'
    | 'user';
  artifactSkill?: string;
  artifactMeaning?: string;
  condition?: string;
  defaultAgentRole?: AgentRoleName;
  alternateAgentRoles?: AgentRoleName[];
  supportingAgentRoles?: AgentRoleName[];
  persistenceAgentRole?: AgentRoleName;
  delegationReason?: string;
}

export interface SddWorkflowContract {
  phases: SddPhaseContract[];
  routingRules: string[];
  artifactRules: string[];
  verificationRules: string[];
}

export const FULL_SDD_PHASE_ORDER = [
  'requirements-interview',
  'explore',
  'proposal',
  'spec',
  'design',
  'tasks',
  'plan-review',
  'implementation-confirmation',
  'apply',
  'verify',
  'archive',
] as const satisfies readonly SddPhaseId[];

export const SDD_PHASES = [
  {
    id: 'requirements-interview',
    order: 0,
    requiredFor: ['direct', 'accelerated', 'full'],
    prerequisites: [],
    producesArtifact: false,
    owner: 'orchestrator',
    delegationReason:
      'Root-owned requirements discovery, scope calibration, and route approval.',
  },
  {
    id: 'init',
    order: 1,
    requiredFor: [],
    prerequisites: ['requirements-interview'],
    producesArtifact: true,
    owner: 'write-capable-agent',
    artifactSkill: 'sdd-init',
    condition:
      'Only when OpenSpec persistence is selected and openspec/ is missing.',
    defaultAgentRole: 'quick',
    supportingAgentRoles: ['explorer'],
    delegationReason:
      'Fast mechanical bootstrap, with explorer supplying repository facts when needed.',
  },
  {
    id: 'explore',
    order: 2,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['requirements-interview'],
    producesArtifact: false,
    owner: 'read-only-agent',
    defaultAgentRole: 'explorer',
    supportingAgentRoles: ['librarian'],
    delegationReason:
      'Read-only repository discovery before artifact-producing SDD phases.',
  },
  {
    id: 'proposal',
    order: 3,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['requirements-interview', 'explore'],
    producesArtifact: true,
    owner: 'write-capable-agent',
    artifactSkill: 'sdd-propose',
    defaultAgentRole: 'deep',
    supportingAgentRoles: ['oracle'],
    delegationReason:
      'Structured technical reasoning and trade-off synthesis before implementation.',
  },
  {
    id: 'spec',
    order: 4,
    requiredFor: ['full'],
    prerequisites: ['proposal'],
    producesArtifact: true,
    owner: 'write-capable-agent',
    artifactSkill: 'sdd-spec',
    defaultAgentRole: 'deep',
    supportingAgentRoles: ['oracle'],
    delegationReason:
      'High-quality requirement contract work where ambiguity propagates downstream.',
  },
  {
    id: 'design',
    order: 5,
    requiredFor: ['full'],
    prerequisites: ['proposal', 'spec'],
    producesArtifact: true,
    owner: 'write-capable-agent',
    artifactSkill: 'sdd-design',
    artifactMeaning: 'technical-solution-design',
    defaultAgentRole: 'deep',
    supportingAgentRoles: ['designer'],
    delegationReason:
      'Technical architecture and file-change design; designer only supports UI/UX concerns.',
  },
  {
    id: 'tasks',
    order: 6,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['proposal', 'spec', 'design'],
    producesArtifact: true,
    owner: 'write-capable-agent',
    artifactSkill: 'sdd-tasks',
    defaultAgentRole: 'quick',
    alternateAgentRoles: ['deep'],
    delegationReason:
      'Mechanical conversion of settled design into dependency-ordered execution tasks.',
  },
  {
    id: 'plan-review',
    order: 7,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['tasks'],
    producesArtifact: false,
    gate: 'oracle-review',
    owner: 'oracle',
    defaultAgentRole: 'oracle',
    delegationReason:
      'Independent read-only executability review of tasks before implementation.',
  },
  {
    id: 'implementation-confirmation',
    order: 8,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['plan-review'],
    producesArtifact: false,
    gate: 'user-confirmation',
    owner: 'user',
    delegationReason:
      'Human approval gate after reviewed tasks and before workspace implementation.',
  },
  {
    id: 'apply',
    order: 9,
    requiredFor: ['direct', 'accelerated', 'full'],
    prerequisites: ['implementation-confirmation'],
    producesArtifact: false,
    owner: 'write-capable-agent',
    defaultAgentRole: 'deep',
    alternateAgentRoles: ['quick', 'designer'],
    delegationReason:
      'Correctness-heavy implementation by default; quick handles mechanical batches and designer owns UI/visual work.',
  },
  {
    id: 'verify',
    order: 10,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['apply'],
    producesArtifact: true,
    owner: 'oracle',
    artifactSkill: 'sdd-verify',
    defaultAgentRole: 'oracle',
    persistenceAgentRole: 'quick',
    delegationReason:
      'Independent verification review; quick persists the report when the selected store requires writes.',
  },
  {
    id: 'archive',
    order: 11,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['verify'],
    producesArtifact: true,
    owner: 'write-capable-agent',
    artifactSkill: 'sdd-archive',
    defaultAgentRole: 'quick',
    delegationReason:
      'Mechanical closeout, summary, and archive movement after verification passes.',
  },
] as const satisfies readonly SddPhaseContract[];

export const SDD_WORKFLOW_CONTRACT: SddWorkflowContract = {
  phases: [...SDD_PHASES],
  routingRules: [
    'Requirements interview is step zero for all non-trivial work.',
    'Scope-faithful invariant: accepted user intent/scope is preserved; unresolved affected areas remain explicit as deferred/discovery follow-up.',
    'Direct implementation is reserved for low-complexity work.',
    'Accelerated SDD follows explore -> proposal -> tasks before execution.',
    'Full SDD follows explore -> proposal -> spec -> design -> tasks before execution.',
  ],
  artifactRules: [
    'SDD delegation defaults are phase-specific: sdd-propose, sdd-spec, and sdd-design default to deep.',
    'sdd-tasks defaults to quick with deep as fallback when the task plan is complex.',
    'sdd-verify defaults to oracle for independent review; quick persists the report when repository or memory writes are required.',
    'sdd-archive defaults to quick for mechanical closeout.',
    'OpenSpec design.md is technical solution design, not UI/UX design; sdd-design itself never routes to designer.',
    'Designer participates during apply only for user-facing UI, visual work, screenshots, or visual QA.',
    'Full-pipeline tasks require proposal, spec, and design artifacts.',
    'Oracle is read-only and performs plan review plus independent verification review; it does not persist artifacts.',
  ],
  verificationRules: [
    'Plan review must complete before implementation confirmation.',
    'User confirmation is required after plan-review approval and before apply.',
    'Apply is followed by verify and archive for SDD pipelines.',
  ],
};

export function getSddWorkflowContract(): SddWorkflowContract {
  return {
    phases: SDD_WORKFLOW_CONTRACT.phases.map((phase) => ({
      ...phase,
      requiredFor: [...phase.requiredFor],
      prerequisites: [...phase.prerequisites],
      alternateAgentRoles: phase.alternateAgentRoles
        ? [...phase.alternateAgentRoles]
        : undefined,
      supportingAgentRoles: phase.supportingAgentRoles
        ? [...phase.supportingAgentRoles]
        : undefined,
    })),
    routingRules: [...SDD_WORKFLOW_CONTRACT.routingRules],
    artifactRules: [...SDD_WORKFLOW_CONTRACT.artifactRules],
    verificationRules: [...SDD_WORKFLOW_CONTRACT.verificationRules],
  };
}

export function getSddPhase(id: SddPhaseId): SddPhaseContract {
  const phase = SDD_PHASES.find((candidate) => candidate.id === id);

  if (!phase) {
    throw new Error(`Unknown SDD phase: ${id}`);
  }

  return phase;
}

export function getRequiredSddPhaseOrder(
  pipeline: SddPipelineType,
): SddPhaseId[] {
  if (pipeline === 'direct') {
    return ['requirements-interview', 'apply'];
  }

  return SDD_PHASES.filter((phase) =>
    (phase.requiredFor as readonly SddPipelineType[]).includes(pipeline),
  ).map((phase) => phase.id);
}

export function canEnterSddPhase({
  pipeline,
  completed,
  target,
}: {
  pipeline: SddPipelineType;
  completed: readonly SddPhaseId[];
  target: SddPhaseId;
}): boolean {
  const required = getRequiredSddPhaseOrder(pipeline);

  if (!required.includes(target)) {
    return false;
  }

  if (pipeline === 'accelerated' && target === 'tasks') {
    return completed.includes('explore') && completed.includes('proposal');
  }

  if (pipeline === 'direct' && target === 'apply') {
    return completed.includes('requirements-interview');
  }

  const phase = getSddPhase(target);
  const applicablePrerequisites = phase.prerequisites.filter((prerequisite) =>
    required.includes(prerequisite),
  );

  return applicablePrerequisites.every((prerequisite) =>
    completed.includes(prerequisite),
  );
}
