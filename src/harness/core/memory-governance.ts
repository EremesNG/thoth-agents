import type { HarnessPromptDialect } from '../../agents/prompt-dialects';
import type { HarnessCapabilityStatus, HarnessDiagnostic } from '../types';
import type { AgentRoleContract, AgentRoleName } from './agent-pack';

export type MemoryToolName =
  | 'mem_session_start'
  | 'mem_session_summary'
  | 'mem_save_prompt'
  | 'mem_search'
  | 'mem_timeline'
  | 'mem_get_observation'
  | 'mem_context'
  | 'mem_project_summary'
  | 'mem_project_graph'
  | 'mem_topic_keys'
  | 'mem_suggest_topic_key'
  | 'mem_save';

export type MemoryRuntimeEnforcement = 'runtime' | 'instruction-only';

export interface RoleMemoryGovernance {
  role: AgentRoleName;
  rootOwnedTools: MemoryToolName[];
  allowedTools: MemoryToolName[];
  forbiddenTools: MemoryToolName[];
  requiresParentContext: boolean;
  mayReadProjectMemory: boolean;
  mayWriteDurableObservations: boolean;
  protectsSddNamespace: boolean;
  rules: string[];
}

export interface MemoryGovernanceContract {
  rootOwnedTools: MemoryToolName[];
  readRecallChain: MemoryToolName[];
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

const ROOT_OWNED_TOOLS: MemoryToolName[] = [
  'mem_session_start',
  'mem_session_summary',
  'mem_save_prompt',
];

const READ_RECALL_CHAIN: MemoryToolName[] = [
  'mem_search',
  'mem_timeline',
  'mem_get_observation',
];

const BOUNDED_CONTEXT_TOOLS: MemoryToolName[] = [
  'mem_context',
  'mem_project_summary',
  'mem_project_graph',
  'mem_topic_keys',
];

const WRITE_CAPABLE_DELEGATED_TOOLS: MemoryToolName[] = [
  'mem_save',
  'mem_search',
  'mem_get_observation',
  'mem_timeline',
  ...BOUNDED_CONTEXT_TOOLS,
  'mem_suggest_topic_key',
];

const ALL_MEMORY_TOOLS: MemoryToolName[] = [
  ...ROOT_OWNED_TOOLS,
  ...READ_RECALL_CHAIN,
  ...BOUNDED_CONTEXT_TOOLS,
  'mem_suggest_topic_key',
  'mem_save',
];

function uniqueTools(tools: MemoryToolName[]): MemoryToolName[] {
  return [...new Set(tools)];
}

function roleAllowedTools(role: AgentRoleContract): MemoryToolName[] {
  if (role.name === 'orchestrator') {
    return uniqueTools([...ROOT_OWNED_TOOLS, ...WRITE_CAPABLE_DELEGATED_TOOLS]);
  }

  if (role.mode === 'read-only') {
    return [...READ_RECALL_CHAIN, ...BOUNDED_CONTEXT_TOOLS];
  }

  return [...WRITE_CAPABLE_DELEGATED_TOOLS];
}

function roleRules(role: AgentRoleContract): string[] {
  const sharedSubagentRules = [
    'Every subagent memory call requires the parent session_id and project from dispatch; if either is missing, do not call thoth-mem.',
    'Delegated handoff recovery uses parent-scoped 3-layer recall with mem_search -> mem_timeline -> mem_get_observation before memory content is treated as source material.',
    'Report missing, stale, contradictory, or insufficient recalled context instead of guessing through it.',
    'Never call mem_session_start, mem_session_summary, or mem_save_prompt; those tools are root/orchestrator-owned.',
    'Never save generated subagent prompts as user intent.',
    'Protect the sdd/* topic namespace; SDD artifacts may use deterministic sdd/{change}/{artifact} topic keys only in persistence modes that include thoth-mem.',
  ];

  if (role.name === 'orchestrator') {
    return [
      'mem_session_start, mem_session_summary, and mem_save_prompt are root/main orchestrator-owned tools and responsibilities.',
      'In harnesses without an orchestrator-named agent, root/main orchestrator-owned means the initial/root agent when the harness does not expose an orchestrator-named agent.',
      'Before delegation, save or refresh the handoff body with root-owned mem_session_summary when available; otherwise disclose that compaction could not be persisted.',
      'Dispatch task instructions plus recovery instructions, not the handoff body, raw transcripts, or generated subagent prompts.',
      'Dispatch parent session_id and project when authorizing subagent memory use.',
      'Protect the sdd/* topic namespace and write SDD memory artifacts only in thoth-mem or hybrid persistence modes.',
    ];
  }

  if (role.mode === 'read-only') {
    return [
      ...sharedSubagentRules,
      'Read-only agents may only perform bounded, project-scoped recall with mem_search -> mem_timeline -> mem_get_observation when authorized.',
      'Bounded context tools mem_context, mem_project_summary, mem_project_graph, and mem_topic_keys are allowed only with explicit delegated permission and parent session/project scope.',
      'Project-scoped read tools require explicit delegated permission.',
      'Read-only agents must never write durable memory.',
    ];
  }

  return [
    ...sharedSubagentRules,
    'Write-capable agents may call mem_save only for delegated durable observations or assigned deterministic SDD artifacts/apply-progress under the parent session/project.',
    'For reads, use only mem_search -> mem_timeline -> mem_get_observation.',
    'Bounded context tools mem_context, mem_project_summary, mem_project_graph, and mem_topic_keys are allowed only with explicit delegated permission and parent session/project scope.',
    'Project-scoped read tools require explicit delegated permission.',
  ];
}

export function getRoleMemoryGovernance(
  role: AgentRoleContract,
): RoleMemoryGovernance {
  const allowedTools = roleAllowedTools(role);

  return {
    role: role.name,
    rootOwnedTools: [...ROOT_OWNED_TOOLS],
    allowedTools,
    forbiddenTools: ALL_MEMORY_TOOLS.filter(
      (tool) => !allowedTools.includes(tool),
    ),
    requiresParentContext: role.name !== 'orchestrator',
    mayReadProjectMemory: role.name !== 'orchestrator',
    mayWriteDurableObservations: role.mode === 'write-capable',
    protectsSddNamespace: true,
    rules: roleRules(role),
  };
}

export function getMemoryGovernanceContract(
  roles: readonly AgentRoleContract[],
): MemoryGovernanceContract {
  return {
    rootOwnedTools: [...ROOT_OWNED_TOOLS],
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
    `- Runtime enforcement: ${role.name === 'orchestrator' ? 'root-owned' : 'instruction-level unless the target harness validates per-agent memory controls'}.`,
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
        'Runtime controls for root-only memory tools are unavailable; governance is rendered as instruction-level guidance.',
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
        'Runtime controls for delegated memory writes are unavailable; write-capable agents receive instruction-level mem_save limits for durable observations and deterministic SDD artifacts only.',
      harness: input.harness,
      capability: 'memoryGovernanceEnforcement',
      fallback: 'instruction-only',
    });
  }

  return diagnostics;
}
