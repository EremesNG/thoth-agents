export type SddUnderstandingPhaseId = 'explore' | 'specify' | 'clarify';
export type SddClassification = 'small' | 'substantial';
export type SddIntent =
  | 'documentation'
  | 'mechanical'
  | 'behavior'
  | 'architecture';
// Scope describes coordination impact, not the number of changed files.
export type SddScope = 'local' | 'coordinated' | 'cross-cutting';
export type SddUncertainty = 'low' | 'medium' | 'high';
export type SddRisk = 'low' | 'medium' | 'high';
export type SddClarificationOutcome = 'not-needed' | 'resolved' | 'unresolved';
export type SddPhaseId =
  | SddUnderstandingPhaseId
  | 'plan'
  | 'checklist'
  | 'tasks'
  | 'plan-review'
  | 'implement'
  | 'verify'
  | 'converge'
  | 'archive';
export type SddPhaseActivation = 'required' | 'conditional';
export type SddVerificationOwner = 'orchestrator' | 'oracle';

export interface SddUnderstandingPhaseContract {
  id: SddUnderstandingPhaseId;
  order: number;
  requiredForClassification: true;
  artifactRequired: false;
  agentRequired: false;
  interviewRequired: false;
  objective: string;
}

export interface SddUnderstandingEvidence {
  completed: readonly SddUnderstandingPhaseId[];
  clarification: SddClarificationOutcome;
}

export interface SddChangeClassificationInput {
  scope: SddScope;
  uncertainty: SddUncertainty;
  risk: SddRisk;
  understanding: SddUnderstandingEvidence;
}

export interface SddClassificationDecision {
  classification: SddClassification;
  scope: SddScope;
  uncertainty: SddUncertainty;
  risk: SddRisk;
  planningRequired: boolean;
  recordRequired: boolean;
  independentVerificationRequired: boolean;
  reasons: string[];
}

export interface SddPhaseContract {
  id: SddPhaseId;
  order: number;
  activation: SddPhaseActivation;
  prerequisites: SddPhaseId[];
  producesArtifact: boolean;
  reason: string;
  condition?: string;
}

export interface SddPhaseProtocol {
  id: SddPhaseId;
  objective: string;
  requiredInputs: string[];
  instructions: string[];
  outputSchema: string[];
  doneWhen: string[];
  blockingConditions: string[];
}

export interface SddFinalVerificationDecision {
  verificationRequired: true;
  independent: boolean;
  owner: SddVerificationOwner;
}

export interface SddWorkflowContract {
  recordRoot: string;
  recordPath: string;
  understandingPhases: SddUnderstandingPhaseContract[];
  phases: SddPhaseContract[];
  classificationRules: string[];
  artifactRules: string[];
  verificationRules: string[];
}

export const SDD_UNDERSTANDING_PHASES = [
  {
    id: 'explore',
    order: 0,
    requiredForClassification: true,
    artifactRequired: false,
    agentRequired: false,
    interviewRequired: false,
    objective:
      'Inspect proportionally to understand current behavior, constraints, and uncertainty.',
  },
  {
    id: 'specify',
    order: 1,
    requiredForClassification: true,
    artifactRequired: false,
    agentRequired: false,
    interviewRequired: false,
    objective:
      'State the intended outcome, non-goals, and observable acceptance proportionally.',
  },
  {
    id: 'clarify',
    order: 2,
    requiredForClassification: true,
    artifactRequired: false,
    agentRequired: false,
    interviewRequired: false,
    objective:
      'Resolve material uncertainty with evidence or a safe assumption; ask only when needed.',
  },
] as const satisfies readonly SddUnderstandingPhaseContract[];

