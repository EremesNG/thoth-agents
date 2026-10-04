import type {
  AgentDispatchMethod,
  AgentRoleName,
} from '../harness/core/agent-pack';
import { piSpecialistName } from '../harness/pi-specialists';
import type { HarnessCapabilities, HarnessId } from '../harness/types';

export type AgentPromptRole = AgentRoleName;

export interface LifecycleNomenclature {
  freshDelegation: string;
  sameAssignmentContinuation: string;
  independentContext: string;
  statusAction: string;
  terminalState: string;
  nonterminalState: string;
  sameSessionProbe: string;
  enforcement: 'runtime-supported' | 'instruction-only' | 'unknown';
}

export interface ToolNomenclature {
  delegationTool: string;
  backgroundDelegationTool?: string;
  backgroundStatusTool?: string;
  backgroundWaitInstruction?: string;
  userQuestionTool: string;
  progressTool?: string;
  hostStatusSurface?: string;
  lifecycle: LifecycleNomenclature;
  roleReference(role: AgentPromptRole): string;
}

export interface CapabilityProfile {
  capabilities: HarnessCapabilities;
  renderCapabilityDisclosure(
    capability: keyof HarnessCapabilities,
  ): string | undefined;
}

export interface HarnessPromptDialect {
  harness: HarnessId;
  tools: ToolNomenclature;
  capabilities: CapabilityProfile;
  dispatchLabel(method: AgentDispatchMethod): string;
  renderRoleInvocation(role: AgentPromptRole): string;
}

const OPENCODE_CAPABILITIES: HarnessCapabilities = {
  agentDefinitions: 'supported',
  delegatedExecution: 'supported',
  parallelDelegation: 'supported',
  runtimeHooks: 'supported',
  mcpConfiguration: 'supported',
  skillPackaging: 'supported',
  rolePermissions: 'supported',
  parentContextInjection: 'supported',
  memoryGovernanceEnforcement: 'supported',
};

export const CODEX_PROMPT_CAPABILITIES: HarnessCapabilities = {
  agentDefinitions: 'supported',
  delegatedExecution: 'supported',
  parallelDelegation: 'supported',
  runtimeHooks: 'unknown',
  mcpConfiguration: 'supported',
  skillPackaging: 'supported',
  rolePermissions: 'instruction-only',
  parentContextInjection: 'instruction-only',
  memoryGovernanceEnforcement: 'instruction-only',
};

export const CLAUDE_CODE_PROMPT_CAPABILITIES: HarnessCapabilities = {
  agentDefinitions: 'supported',
  delegatedExecution: 'supported',
  parallelDelegation: 'supported',
  runtimeHooks: 'supported',
  mcpConfiguration: 'supported',
  skillPackaging: 'supported',
  rolePermissions: 'supported',
  parentContextInjection: 'supported',
  memoryGovernanceEnforcement: 'instruction-only',
};

export const PI_PROMPT_CAPABILITIES: HarnessCapabilities = {
  agentDefinitions: 'supported',
  delegatedExecution: 'supported',
  parallelDelegation: 'supported',
  runtimeHooks: 'conditional',
  mcpConfiguration: 'adapter-backed',
  skillPackaging: 'supported',
  rolePermissions: 'supported',
  parentContextInjection: 'supported',
  memoryGovernanceEnforcement: 'instruction-only',
};

function supportedCapabilityProfile(
  capabilities: HarnessCapabilities,
): CapabilityProfile {
  return {
    capabilities,
    renderCapabilityDisclosure: () => undefined,
  };
}

function codexCapabilityDisclosure(
  capability: keyof HarnessCapabilities,
): string | undefined {
  const status = CODEX_PROMPT_CAPABILITIES[capability];

  if (status === 'supported') {
    return undefined;
  }

  if (status === 'unknown') {
    return `${capability}: unknown in Codex; treat related behavior as diagnostic-only unless the active Codex host documents support.`;
  }

  return `${capability}: ${status} in Codex; preserve the role responsibility as prompt guidance because equivalent runtime enforcement is not guaranteed.`;
}

function claudeCodeCapabilityDisclosure(
  capability: keyof HarnessCapabilities,
): string | undefined {
  const status = CLAUDE_CODE_PROMPT_CAPABILITIES[capability];

  if (status === 'supported') {
    return undefined;
  }

  return `${capability}: ${status} in Claude Code; installed provider guidance owns provider-dependent enforcement and mechanics.`;
}

