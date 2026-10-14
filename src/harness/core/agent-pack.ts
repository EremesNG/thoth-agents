import {
  getSpecialistResultFields,
  SPECIALIST_RESULT_CONTRACT,
} from './result-contract';

export type {
  OracleReview,
  OracleReviewKind,
  ResultCommon,
  SpecialistResult,
  SpecialistRole,
} from './result-contract';
export {
  getSpecialistResultFields,
  SPECIALIST_RESULT_CONTRACT,
} from './result-contract';

export type AgentRoleName =
  | 'orchestrator'
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'worker';

export type AgentMutationMode = 'adaptive-root' | 'read-only' | 'write-capable';

export type AgentDispatchMethod = 'root-coordinator' | 'task';

export interface AgentRoleContract {
  name: AgentRoleName;
  mode: AgentMutationMode;
  dispatch: AgentDispatchMethod;
  canMutateWorkspace: boolean;
  scope: string;
  responsibility: string;
  useWhen: string[];
  doNotUseWhen: string[];
  escalateWhen: string[];
  writeScope?: string[];
  toolGovernance: string[];
  verification: string[];
}

export interface OrchestrationPolicy {
  maxDelegationDepth: number;
  singleWriter: boolean;
  implementationOwnership: ImplementationOwnershipPolicy;
  taskShaping: TaskShapingPolicy;
  specialistDirectory: SpecialistDecision[];
  rules: string[];
}

export type TaskShapingStep =
  | 'bound-units'
  | 'map-output-dependencies'
  | 'assign-ownership'
  | 'select-specialists'
  | 'admit-ready-units'
  | 'dispatch-to-native-capacity'
  | 'wait-for-native-terminal-event'
  | 'accept-results'
  | 'refill-capacity';

export interface TaskShapingPolicy {
  steps: TaskShapingStep[];
  nativeAuthority: boolean;
  boundedWidth: boolean;
  decisions: {
    dependency: string;
    ownershipConflict: string;
    unitOutcome: string;
    unitEnvelope: string;
    phaseSplitting: string;
    independentDiscovery: string;
    scopeGrowth: string;
    readyDispatch: string;
    refill: string;
    terminalEvidence: string;
    degradation: string;
  };
}

export interface SpecialistDecision {
  role: Exclude<AgentRoleName, 'orchestrator'>;
  selectWhen: string;
  rejectWhen: string;
}

export type ImplementationOwner = 'orchestrator' | 'designer' | 'worker';

export interface ImplementationOwnershipPolicy {
  eligibleOwners: ImplementationOwner[];
  workflowIndependent: boolean;
  defaultImplementationOwner: 'specialist';
  rootIdentity: string;
  defaultRule: string;
  rootResponsibilities: string[];
  discovery: string[];
  directConsultation: string[];
  directException: string[];
  writerRouting: string[];
  evidenceHandling: string[];
  delegationFailure: string[];
  userDirection: string;
  insufficientSignals: string[];
}

export interface AgentPackContract {
  roles: AgentRoleContract[];
  orchestrationPolicy: OrchestrationPolicy;
  returnContract: Record<AgentRoleName, string[]>;
  verificationProtocol: string[];
}

export const AGENT_ROLE_NAMES = [
  'orchestrator',
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
] as const satisfies readonly AgentRoleName[];

