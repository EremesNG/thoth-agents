import type { AgentRoleName } from './agent-pack';

export type SddRoute = 'direct' | 'accelerated' | 'full';

export type SddIntent =
  | 'documentation'
  | 'mechanical'
  | 'behavior'
  | 'architecture';

export type SddScope = 'local' | 'multi-file' | 'cross-cutting';
export type SddClarity = 'clear' | 'partial' | 'uncertain';
export type SddRisk = 'low' | 'medium' | 'high';

export interface SddRoutingInput {
  intent: SddIntent;
  scope: SddScope;
  clarity: SddClarity;
  contractRisk: SddRisk;
  failureCost: SddRisk;
  explicitSdd?: boolean;
}

export interface SddRoutingDecision {
  route: SddRoute;
  requiresUserInput: boolean;
  reasons: string[];
}

export type SddPhaseId =
  | 'explore'
  | 'specify'
  | 'clarify'
  | 'plan'
  | 'checklist'
  | 'tasks'
  | 'analyze'
  | 'implement'
  | 'verify'
  | 'converge';

export type SddPhaseActivation = 'required' | 'conditional';

export interface SddPhaseContract {
  id: SddPhaseId;
  order: number;
  requiredFor: SddRoute[];
  activation: SddPhaseActivation;
  prerequisites: SddPhaseId[];
  producesArtifact: boolean;
  defaultAgentRole: AgentRoleName;
  reason: string;
  condition?: string;
}

export type SddArtifactId =
  | 'spec'
  | 'plan'
  | 'tasks'
  | 'requirements-checklist'
  | 'research'
  | 'data-model'
  | 'contracts'
  | 'quickstart';

export interface SddArtifactContract {
  id: SddArtifactId;
  path: string;
  producedBy: SddPhaseId;
  consumes: SddArtifactId[];
  requiredFor: SddRoute[];
}

export interface SddWorkflowContract {
  artifactRoot: string;
  phases: SddPhaseContract[];
  routingRules: string[];
  artifactRules: string[];
  verificationRules: string[];
}

export const SDD_PHASES = [
  {
    id: 'explore',
    order: 0,
    requiredFor: ['full'],
    activation: 'required',
    prerequisites: [],
    producesArtifact: false,
    defaultAgentRole: 'explorer',
    reason:
      'Resolve broad repository uncertainty before requirements are fixed.',
  },
  {
    id: 'specify',
    order: 1,
    requiredFor: ['accelerated', 'full'],
    activation: 'required',
    prerequisites: [],
    producesArtifact: true,
    defaultAgentRole: 'sdd-specify',
    reason: 'Define the user-visible requirements and acceptance contract.',
  },
  {
    id: 'clarify',
    order: 2,
    requiredFor: [],
    activation: 'conditional',
    prerequisites: ['specify'],
    producesArtifact: false,
    defaultAgentRole: 'sdd-specify',
    reason: 'Resolve only material ambiguity that would change the solution.',
    condition:
      'Activate when unresolved decisions cannot be handled by a safe local assumption.',
  },
  {
    id: 'plan',
    order: 3,
    requiredFor: ['accelerated', 'full'],
    activation: 'required',
    prerequisites: ['specify'],
    producesArtifact: true,
    defaultAgentRole: 'sdd-plan',
    reason: 'Translate requirements into an executable technical approach.',
  },
  {
    id: 'checklist',
    order: 4,
    requiredFor: [],
    activation: 'conditional',
    prerequisites: ['specify', 'plan'],
    producesArtifact: true,
    defaultAgentRole: 'sdd-specify',
    reason:
      'Audit requirement quality when risk justifies an explicit checklist.',
    condition:
      'Activate for high-risk, compliance-sensitive, or ambiguity-prone requirements.',
  },
  {
    id: 'tasks',
    order: 5,
    requiredFor: ['accelerated', 'full'],
    activation: 'required',
    prerequisites: ['specify', 'plan'],
    producesArtifact: true,
    defaultAgentRole: 'sdd-tasks',
    reason:
      'Produce dependency-ordered implementation slices with verification.',
  },
  {
    id: 'analyze',
    order: 6,
    requiredFor: ['full'],
    activation: 'required',
    prerequisites: ['specify', 'plan', 'tasks'],
    producesArtifact: false,
    defaultAgentRole: 'oracle',
    reason:
      'Independently check cross-artifact consistency before high-risk implementation.',
  },
  {
    id: 'implement',
    order: 7,
    requiredFor: ['direct', 'accelerated', 'full'],
    activation: 'required',
    prerequisites: [],
    producesArtifact: false,
    defaultAgentRole: 'orchestrator',
    reason:
      'Let the adaptive root act directly or route the settled work to one writer.',
  },
  {
    id: 'verify',
    order: 8,
    requiredFor: ['direct', 'accelerated', 'full'],
    activation: 'required',
    prerequisites: ['implement'],
    producesArtifact: false,
    defaultAgentRole: 'oracle',
    reason:
      'Judge the result against requirements, contracts, and focused checks.',
  },
  {
    id: 'converge',
    order: 9,
    requiredFor: [],
    activation: 'conditional',
    prerequisites: ['verify'],
    producesArtifact: false,
    defaultAgentRole: 'orchestrator',
    reason:
      'Resolve verification findings with a bounded additional implementation loop.',
    condition: 'Activate only when verification finds actionable defects.',
  },
] as const satisfies readonly SddPhaseContract[];

