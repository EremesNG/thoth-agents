import type { AgentRoleName } from './agent-pack';
import type { MemoryDispatchContract } from './memory-governance';

export type SddRoute = 'direct' | 'accelerated' | 'full';

export type SddIntent =
  | 'documentation'
  | 'mechanical'
  | 'behavior'
  | 'architecture';

export type SddScope = 'local' | 'multi-file' | 'cross-cutting';
export type SddClarity = 'clear' | 'partial' | 'uncertain';
export type SddRisk = 'low' | 'medium' | 'high';
export type SddPlanningMode = 'none' | 'fast-forward' | 'gated';
export type SddValidationGate =
  | 'specify'
  | 'plan'
  | 'tasks'
  | 'checklist'
  | 'ready'
  | 'closeout';
export type SddArtifactRevisionPolicy =
  | 'none'
  | 'revalidate-affected-downstream';

export interface SddRoutingInput {
  intent: SddIntent;
  scope: SddScope;
  clarity: SddClarity;
  contractRisk: SddRisk;
  failureCost: SddRisk;
  requestedRoute?: SddRoute;
  sddRequested?: boolean;
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
  | 'converge'
  | 'archive';

export type SddPhaseActivation = 'required' | 'conditional';

export interface SddPhaseContract {
  id: SddPhaseId;
  order: number;
  availableFor: SddRoute[];
  requiredFor: SddRoute[];
  activation: SddPhaseActivation;
  prerequisites: SddPhaseId[];
  producesArtifact: boolean;
  defaultAgentRole: AgentRoleName;
  eligibleAgentRoles: AgentRoleName[];
  reason: string;
  condition?: string;
}

export interface SddPhaseProtocol {
  id: SddPhaseId;
  objective: string;
  requiredInputs: string[];
  instructions: string[];
  allowedWrites: string[];
  outputSchema: string[];
  doneWhen: string[];
  blockingConditions: string[];
  handoff: string[];
}

export interface SddPhaseDispatchInput {
  phase: SddPhaseId;
  route: SddRoute;
  changeName: string;
  inputArtifacts?: string[];
  requirements?: string[];
  boundaries?: string[];
  verification?: string[];
  memory: MemoryDispatchContract;
}

export type SddArtifactId =
  | 'spec'
  | 'plan'
  | 'tasks'
  | 'requirements-checklist'
  | 'research'
  | 'data-model'
  | 'contracts'
  | 'quickstart'
  | 'verify-report'
  | 'archive-report';

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
  routePolicies: SddRouteExecutionPolicy[];
  routingRules: string[];
  artifactRules: string[];
  verificationRules: string[];
}

export interface SddRouteExecutionPolicy {
  route: SddRoute;
  planningMode: SddPlanningMode;
  validationGates: SddValidationGate[];
  optionalArtifactsByDefault: boolean;
  routineUserPauses: boolean;
  artifactRevisionPolicy: SddArtifactRevisionPolicy;
}