export const AGENT_ROLES = [
  {
    name: 'orchestrator',
    mode: 'adaptive-root',
    dispatch: 'root-coordinator',
    canMutateWorkspace: true,
    scope:
      'human agreement, SDD coordination, bounded direct exceptions, decisions, and synthesis',
    responsibility:
      'Coordinate goals, decisions, acceptance, and synthesis under the specialist-default implementation-ownership policy; direct work is limited to its bounded exceptions and explicit user instructions.',
    useWhen: [
      'Coordinate goals, constraints, decisions, governed artifacts, routing, acceptance, and synthesis.',
      'Retain reviewed commits and known low-risk mechanical operations; honor explicit direct-work or no-delegation instructions.',
      'Consult a known source for one bounded question or make a minimal authorized low-risk edit only when source, scope, and verification are known and no discovery or independent judgment is needed.',
    ],
    doNotUseWhen: [
      'Not for independent plan review or Oracle-required final verification.',
    ],
    escalateWhen: [
      'Reassess ownership when actual uncertainty, scope, or risk increases, not because another search is needed; never override explicit no-delegation instructions.',
    ],
    toolGovernance: [
      'may inspect and edit the accepted bounded implementation surface and may verify trivial deterministic work without self-approval',
      'loads the matching thoth-sdd phase guidance on demand instead of carrying every phase protocol in its prompt',
      'owns proportional understanding, classification, one ID-named substantial-change record, semantic acceptance, and active .thoth/ work evidence',
      'uses the bounded implementation-ownership exceptions for reviewed commits and known low-risk mechanical work',
      'keeps requirements, decisions, and final synthesis in the root thread',
    ],
    verification: [
      'runs focused checks for trivial deterministic work while final verification remains mandatory',
      'delegates selected focused plan review plus artifact-backed and material-risk final verification to a fresh oracle',
      'consolidates summarized evidence returned by child agents',
    ],
  },
  {
    name: 'explorer',
    mode: 'read-only',
    dispatch: 'task',
    canMutateWorkspace: false,
    scope: 'local repository discovery',
    responsibility:
      'Resolve broad or uncertain repository questions and return distilled evidence.',
    useWhen: [
      'Local source, effective flow, responsibility, repository ownership, or behavior is unknown or uncertain.',
    ],
    doNotUseWhen: ['Not for implementation, edits, or known narrow questions.'],
    escalateWhen: [
      'Send external evidence to librarian and mutation scope to root.',
    ],
    toolGovernance: [
      'uses read, search, and code-navigation tools only',
      'does not mutate files or delegate further',
    ],
    verification: ['reports inspected paths, confidence, and remaining gaps'],
  },
  {
    name: 'librarian',
    mode: 'read-only',
    dispatch: 'task',
    canMutateWorkspace: false,
    scope:
      'authoritative external research with local confirmation when needed',
    responsibility:
      'Gather current authoritative evidence and separate documented facts from inference.',
    useWhen: ['Current authoritative external evidence is required.'],
    doNotUseWhen: ['Not for implementation, edits, or purely local discovery.'],
    escalateWhen: ['Report contradictory or insufficient sources to root.'],
    toolGovernance: [
      'uses research and read-only local tools',
      'does not mutate files or delegate further',
    ],
    verification: ['provides direct sources for substantive external claims'],
  },
  {
    name: 'oracle',
    mode: 'read-only',
    dispatch: 'task',
    canMutateWorkspace: false,
    scope:
      'diagnosis, architecture, optional focused plan review, and independent verification',
    responsibility:
      'Independently review plans when selected and provide independent judgment for artifact-backed or material-risk final verification, exposing correctness risks and judging whether results satisfy their contracts.',
    useWhen: [
      'Selected focused plan review, persistent diagnosis, material architecture or security risk, contradictory evidence, high failure cost, or artifact-backed final verification needs independent judgment.',
    ],
    doNotUseWhen: [
      'Not for implementation, mutation, persistence, or self-review.',
    ],
    escalateWhen: ['Return blockers and remediation anchors to root.'],
    toolGovernance: [
      'performs read-only analysis and independent review and is never the implementer of the work it judges',
      'does not implement, persist artifacts, or delegate further',
    ],
    verification: ['separates observations, risks, and recommendations'],
  },
  {
    name: 'designer',
    mode: 'write-capable',
    dispatch: 'task',
    canMutateWorkspace: true,
    scope: 'UI/UX decisions, implementation, and visual verification',
    responsibility:
      'Own user-facing implementation choices and visual quality for UI work.',
    useWhen: [
      'User-facing UI/UX, interaction, accessibility, or visual quality is material.',
    ],
    doNotUseWhen: [
      'Not for backend-only, non-visual, or correctness-heavy cross-cutting work.',
    ],
    escalateWhen: [
      'Escalate coupled contracts, migrations, or high risk to worker.',
    ],
    toolGovernance: [
      'may edit focused UI/UX files',
      'owns screenshots and visual QA',
      'does not delegate further',
    ],
    verification: ['includes visual verification when applicable'],
  },
  {
    name: 'worker',
    mode: 'write-capable',
    dispatch: 'task',
    canMutateWorkspace: true,
    scope: 'bounded nonvisual implementation and verification',
    responsibility:
      'Handle bounded nonvisual implementation with full local context, including exact low-risk edits and correctness-critical, multi-file, edge-case-heavy, or high-risk work.',
    useWhen: [
      'Known bounded nonvisual implementation is ready, regardless of complexity; root direct work is limited to the bounded implementation-ownership exceptions.',
      'Correctness-critical work may be multi-file, edge-case-heavy, migration, concurrency, shared-contract, or high-risk.',
    ],
    doNotUseWhen: [
      'Not for visual-only work, reviewed commits, or work explicitly retained by the user in root.',
    ],
    escalateWhen: ['Return product or architecture choices to root.'],
    toolGovernance: [
      'may edit implementation and tests within the assigned surface',
      'validates shared behavior against related code and call sites',
      'does not delegate further',
    ],
    verification: ['reports focused checks and relevant edge-case evidence'],
  },
] as const satisfies readonly AgentRoleContract[];