export const SDD_PHASES = [
  {
    id: 'explore',
    order: 0,
    activation: 'required',
    prerequisites: [],
    producesArtifact: false,
    reason:
      'Every change begins with proportionate repository and intent discovery.',
  },
  {
    id: 'specify',
    order: 1,
    activation: 'required',
    prerequisites: ['explore'],
    producesArtifact: false,
    reason: 'Settle outcome and acceptance before risk-aware classification.',
  },
  {
    id: 'clarify',
    order: 2,
    activation: 'required',
    prerequisites: ['specify'],
    producesArtifact: false,
    reason:
      'Material uncertainty must be resolved or explicitly block classification.',
  },
  {
    id: 'plan',
    order: 3,
    activation: 'required',
    prerequisites: ['explore', 'specify', 'clarify'],
    producesArtifact: true,
    reason:
      'Substantial changes need a decision-ready technical approach in the sole record.',
  },
  {
    id: 'checklist',
    order: 4,
    activation: 'conditional',
    prerequisites: ['plan'],
    producesArtifact: true,
    reason: 'Audit acceptance only when risk or ambiguity justifies it.',
    condition: 'Use for elevated risk, compliance, or acceptance ambiguity.',
  },
  {
    id: 'tasks',
    order: 5,
    activation: 'required',
    prerequisites: ['plan'],
    producesArtifact: true,
    reason: 'Shape useful implementation slices and acceptance coverage.',
  },
  {
    id: 'plan-review',
    order: 6,
    activation: 'conditional',
    prerequisites: ['tasks'],
    producesArtifact: true,
    reason: 'Offer optional independent plan review after readiness.',
    condition: 'Run only when selected; it never authorizes implementation.',
  },
  {
    id: 'implement',
    order: 7,
    activation: 'required',
    prerequisites: ['clarify'],
    producesArtifact: false,
    reason:
      'Implement within accepted intent using one writer and focused checks.',
  },
  {
    id: 'verify',
    order: 8,
    activation: 'required',
    prerequisites: ['implement'],
    producesArtifact: true,
    reason:
      'Verify actual outcomes and residual risk independently when required.',
  },
  {
    id: 'converge',
    order: 9,
    activation: 'conditional',
    prerequisites: ['verify'],
    producesArtifact: true,
    reason:
      'Record bounded corrective work only when verification finds actionable gaps.',
    condition: 'Use only for actionable defects within settled intent.',
  },
  {
    id: 'archive',
    order: 10,
    activation: 'required',
    prerequisites: ['verify'],
    producesArtifact: true,
    reason:
      'Fail closed on incomplete work or verification, then transactionally archive.',
  },
] as const satisfies readonly SddPhaseContract[];

