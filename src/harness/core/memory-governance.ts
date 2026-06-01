import type { HarnessPromptDialect } from '../../agents/prompt-dialects';
import type { HarnessCapabilityStatus, HarnessDiagnostic } from '../types';
import type { AgentRoleContract, AgentRoleName } from './agent-pack';

export type MemoryToolName =
  | 'mem_save'
  | 'mem_recall'
  | 'mem_context'
  | 'mem_get'
  | 'mem_project'
  | 'mem_session';

export type MemSaveKind =
  | 'observation'
  | 'prompt'
  | 'session_summary'
  | 'passive_learnings';
export type MemSessionAction = 'start' | 'checkpoint' | 'summary';
export type MemRecallMode = 'compact' | 'context';
export type MemProjectAction =
  | 'list'
  | 'summary'
  | 'graph'
  | 'topics'
  | 'topic';

export type MemoryOperation =
  | { tool: 'mem_session'; action: MemSessionAction }
  | { tool: 'mem_save'; kind: MemSaveKind }
  | { tool: 'mem_recall'; mode: MemRecallMode }
  | { tool: 'mem_get'; includeTimeline?: boolean }
  | { tool: 'mem_context'; recallQuery?: boolean }
  | { tool: 'mem_project'; action: MemProjectAction };

export type RootOwnedMemoryOperation =
  | { tool: 'mem_session'; action: MemSessionAction }
  | { tool: 'mem_save'; kind: 'prompt' | 'session_summary' };

export type MemoryRuntimeEnforcement = 'runtime' | 'instruction-only';

export interface RoleMemoryGovernance {
  role: AgentRoleName;
  rootOwnedOperations: RootOwnedMemoryOperation[];
  allowedTools: MemoryToolName[];
  forbiddenTools: MemoryToolName[];
  requiresParentContext: boolean;
  mayReadProjectMemory: boolean;
  mayWriteDurableObservations: boolean;
  protectsSddNamespace: boolean;
  rules: string[];
}

export interface MemoryGovernanceContract {
  rootOwnedOperations: RootOwnedMemoryOperation[];
  readRecallChain: MemoryOperation[];
  writeCapableDelegatedTools: MemoryToolName[];
  protectedTopicNamespaces: string[];
  roles: RoleMemoryGovernance[];
}

export interface MemoryGovernanceDiagnosticInput {
  harness: string;
  permissionControls: HarnessCapabilityStatus;
  parentContextInjection: HarnessCapabilityStatus;
  memoryWriteControls: HarnessCapabilityStatus;
}

export const ROOT_OWNED_OPERATIONS: RootOwnedMemoryOperation[] = [
  { tool: 'mem_session', action: 'start' },
  { tool: 'mem_session', action: 'checkpoint' },
  { tool: 'mem_session', action: 'summary' },
  { tool: 'mem_save', kind: 'prompt' },
  { tool: 'mem_save', kind: 'session_summary' },
];

export const READ_RECALL_CHAIN: MemoryOperation[] = [
  { tool: 'mem_recall', mode: 'compact' },
  { tool: 'mem_recall', mode: 'context' },
  { tool: 'mem_get' },
];

export const PARENT_SCOPED_READ_TOOLS: MemoryToolName[] = [
  'mem_recall',
  'mem_context',
  'mem_get',
  'mem_project',
];

export const WRITE_CAPABLE_DELEGATED_TOOLS: MemoryToolName[] = [
  ...PARENT_SCOPED_READ_TOOLS,
  'mem_save',
];

export const ALL_MEMORY_TOOLS: MemoryToolName[] = [
  'mem_save',
  'mem_recall',
  'mem_context',
  'mem_get',
  'mem_project',
  'mem_session',
];

function uniqueTools(tools: MemoryToolName[]): MemoryToolName[] {
  return [...new Set(tools)];
}

function roleAllowedTools(role: AgentRoleContract): MemoryToolName[] {
  if (role.name === 'orchestrator') {
    return [...ALL_MEMORY_TOOLS];
  }

  if (role.mode === 'read-only') {
    return [...PARENT_SCOPED_READ_TOOLS];
  }

  return uniqueTools([...WRITE_CAPABLE_DELEGATED_TOOLS]);
}