const IMPLEMENTATION_OWNERSHIP_POLICY: ImplementationOwnershipPolicy = {
  eligibleOwners: ['orchestrator', 'designer', 'worker'],
  workflowIndependent: true,
  defaultImplementationOwner: 'specialist',
  rootIdentity:
    'You are the root coordinator. By default, specialists perform discovery of unlocated source, external research and substantive implementation; you direct, decide, accept and synthesize.',
  defaultRule:
    'Specialists execute by default for discovery of unlocated source, external research and substantive implementation; root retains goals, decisions, coordination, acceptance, and synthesis.',
  rootResponsibilities: [
    'retain the goal, constraints, decisions, coordination, semantic acceptance, and synthesis',
  ],
  discovery: [
    'Unlocated local source/flow/responsibility: Explorer before root read/search/shell/git/CodeGraph; name the unknown location in the assignment, no pre-reading. Navigation/fallbacks govern investigators, not root.',
    'Before first read/search/shell each turn: bounded known source in a direct-work exception or dispatch. Memory recall is not source discovery; precedes dispatch, exempt from this rule.',
  ],
  directConsultation: [
    'Direct consultation: one known source, bounded question; at most two fragments/~200 code lines per user request across tools/files/subtasks (instructions/coordination artifacts excluded; no source/log dumps). On new path/unlocated dependency/exhausted allowance: delegate missing evidence.',
  ],
  directException: [
    'Direct-work exceptions: known low-risk mechanical work (reviewed commits included), no rediscovery; minimal authorized low-risk edits with known scope/verification, no discovery/independent judgment.',
  ],
  writerRouting: [
    'Known bounded implementation: directly to designer/worker, no mandatory Explorer; librarian: external evidence; Oracle: independent judgment; no fixed all-role pipeline.',
  ],
  evidenceHandling: [
    'Conclusions, localized evidence, uncertainty—not files/source/log dumps; next action only from Oracle/Worker/Designer. Never repeat delegated discovery; fill gaps via targeted requests or bounded inspection of identified evidence. Independent verification stays mandatory.',
  ],
  delegationFailure: [
    'Report delegation failure truthfully; no unrestricted root execution. Prompt guidance, not runtime enforcement.',
  ],
  userDirection:
    'Explicit user direct-work or no-delegation instruction wins. Preserve operator-selected model/effort, including max; adjust scope/supervision, never lower effort for speed. Disclose unavailable independent review; never self-approve.',
  insufficientSignals: [
    'workflow persistence choice',
    'file count or an additional targeted search alone',
    'cheaper model price without end-to-end evidence',
  ],
};

