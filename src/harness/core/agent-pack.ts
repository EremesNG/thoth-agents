export type AgentRoleName =
  | 'orchestrator'
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'sdd-specify'
  | 'sdd-plan'
  | 'sdd-tasks'
  | 'designer'
  | 'quick'
  | 'deep';

export type AgentMutationMode =
  | 'adaptive-root'
  | 'read-only'
  | 'coordination-write'
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
  'sdd-specify',
  'sdd-plan',
  'sdd-tasks',
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
      'requirements, routing, bounded direct work, decisions, and synthesis',
    responsibility:
      'Keep the task coherent, act directly when the work is clear and bounded, and delegate only when specialization or parallelism produces a net gain.',
    toolGovernance: [
      'may inspect, edit, and verify bounded direct work',
      'delegates independent or specialist work only when it produces a net gain',
      'keeps requirements, decisions, and final synthesis in the root thread',
    ],
    verification: [
      'verifies direct work before completion',
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
    scope: 'diagnosis, architecture, analysis, and independent verification',
    responsibility:
      'Review evidence, expose correctness risks, and judge whether the result satisfies its contracts.',
    toolGovernance: [
      'performs read-only analysis and review',
      'does not implement, persist artifacts, or delegate further',
    ],
    verification: ['separates observations, risks, and recommendations'],
  },
  {
    name: 'sdd-specify',
    mode: 'coordination-write',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: true,
    scope: 'feature intent and requirements contract',
    responsibility:
      'Produce or refine the Spec Kit-compatible feature specification without implementing product code.',
    writeScope: ['openspec/'],
    toolGovernance: [
      'writes only governed coordination artifacts under openspec/',
      'does not implement product code or delegate further',
    ],
    verification: [
      'checks that requirements are testable and materially unambiguous',
    ],
  },
  {
    name: 'sdd-plan',
    mode: 'coordination-write',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: true,
    scope: 'technical plan and optional design-support artifacts',
    responsibility:
      'Translate an accepted specification into a technically executable Spec Kit-compatible plan.',
    writeScope: ['openspec/'],
    toolGovernance: [
      'writes only governed coordination artifacts under openspec/',
      'does not implement product code or delegate further',
    ],
    verification: ['checks plan coverage, constraints, and affected surfaces'],
  },
  {
    name: 'sdd-tasks',
    mode: 'coordination-write',
    dispatch: 'synchronous-task-only',
    canMutateWorkspace: true,
    scope: 'dependency-ordered implementation and convergence tasks',
    responsibility:
      'Convert the accepted specification and plan into bounded tasks, and append traceable convergence work from verification findings.',
    writeScope: ['openspec/'],
    toolGovernance: [
      'writes only governed coordination artifacts under openspec/',
      'does not implement product code or delegate further',
      'uses append-only tasks.md updates during convergence',
    ],
    verification: [
      'checks task coverage, ordering, ownership, and verification steps',
    ],
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
    scope: 'fast bounded implementation and mechanical archive closeout',
    responsibility:
      'Implement narrow changes or mechanically archive a fully verified SDD change.',
    toolGovernance: [
      'edits only bounded targets',
      'escalates when discovery or correctness risk exceeds the assignment',
      'archives only from a passing verify-report.md and never interprets unresolved requirements',
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