export const SDD_PHASE_PROTOCOLS = [
  {
    id: 'explore',
    objective:
      'Understand current behavior and constraints in proportion to the request.',
    requiredInputs: ['User intent and known repository context'],
    instructions: [
      'Inspect repository evidence in proportion to the request to identify behavior, constraints, risks, and safe assumptions.',
      'Root owns completing understanding and acceptance; specific discovery ownership determines who gathers evidence, even when generic guidance permits direct exploration.',
      'Give each evidence assignment one precise question and result. Independent questions may run in parallel within native capacity; dependent questions wait until the upstream output is accepted by root. Do not duplicate discovery.',
      'Complete this phase before specifying. No document, agent, or interview is forced in this phase.',
    ],
    outputSchema: [
      'confirmed facts',
      'constraints',
      'safe assumptions',
      'material uncertainty',
    ],
    doneWhen: [
      'The next step can state intended outcomes without repeating discovery.',
    ],
    blockingConditions: [
      'A material human-owned decision cannot safely be inferred.',
    ],
  },
  {
    id: 'specify',
    objective:
      'State the intended outcome and observable acceptance proportionally.',
    requiredInputs: ['User intent', 'Explore findings and constraints'],
    instructions: [
      'Define outcomes, non-goals, and meaningful edge cases in concise working notes.',
      'Do not persist a document before classification; only substantial work creates the one ID-named record.',
      'No document, agent, or interview is forced in this phase.',
    ],
    outputSchema: ['intent', 'non-goals', 'observable acceptance'],
    doneWhen: [
      'Acceptance expresses the requested outcome without material ambiguity.',
    ],
    blockingConditions: [
      'Acceptance depends on an unresolved material human decision.',
    ],
  },
  {
    id: 'clarify',
    objective:
      'Resolve material ambiguity without imposing routine interviews.',
    requiredInputs: [
      'Explore evidence',
      'Specified outcome',
      'Any material uncertainty',
    ],
    instructions: [
      'Use evidence or a safe bounded assumption when it preserves user intent.',
      'Ask only for a material human-owned decision that cannot safely be inferred; no interview is forced.',
      'An unresolved material clarification blocks classification.',
      'No document, agent, or interview is forced in this phase.',
    ],
    outputSchema: [
      'resolved decision or none-needed disposition',
      'remaining material blockers',
    ],
    doneWhen: ['No material intent remains unresolved.'],
    blockingConditions: [
      'The required human clarification has not been provided.',
    ],
  },
  {
    id: 'plan',
    objective: 'Plan substantial work in its one persistent record.',
    requiredInputs: [
      'Settled understanding',
      'Substantial classification',
      'Accepted outcomes',
    ],
    instructions: [
      'Substantial classification only creates the `.thoth/changes/<id>/<id>.md` record.',
      'Capture interfaces, mutable surfaces, durable deltas, dependencies, risks, and verification seams.',
      'Plan each useful work unit with concrete inputs, outputs, and dependencies.',
      "Record each unit's owner, owned writes, interface boundaries, focused checks with PASS evidence, and return milestone and stop condition.",
      'Validate the plan before tasks exist; tasks are checked later for acceptance coverage.',
    ],
    outputSchema: [
      'technical approach',
      'affected interfaces',
      'risks',
      'verification seams',
    ],
    doneWhen: [
      'A competent implementer can proceed without guessing at critical constraints.',
    ],
    blockingConditions: [
      'The approach contradicts accepted intent or unresolved material choices remain.',
    ],
  },
  {
    id: 'checklist',
    objective: 'Audit acceptance only when risk warrants a focused review.',
    requiredInputs: ['Substantial record', 'Risk or ambiguity rationale'],
    instructions: [
      'Assess completeness, consistency, measurability, and relevant domain coverage in the same record.',
      'Correct material gaps without creating a second checklist artifact.',
    ],
    outputSchema: [
      'activation rationale',
      'resolved or remaining acceptance gaps',
    ],
    doneWhen: ['Material acceptance gaps have an evidence-backed disposition.'],
    blockingConditions: [
      'A material high-risk acceptance gap remains unresolved.',
    ],
  },
  {
    id: 'tasks',
    objective: 'Record useful implementation slices and acceptance coverage.',
    requiredInputs: [
      'Accepted outcomes',
      'Validated plan',
      'Known dependencies',
    ],
    instructions: [
      'Record one task row per outcome in the same ID-named record; each row names one independently acceptable outcome.',
      'Use the validator-compatible `- [ ] AC-n: ...` row with indented details and name concrete inputs, outputs, dependencies, owner, owned writes, interface boundaries, focused checks with PASS evidence, a meaningful return milestone, and a stop condition for each unit.',
      'Write `none` for owned writes on read-only work.',
      'Split phases with separately acceptable outcomes before dispatch; keep tiny cohesive mechanical work together and do not split mechanically by file or test step.',
      'Independent, precise Explorer questions may run in parallel within native capacity. Dependent questions wait for accepted evidence; root accepts producer outputs before consumers start, and discovery is not duplicated.',
      'Cover every accepted outcome with concrete work; test-first for behavior changes.',
      'Tasks and ready gates enforce coverage; the plan gate does not depend on tasks.',
    ],
    outputSchema: ['pending work', 'acceptance coverage', 'dependency order'],
    doneWhen: [
      'Each outcome has an executable task or bounded implementation seam.',
    ],
    blockingConditions: [
      'A task depends on unresolved material intent or hidden prerequisites.',
    ],
  },
  {
    id: 'plan-review',
    objective:
      'Offer optional independent blocker review after the ready plan.',
    requiredInputs: ['Ready substantial record', 'Selected review disposition'],
    instructions: [
      'Review scope, approach, risks, and acceptance coverage without redesigning settled intent.',
      'Return actionable blockers and cautions; a pass is not implementation authorization or final verification.',
      'Keep the separate Implement (Recommended) / Stop decision.',
      'A plan review does not substitute for fresh final verification.',
    ],
    outputSchema: ['status', 'blockers', 'cautions'],
    doneWhen: [
      'The selected review has a current, evidence-backed disposition.',
    ],
    blockingConditions: ['A blocking finding remains unresolved.'],
  },
  {
    id: 'implement',
    objective:
      'Implement the accepted small request or authorized substantial slice.',
    requiredInputs: [
      'Settled user intent or authorized record',
      'Exact mutable boundaries',
      'Focused checks',
    ],
    instructions: [
      'Use one writer per mutable surface and choose an owner from task shape and net gain.',
      'Work only from accepted inputs and named dependencies within the assigned outcome and interface boundaries.',
      'Return bounded progress for root acceptance before dependent work starts.',
      'Use test-first (TDD); observe red before green for behavior changes, then verify call sites, shared contracts, and edge cases.',
      'Stop on a missing interface, ownership conflict, or new independent outcome.',
      'Return completed bounded progress and the smallest blocker for root reassessment before expansion.',
      'Do not create process tooling, reports, evidence generators, or temporary artifacts.',
    ],
    outputSchema: ['outcome', 'changed files', 'checks', 'residual risks'],
    doneWhen: [
      'The assigned outcome is implemented and focused checks have run.',
    ],
    blockingConditions: [
      'Scope, risk, or material intent changes before safe completion.',
    ],
  },
  {
    id: 'verify',
    objective: 'Verify actual outcomes with independence proportional to risk.',
    requiredInputs: ['Accepted outcomes', 'Actual change and executed checks'],
    instructions: [
      'Judge the actual diff, executed checks, and residual risks; verify completeness, correctness, coherence, and behavior.',
      'Substantial or materially risky work requires a fresh independent Oracle; no writer self-approves.',
      'For substantial work, record acceptance evidence, checks, source digests, and reviewed-record digest in the same record.',
    ],
    outputSchema: [
      'verdict',
      'acceptance evidence',
      'checks',
      'residual risks',
    ],
    doneWhen: [
      'Every accepted outcome has evidence or an explicit residual risk.',
    ],
    blockingConditions: [
      'A failed check, missing evidence, or critical issue remains.',
    ],
  },
  {
    id: 'converge',
    objective:
      'Turn actionable verification gaps into bounded corrective work.',
    requiredInputs: ['Failed verification', 'Settled intent'],
    instructions: [
      'Record acceptance-linked follow-up in the same record when one exists.',
      'If scope or risk changes materially, reopen understanding and classification.',
      'Do not create a separate convergence report.',
    ],
    outputSchema: ['bounded follow-up', 'verification seam'],
    doneWhen: [
      'Each actionable gap has a safe next action or the work is confirmed converged.',
    ],
    blockingConditions: [
      'Findings lack evidence or require material new intent.',
    ],
  },
  {
    id: 'archive',
    objective:
      'Transactionally apply declared deltas and archive a verified record.',
    requiredInputs: [
      'Complete substantial record',
      'Fresh independent pass',
      'Current archive date',
    ],
    instructions: [
      'Fail-closed behavior blocks incomplete tasks, acceptance evidence, authorization, or independent verification.',
      'Apply only declared durable deltas transactionally and preserve unaffected specifications.',
      'Move `.thoth/changes/<id>/<id>.md` to `.thoth/changes/archive/YYYY-MM-DD-<id>/<id>.md`; keep the filename stable.',
    ],
    outputSchema: ['archive path', 'updated specifications', 'residual risks'],
    doneWhen: [
      'Declared deltas and verified record are archived without collisions or history loss.',
    ],
    blockingConditions: [
      'A closeout gate fails, destination collides, or a symlinked ancestor exists.',
    ],
  },
] as const satisfies readonly SddPhaseProtocol[];

