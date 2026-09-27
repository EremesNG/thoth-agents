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
  rootResponsibilities: string[];
  discovery: string[];
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
  returnContract: string[];
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
      'human agreement, persisted work coordination, bounded direct exceptions, decisions, and synthesis',
    responsibility:
      'Keep goals, constraints, decisions, work-unit coordination, semantic acceptance, and final synthesis in the root thread; direct discovery and implementation to specialists by default, use only the bounded direct exception, and run focused verification for trivial deterministic work.',
    useWhen: [
      'Coordinate goals, constraints, decisions, governed artifacts, routing, acceptance, and synthesis.',
      'Consult a known source for one bounded question or make a minimal authorized low-risk edit only when source, scope, and verification are known and no discovery or independent judgment is needed.',
    ],
    doNotUseWhen: [
      'Not for independent plan review or Oracle-required final verification.',
    ],
    escalateWhen: [
      'Stop the direct exception when another search or dependency appears; send unknown local discovery to explorer and implementation to designer or worker by task shape.',
    ],
    toolGovernance: [
      'may inspect and edit the accepted bounded implementation surface and may verify trivial deterministic work without self-approval',
      'loads the matching thoth-work guidance on demand instead of carrying every workflow detail in its prompt',
      'owns agreement, work-unit state, semantic acceptance, and project work evidence under .thoth/changes/',
      'delegates discovery and implementation by default, with direct work limited to the explicit bounded exception',
      'keeps requirements, decisions, and final synthesis in the root thread',
    ],
    verification: [
      'runs focused checks for trivial deterministic work while final verification remains mandatory',
      'delegates selected focused plan review plus persisted-work and material-risk final verification to a fresh oracle',
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
      'Independently review plans when selected and provide independent judgment for persisted-work or material-risk final verification, exposing correctness risks and judging whether results satisfy their contracts.',
    useWhen: [
      'Selected focused plan review, persistent diagnosis, material architecture or security risk, contradictory evidence, high failure cost, or persisted-work final verification needs independent judgment.',
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
      'Known bounded nonvisual implementation is ready, regardless of complexity; this includes exact low-risk or mechanical edits.',
      'Correctness-critical work may be multi-file, edge-case-heavy, migration, concurrency, shared-contract, or high-risk.',
    ],
    doNotUseWhen: ['Not for visual-only work.'],
    escalateWhen: ['Return product or architecture choices to root.'],
    toolGovernance: [
      'may edit implementation and tests within the assigned surface',
      'validates shared behavior against related code and call sites',
      'does not delegate further',
    ],
    verification: ['reports focused checks and relevant edge-case evidence'],
  },
] as const satisfies readonly AgentRoleContract[];

