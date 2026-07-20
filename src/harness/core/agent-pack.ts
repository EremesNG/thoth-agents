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
  writeScope?: string[];
  toolGovernance: string[];
  verification: string[];
}

export interface OrchestrationPolicy {
  maxDelegationDepth: number;
  singleWriter: boolean;
  rules: string[];
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
      'requirements, SDD coordination, routing, bounded direct work, decisions, and synthesis',
    responsibility:
      'Keep the task coherent, own sequential specification, planning, task, convergence, and archive coordination, act directly when work is clear and bounded, and delegate only for net gain.',
    toolGovernance: [
      'may inspect and edit bounded direct work, but every verification is delegated to oracle',
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
  rules: [
    'The root performs bounded direct work when scope and intent are clear.',
    'Delegate only when specialization, context isolation, or independent parallel work creates a net gain.',
    'Prefer child agents for read-heavy exploration, research, analysis, and verification.',
    'Use one writer for each mutable surface and never parallelize overlapping writes.',
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

export function getAgentPackContract(): AgentPackContract {
  return {
    roles: AGENT_PACK_CONTRACT.roles.map((role) => ({
      ...role,
      writeScope: role.writeScope ? [...role.writeScope] : undefined,
      toolGovernance: [...role.toolGovernance],
      verification: [...role.verification],
    })),
    orchestrationPolicy: {
      ...AGENT_PACK_CONTRACT.orchestrationPolicy,
      rules: [...AGENT_PACK_CONTRACT.orchestrationPolicy.rules],
    },
    returnContract: [...AGENT_PACK_CONTRACT.returnContract],
    verificationProtocol: [...AGENT_PACK_CONTRACT.verificationProtocol],
  };
}