const workflow: SddWorkflowContract = {
  recordRoot: '.thoth/changes/<id>/',
  recordPath: '.thoth/changes/<id>/<id>.md',
  understandingPhases: [...SDD_UNDERSTANDING_PHASES],
  phases: [...SDD_PHASES],
  classificationRules: [
    'Complete explore, specify, and clarify in order before classification.',
    'Classify only after understanding, using scope, uncertainty, and risk.',
    'Local scope may touch multiple files within one area; file count alone does not increase scope or escalate classification.',
    'Coordinated multi-area or cross-cutting scope, material uncertainty, or elevated risk requires substantial planning.',
    'Risk can require planning even when the code patch is local or small.',
    'Human-owned material decisions stay with the user; unresolved material intent blocks classification and implementation.',
    'Scope or risk increases reopen understanding and classification before more work.',
  ],
  artifactRules: [
    'Small clear low-risk work gets test-first implementation and verification with no record.',
    'Substantial work creates one `.thoth/changes/<id>/<id>.md` record after classification; the record contains exploration, intent, acceptance, clarification, decisions, plan, tasks, verification, and closeout.',
    'Archive to `.thoth/changes/archive/YYYY-MM-DD-<id>/<id>.md`; the date prefixes only the directory, and the ID filename remains stable.',
    'No aliases, extra per-change files, reports, evidence directories, process tools, wrappers, or temporary generators are created.',
    'Durable requirement deltas target `.thoth/specs/<capability>/spec.md` and are applied only after independent verification.',
    'Historical changes are preserved; collisions and symlinked ancestors fail closed.',
  ],
  verificationRules: [
    'Every change is verified; small low-risk work receives focused root verification.',
    'Substantial or materially risky work requires a fresh independent Oracle; no implementation writer self-approves.',
    'Plan review is optional and separate from the Implement or Stop authorization decision and final verification.',
    'A substantial record cannot close out without complete tasks, independent PASS, acceptance evidence, current digests, and Archive READY.',
    'A verification failure blocks archive; actionable fixes must be reimplemented and reverified.',
  ],
};