function piCapabilityDisclosure(
  capability: keyof HarnessCapabilities,
): string | undefined {
  const status = PI_PROMPT_CAPABILITIES[capability];
  if (status === 'supported') return undefined;
  return `${capability}: ${status} in Pi; Pi extensions run with the invoking user's system permissions, and child selection through tools, disallowed_tools, configuration and native subagent_* exclusions is runtime-verified registry filtering; behavioral role limits are instruction-level, not an OS, filesystem, process, network, or credential sandbox.`;
}

export const OPENCODE_PROMPT_DIALECT: HarnessPromptDialect = {
  harness: 'opencode',
  tools: {
    delegationTool: 'task',
    backgroundDelegationTool: 'task(background=true)',
    backgroundStatusTool: 'task_status',
    userQuestionTool: 'question',
    progressTool: 'todowrite',
    hostStatusSurface: 'task_status',
    lifecycle: {
      freshDelegation: '`task` without `task_id`',
      sameAssignmentContinuation: '`task` with the prior `task_id`',
      independentContext:
        'omitting `task_id` creates an isolated child session',
      statusAction: 'wait, poll, and collect',
      terminalState: 'terminal task_status result',
      nonterminalState: 'nonterminal task_status result',
      sameSessionProbe: 'task_status on the same task session',
      enforcement: 'runtime-supported',
    },
    roleReference: (role) => `@${role}`,
  },
  capabilities: supportedCapabilityProfile(OPENCODE_CAPABILITIES),
  dispatchLabel(method) {
    switch (method) {
      case 'root-coordinator':
        return 'root coordinator';
      case 'task':
        return 'task';
    }
  },
  renderRoleInvocation(role) {
    return `@${role}`;
  },
};

export const CODEX_PROMPT_DIALECT: HarnessPromptDialect = {
  harness: 'codex',
  tools: {
    delegationTool: 'collaboration.spawn_agent',
    backgroundDelegationTool: 'collaboration.spawn_agent',
    backgroundStatusTool: 'collaboration.wait_agent',
    userQuestionTool: 'request_user_input',
    progressTool: 'functions.update_plan',
    hostStatusSurface: 'collaboration.list_agents',
    lifecycle: {
      freshDelegation: '`collaboration.spawn_agent` with `fork_turns="none"`',
      sameAssignmentContinuation:
        '`collaboration.followup_task` for the existing agent',
      independentContext:
        '`fork_turns="none"` prevents parent-history inheritance',
      statusAction: 'wait and inspect status',
      terminalState: 'terminal mailbox completion or failure update',
      nonterminalState: 'collaboration.wait_agent timeout or silence',
      sameSessionProbe: 'collaboration.list_agents on the same task path',
      enforcement: 'runtime-supported',
    },
    roleReference: (role) => `${role} role agent`,
  },
  capabilities: {
    capabilities: CODEX_PROMPT_CAPABILITIES,
    renderCapabilityDisclosure: codexCapabilityDisclosure,
  },
  dispatchLabel(method) {
    switch (method) {
      case 'root-coordinator':
        return 'ambient Codex root session coordinator';
      case 'task':
        return 'collaboration.spawn_agent';
    }
  },
  renderRoleInvocation(role) {
    return role === 'orchestrator'
      ? 'orchestrator role agent'
      : `${role} subagent`;
  },
};

/**
 * Claude Code registers plugin subagents under the plugin name as a namespace,
 * so the `subagent_type` for delegation is `thoth-agents:<role>`, not the bare
 * role name. This must match the plugin manifest `name`.
 */
export const CLAUDE_CODE_SUBAGENT_NAMESPACE = 'thoth-agents';

export function claudeCodeSubagentType(role: AgentPromptRole): string {
  return `${CLAUDE_CODE_SUBAGENT_NAMESPACE}:${role}`;
}

