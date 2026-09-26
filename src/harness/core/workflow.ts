import type { AgentRoleName } from './agent-pack';
import type { MemoryDispatchContract } from './memory-governance';

export type WorkPhaseId = 'plan' | 'execute' | 'resume' | 'verify' | 'close';

export interface WorkPhaseContract {
  id: WorkPhaseId;
  objective: string;
  eligibleAgentRoles: AgentRoleName[];
  inputs: string[];
  rules: string[];
  outputs: string[];
}

export interface WorkWorkflowContract {
  version: 1;
  directPath: 'implement -> verify';
  persistedWorkPath: '.thoth/changes/<id>/work.yaml';
  checkpointPath: '.thoth/changes/<id>/evidence/<unit-id>/checkpoint.json';
  phases: WorkPhaseContract[];
  rules: string[];
  authorizationRules: string[];
  verificationRules: string[];
}

export type ExecutionCoordinationStep =
  | 'bound-units'
  | 'map-output-dependencies'
  | 'admit-ready-units'
  | 'dispatch-to-native-capacity'
  | 'wait-for-native-terminal-event'
  | 'accept-results'
  | 'refill-capacity';

export interface ExecutionCoordinationPolicy {
  steps: ExecutionCoordinationStep[];
  admission: string[];
  dispatch: string[];
  completion: string[];
  recovery: string[];
}

export interface WorkUnitDispatchInput {
  phase: WorkPhaseId;
  changeId: string;
  unitId: string;
  objective: string;
  inputs?: readonly string[];
  requirements?: readonly string[];
  boundaries?: readonly string[];
  verification?: readonly string[];
  expectedOutput?: readonly string[];
  handoff?: readonly string[];
  memory: MemoryDispatchContract;
}

const WORK_PHASES: readonly WorkPhaseContract[] = [
  {
    id: 'plan',
    objective:
      'Turn the human-agreed goal, bounds, autonomy, and acceptance into bounded executable units.',
    eligibleAgentRoles: ['orchestrator'],
    inputs: ['human agreement', 'relevant repository evidence'],
    rules: [
      'Root owns the agreement, unit graph, ownership, and acceptance criteria.',
      'Persist nontrivial or recoverable work in .thoth/changes/<id>/work.yaml using work contract version 1.',
      'Offer the user Oracle plan review or direct implementation once the persisted plan is ready; after Oracle [OKAY], resolve implementation or stop.',
      'Use the two bounded planning choices in authorizationRules; do not ask the user to choose a pipeline.',
    ],
    outputs: ['work.yaml or a bounded direct-work decision'],
  },
  {
    id: 'execute',
    objective:
      'Complete accepted work units through bounded owners and harness-native execution.',
    eligibleAgentRoles: ['orchestrator', 'designer', 'quick', 'deep'],
    inputs: ['accepted agreement', 'ready unit packet'],
    rules: [
      'Use TDD for behavior changes at public seams and preserve one writer per mutable surface.',
      'Dispatch only units whose concrete upstream outputs are root-accepted and fresh.',
      'A child may write only its assigned surface and cannot approve its own work.',
    ],
    outputs: ['implementation evidence', 'unit result for root acceptance'],
  },
  {
    id: 'resume',
    objective:
      'Recover persisted work without replaying completed or unsafe effects.',
    eligibleAgentRoles: ['orchestrator'],
    inputs: [
      '.thoth/changes/<id>/work.yaml',
      'pending checkpoint for the affected unit',
      'relevant diff and dirty files',
      'dependency fingerprints',
    ],
    rules: [
      'Load bounded recovery evidence rather than scanning unrelated repository areas.',
      'Preserve partial and preexisting work and reconcile external effects before replay.',
      'Unknown native liveness blocks only the conflicting surface until reconciled.',
      'A checkpoint records evidence; it never establishes native execution state.',
    ],
    outputs: ['reconciled pending units', 'updated recovery evidence'],
  },
  {
    id: 'verify',
    objective:
      'Judge the implemented result against the agreed acceptance criteria.',
    eligibleAgentRoles: ['oracle'],
    inputs: ['accepted unit results', 'agreement and acceptance criteria'],
    rules: [
      'Persisted artifact work uses a fresh Oracle; the writer must never self-approve.',
      'Trivial deterministic direct work may use focused root checks when independent judgment adds no value.',
      'Plan review is optional and never substitutes for final independent verification.',
    ],
    outputs: ['PASS or FAIL with evidence and bounded remediation anchors'],
  },
  {
    id: 'close',
    objective: 'Close only accepted and independently verified persisted work.',
    eligibleAgentRoles: ['orchestrator'],
    inputs: ['terminal accepted units', 'verification verdict'],
    rules: [
      'Record the outcome in project work evidence without mirroring provider memory.',
      'Preserve historical records separately from active execution input.',
    ],
    outputs: ['closed work contract and retained evidence'],
  },
];

