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
      'human agreement, SDD coordination, bounded direct exceptions, decisions, and synthesis',
    responsibility:
      'Keep goals, decisions, coordination, acceptance, and synthesis in the root; retain known low-risk mechanical work and explicit direct-work requests. Otherwise use specialists for substantive outcomes and independent judgment.',
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
      'retains reviewed commits and known low-risk mechanical work; otherwise delegates for a concrete benefit within user authorization',
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
      'Known bounded nonvisual implementation selected for delegation is ready, regardless of complexity; routine mechanical work stays with root unless explicitly delegated.',
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
      'Unknown local source, flow, or responsibility triggers Explorer before root search unless the user explicitly requests direct investigation.',
      'A bounded discovery assignment may state an unknown location; root must not perform exploratory pre-reading to prepare it.',
      'The assigned investigator owns applicable discovery-tool fallback.',
    ],
    directConsultation: [
      'One known source, one bounded question. On a new path or unlocated dependency, stop and delegate; do not continue discovery from acquired context.',
      'Experimental cumulative budget: two source fragments, approximately 200 code lines per user request across tools, files, and subtasks.',
      'Required operating instructions and pertinent coordination artifacts are excluded; this never permits source or log dumps.',
      'At exhaustion, delegate missing evidence. Prompt guidance, not runtime enforcement; it never waives independent verification.',
    ],
    directException: [
      'Root may make a minimal authorized low-risk edit only when scope and verification are known and no discovery or independent judgment is needed.',
      'Root retains reviewed commits and other known low-risk mechanical work; another search alone does not force delegation. Explicit direct-work or no-delegation instructions take precedence.',
    ],
    writerRouting: [
      'Known sufficiently bounded implementation selected for delegation goes directly to designer or worker by task shape without a mandatory Explorer stage.',
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
    userDirection:
      'explicit direct-work or no-delegation instruction wins; preserve operator-selected model and effort',
    insufficientSignals: [
      'workflow persistence choice',
      'file count or an additional targeted search alone',
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
      unitOutcome:
        'For exploration, research, planning, implementation, and verification, each unit has one independently acceptable outcome',
      unitEnvelope:
        'Name accepted upstream inputs and result produced; bound owned writes and require compatible reads, interfaces, and shared resources; include focused checks with pass evidence, a native return milestone, and stop condition',
      phaseSplitting:
        'Split phases with separately acceptable outcomes before dispatch; keep cohesive tiny edits together',
      independentDiscovery:
        'Run precise independent Explorer questions in parallel within proven native capacity; avoid duplicate reads; dependent questions wait for root-accepted fresh outputs',
      scopeGrowth:
        'Missing context, interfaces, ownership conflicts, or material scope growth returns bounded progress for root reassessment before expansion',
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
    'Unless explicit ownership or known low-risk mechanical work stays with root, specialists perform substantive discovery, research, and implementation; root retains goals, decisions, coordination, acceptance, and synthesis.',
    'Unknown local source, flow, or responsibility triggers Explorer before root search unless the user requests direct investigation; no preliminary discovery is needed to prepare that assignment.',
    'Root retains known low-risk mechanical work including reviewed commits; explicit direct-work or no-delegation instruction wins. Do not reopen completed discovery for mechanical operations.',
    'Additional searches or file count do not force delegation; preserve operator-selected model and effort, including max.',
    'Known sufficiently bounded implementation selected for delegation goes directly to designer or worker without a mandatory Explorer stage.',
    'Do not duplicate delegated discovery; request targeted missing support and preserve bounded decision inspection plus mandatory independent verification.',
    'Report delegation failure truthfully without unrestricted root fallback; discovery-tool fallback belongs to the assigned investigator.',
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
    returnContract: [...AGENT_PACK_CONTRACT.returnContract],
    verificationProtocol: [...AGENT_PACK_CONTRACT.verificationProtocol],
  };
}