function clonePhase(phase: SddPhaseContract): SddPhaseContract {
  return { ...phase, prerequisites: [...phase.prerequisites] };
}

function cloneProtocol(protocol: SddPhaseProtocol): SddPhaseProtocol {
  return {
    ...protocol,
    requiredInputs: [...protocol.requiredInputs],
    instructions: [...protocol.instructions],
    outputSchema: [...protocol.outputSchema],
    doneWhen: [...protocol.doneWhen],
    blockingConditions: [...protocol.blockingConditions],
  };
}

export function classifySddChange(
  input: SddChangeClassificationInput,
): SddClassificationDecision {
  const expected: readonly SddUnderstandingPhaseId[] = [
    'explore',
    'specify',
    'clarify',
  ];
  if (
    input.understanding.completed.length !== expected.length ||
    expected.some(
      (phase, index) => input.understanding.completed[index] !== phase,
    )
  ) {
    throw new Error(
      'Complete explore, specify, and clarify in order before classification',
    );
  }
  if (input.understanding.clarification === 'unresolved') {
    throw new Error(
      'An unresolved material clarification blocks classification',
    );
  }
  if (!['local', 'coordinated', 'cross-cutting'].includes(input.scope)) {
    throw new Error(`Unknown SDD scope: ${input.scope}`);
  }
  if (!['low', 'medium', 'high'].includes(input.uncertainty)) {
    throw new Error(`Unknown SDD uncertainty: ${input.uncertainty}`);
  }
  if (!['low', 'medium', 'high'].includes(input.risk)) {
    throw new Error(`Unknown SDD risk: ${input.risk}`);
  }

  const reasons: string[] = [];
  if (input.scope !== 'local') {
    reasons.push(`${input.scope} scope requires a planned, traceable change.`);
  }
  if (input.uncertainty !== 'low') {
    reasons.push(
      `${input.uncertainty} uncertainty requires explicit planning.`,
    );
  }
  if (input.risk !== 'low') {
    reasons.push(`${input.risk} risk requires planning despite patch size.`);
  }
  const classification = reasons.length > 0 ? 'substantial' : 'small';
  if (classification === 'small') {
    reasons.push('Scope is local, intent is clear, and risk is low.');
  }
  const independentVerificationRequired =
    classification === 'substantial' || input.risk !== 'low';

  return {
    classification,
    scope: input.scope,
    uncertainty: input.uncertainty,
    risk: input.risk,
    planningRequired: classification === 'substantial',
    recordRequired: classification === 'substantial',
    independentVerificationRequired,
    reasons,
  };
}

