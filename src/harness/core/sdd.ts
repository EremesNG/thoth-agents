export type SddPipelineType = 'direct' | 'accelerated' | 'full';

export type SddPhaseId =
  | 'requirements-interview'
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
  owner: 'orchestrator' | 'write-capable-agent' | 'oracle' | 'user';
}

export interface SddWorkflowContract {
  phases: SddPhaseContract[];
  routingRules: string[];
  artifactRules: string[];
  verificationRules: string[];
}

export const FULL_SDD_PHASE_ORDER = [
  'requirements-interview',
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
  },
  {
    id: 'proposal',
    order: 1,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['requirements-interview'],
    producesArtifact: true,
    owner: 'write-capable-agent',
  },
  {
    id: 'spec',
    order: 2,
    requiredFor: ['full'],
    prerequisites: ['proposal'],
    producesArtifact: true,
    owner: 'write-capable-agent',
  },
  {
    id: 'design',
    order: 3,
    requiredFor: ['full'],
    prerequisites: ['proposal', 'spec'],
    producesArtifact: true,
    owner: 'write-capable-agent',
  },
  {
    id: 'tasks',
    order: 4,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['proposal', 'spec', 'design'],
    producesArtifact: true,
    owner: 'write-capable-agent',
  },
  {
    id: 'plan-review',
    order: 5,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['tasks'],
    producesArtifact: false,
    gate: 'oracle-review',
    owner: 'oracle',
  },
  {
    id: 'implementation-confirmation',
    order: 6,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['plan-review'],
    producesArtifact: false,
    gate: 'user-confirmation',
    owner: 'user',
  },
  {
    id: 'apply',
    order: 7,
    requiredFor: ['direct', 'accelerated', 'full'],
    prerequisites: ['implementation-confirmation'],
    producesArtifact: false,
    owner: 'write-capable-agent',
  },
  {
    id: 'verify',
    order: 8,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['apply'],
    producesArtifact: true,
    owner: 'write-capable-agent',
  },
  {
    id: 'archive',
    order: 9,
    requiredFor: ['accelerated', 'full'],
    prerequisites: ['verify'],
    producesArtifact: true,
    owner: 'write-capable-agent',
  },
] as const satisfies readonly SddPhaseContract[];

export const SDD_WORKFLOW_CONTRACT: SddWorkflowContract = {
  phases: [...SDD_PHASES],
  routingRules: [
    'Requirements interview is step zero for all non-trivial work.',
    'Direct implementation is reserved for low-complexity work.',
    'Accelerated SDD follows proposal -> tasks before execution.',
    'Full SDD follows proposal -> spec -> design -> tasks before execution.',
  ],
  artifactRules: [
    'Artifact-producing phases are executed by write-capable agents.',
    'Full-pipeline tasks require proposal, spec, and design artifacts.',
    'Oracle is read-only and only performs plan review.',
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
    return completed.includes('proposal');
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
