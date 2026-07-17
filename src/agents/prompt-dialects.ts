import type {
  AgentDispatchMethod,
  AgentRoleName,
} from '../harness/core/agent-pack';
import type { HarnessCapabilities, HarnessId } from '../harness/types';

export type AgentPromptRole = AgentRoleName;

export interface LifecycleNomenclature {
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
  memoryGovernanceEnforcement: 'supported',
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
    delegationTool: 'Task',
    backgroundDelegationTool: 'Task(run_in_background=true)',
    backgroundStatusTool: 'TaskOutput',
    userQuestionTool: 'AskUserQuestion',
    progressTool: 'TodoWrite',
    hostStatusSurface: 'TodoWrite',
    lifecycle: {
      statusAction: 'wait, poll, and collect',
      terminalState: 'terminal TaskOutput result',
      nonterminalState: 'nonterminal TaskOutput result',
      sameSessionProbe: 'TaskOutput on the same task session',
      enforcement: 'runtime-supported',
    },
    roleReference: (role) =>
      role === 'orchestrator'
        ? 'the main-thread orchestrator'
        : `Task(subagent_type: ${claudeCodeSubagentType(role)})`,
  },
  capabilities: supportedCapabilityProfile(CLAUDE_CODE_PROMPT_CAPABILITIES),
  dispatchLabel(method) {
    switch (method) {
      case 'root-coordinator':
        return 'main-session coordinator';
      case 'task':
        return 'Task tool';
      case 'synchronous-task-only':
        return 'synchronous Task only';
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

  throw new Error(`Unsupported prompt dialect: ${harness}`);
}