export const SDD_ARTIFACT_GRAPH = [
  {
    id: 'spec',
    path: 'spec.md',
    producedBy: 'specify',
    consumes: [],
    requiredFor: ['accelerated', 'full'],
  },
  {
    id: 'plan',
    path: 'plan.md',
    producedBy: 'plan',
    consumes: ['spec'],
    requiredFor: ['accelerated', 'full'],
  },
  {
    id: 'tasks',
    path: 'tasks.md',
    producedBy: 'tasks',
    consumes: ['spec', 'plan'],
    requiredFor: ['accelerated', 'full'],
  },
  {
    id: 'requirements-checklist',
    path: 'checklists/requirements.md',
    producedBy: 'checklist',
    consumes: ['spec'],
    requiredFor: [],
  },
  {
    id: 'research',
    path: 'research.md',
    producedBy: 'plan',
    consumes: ['spec'],
    requiredFor: [],
  },
  {
    id: 'data-model',
    path: 'data-model.md',
    producedBy: 'plan',
    consumes: ['spec'],
    requiredFor: [],
  },
  {
    id: 'contracts',
    path: 'contracts/',
    producedBy: 'plan',
    consumes: ['spec'],
    requiredFor: [],
  },
  {
    id: 'quickstart',
    path: 'quickstart.md',
    producedBy: 'plan',
    consumes: ['spec', 'plan'],
    requiredFor: [],
  },
] as const satisfies readonly SddArtifactContract[];

export const SDD_WORKFLOW_CONTRACT: SddWorkflowContract = {
  artifactRoot: 'openspec/changes/<feature>/',
  phases: [...SDD_PHASES],
  routingRules: [
    'Direct work is the default for clear, local, low-risk changes.',
    'Accelerated SDD is used for bounded multi-file or moderate-risk work.',
    'Full SDD is used for explicit SDD requests, unresolved scope, cross-cutting work, or high risk.',
    'Use architectural-grilling before specification only when the user explicitly requests it or material product or architecture decisions remain human-owned and unresolved; never require it merely because the route is Full.',
    'User input is requested only when a material unresolved decision would change the result.',
  ],
  artifactRules: [
    'Spec Kit artifact semantics are preserved inside the governed openspec store.',
    'Accelerated and full routes require spec.md, plan.md, and tasks.md.',
    'Research, data model, contracts, quickstart, and requirements checklist are created only when useful.',
    'Phase agents write coordination artifacts; implementation ownership stays with the adaptive root or one writer role.',
  ],
  verificationRules: [
    'Every route ends with focused verification proportional to behavior and risk.',
    'Full SDD uses independent cross-artifact analysis before implementation.',
    'Convergence is conditional and bounded by actionable verification findings.',
  ],
};

