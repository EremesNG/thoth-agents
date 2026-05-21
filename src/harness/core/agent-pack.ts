export type AgentRoleName =
  | 'orchestrator'
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'quick'
  | 'deep';

export type AgentMutationMode =
  | 'primary-non-mutating'
  | 'read-only'
  | 'write-capable';

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
  toolGovernance: string[];
  verification: string[];
}

export interface AgentPackContract {
  roles: AgentRoleContract[];
  delegateFirstRules: string[];
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
    mode: 'primary-non-mutating',
    dispatch: 'root-coordinator',
    canMutateWorkspace: false,
    scope: 'coordination, routing, decisions, progress, and root memory',
    responsibility:
      'Delegate-first coordinator for SDD workflow, specialist dispatch, and root-session memory ownership.',
    toolGovernance: [
      'delegates inspection, writing, debugging, and verification',
      'owns question prompts and root-session memory',
      'does not perform inline workspace implementation',
    ],
    verification: [
      'routes verification to specialists',
      'summarizes evidence from changed files, diagnostics, and tests',
    ],
  },
  {
    name: 'explorer',
    mode: 'read-only',
    dispatch: 'task',
    canMutateWorkspace: false,
    scope: 'local repository discovery',
    responsibility:
      'Find workspace facts fast and return paths, lines, symbols, constraints, edit targets, and conclusions.',
    toolGovernance: [
      'read/search/code-navigation tools only',
      'no durable memory writes',
      'no task delegation or progress ownership',
    ],
    verification: ['reports confidence, anchors, unchecked areas, and gaps'],
  },
  {
    name: 'librarian',
    mode: 'read-only',
    dispatch: 'task',
    canMutateWorkspace: false,
    scope: 'external research plus local confirmation when needed',
    responsibility:
      'Gather authoritative external evidence and distinguish official docs from examples.',
    toolGovernance: [
      'research and read-only local confirmation tools',
      'no workspace mutation',
      'no durable memory writes',
    ],
    verification: ['sources every substantive external claim with a URL'],
  },
  {
    name: 'oracle',
    mode: 'read-only',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: false,
    scope: 'advice, diagnosis, architecture, code review, and plan review',
    responsibility:
      'Provide strategic technical guidance anchored to evidence and review SDD plans.',
    toolGovernance: [
      'read-only analysis and review',
      'no implementation or artifact-producing SDD phases',
      'no task delegation',
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
      'Own user-facing implementation choices and visual QA for UI work.',
    toolGovernance: [
      'may edit focused UI/UX files',
      'owns screenshots and visual QA',
      'does not delegate or own SDD progress',
    ],
    verification: ['includes visual verification status when applicable'],
  },
  {
    name: 'quick',
    mode: 'write-capable',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: true,
    scope: 'fast bounded implementation',
    responsibility:
      'Implement well-defined narrow or mechanical changes with focused verification.',
    toolGovernance: [
      'may edit bounded targets',
      'does not perform broad rediscovery',
      'does not delegate or own SDD progress',
    ],
    verification: ['runs the smallest sufficient focused check'],
  },
  {
    name: 'deep',
    mode: 'write-capable',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: true,
    scope: 'thorough implementation and verification',
    responsibility:
      'Handle correctness-critical, multi-file, or edge-case-heavy changes with full local context analysis.',
    toolGovernance: [
      'may edit implementation and tests',
      'validates shared behavior against related code and call sites',
      'does not delegate or own SDD progress',
    ],
    verification: ['does not skip verification and reports edge-case evidence'],
  },
] as const satisfies readonly AgentRoleContract[];

export const DELEGATE_FIRST_RULES = [
  'The orchestrator coordinates, decides, asks blocking questions, and delegates evidence or action.',
  'Explorer, librarian, and oracle remain read-only specialists.',
  'Designer, quick, and deep are write-capable leaf agents with synchronous task dispatch.',
  'Subagents return findings, diffs, verification, and blockers rather than raw file dumps.',
  'No leaf agent owns SDD progress checkboxes or orchestrator-only memory.',
] as const;

export const VERIFICATION_PROTOCOL = [
  'Completion reports include changed files and verification evidence.',
  'Behavior changes require the smallest sufficient automated check or an explicitly documented check.',
  'Visual changes require designer-owned visual QA when feasible.',
] as const;

export const AGENT_PACK_CONTRACT: AgentPackContract = {
  roles: [...AGENT_ROLES],
  delegateFirstRules: [...DELEGATE_FIRST_RULES],
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
      toolGovernance: [...role.toolGovernance],
      verification: [...role.verification],
    })),
    delegateFirstRules: [...AGENT_PACK_CONTRACT.delegateFirstRules],
    verificationProtocol: [...AGENT_PACK_CONTRACT.verificationProtocol],
  };
}