export function getImplementationOwnershipInstructions(
  policy: ImplementationOwnershipPolicy,
): string[] {
  return [
    ...policy.discovery,
    ...policy.directException,
    ...policy.directConsultation,
    policy.userDirection,
    ...policy.writerRouting,
    ...policy.evidenceHandling,
    ...policy.delegationFailure,
  ];
}

export const ORCHESTRATION_POLICY: OrchestrationPolicy = {
  maxDelegationDepth: 1,
  singleWriter: true,
  implementationOwnership: IMPLEMENTATION_OWNERSHIP_POLICY,
  taskShaping: {
    steps: [
      'bound-units',
      'map-output-dependencies',
      'assign-ownership',
      'select-specialists',
      'admit-ready-units',
      'dispatch-to-native-capacity',
      'wait-for-native-terminal-event',
      'accept-results',
      'refill-capacity',
    ],
    nativeAuthority: true,
    boundedWidth: true,
    decisions: {
      unitOutcome:
        'Each exploration, research, planning, implementation or verification unit has one independently acceptable outcome',
      unitEnvelope:
        'Assignment: phase, record if any, requirements, accepted upstream inputs, result produced; owned writes, compatible reads/interfaces/shared resources; focused checks with pass evidence, native return milestone, stop condition; MEMORY (`none`/`recall`/`observe`) verified project/root session identity (or `unavailable`), verbatim',
      phaseSplitting:
        'Split phases with separately acceptable outcomes before dispatch; keep cohesive tiny edits together',
      independentDiscovery:
        'Run precise independent Explorer questions in parallel within proven native capacity, without duplicate reads; dependent questions wait for root-accepted fresh outputs',
      scopeGrowth:
        'Missing context, interfaces, ownership conflicts or material scope growth return bounded progress for root reassessment before expansion',
      dependency:
        'Block a unit until every concrete upstream output is terminal, root-accepted, and fresh',
      ownershipConflict:
        'serialize overlapping mutable surfaces or assign one writer',
      readyDispatch:
        'Dispatch every admitted conflict-free ready unit before waiting within proven native capacity',
      refill:
        'Refill freed capacity with newly ready consumers before another wait',
      terminalEvidence:
        'silence, timeout, and malformed status remain nonterminal',
      degradation:
        'report an unavailable native primitive and use a truthful sequential fallback',
    },
  },
  specialistDirectory: AGENT_ROLES.filter(
    (
      role,
    ): role is (typeof AGENT_ROLES)[number] & {
      name: Exclude<AgentRoleName, 'orchestrator'>;
    } => role.name !== 'orchestrator',
  ).map((role) => ({
    role: role.name,
    selectWhen: role.useWhen.join(' '),
    rejectWhen: role.doNotUseWhen.join(' '),
  })),
  rules: [
    'Persistence and planning choices do not determine implementation ownership.',
    ...getImplementationOwnershipInstructions(IMPLEMENTATION_OWNERSHIP_POLICY),
    'Honor explicit user ownership; if independent review is prohibited, disclose the limitation and do not claim independent PASS or archive.',
    'Across exploration, research, planning, implementation, and verification, each unit has one independently acceptable outcome; name concrete accepted inputs and output, owned writes, interfaces and resources, focused pass evidence, and a native return milestone/stop condition.',
    'Split a phase containing separately acceptable outcomes before dispatch, keep cohesive tiny edits together, and run precise independent Explorer questions in parallel within native capacity without duplicate reads; dependent questions wait for accepted fresh outputs.',
    'Missing context or interfaces, ownership conflicts, or material scope growth returns bounded progress for root reassessment before expansion.',
    'On native attention or a missed agreed milestone, root inspects progress and steers, narrows, or stops safely; timeout is a safety ceiling, not a progress plan.',
    'After two consecutive attempts without new evidence or progress, return the smallest blocker instead of repeating. Use native notifications/waits without polling or custom timers.',
    'Freeze relevant inputs before final validation; reuse fresh evidence and rerun only checks invalidated by later edits. Reconcile owned background results before the substantive handoff.',
    'Use one writer for each mutable surface and never parallelize overlapping writes.',
    'A fresh subagent instance is the default when the objective, work unit, mutable surface, or independent judgment changes.',
    'Continue an existing subagent only to steer, complete, or clarify the same bounded assignment; completed agents are not a reusable role pool.',
    'Every Oracle plan review, verification round, and approval or PASS judgment uses a fresh Oracle instance; reuse is limited to clarifying current findings.',
    'Final verification is mandatory: root owns trivial deterministic checks; a fresh Oracle owns artifact-backed and material-risk judgment.',
    'Wait and status operations collect only the active nonterminal assignment and do not authorize later reuse.',
    'Child agents return distilled evidence instead of raw logs or file dumps.',
  ],
};