const WORKFLOW_CONTRACT: WorkWorkflowContract = {
  version: 1,
  directPath: 'implement -> verify',
  persistedWorkPath: '.thoth/changes/<id>/work.yaml',
  checkpointPath: '.thoth/changes/<id>/evidence/<unit-id>/checkpoint.json',
  phases: [...WORK_PHASES],
  rules: [
    'Trivial bounded work may implement and verify directly.',
    'Nontrivial, multi-unit, interruptible, or recoverable work uses the persisted work contract.',
    'Supporting context and external unit files are optional; units may remain inline in work.yaml.',
    'Project work evidence and provider memory are independent and must not be mirrored.',
  ],
  authorizationRules: [
    'Existing authorization persists; technical replanning within the agreement does not require fresh approval outside these two choices.',
    'Ready persisted plan: ask Review plan with Oracle (Recommended) or Implement directly unless resolved; the user decides.',
    'Use plan-reviewer and fresh read-only Oracle: [OKAY]/[REJECT], at most three blockers. Repair then obtain a fresh judgment.',
    'After Oracle [OKAY], summarize and ask Implement (Recommended) or Stop with approved plan, even when already authorized; Oracle alone cannot authorize execution.',
    'At most three total native attempts for each question; the third confirmed unanswered return selects the recommended option. Explicit answers, including Stop, always win.',
    'A pending question, elapsed time, unavailable UI/tool, failure or interruption never count. Obey native retry limits; report gaps without inventing attempts.',
    'The two defaults select review, then implementation; never resolve secrets, destructive/security-sensitive actions or product decisions. Implement directly skips plan review only, not final verification.',
    'Persist native references, unanswered counts, choices and plan identity in evidence/planning.json per thoth-work references/planning.md. Resume preserves explicit or fallback choices, Stop and remaining attempts. Materially changed reviewed plans need fresh review and an implementation choice; expected implementation edits do not reopen choices.',
    'Otherwise ask only for a material human-owned new decision, secret or sensitive action outside authorization.',
  ],
  verificationRules: [
    'Every change is verified in proportion to risk.',
    'Persisted work and materially risky direct work receive independent verification by a fresh Oracle.',
    'No implementation writer approves its own result.',
  ],
};

const EXECUTION_COORDINATION_POLICY: ExecutionCoordinationPolicy = {
  steps: [
    'bound-units',
    'map-output-dependencies',
    'admit-ready-units',
    'dispatch-to-native-capacity',
    'wait-for-native-terminal-event',
    'accept-results',
    'refill-capacity',
  ],
  admission: [
    'A dependency exists only when a unit needs a concrete upstream output.',
    'Admit units only when their dependencies are terminal, root-accepted, and fresh.',
    'Concurrent units require compatible reads, writes, interfaces, and resources plus one writer per mutable surface.',
  ],
  dispatch: [
    'Dispatch every admitted conflict-free ready unit before waiting, limited by proven native capacity.',
    'After accepting a terminal result, refill freed capacity with newly ready consumers before another wait.',
    'Release each consumer as soon as its own dependencies qualify; there is no global wave barrier.',
  ],
  completion: [
    'Harness-native spawn, status, wait, steering, cancellation, and terminal results are the sole authority.',
    'Timeout, silence, malformed status, and checkpoint presence remain nonterminal.',
    'Root acceptance records semantic completion after reconciling intent, ownership, checks, and freshness.',
  ],
  recovery: [
    'Unknown native liveness blocks only a conflicting surface while unrelated ready units may continue.',
    'Reconcile external effects before replay and preserve partial plus preexisting work.',
  ],
};