export function getSddWorkflowContract(): SddWorkflowContract {
  return {
    ...workflow,
    understandingPhases: workflow.understandingPhases.map((phase) => ({
      ...phase,
    })),
    phases: workflow.phases.map(clonePhase),
    classificationRules: [...workflow.classificationRules],
    artifactRules: [...workflow.artifactRules],
    verificationRules: [...workflow.verificationRules],
  };
}

export function getSddPhase(id: SddPhaseId): SddPhaseContract {
  const phase = SDD_PHASES.find((candidate) => candidate.id === id);
  if (!phase) throw new Error(`Unknown SDD phase: ${id}`);
  return clonePhase(phase);
}

export function getSddPhaseProtocol(id: SddPhaseId): SddPhaseProtocol {
  const protocol = SDD_PHASE_PROTOCOLS.find((candidate) => candidate.id === id);
  if (!protocol) throw new Error(`Unknown SDD phase protocol: ${id}`);
  return cloneProtocol(protocol);
}

export function getSddRequiredPhaseOrder(
  classification: Pick<SddClassificationDecision, 'classification'>,
): SddPhaseId[] {
  const common: SddPhaseId[] = ['explore', 'specify', 'clarify'];
  if (classification.classification === 'small') {
    return [...common, 'implement', 'verify'];
  }
  return [...common, 'plan', 'tasks', 'implement', 'verify', 'archive'];
}

export function canEnterSddPhase({
  classification,
  completed,
  target,
}: {
  classification: Pick<SddClassificationDecision, 'classification'>;
  completed: readonly SddPhaseId[];
  target: SddPhaseId;
}): boolean {
  const phase = getSddPhase(target);
  const completedSet = new Set(completed);
  if (phase.id === 'explore') return !completedSet.has('explore');
  if (phase.id === 'specify')
    return completedSet.has('explore') && !completedSet.has('specify');
  if (phase.id === 'clarify')
    return completedSet.has('specify') && !completedSet.has('clarify');

  const understandingComplete = SDD_UNDERSTANDING_PHASES.every(({ id }) =>
    completedSet.has(id),
  );
  if (!understandingComplete) return false;

  if (classification.classification === 'small') {
    if (target === 'implement') return !completedSet.has('implement');
    if (target === 'verify')
      return completedSet.has('implement') && !completedSet.has('verify');
    return false;
  }

  const prerequisites: Record<
    Exclude<SddPhaseId, SddUnderstandingPhaseId>,
    SddPhaseId[]
  > = {
    plan: ['clarify'],
    checklist: ['plan'],
    tasks: ['plan'],
    'plan-review': ['tasks'],
    implement: ['tasks'],
    verify: ['implement'],
    converge: ['verify'],
    archive: ['verify'],
  };
  return prerequisites[
    target as Exclude<SddPhaseId, SddUnderstandingPhaseId>
  ].every((required) => completedSet.has(required));
}

export function getSddFinalVerificationDecision({
  classification,
  risk,
}: {
  classification: SddClassification;
  risk: SddRisk;
}): SddFinalVerificationDecision {
  const independent = classification === 'substantial' || risk !== 'low';
  return {
    verificationRequired: true,
    independent,
    owner: independent ? 'oracle' : 'orchestrator',
  };
}