const EVIDENCE_RETURN_FIELDS = [
  'conclusion',
  'evidence',
  'verification',
  'risks',
  'openQuestions',
] as const;
const HANDOFF_RETURN_FIELDS = [
  ...EVIDENCE_RETURN_FIELDS,
  'nextAction',
] as const;

export const AGENT_RETURN_CONTRACT = {
  orchestrator: HANDOFF_RETURN_FIELDS,
  explorer: EVIDENCE_RETURN_FIELDS,
  librarian: EVIDENCE_RETURN_FIELDS,
  oracle: HANDOFF_RETURN_FIELDS,
  designer: [...HANDOFF_RETURN_FIELDS, 'changedFiles'],
  worker: [...HANDOFF_RETURN_FIELDS, 'changedFiles'],
} as const satisfies Record<AgentRoleName, readonly string[]>;

function cloneReturnContract(
  contract: Record<AgentRoleName, readonly string[]>,
): AgentPackContract['returnContract'] {
  return Object.fromEntries(
    AGENT_ROLE_NAMES.map((role) => [role, [...contract[role]]]),
  ) as AgentPackContract['returnContract'];
}

export const VERIFICATION_PROTOCOL = [
  'Completion reports identify changed files and verification evidence.',
  'Behavior changes receive the smallest sufficient automated check or a declared manual check.',
  'Visual changes receive designer-owned visual QA when applicable.',
] as const;

export const AGENT_PACK_CONTRACT: AgentPackContract = {
  roles: [...AGENT_ROLES],
  orchestrationPolicy: {
    ...ORCHESTRATION_POLICY,
    rules: [...ORCHESTRATION_POLICY.rules],
  },
  returnContract: cloneReturnContract(AGENT_RETURN_CONTRACT),
  verificationProtocol: [...VERIFICATION_PROTOCOL],
};

export function getAgentRole(name: AgentRoleName): AgentRoleContract {
  const role = AGENT_ROLES.find((candidate) => candidate.name === name);

  if (!role) {
    throw new Error(`Unknown agent role: ${name}`);
  }

  return role;
}

interface ResultFieldSchema {
  type: string | readonly string[];
  const?: unknown;
  enum?: readonly unknown[];
  properties?: Record<string, ResultFieldSchema>;
  required?: readonly string[];
  items?: ResultFieldSchema;
  minLength?: number;
  pattern?: string;
}

function renderResultType(schema: ResultFieldSchema): string {
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map(String).join('|');
  if (schema.type === 'object') {
    return `{${Object.entries(schema.properties ?? {})
      .map(
        ([name, field]) =>
          `${name}${schema.required?.includes(name) ? '' : '?'}: ${renderResultType(field)}`,
      )
      .join(', ')}}`;
  }
  if (schema.items) return `${renderResultType(schema.items)}[]`;
  if (schema.pattern === '^[a-f0-9]{64}$') return 'hex64';
  if (schema.minLength) return 's+';
  const types = typeof schema.type === 'string' ? [schema.type] : schema.type;
  return types.map((type) => (type === 'string' ? 's' : type)).join('|');
}

