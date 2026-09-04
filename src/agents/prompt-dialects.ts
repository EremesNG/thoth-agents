import type {
  AgentDispatchMethod,
  AgentRoleName,
} from '../harness/core/agent-pack';
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
  userQuestionTool: string;
  progressTool: string;
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
  return `${capability}: ${status} in Pi; Pi extensions run with the invoking user's system permissions, and child tool allowlists are role controls rather than an OS, filesystem, process, network, or credential sandbox.`;
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
      case 'synchronous-task-only':
        return 'synchronous task only';
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
      case 'synchronous-task-only':
        return 'synchronous collaboration.spawn_agent only';
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
      case 'synchronous-task-only':
        return 'synchronous Agent only';
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
    backgroundDelegationTool: 'subagent_run(background=true)',
    backgroundStatusTool: 'subagent_status / subagent_result / subagent_list',
    userQuestionTool: 'ask_user',
    progressTool: 'subagent_status',
    hostStatusSurface: 'subagent_list',
    lifecycle: {
      freshDelegation:
        '`subagent_run` with one exact canonical `agent` and no deprecated batch input',
      sameAssignmentContinuation:
        '`subagent_status`, `subagent_result`, or `subagent_list`; use `subagent_send_message` only when the active SDK confirms live steering, and `subagent_continue` only when continuation is explicitly enabled',
      independentContext:
        'a new objective, phase, mutable surface, or independent judgment starts a fresh `subagent_run` task',
      statusAction: 'inspect status, collect terminal results, or cancel',
      terminalState: 'a terminal subagent_result outcome',
      nonterminalState:
        'running, queued, timed-out, malformed, or merely message-accepted state',
      sameSessionProbe: 'subagent_status for the current parent-owned task ID',
      enforcement: 'runtime-supported',
    },
    roleReference: (role) =>
      role === 'orchestrator'
        ? 'the ambient Pi root'
        : `subagent_run(agent: "${role}")`,
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
      case 'synchronous-task-only':
        return 'single-agent subagent_run';
    }
  },
  renderRoleInvocation(role) {
    return role === 'orchestrator'
      ? 'ambient Pi root'
      : `subagent_run(agent: "${role}")`;
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