export const CLAUDE_CODE_PROMPT_DIALECT: HarnessPromptDialect = {
  harness: 'claude',
  tools: {
    delegationTool: 'Agent',
    backgroundDelegationTool: 'Agent(run_in_background=true)',
    backgroundStatusTool: 'TaskOutput',
    userQuestionTool: 'AskUserQuestion',
    progressTool: 'TodoWrite',
    hostStatusSurface: 'TodoWrite',
    lifecycle: {
      freshDelegation: 'a normal `Agent` invocation',
      sameAssignmentContinuation: '`SendMessage` to the prior agent ID',
      independentContext: 'do not use `fork` for independent work',
      statusAction: 'wait, inspect, and collect',
      terminalState: 'terminal TaskOutput result',
      nonterminalState: 'nonterminal TaskOutput result',
      sameSessionProbe: 'TaskOutput on the same task session',
      enforcement: 'runtime-supported',
    },
    roleReference: (role) =>
      role === 'orchestrator'
        ? 'the main-thread orchestrator'
        : `Agent(subagent_type: ${claudeCodeSubagentType(role)})`,
  },
  capabilities: {
    capabilities: CLAUDE_CODE_PROMPT_CAPABILITIES,
    renderCapabilityDisclosure: claudeCodeCapabilityDisclosure,
  },
  dispatchLabel(method) {
    switch (method) {
      case 'root-coordinator':
        return 'main-session coordinator';
      case 'task':
        return 'Agent tool';
    }
  },
  renderRoleInvocation(role) {
    // Plugin subagents are namespaced: delegate with subagent_type
    // `thoth-agents:<role>`. The orchestrator is the main thread, not a delegate.
    return role === 'orchestrator'
      ? 'main-thread orchestrator'
      : claudeCodeSubagentType(role);
  },
};

export const PI_PROMPT_DIALECT: HarnessPromptDialect = {
  harness: 'pi',
  tools: {
    delegationTool: 'subagent_run',
    backgroundDelegationTool:
      'subagent_run({ agent, task, mode: "background" })',
    backgroundStatusTool: 'subagent_status({ task_id })',
    backgroundWaitInstruction:
      'Launch separate background runs with `subagent_run({ agent, task, mode: "background" })` before collecting results. Native terminal notifications (`triggerTurn`/`followUp`) wake the parent. Do not poll status or sleep merely to wait. When `enable_ask_orchestrator` is true, children receive `ask_orchestrator` regardless of `tools` selection unless denied by `disallowed_tools`; Thoth Oracle denies `ask_orchestrator` for independent judgment. A task-mode child that asks a question is moved to background; answer it with `subagent_reply` and collect its result later through terminal completion.',
    userQuestionTool: 'ask_user_question',
    hostStatusSurface: 'subagent_status({ task_id })',
    lifecycle: {
      freshDelegation:
        '`subagent_run` with one canonical `agent`, a fresh bounded `task`, and an explicit `mode` of `"task"` or `"background"`',
      sameAssignmentContinuation:
        '`subagent_reply({ task_id, request_id?, message })` for an injected `subagent-question` when exposed; `subagent_send_message` only when exposed and its schema is confirmed; `subagent_continue` is unavailable unless `enable_continue` is explicitly enabled',
      independentContext:
        'a new objective, phase, mutable surface, or independent judgment uses a fresh `subagent_run`; optional `context` is plain supporting text, not a context-mode selector',
      statusAction:
        '`subagent_status`, `subagent_result`, or `subagent_cancel` by `task_id`',
      terminalState:
        'a native terminal completion notification or terminal task-id result',
      nonterminalState:
        'waiting for an orchestrator reply, an injected `subagent-question`, running, queued, timed-out, malformed, message-accepted, or cancellation-acknowledged state',
      sameSessionProbe:
        '`subagent_status({ task_id })` for the current parent-owned assignment',
      enforcement: 'runtime-supported',
    },
    roleReference: (role) =>
      role === 'orchestrator'
        ? 'the ambient Pi root'
        : `subagent_run({ agent: "${piSpecialistName(role)}", task: "…", mode: "${role === 'librarian' ? 'background' : 'task'}" })`,
  },
  capabilities: {
    capabilities: PI_PROMPT_CAPABILITIES,
    renderCapabilityDisclosure: piCapabilityDisclosure,
  },
  dispatchLabel(method) {
    switch (method) {
      case 'root-coordinator':
        return 'ambient Pi root session coordinator';
      case 'task':
        return 'subagent_run';
    }
  },
  renderRoleInvocation(role) {
    return role === 'orchestrator'
      ? 'ambient Pi root'
      : `subagent_run({ agent: "${piSpecialistName(role)}", task: "…", mode: "${role === 'librarian' ? 'background' : 'task'}" })`;
  },
};

export function getPromptDialect(harness: HarnessId): HarnessPromptDialect;
export function getPromptDialect(harness: string): HarnessPromptDialect;
export function getPromptDialect(harness: string): HarnessPromptDialect {
  if (harness === 'opencode') {
    return OPENCODE_PROMPT_DIALECT;
  }

  if (harness === 'codex') {
    return CODEX_PROMPT_DIALECT;
  }

  if (harness === 'claude') {
    return CLAUDE_CODE_PROMPT_DIALECT;
  }

  if (harness === 'pi') {
    return PI_PROMPT_DIALECT;
  }

  throw new Error(`Unsupported prompt dialect: ${harness}`);
}