/** Keep non-gate returns independent of the Oracle validator contract. */
export function renderSpecialistResultContract(
  role: Exclude<AgentRoleName, 'orchestrator'>,
): string {
  const markdown = `Return compact markdown fields (no JSON): ${AGENT_RETURN_CONTRACT[role].join(', ')}.`;
  if (role !== 'oracle') return markdown;
  const contract = SPECIALIST_RESULT_CONTRACT;
  const properties: Record<string, ResultFieldSchema> = {
    ...contract.common.properties,
    ...contract.roles[role].properties,
    role: { type: 'string', const: role },
  };
  const fields = getSpecialistResultFields(role)
    .map((name) => `- ${name}: ${renderResultType(properties[name])}`)
    .join('\n');
  const reviewRules = `
${Object.entries(contract.reviewKinds)
  .map(([kind, rule]) => `${kind}: ${rule.verdicts.join('|')}`)
  .join(
    '; ',
  )}; ${contract.rules.positiveVerdicts.join('|')} requires ${contract.rules.positiveStatus} status and no blocking risks. Final-verification requires reviewedRecord and reviewedRecordSha256 if the assignment names a record; otherwise omit both.`;
  return `${markdown}
Diagnosis/advice uses markdown fields and cannot approve. Only for assigned plan-review or final-verification, instead return exactly one fenced \`\`\`${contract.fence} JSON block and nothing else. Types: s=string, s+=nonempty string, hex64=64 lowercase hex. No extra keys; ?=optional. evidenceIds reference unique evidence IDs.
${fields}${reviewRules}`;
}

export function renderAgentRoutingDescription(role: AgentRoleContract): string {
  return [
    role.responsibility,
    `Use when: ${role.useWhen.join(' ')}`,
    `Do not use when: ${role.doNotUseWhen.join(' ')}`,
    `Escalate when: ${role.escalateWhen.join(' ')}`,
    `Mutation: ${role.canMutateWorkspace ? `only the assigned ${role.scope} surface` : 'read-only; never mutate the workspace'}.`,
    `Verification: ${role.verification.join(' ')}`,
    role.name === 'orchestrator'
      ? 'Present results to the user as readable prose.'
      : `Return: compact markdown fields: ${AGENT_RETURN_CONTRACT[role.name].join(', ')}.${role.name === 'oracle' ? ' Only plan-review/final-verification uses a thoth-result gate envelope; diagnosis/advice cannot approve.' : ''}`,
  ].join(' ');
}

export function getAgentPackContract(): AgentPackContract {
  return {
    roles: AGENT_PACK_CONTRACT.roles.map((role) => ({
      ...role,
      useWhen: [...role.useWhen],
      doNotUseWhen: [...role.doNotUseWhen],
      escalateWhen: [...role.escalateWhen],
      writeScope: role.writeScope ? [...role.writeScope] : undefined,
      toolGovernance: [...role.toolGovernance],
      verification: [...role.verification],
    })),
    orchestrationPolicy: {
      ...AGENT_PACK_CONTRACT.orchestrationPolicy,
      implementationOwnership: {
        ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership,
        eligibleOwners: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .eligibleOwners,
        ],
        rootResponsibilities: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .rootResponsibilities,
        ],
        discovery: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .discovery,
        ],
        directConsultation: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .directConsultation,
        ],
        directException: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .directException,
        ],
        writerRouting: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .writerRouting,
        ],
        evidenceHandling: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .evidenceHandling,
        ],
        delegationFailure: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .delegationFailure,
        ],
        insufficientSignals: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .insufficientSignals,
        ],
      },
      taskShaping: {
        ...AGENT_PACK_CONTRACT.orchestrationPolicy.taskShaping,
        steps: [...AGENT_PACK_CONTRACT.orchestrationPolicy.taskShaping.steps],
        decisions: {
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.taskShaping.decisions,
        },
      },
      specialistDirectory:
        AGENT_PACK_CONTRACT.orchestrationPolicy.specialistDirectory.map(
          (decision) => ({ ...decision }),
        ),
      rules: [...AGENT_PACK_CONTRACT.orchestrationPolicy.rules],
    },
    returnContract: cloneReturnContract(AGENT_PACK_CONTRACT.returnContract),
    verificationProtocol: [...AGENT_PACK_CONTRACT.verificationProtocol],
  };
}