export const ORCHESTRATION_POLICY: OrchestrationPolicy = {
  maxDelegationDepth: 1,
  singleWriter: true,
  implementationOwnership: {
    eligibleOwners: ['orchestrator', 'designer', 'worker'],
    workflowIndependent: true,
    defaultImplementationOwner: 'specialist',
    rootResponsibilities: [
      'retain the goal, constraints, decisions, coordination, semantic acceptance, and synthesis',
    ],
    discovery: [
      'Unknown local source, flow, or responsibility triggers Explorer before root repository search or dependency traversal.',
      'A bounded discovery assignment may state an unknown location; root must not perform exploratory pre-reading to prepare it.',
      'The assigned investigator owns applicable discovery-tool fallback.',
    ],
    directException: [
      'Root may consult a known source for one bounded question or make a minimal authorized low-risk edit only when source, scope, and verification are known and no discovery or independent judgment is needed.',
      'Another search or dependency ends the direct exception.',
    ],
    writerRouting: [
      'Known sufficiently bounded implementation goes directly to designer or worker by task shape without a mandatory Explorer stage.',
      'Use librarian for needed external evidence and Oracle for independent judgment; never impose a mechanical all-role pipeline.',
    ],
    evidenceHandling: [
      'Request conclusions, localized evidence, uncertainty, and next action instead of full files, source dumps, or logs.',
      'Root must not repeat delegated discovery before, during, or after the assignment.',
      'Missing support triggers a targeted evidence request or bounded inspection of identified evidence, while mandatory independent verification remains intact.',
    ],
    delegationFailure: [
      'Report delegation failure truthfully; it does not authorize unrestricted root execution.',
    ],
    userDirection: 'explicit safe user direction is an ownership input',
    insufficientSignals: [
      'workflow persistence choice',
      'file count, accumulated context, or coordination overhead',
      'cheaper model price without end-to-end evidence',
    ],
  },
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
      dependency:
        'block a unit until every concrete upstream output is terminal, root-accepted, and fresh',
      ownershipConflict:
        'serialize overlapping mutable surfaces or assign one writer',
      readyDispatch:
        'dispatch every admitted conflict-free ready unit before waiting within proven native capacity',
      refill:
        'refill freed capacity with newly ready consumers before another wait',
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
    'Specialists perform discovery, external research, and implementation by default; root retains goals, constraints, decisions, coordination, semantic acceptance, and synthesis.',
    'Unknown local source, flow, or responsibility triggers Explorer before root repository search; no exploratory pre-reading is needed to prepare a bounded discovery assignment.',
    'Root direct work is limited to a known-source bounded consultation or minimal authorized low-risk edit with known scope and verification and no discovery or independent judgment; another search or dependency ends it.',
    'File count, accumulated context, and coordination overhead do not extend the direct exception.',
    'Known sufficiently bounded implementation goes directly to designer or worker without a mandatory Explorer stage.',
    'Do not duplicate delegated discovery; request targeted missing support and preserve bounded decision inspection plus mandatory independent verification.',
    'Report delegation failure truthfully without unrestricted root fallback; discovery-tool fallback belongs to the assigned investigator.',
    'Treat explicit safe user direction as an ownership input; persistence choice or cheaper model price without end-to-end evidence cannot choose an owner.',
    'Use one writer for each mutable surface and never parallelize overlapping writes.',
    'A fresh subagent instance is the default when the objective, work unit, mutable surface, or independent judgment changes.',
    'Continue an existing subagent only to steer, complete, or clarify the same bounded assignment; completed agents are not a reusable role pool.',
    'Every Oracle plan review, verification round, and approval or PASS judgment uses a fresh Oracle instance; reuse is limited to clarifying current findings.',
    'Final verification is mandatory: root owns trivial deterministic checks; a fresh Oracle owns persisted-work and material-risk judgment.',
    'Wait and status operations collect only the active nonterminal assignment and do not authorize later reuse.',
    'Child agents return distilled evidence instead of raw logs or file dumps.',
  ],
};

export const AGENT_RETURN_CONTRACT = [
  'conclusion',
  'evidence',
  'verification',
  'risks',
  'openQuestions',
  'nextAction',
] as const;

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
  returnContract: [...AGENT_RETURN_CONTRACT],
  verificationProtocol: [...VERIFICATION_PROTOCOL],
};

export function getAgentRole(name: AgentRoleName): AgentRoleContract {
  const role = AGENT_ROLES.find((candidate) => candidate.name === name);

  if (!role) {
    throw new Error(`Unknown agent role: ${name}`);
  }

  return role;
}

export function renderAgentRoutingDescription(role: AgentRoleContract): string {
  return [
    role.responsibility,
    `Use when: ${role.useWhen.join(' ')}`,
    `Do not use when: ${role.doNotUseWhen.join(' ')}`,
    `Escalate when: ${role.escalateWhen.join(' ')}`,
    `Mutation: ${role.canMutateWorkspace ? `only the assigned ${role.scope} surface` : 'read-only; never mutate the workspace'}.`,
    `Verification: ${role.verification.join(' ')}`,
    `Return: ${AGENT_RETURN_CONTRACT.join(', ')}.`,
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
    returnContract: [...AGENT_PACK_CONTRACT.returnContract],
    verificationProtocol: [...AGENT_PACK_CONTRACT.verificationProtocol],
  };
}
