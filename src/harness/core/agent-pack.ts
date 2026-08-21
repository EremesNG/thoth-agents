export type AgentRoleName =
  | 'orchestrator'
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'quick'
  | 'deep';

export type AgentMutationMode = 'adaptive-root' | 'read-only' | 'write-capable';

export type AgentDispatchMethod =
  | 'root-coordinator'
  | 'task'
  | 'synchronous-task-only';

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
  rules: string[];
}

export type ImplementationOwner =
  | 'orchestrator'
  | 'designer'
  | 'quick'
  | 'deep';

export interface ImplementationOwnershipPolicy {
  eligibleOwners: ImplementationOwner[];
  routeIndependent: boolean;
  delegationBenefits: string[];
  rootContinuityBenefits: string[];
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
  'quick',
  'deep',
] as const satisfies readonly AgentRoleName[];

export const AGENT_ROLES = [
  {
    name: 'orchestrator',
    mode: 'adaptive-root',
    dispatch: 'root-coordinator',
    canMutateWorkspace: true,
    scope:
      'requirements, SDD coordination, routing, bounded implementation, decisions, and synthesis',
    responsibility:
      'Keep requirements, decisions, sequential SDD coordination, and final synthesis in the root thread; evaluate implementation ownership independently in every route and implement directly or delegate according to explicit user direction and demonstrated net gain.',
    useWhen: [
      'Coordinate requirements, governed artifacts, routing, and synthesis.',
      'Implement an accepted mutable surface in any route when accumulated context and continuity outweigh delegation overhead.',
    ],
    doNotUseWhen: ['Not for independent plan review or final verification.'],
    escalateWhen: [
      'Delegate implementation when specialization, context isolation, or independent bounded work creates a demonstrated net gain; then select designer, quick, or deep by task shape.',
    ],
    toolGovernance: [
      'may inspect and edit the accepted bounded implementation surface in every route, but every verification is delegated to oracle',
      'loads the matching thoth-sdd phase contract on demand instead of carrying every phase protocol in its prompt',
      'owns governed coordination writes under openspec/ and uses append-only tasks.md updates during convergence',
      'delegates independent or specialist work only when it produces a net gain',
      'keeps requirements, decisions, and final synthesis in the root thread',
    ],
    verification: [
      'delegates selected plan-review and every verify phase to oracle; plan review stays optional and final verification stays mandatory',
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
    useWhen: ['Repository ownership or behavior is broad or uncertain.'],
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
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: false,
    scope:
      'diagnosis, architecture, optional plan review, and independent verification',
    responsibility:
      'Independently review plans when the user requests it and perform every implementation verification, exposing correctness risks and judging whether results satisfy their contracts.',
    useWhen: [
      'Selected plan review, diagnosis, or final verification needs independent judgment.',
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
    dispatch: 'synchronous-task-only',
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
      'Escalate coupled contracts, migrations, or high risk to deep.',
    ],
    toolGovernance: [
      'may edit focused UI/UX files',
      'owns screenshots and visual QA',
      'does not delegate further',
    ],
    verification: ['includes visual verification when applicable'],
  },
  {
    name: 'quick',
    mode: 'write-capable',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: true,
    scope: 'fast bounded implementation',
    responsibility:
      'Implement narrow, clear, low-risk changes within an explicitly bounded surface.',
    useWhen: ['Known narrow mechanical low-risk work has exact targets.'],
    doNotUseWhen: [
      'Not for coupled contracts, migrations, broad discovery, concurrency, edge cases, or high risk.',
    ],
    escalateWhen: [
      'Escalate discovery, coupling, edge cases, or higher risk to deep.',
    ],
    toolGovernance: [
      'edits only bounded targets',
      'escalates when discovery or correctness risk exceeds the assignment',
      'does not delegate further',
    ],
    verification: ['runs the smallest sufficient focused check'],
  },
  {
    name: 'deep',
    mode: 'write-capable',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: true,
    scope: 'correctness-critical implementation and verification',
    responsibility:
      'Handle multi-file, edge-case-heavy, or high-risk implementation with full local context.',
    useWhen: [
      'Implementation is multi-file, edge-case-heavy, migration, concurrency, shared-contract, or high-risk.',
    ],
    doNotUseWhen: ['Not for visual-only work or narrow known low-risk edits.'],
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
    eligibleOwners: ['orchestrator', 'designer', 'quick', 'deep'],
    routeIndependent: true,
    delegationBenefits: [
      'specialization',
      'context isolation',
      'independent bounded work',
      'safe parallelism',
      'quality, latency, or total-cost gain',
    ],
    rootContinuityBenefits: [
      'short work',
      'one ordered reasoning chain',
      'frequent shared-state writes',
      'already-loaded context',
      'rediscovery and coordination cost',
    ],
    userDirection: 'explicit safe user direction is an ownership input',
    insufficientSignals: [
      'SDD route name',
      'file count alone',
      'cheaper model price without end-to-end evidence',
    ],
  },
  rules: [
    'Direct, Accelerated, Full, and no-artifact execution govern artifacts and gates, not implementation ownership.',
    'Root or a specialist may implement in every route; delegate only when specialization, context isolation, independent bounded work, or safe parallelism creates a demonstrated quality, latency, or total-cost net gain.',
    'Keep implementation in root when short work, one ordered reasoning chain, frequent shared-state writes, already-loaded context, rediscovery, or coordination cost outweigh delegation benefit.',
    'Treat explicit safe user direction as an ownership input; route name, file count alone, or cheaper model price without end-to-end evidence cannot choose an owner.',
    'After deciding to delegate implementation, select designer for UI/UX, quick for known narrow low-risk work, and deep for coupled or high-risk work.',
    'Use one writer for each mutable surface and never parallelize overlapping writes.',
    'A fresh subagent instance is the default when the objective, SDD phase, mutable surface, or independent judgment changes.',
    'Continue an existing subagent only to steer, complete, or clarify the same bounded assignment; completed agents are not a reusable role pool.',
    'Every Oracle plan review, verification round, and approval or PASS judgment uses a fresh Oracle instance; reuse is limited to clarifying current findings.',
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
        delegationBenefits: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .delegationBenefits,
        ],
        rootContinuityBenefits: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .rootContinuityBenefits,
        ],
        insufficientSignals: [
          ...AGENT_PACK_CONTRACT.orchestrationPolicy.implementationOwnership
            .insufficientSignals,
        ],
      },
      rules: [...AGENT_PACK_CONTRACT.orchestrationPolicy.rules],
    },
    returnContract: [...AGENT_PACK_CONTRACT.returnContract],
    verificationProtocol: [...AGENT_PACK_CONTRACT.verificationProtocol],
  };
}