function clonePhase(phase: SddPhaseContract): SddPhaseContract {
  return {
    ...phase,
    requiredFor: [...phase.requiredFor],
    prerequisites: [...phase.prerequisites],
  };
}

export function classifySddRoute(input: SddRoutingInput): SddRoutingDecision {
  const reasons: string[] = [];

  if (input.explicitSdd) {
    reasons.push('The user explicitly requested SDD.');
  }
  if (input.clarity === 'uncertain') {
    reasons.push(
      'A material scope or requirements decision remains unresolved.',
    );
  }
  if (input.scope === 'cross-cutting') {
    reasons.push('The change crosses multiple architectural surfaces.');
  }
  if (input.contractRisk === 'high') {
    reasons.push('The public or internal contract risk is high.');
  }
  if (input.failureCost === 'high') {
    reasons.push('The cost of an incorrect change is high.');
  }

  if (reasons.length > 0) {
    return {
      route: 'full',
      requiresUserInput: input.clarity === 'uncertain',
      reasons,
    };
  }

  const useLeanRoute =
    input.scope === 'multi-file' ||
    input.clarity === 'partial' ||
    input.contractRisk === 'medium' ||
    input.failureCost === 'medium';

  if (useLeanRoute) {
    return {
      route: 'accelerated',
      requiresUserInput: false,
      reasons: [
        'The work is bounded but benefits from explicit specification, planning, and tasks.',
      ],
    };
  }

  return {
    route: 'direct',
    requiresUserInput: false,
    reasons: ['The work is clear, local, and low risk.'],
  };
}

export function getSddWorkflowContract(): SddWorkflowContract {
  return {
    artifactRoot: SDD_WORKFLOW_CONTRACT.artifactRoot,
    phases: SDD_WORKFLOW_CONTRACT.phases.map(clonePhase),
    routingRules: [...SDD_WORKFLOW_CONTRACT.routingRules],
    artifactRules: [...SDD_WORKFLOW_CONTRACT.artifactRules],
    verificationRules: [...SDD_WORKFLOW_CONTRACT.verificationRules],
  };
}

export function getSddArtifactGraph(): SddArtifactContract[] {
  return SDD_ARTIFACT_GRAPH.map((artifact) => ({
    ...artifact,
    consumes: [...artifact.consumes],
    requiredFor: [...artifact.requiredFor],
  }));
}

export function getSddPhase(id: SddPhaseId): SddPhaseContract {
  const phase = SDD_PHASES.find((candidate) => candidate.id === id);

  if (!phase) {
    throw new Error(`Unknown SDD phase: ${id}`);
  }

  return clonePhase(phase);
}

export function getSddPhaseOwner(
  route: SddRoute,
  phaseId: SddPhaseId,
): AgentRoleName {
  if (phaseId === 'verify' && route !== 'full') {
    return 'orchestrator';
  }

  return getSddPhase(phaseId).defaultAgentRole;
}

export function getRequiredSddPhaseOrder(route: SddRoute): SddPhaseId[] {
  return SDD_PHASES.filter((phase) =>
    (phase.requiredFor as readonly SddRoute[]).includes(route),
  ).map((phase) => phase.id);
}

export function canEnterSddPhase({
  route,
  completed,
  target,
}: {
  route: SddRoute;
  completed: readonly SddPhaseId[];
  target: SddPhaseId;
}): boolean {
  const phase = getSddPhase(target);
  const isRequired = phase.requiredFor.includes(route);

  if (!isRequired && phase.activation !== 'conditional') {
    return false;
  }

  const applicable = new Set<SddPhaseId>([
    ...getRequiredSddPhaseOrder(route),
    ...SDD_PHASES.filter(
      (candidate) => candidate.activation === 'conditional',
    ).map((candidate) => candidate.id),
  ]);

  return phase.prerequisites
    .filter((prerequisite) => applicable.has(prerequisite))
    .every((prerequisite) => completed.includes(prerequisite));
}