function clonePhase(phase: WorkPhaseContract): WorkPhaseContract {
  return {
    ...phase,
    eligibleAgentRoles: [...phase.eligibleAgentRoles],
    inputs: [...phase.inputs],
    rules: [...phase.rules],
    outputs: [...phase.outputs],
  };
}

export function getWorkWorkflowContract(): WorkWorkflowContract {
  return {
    ...WORKFLOW_CONTRACT,
    phases: WORKFLOW_CONTRACT.phases.map(clonePhase),
    rules: [...WORKFLOW_CONTRACT.rules],
    authorizationRules: [...WORKFLOW_CONTRACT.authorizationRules],
    verificationRules: [...WORKFLOW_CONTRACT.verificationRules],
  };
}

export function getExecutionCoordinationPolicy(): ExecutionCoordinationPolicy {
  return {
    steps: [...EXECUTION_COORDINATION_POLICY.steps],
    admission: [...EXECUTION_COORDINATION_POLICY.admission],
    dispatch: [...EXECUTION_COORDINATION_POLICY.dispatch],
    completion: [...EXECUTION_COORDINATION_POLICY.completion],
    recovery: [...EXECUTION_COORDINATION_POLICY.recovery],
  };
}

export function getWorkPhase(id: WorkPhaseId): WorkPhaseContract {
  const phase = WORK_PHASES.find((candidate) => candidate.id === id);
  if (!phase) throw new Error(`Unknown work phase: ${id}`);
  return clonePhase(phase);
}

export function getWorkPhasesForRole(role: AgentRoleName): WorkPhaseContract[] {
  return WORK_PHASES.filter((phase) =>
    phase.eligibleAgentRoles.includes(role),
  ).map(clonePhase);
}

function renderList(items: readonly string[] | undefined): string {
  return items && items.length > 0
    ? items.map((item) => `- ${item}`).join('\n')
    : '- none';
}

function renderMemory(memory: MemoryDispatchContract): string {
  return [
    `provider=${memory.provider}`,
    `project=${memory.project}`,
    `root_session_id=${memory.rootSessionId ?? 'unavailable'}`,
    `authorization=${memory.authorization}`,
    'context:',
    renderList(memory.context),
  ].join('\n');
}

export function renderWorkUnitDispatchTemplate(): string {
  return `## PHASE / WORK
<plan|execute|resume|verify|close> / <change-id>

## UNIT
<unit-id>

## OBJECTIVE
<bounded outcome>

## INPUTS
<accepted dependency outputs and focused evidence>

## REQUIREMENTS
<concrete outcomes>

## BOUNDARIES
<owned reads, writes, interfaces, resources, and non-goals>

## VERIFICATION
<checks and acceptance criteria>

## EXPECTED OUTPUT
conclusion, evidence, verification, risks, openQuestions, nextAction

## HANDOFF
<what consumers need and how freshness is established>

## MEMORY
provider=thoth-mem
project=<project-name>
root_session_id=<stable-root-session-id|unavailable>
authorization=<none|recall|observe>
context:
<bounded recalled context or - none>`;
}

export function renderWorkUnitDispatchEnvelope(
  input: WorkUnitDispatchInput,
): string {
  const phase = getWorkPhase(input.phase);
  return `## PHASE / WORK
${input.phase} / ${input.changeId}

## UNIT
${input.unitId}

## OBJECTIVE
${input.objective || phase.objective}

## INPUTS
${renderList(input.inputs)}

## REQUIREMENTS
${renderList(input.requirements)}

## BOUNDARIES
${renderList(input.boundaries)}

## VERIFICATION
${renderList(input.verification)}

## EXPECTED OUTPUT
${renderList(
  input.expectedOutput ?? [
    'conclusion',
    'evidence',
    'verification',
    'risks',
    'openQuestions',
    'nextAction',
  ],
)}

## HANDOFF
${renderList(input.handoff)}

## MEMORY
${renderMemory(input.memory)}`;
}