function roleRules(role: AgentRoleContract): string[] {
  const sharedSubagentRules = [
    'Every subagent memory call requires the parent session_id and project from dispatch; if either is missing, do not call thoth-mem.',
    'Delegated handoff recovery uses the parent-scoped recall funnel: mem_recall(mode="compact") -> mem_recall(mode="context") -> mem_get(...) before memory content is treated as source material.',
    'Use mem_get(include_timeline=true) when chronology around a recovered record matters.',
    'mem_context(recall_query=...) and bounded mem_project(action="graph"|"topics"|"topic") are supplemental project context only and do not replace the recall funnel.',
    'Report missing, stale, contradictory, or insufficient recalled context instead of guessing through it.',
    'Never own mem_session(action="start"|"checkpoint"|"summary") or mem_save(kind="prompt"|"session_summary"); those operations are root/orchestrator-owned.',
    'Never save generated subagent prompts as user intent.',
    'Protect the sdd/* topic namespace; SDD artifacts may use deterministic sdd/{change}/{artifact} topic keys only in persistence modes that include thoth-mem.',
  ];

  if (role.name === 'orchestrator') {
    return [
      'mem_session(action="start"|"checkpoint"|"summary"), mem_save(kind="prompt"), and mem_save(kind="session_summary") are root/main orchestrator-owned operations and responsibilities.',
      'In harnesses without an orchestrator-named agent, root/main orchestrator-owned means the initial/root agent when the harness does not expose an orchestrator-named agent.',
      'Before delegation, save or refresh the handoff body with root-owned mem_session(action="summary") or mem_save(kind="session_summary") when available; otherwise disclose that compaction could not be persisted.',
      'Dispatch task instructions plus recovery instructions, not the handoff body, raw transcripts, or generated subagent prompts.',
      'Dispatch parent session_id and project when authorizing subagent memory use.',
      'Root recall uses mem_recall(mode="compact") -> mem_recall(mode="context") -> mem_get(...); use mem_context(recall_query=...) and bounded mem_project(action="graph"|"topics"|"topic") for supplemental context.',
      'Protect the sdd/* topic namespace and write SDD memory artifacts only in thoth-mem or hybrid persistence modes.',
    ];
  }

  if (role.mode === 'read-only') {
    return [
      ...sharedSubagentRules,
      'Read-only agents may use only parent-scoped mem_recall, mem_context, mem_get, and bounded mem_project reads when authorized.',
      'Project-scoped read tools require explicit delegated permission and must stay bounded to the parent session/project scope.',
      'Read-only agents must never write durable memory or save prompts.',
    ];
  }

  return [
    ...sharedSubagentRules,
    'Write-capable agents may use the same parent-scoped reads as read-only agents when authorized.',
    'mem_save(kind="observation") is allowed only for delegated durable observations or assigned deterministic SDD artifacts/apply-progress under the parent session/project.',
    'Project-scoped read tools require explicit delegated permission and must stay bounded to the parent session/project scope.',
  ];
}

export function getRoleMemoryGovernance(
  role: AgentRoleContract,
): RoleMemoryGovernance {
  const allowedTools = roleAllowedTools(role);

  return {
    role: role.name,
    rootOwnedOperations: [...ROOT_OWNED_OPERATIONS],
    allowedTools,
    forbiddenTools: ALL_MEMORY_TOOLS.filter(
      (tool) => !allowedTools.includes(tool),
    ),
    requiresParentContext: role.name !== 'orchestrator',
    mayReadProjectMemory: true,
    mayWriteDurableObservations: role.mode === 'write-capable',
    protectsSddNamespace: true,
    rules: roleRules(role),
  };
}

export function getMemoryGovernanceContract(
  roles: readonly AgentRoleContract[],
): MemoryGovernanceContract {
  return {
    rootOwnedOperations: [...ROOT_OWNED_OPERATIONS],
    readRecallChain: [...READ_RECALL_CHAIN],
    writeCapableDelegatedTools: [...WRITE_CAPABLE_DELEGATED_TOOLS],
    protectedTopicNamespaces: ['sdd/*'],
    roles: roles.map(getRoleMemoryGovernance),
  };
}

export function renderMemoryGovernanceInstructions(
  role: AgentRoleContract,
  dialect?: HarnessPromptDialect,
): string {
  const governance = getRoleMemoryGovernance(role);
  const harnessRules = dialect
    ? [
        `- Harness wording: use ${dialect.renderRoleInvocation('orchestrator')} as the memory owner and \`${dialect.tools.userQuestionTool}\` for blocking memory-context questions.`,
        `- Progress ownership remains with the coordinator; report memory-governance verification for tracking in ${dialect.tools.progressTool}.`,
      ]
    : [];

  return [
    'thoth-mem governance:',
    ...governance.rules.map((rule) => `- ${rule}`),
    ...harnessRules,
    `- Runtime enforcement: ${role.name === 'orchestrator' ? 'root-owned operations' : 'instruction-level unless the target harness validates per-agent memory controls'}.`,
  ].join('\n');
}

export function memoryGovernanceDiagnostics(
  input: MemoryGovernanceDiagnosticInput,
): HarnessDiagnostic[] {
  const diagnostics: HarnessDiagnostic[] = [];

  if (input.permissionControls !== 'supported') {
    diagnostics.push({
      severity: 'warning',
      code: `${input.harness}.permission.memory.enforcement_gap`,
      message:
        'Runtime controls for root-owned memory operations are unavailable; governance is rendered as instruction-level guidance.',
      harness: input.harness,
      capability: 'rolePermissions',
      fallback: 'instruction-only',
    });
  }

  if (input.parentContextInjection !== 'supported') {
    diagnostics.push({
      severity:
        input.parentContextInjection === 'unknown' ? 'error' : 'warning',
      code: `${input.harness}.context.parent_injection.unvalidated`,
      message:
        'Parent session_id/project injection is not runtime-enforced; subagents must be instructed not to use memory without explicit dispatch context and handoff recovery instructions.',
      harness: input.harness,
      capability: 'parentContextInjection',
      fallback: 'instruction-only',
    });
  }

  if (input.memoryWriteControls !== 'supported') {
    diagnostics.push({
      severity: 'warning',
      code: `${input.harness}.permission.memory_write.enforcement_gap`,
      message:
        'Runtime controls for delegated memory writes are unavailable; write-capable agents receive instruction-level mem_save(kind="observation") limits for durable observations and deterministic SDD artifacts only.',
      harness: input.harness,
      capability: 'memoryGovernanceEnforcement',
      fallback: 'instruction-only',
    });
  }

  return diagnostics;
}