export const SDD_PHASES = [
  {
    id: 'explore',
    order: 0,
    availableFor: ['full'],
    requiredFor: ['full'],
    activation: 'required',
    prerequisites: [],
    producesArtifact: false,
    defaultAgentRole: 'explorer',
    eligibleAgentRoles: ['explorer'],
    reason:
      'Resolve broad repository uncertainty before requirements are fixed.',
  },
  {
    id: 'specify',
    order: 1,
    availableFor: ['accelerated', 'full'],
    requiredFor: ['accelerated', 'full'],
    activation: 'required',
    prerequisites: ['explore'],
    producesArtifact: true,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator'],
    reason: 'Define the user-visible requirements and acceptance contract.',
  },
  {
    id: 'clarify',
    order: 2,
    availableFor: ['accelerated', 'full'],
    requiredFor: [],
    activation: 'conditional',
    prerequisites: ['specify'],
    producesArtifact: false,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator'],
    reason: 'Resolve only material ambiguity that would change the solution.',
    condition:
      'Activate when unresolved decisions cannot be handled by a safe local assumption.',
  },
  {
    id: 'plan',
    order: 3,
    availableFor: ['accelerated', 'full'],
    requiredFor: ['accelerated', 'full'],
    activation: 'required',
    prerequisites: ['specify'],
    producesArtifact: true,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator'],
    reason: 'Translate requirements into an executable technical approach.',
  },
  {
    id: 'checklist',
    order: 4,
    availableFor: ['accelerated', 'full'],
    requiredFor: [],
    activation: 'conditional',
    prerequisites: ['specify', 'plan'],
    producesArtifact: true,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator'],
    reason:
      'Audit requirement quality when risk justifies an explicit checklist.',
    condition:
      'Activate for high-risk, compliance-sensitive, or ambiguity-prone requirements.',
  },
  {
    id: 'tasks',
    order: 5,
    availableFor: ['accelerated', 'full'],
    requiredFor: ['accelerated', 'full'],
    activation: 'required',
    prerequisites: ['specify', 'plan'],
    producesArtifact: true,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator'],
    reason:
      'Produce dependency-ordered implementation slices with verification.',
  },
  {
    id: 'analyze',
    order: 6,
    availableFor: ['full'],
    requiredFor: ['full'],
    activation: 'required',
    prerequisites: ['specify', 'plan', 'tasks'],
    producesArtifact: false,
    defaultAgentRole: 'oracle',
    eligibleAgentRoles: ['oracle'],
    reason:
      'Independently check cross-artifact consistency before high-risk implementation.',
  },
  {
    id: 'implement',
    order: 7,
    availableFor: ['direct', 'accelerated', 'full'],
    requiredFor: ['direct', 'accelerated', 'full'],
    activation: 'required',
    prerequisites: ['tasks', 'analyze'],
    producesArtifact: false,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator', 'designer', 'quick', 'deep'],
    reason:
      'Let the adaptive root act directly or route the settled work to one writer.',
  },
  {
    id: 'verify',
    order: 8,
    availableFor: ['direct', 'accelerated', 'full'],
    requiredFor: ['direct', 'accelerated', 'full'],
    activation: 'required',
    prerequisites: ['implement'],
    producesArtifact: true,
    defaultAgentRole: 'oracle',
    eligibleAgentRoles: ['oracle'],
    reason:
      'Independently judge the result against requirements, contracts, and focused checks.',
  },
  {
    id: 'converge',
    order: 9,
    availableFor: ['accelerated', 'full'],
    requiredFor: [],
    activation: 'conditional',
    prerequisites: ['verify'],
    producesArtifact: true,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator'],
    reason:
      'Append traceable remaining work to tasks.md before another implementation loop.',
    condition: 'Activate only when verification finds actionable defects.',
  },
  {
    id: 'archive',
    order: 10,
    availableFor: ['accelerated', 'full'],
    requiredFor: ['accelerated', 'full'],
    activation: 'required',
    prerequisites: ['verify'],
    producesArtifact: true,
    defaultAgentRole: 'orchestrator',
    eligibleAgentRoles: ['orchestrator'],
    reason:
      'Transactionally sync declared durable deltas and close verified work with a dated audit trail.',
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
  {
    id: 'verify-report',
    path: 'verify-report.md',
    producedBy: 'verify',
    consumes: ['spec', 'plan', 'tasks'],
    requiredFor: ['accelerated', 'full'],
  },
  {
    id: 'archive-report',
    path: 'archive-report.md',
    producedBy: 'archive',
    consumes: ['spec', 'plan', 'tasks', 'verify-report'],
    requiredFor: ['accelerated', 'full'],
  },
] as const satisfies readonly SddArtifactContract[];

export const SDD_ROUTE_EXECUTION_POLICIES = [
  {
    route: 'direct',
    planningMode: 'none',
    validationGates: [],
    optionalArtifactsByDefault: false,
    routineUserPauses: false,
    artifactRevisionPolicy: 'none',
  },
  {
    route: 'accelerated',
    planningMode: 'fast-forward',
    validationGates: ['specify', 'ready', 'closeout'],
    optionalArtifactsByDefault: false,
    routineUserPauses: false,
    artifactRevisionPolicy: 'revalidate-affected-downstream',
  },
  {
    route: 'full',
    planningMode: 'gated',
    validationGates: ['specify', 'plan', 'tasks', 'ready', 'closeout'],
    optionalArtifactsByDefault: false,
    routineUserPauses: false,
    artifactRevisionPolicy: 'revalidate-affected-downstream',
  },
] as const satisfies readonly SddRouteExecutionPolicy[];

export const SDD_PHASE_PROTOCOLS = [
  {
    id: 'explore',
    objective: 'Resolve repository uncertainty before requirements are fixed.',
    requiredInputs: [
      'User request and known scope',
      'Repository instructions and relevant starting anchors',
      'Questions that materially affect specification',
    ],
    instructions: [
      'Inspect only enough repository context to make downstream requirements decision-ready.',
      'Separate confirmed behavior, constraints, assumptions, and unresolved material decisions.',
      'Return distilled evidence instead of raw searches or full-file content.',
    ],
    allowedWrites: ['None; exploration is read-only.'],
    outputSchema: [
      'relevant paths and symbols',
      'current behavior and constraints',
      'material uncertainties and safe assumptions',
      'recommended specification anchors',
    ],
    doneWhen: [
      'The root can dispatch specification without repeating repository discovery.',
    ],
    blockingConditions: [
      'A material product choice remains human-owned and cannot be safely assumed.',
    ],
    handoff: [
      'The root passes the relevant paths, constraints, accepted assumptions, and unresolved decisions to specify.',
    ],
  },
  {
    id: 'specify',
    objective:
      'Create a testable, implementation-neutral feature contract in spec.md.',
    requiredInputs: [
      'User intent and accepted scope',
      'Explore handoff when the route is full',
      'Project constitution and existing public contracts when relevant',
    ],
    instructions: [
      'Record intent and scope as Why, Impact, and Affected capabilities before prescribing any contract.',
      'Define prioritized independent stories and map each story to its FR-### and SC-### contracts with Covers metadata.',
      'Give every normative MUST or SHALL requirement a descriptive title and declare it INTERNAL or as an ADDED, MODIFIED, REMOVED, or RENAMED durable capability delta.',
      'Classify every success criterion as buildable or outcome; both remain measurable, but only buildable criteria require implementation task coverage.',
      'Capture assumptions, acceptance scenarios, edge cases, dependencies, and explicit non-goals.',
      'Use a clarification marker only when no safe default exists and the answer materially changes scope or behavior.',
    ],
    allowedWrites: ['openspec/changes/<feature>/spec.md'],
    outputSchema: [
      'spec.md path',
      'requirements summary',
      'open clarifications',
    ],
    doneWhen: [
      'Every accepted FR and SC is testable, materially unambiguous, mapped to a story, and implementation-neutral.',
    ],
    blockingConditions: [
      'A material unresolved choice prevents a truthful acceptance contract.',
    ],
    handoff: [
      'Pass accepted scope, requirements, assumptions, and clarification decisions to plan.',
    ],
  },
  {
    id: 'clarify',
    objective:
      'Resolve only material ambiguity and write accepted answers back into spec.md.',
    requiredInputs: ['spec.md', 'The unresolved material decision'],
    instructions: [
      'Ask a targeted question only when repository evidence and safe assumptions cannot resolve it.',
      'Update the canonical specification with the accepted decision instead of creating a parallel answer document.',
    ],
    allowedWrites: ['openspec/changes/<feature>/spec.md'],
    outputSchema: [
      'resolved decision',
      'updated spec anchor',
      'remaining risks',
    ],
    doneWhen: ['The material ambiguity is resolved in the canonical spec.'],
    blockingConditions: ['The required human decision has not been provided.'],
    handoff: ['Pass the updated spec and accepted decision to plan.'],
  },
  {
    id: 'plan',
    objective:
      'Translate the accepted specification into an executable technical approach.',
    requiredInputs: [
      'spec.md',
      'Relevant repository evidence and constraints',
      'Project constitution',
    ],
    instructions: [
      'Make each technical choice traceable to a requirement or repository constraint.',
      'Name affected components, interfaces, files, risks, migrations, and verification strategy.',
      'Create research, data model, contracts, or quickstart artifacts only when they reduce implementation risk.',
      'Read active constitution principles for the plan; do not amend or run constitution lifecycle validation unless an explicit constitution amendment is itself in scope.',
    ],
    allowedWrites: [
      'openspec/changes/<feature>/plan.md',
      'Optional research.md, data-model.md, contracts/, and quickstart.md under the same change',
    ],
    outputSchema: ['plan.md path', 'technical decisions', 'affected surfaces'],
    doneWhen: [
      'A competent implementer can execute the plan without guessing about critical architecture or constraints.',
    ],
    blockingConditions: [
      'The plan contradicts spec.md, the constitution, or confirmed repository constraints.',
    ],
    handoff: [
      'Pass the accepted plan, affected surfaces, dependencies, and verification strategy to tasks.',
    ],
  },
  {
    id: 'checklist',
    objective:
      'Audit requirement quality when risk justifies an explicit checklist.',
    requiredInputs: ['spec.md', 'Risk or compliance reason for the audit'],
    instructions: [
      'Evaluate requirement completeness, clarity, consistency, measurability, and scenario coverage.',
      'Record the risk or ambiguity activation reason and add only the applicable security, accessibility, compliance, performance, migration, or domain lenses.',
      'Record checked revalidation after requirement-affecting changes, or an evidence-backed no-op when nothing relevant changed.',
      'Do not turn the checklist into implementation tests or QA execution steps.',
    ],
    allowedWrites: ['openspec/changes/<feature>/checklists/requirements.md'],
    outputSchema: [
      'checklist path',
      'passed items',
      'unresolved requirement gaps',
    ],
    doneWhen: ['Every checklist item has an evidence-backed state.'],
    blockingConditions: [
      'A high-risk requirement gap remains unresolved before task generation.',
    ],
    handoff: [
      'Pass unresolved gaps back to specify; otherwise pass readiness to tasks.',
    ],
  },
  {
    id: 'tasks',
    objective:
      'Produce dependency-ordered, independently verifiable implementation slices.',
    requiredInputs: [
      'spec.md',
      'plan.md',
      'Optional planning support artifacts',
    ],
    instructions: [
      'Cover every FR and buildable SC with concrete tasks, exact paths, dependencies, and verification; outcome SC remain verification targets but do not require fake implementation tasks.',
      'Put test-first work before its corresponding implementation when behavior changes.',
      'Mark [P] only for proven non-overlapping mutable surfaces; otherwise state why no safe parallel work exists.',
      'Do not create ceremonial tasks for trivial edits or combine unrelated mutable surfaces.',
    ],
    allowedWrites: ['openspec/changes/<feature>/tasks.md'],
    outputSchema: ['tasks.md path', 'requirement coverage', 'dependency order'],
    doneWhen: [
      'Every FR and buildable SC has executable task coverage and every task has a verification step.',
    ],
    blockingConditions: [
      'A task requires an unresolved requirement, architecture choice, or hidden prerequisite.',
    ],
    handoff: [
      'Pass spec.md, plan.md, tasks.md, dependencies, and verification commands to analyze or implement.',
    ],
  },
  {
    id: 'analyze',
    objective:
      'Perform read-only cross-artifact consistency and readiness analysis before full SDD implementation.',
    requiredInputs: ['spec.md', 'plan.md', 'tasks.md', 'Project constitution'],
    instructions: [
      'Detect contradictions, ambiguity, duplication, scope drift, orphan tasks, and uncovered requirements.',
      'Challenge artifact completeness, requirement correctness, and cross-artifact coherence as separate review dimensions.',
      'Require task coverage for every FR and buildable SC; assess outcome SC as measurable verification targets without manufacturing implementation tasks.',
      'Report requirement coverage as a percentage and classify findings as CRITICAL, HIGH, MEDIUM, or LOW.',
      'Treat constitution violations and baseline requirements with zero task coverage as blocking.',
    ],
    allowedWrites: [
      'None; analysis is read-only and returns its report in-session.',
    ],
    outputSchema: [
      'findings table with stable IDs and severity',
      'requirement coverage percentage',
      'constitution alignment',
      'readiness verdict: ready | blocked',
    ],
    doneWhen: [
      'Every high-signal cross-artifact inconsistency has a severity and remediation anchor.',
    ],
    blockingConditions: [
      'Any unresolved CRITICAL finding or constitution violation blocks implementation.',
    ],
    handoff: [
      'On ready, pass the reviewed artifact set and cautions to implement; on blocked, return findings to the owning coordination phase.',
    ],
  },
  {
    id: 'implement',
    objective:
      'Execute the accepted task slice with one writer and focused verification.',
    requiredInputs: [
      'User request or assigned tasks.md slice',
      'Accepted spec.md and plan.md when present',
      'Exact implementation boundaries and verification commands',
    ],
    instructions: [
      'The root marks selected artifact-backed tasks [~] before dispatch and marks them [x] only after task-specific evidence is verified.',
      'Use test-first or TDD execution for behavior changes and preserve one writer per mutable surface.',
      'Edit only the assigned implementation surface and report justified deviations from the accepted plan.',
      'When evidence refines the same intent, return it to root so canonical artifacts are updated and only affected downstream artifacts and gates are revalidated.',
      'Start a new change instead of expanding the active one when the intent changes.',
    ],
    allowedWrites: [
      'Assigned product and test files',
      'Root only: task checkbox transitions in openspec/changes/<feature>/tasks.md; child writers must not edit task state.',
    ],
    outputSchema: [
      'status: completed | partial | failed',
      'per-task outcome',
      'files changed',
      'executed verification and results',
      'deviations, issues, and remaining work',
    ],
    doneWhen: [
      'The assigned task slice is complete and its focused checks pass with concrete evidence.',
    ],
    blockingConditions: [
      'A task needs scope expansion, a material unresolved decision, or fails repeatedly without a safe bounded recovery.',
    ],
    handoff: [
      'Pass changed files, per-task evidence, deviations, and verification results to verify.',
    ],
  },
  {
    id: 'verify',
    objective:
      'Judge the implementation against accepted requirements using executed evidence.',
    requiredInputs: [
      'Implemented change or task results',
      'spec.md, plan.md, and tasks.md for artifact-backed routes',
      'Changed files and project verification commands',
    ],
    instructions: [
      'Oracle must be independent from the implementation writer; self-review never satisfies this phase.',
      'Run or inspect the smallest sufficient executed checks; static confidence alone is not evidence.',
      'Judge completeness, correctness, and coherence independently so a passing test cannot hide missing or contradictory scope.',
      'Build a compliance matrix from every accepted requirement to code and executed checks.',
      'Record every outcome SC as PASS with concrete observed evidence or RISK with an explicit residual-risk entry.',
      'For accelerated and full routes, the root persists the read-only oracle result as verify-report.md.',
    ],
    allowedWrites: [
      'Root persistence only: openspec/changes/<feature>/verify-report.md for accelerated and full routes',
    ],
    outputSchema: [
      'verdict: pass | fail',
      'compliance matrix',
      'executed checks and results',
      'critical issues with remediation anchors',
      'warnings and residual risks',
    ],
    doneWhen: [
      'Every accepted requirement is represented in the compliance matrix and the verdict matches the evidence.',
    ],
    blockingConditions: [
      'Missing required evidence, incomplete tasks, failed checks, or unresolved critical issues force a fail verdict.',
    ],
    handoff: [
      'On fail, hand off actionable findings to converge; on pass, hand off the accepted verify-report.md to archive for artifact-backed routes.',
    ],
  },
  {
    id: 'converge',
    objective:
      'Convert verified implementation gaps into traceable remaining tasks without editing product code.',
    requiredInputs: [
      'Failed verify result and remediation anchors',
      'spec.md, plan.md, and tasks.md',
      'Current maximum task and phase identifiers',
    ],
    instructions: [
      'Use an append-only update: add one new Convergence phase to tasks.md and never rewrite, renumber, reorder, or delete existing tasks.',
      'Classify each gap as missing, partial, contradicts, or unrequested; append one traceable task per actionable gap, ordered by severity and linked to its source requirement.',
      'Must not edit product code; implementation belongs to the next implement pass.',
      'If there is no actionable gap, leave tasks.md byte-for-byte unchanged.',
    ],
    allowedWrites: [
      'Append-only changes to openspec/changes/<feature>/tasks.md',
    ],
    outputSchema: [
      'outcome: tasks-appended | converged',
      'appended task IDs and source requirements',
      'next implementation scope',
    ],
    doneWhen: [
      'Every actionable verification gap is represented by a new traceable task, or the implementation is confirmed converged.',
    ],
    blockingConditions: [
      'The verify findings lack enough evidence or source anchors to create truthful tasks.',
    ],
    handoff: [
      'On tasks-appended, return to implement and then verify; on converged, re-run verify before archive.',
    ],
  },
  {
    id: 'archive',
    objective:
      'Close a verified artifact-backed change with a durable audit trail.',
    requiredInputs: [
      'Completed spec.md, plan.md, and tasks.md',
      'verify-report.md with verdict pass',
      'Change name and current date',
    ],
    instructions: [
      'Confirm all tasks are complete, verify-report.md records pass, and there are no unresolved critical issues.',
      'Create archive-report.md with verification lineage, completed scope, residual warnings, and final archive path.',
      'After oracle pass, transactionally synchronize only explicitly declared durable deltas from spec.md into openspec/specs.',
      'Stage and back up canonical writes so handled failures roll back within the active process; this is not crash-atomic across forced process or operating-system termination.',
      'Move the complete change to openspec/changes/archive/YYYY-MM-DD-<feature>/.',
      'An INTERNAL requirement never updates openspec/specs; undeclared prose is never merged.',
    ],
    allowedWrites: [
      'openspec/changes/<feature>/archive-report.md',
      'Declared durable requirement updates under openspec/specs/',
      'Move openspec/changes/<feature>/ to openspec/changes/archive/YYYY-MM-DD-<feature>/',
    ],
    outputSchema: [
      'status: archived | blocked',
      'archive path',
      'canonical specifications updated',
      'audit summary and verification lineage',
    ],
    doneWhen: [
      'Declared durable deltas are transactionally synchronized, the audit report records the result, and the complete change directory is present at the dated archive path.',
    ],
    blockingConditions: [
      'Archive is blocked unless all tasks are complete, verify-report.md has verdict pass, and no unresolved critical issue remains.',
    ],
    handoff: [
      'Return the archive path and audit summary to the root for final synthesis.',
    ],
  },
] as const satisfies readonly SddPhaseProtocol[];

export const SDD_WORKFLOW_CONTRACT: SddWorkflowContract = {
  artifactRoot: 'openspec/changes/<feature>/',
  phases: [...SDD_PHASES],
  routePolicies: SDD_ROUTE_EXECUTION_POLICIES.map((policy) => ({
    ...policy,
    validationGates: [...policy.validationGates],
  })),
  routingRules: [
    'An explicitly requested direct, accelerated, or full route wins; a generic SDD request sets accelerated as the minimum route.',
    'Direct work is the default for clear, bounded, low-risk changes; documentation and mechanical work may remain direct across multiple files.',
    'Accelerated SDD is used for multi-surface behavior, architecture, partial clarity, moderate risk, or broad non-behavioral coordination.',
    'Accelerated planning fast-forwards specify, plan, and tasks in one uninterrupted root pass without routine user pauses.',
    'Full SDD is used for unresolved scope, cross-cutting behavior or architecture, high contract risk, or high failure cost.',
    'Use architectural-grilling before specification only when the user explicitly requests it or material product or architecture decisions remain human-owned and unresolved; never require it merely because the route is Full.',
    'User input is requested only when a material unresolved decision would change the result.',
  ],
  artifactRules: [
    'Spec Kit artifact semantics are preserved inside the governed openspec store.',
    'Accelerated and full routes require spec.md, plan.md, tasks.md, verify-report.md, and archive-report.md.',
    'Research, data model, contracts, quickstart, and requirements checklist are created only when useful.',
    'The adaptive root writes coordination artifacts after loading the matching bundled phase contract; implementation ownership stays with the root or one writer role.',
    'After oracle PASS, archive transactionally synchronizes only explicitly declared durable ADDED, MODIFIED, REMOVED, and RENAMED requirement deltas into openspec/specs; INTERNAL requirements and undeclared prose never update permanent specifications.',
    'Archive stages and backs up writes so handled failures roll back within the active process; forced process or operating-system termination is not crash-atomic.',
  ],
  verificationRules: [
    'Every route delegates focused verification to read-only oracle; the implementation writer never verifies its own work.',
    'Full SDD delegates independent cross-artifact analysis to oracle before implementation.',
    'Accelerated and full verification persists verify-report.md with a pass or fail verdict and requirement compliance matrix.',
    'An artifact-backed fail verdict routes through append-only convergence, implementation, and verification again; direct work returns straight to implementation.',
    'A pass verdict is required before accelerated or full work can archive.',
  ],
};

function clonePhase(phase: SddPhaseContract): SddPhaseContract {
  return {
    ...phase,
    availableFor: [...phase.availableFor],
    requiredFor: [...phase.requiredFor],
    prerequisites: [...phase.prerequisites],
    eligibleAgentRoles: [...phase.eligibleAgentRoles],
  };
}

function cloneProtocol(protocol: SddPhaseProtocol): SddPhaseProtocol {
  return {
    ...protocol,
    requiredInputs: [...protocol.requiredInputs],
    instructions: [...protocol.instructions],
    allowedWrites: [...protocol.allowedWrites],
    outputSchema: [...protocol.outputSchema],
    doneWhen: [...protocol.doneWhen],
    blockingConditions: [...protocol.blockingConditions],
    handoff: [...protocol.handoff],
  };
}

export function classifySddRoute(input: SddRoutingInput): SddRoutingDecision {
  const requiresUserInput = input.clarity === 'uncertain';

  if (input.requestedRoute) {
    return {
      route: input.requestedRoute,
      requiresUserInput,
      reasons: [
        `The user explicitly requested the ${input.requestedRoute} route.`,
      ],
    };
  }

  const fullReasons: string[] = [];

  if (input.clarity === 'uncertain') {
    fullReasons.push(
      'A material scope or requirements decision remains unresolved.',
    );
  }
  if (
    input.scope === 'cross-cutting' &&
    (input.intent === 'behavior' || input.intent === 'architecture')
  ) {
    fullReasons.push('The change crosses multiple behavioral surfaces.');
  }
  if (input.contractRisk === 'high') {
    fullReasons.push('The public or internal contract risk is high.');
  }
  if (input.failureCost === 'high') {
    fullReasons.push('The cost of an incorrect change is high.');
  }

  if (fullReasons.length > 0) {
    return {
      route: 'full',
      requiresUserInput,
      reasons: fullReasons,
    };
  }

  const acceleratedReasons: string[] = [];
  if (input.sddRequested) {
    acceleratedReasons.push('The user requested an SDD-backed change.');
  }
  if (input.clarity === 'partial') {
    acceleratedReasons.push(
      'The bounded scope benefits from explicit planning.',
    );
  }
  if (input.contractRisk === 'medium' || input.failureCost === 'medium') {
    acceleratedReasons.push('Moderate risk justifies traceable artifacts.');
  }
  if (input.intent === 'architecture') {
    acceleratedReasons.push(
      'The architectural intent benefits from a recorded design.',
    );
  }
  if (input.intent === 'behavior' && input.scope === 'multi-file') {
    acceleratedReasons.push(
      'The behavior spans multiple implementation surfaces.',
    );
  }
  if (
    (input.intent === 'documentation' || input.intent === 'mechanical') &&
    input.scope === 'cross-cutting'
  ) {
    acceleratedReasons.push(
      'The broad non-behavioral change benefits from coordination.',
    );
  }

  if (acceleratedReasons.length > 0) {
    return {
      route: 'accelerated',
      requiresUserInput: false,
      reasons: acceleratedReasons,
    };
  }

  return {
    route: 'direct',
    requiresUserInput: false,
    reasons: [
      input.scope === 'multi-file'
        ? 'The multi-file work is clear, low risk, and mechanically bounded.'
        : 'The work is clear, bounded, and low risk.',
    ],
  };
}

export function getSddWorkflowContract(): SddWorkflowContract {
  return {
    artifactRoot: SDD_WORKFLOW_CONTRACT.artifactRoot,
    phases: SDD_WORKFLOW_CONTRACT.phases.map(clonePhase),
    routePolicies: SDD_WORKFLOW_CONTRACT.routePolicies.map((policy) => ({
      ...policy,
      validationGates: [...policy.validationGates],
    })),
    routingRules: [...SDD_WORKFLOW_CONTRACT.routingRules],
    artifactRules: [...SDD_WORKFLOW_CONTRACT.artifactRules],
    verificationRules: [...SDD_WORKFLOW_CONTRACT.verificationRules],
  };
}

export function getSddRouteExecutionPolicy(
  route: SddRoute,
): SddRouteExecutionPolicy {
  const policy = SDD_ROUTE_EXECUTION_POLICIES.find(
    (candidate) => candidate.route === route,
  );

  if (!policy) {
    throw new Error(`Unknown SDD route policy: ${route}`);
  }

  return {
    ...policy,
    validationGates: [...policy.validationGates],
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

export function getSddPhaseProtocol(id: SddPhaseId): SddPhaseProtocol {
  const protocol = SDD_PHASE_PROTOCOLS.find((candidate) => candidate.id === id);

  if (!protocol) {
    throw new Error(`Unknown SDD phase protocol: ${id}`);
  }

  return cloneProtocol(protocol);
}

export function getSddPhaseProtocolsForRole(
  role: AgentRoleName,
): SddPhaseProtocol[] {
  return SDD_PHASES.filter((phase) =>
    (phase.eligibleAgentRoles as readonly AgentRoleName[]).includes(role),
  ).map((phase) => getSddPhaseProtocol(phase.id));
}

function renderDispatchList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function phaseIsAvailableInRoute(
  phase: SddPhaseContract,
  route: SddRoute,
): boolean {
  return phase.availableFor.includes(route);
}

export function renderSddPhaseDispatchEnvelope(
  input: SddPhaseDispatchInput,
): string {
  const phase = getSddPhase(input.phase);
  if (!phaseIsAvailableInRoute(phase, input.route)) {
    throw new Error(
      `${input.phase} is not available in the ${input.route} route`,
    );
  }

  const protocol = getSddPhaseProtocol(input.phase);
  const inputs = input.inputArtifacts?.length
    ? input.inputArtifacts
    : protocol.requiredInputs;
  const requirements = [
    ...protocol.instructions,
    ...(input.requirements ?? []),
  ];
  const boundaries = [
    ...protocol.allowedWrites.map((value) => `Allowed writes: ${value}`),
    ...(input.boundaries ?? []),
  ];
  const verification = [
    ...protocol.doneWhen.map((value) => `Done when: ${value}`),
    ...protocol.blockingConditions.map((value) => `Block when: ${value}`),
    ...(input.verification ?? []),
  ];
  const project = input.memory.project.trim();
  const rootSessionId = input.memory.rootSessionId?.trim();
  if (input.memory.provider !== 'thoth-mem' || project.length === 0) {
    throw new Error('memory dispatch requires thoth-mem and a project name');
  }
  if (input.memory.rootSessionId !== undefined && !rootSessionId) {
    throw new Error('root session identity must be stable or omitted');
  }
  const memoryContext = input.memory.context?.length
    ? input.memory.context
    : ['none'];

  return `## PHASE
phase=${input.phase}

## ROUTE / CHANGE
${input.route} / ${input.changeName}

## OBJECTIVE
${protocol.objective}

## INPUT ARTIFACTS
${renderDispatchList(inputs)}

## REQUIREMENTS
${renderDispatchList(requirements)}

## BOUNDARIES
${renderDispatchList(boundaries)}

## VERIFICATION
${renderDispatchList(verification)}

## EXPECTED OUTPUT
${renderDispatchList(protocol.outputSchema)}

## HANDOFF
${renderDispatchList(protocol.handoff)}

## MEMORY
provider=thoth-mem
project=${project}
root_session_id=${rootSessionId ?? 'unavailable'}
authorization=${input.memory.authorization}
context:
${renderDispatchList(memoryContext)}`;
}

export function renderSddPhaseDispatchTemplate(): string {
  return `## PHASE
phase=<phase-id>

## ROUTE / CHANGE
<direct|accelerated|full> / <feature-or-direct-task>

## OBJECTIVE
<phase objective>

## INPUT ARTIFACTS
<required files, evidence, and prior handoff>

## REQUIREMENTS
<concrete outcomes and phase instructions>

## BOUNDARIES
<allowed writes, assigned surface, and non-goals>

## VERIFICATION
<done criteria, blockers, and checks>

## EXPECTED OUTPUT
<phase result fields>

## HANDOFF
<what the next phase must preserve>

## MEMORY
provider=thoth-mem
project=<project-name>
root_session_id=<stable-root-session-id|unavailable>
authorization=<none|recall|observe>
context:
<bounded recalled context or - none>`;
}

export function getSddPhaseOwner(
  _route: SddRoute,
  phaseId: SddPhaseId,
): AgentRoleName {
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
  if (!phase.availableFor.includes(route)) {
    return false;
  }

  const applicable = new Set<SddPhaseId>([
    ...getRequiredSddPhaseOrder(route),
    ...SDD_PHASES.filter(
      (candidate) =>
        candidate.activation === 'conditional' &&
        (candidate.availableFor as readonly SddRoute[]).includes(route),
    ).map((candidate) => candidate.id),
  ]);

  return phase.prerequisites
    .filter((prerequisite) => applicable.has(prerequisite))
    .every((prerequisite) => completed.includes(prerequisite));
}
