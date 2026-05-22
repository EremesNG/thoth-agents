import type {
  AgentDispatchMethod,
  AgentRoleName,
} from '../harness/core/agent-pack';
import type { HarnessCapabilities, HarnessId } from '../harness/types';

export type AgentPromptRole = AgentRoleName;

export interface ToolNomenclature {
  delegationTool: string;
  backgroundDelegationTool?: string;
  backgroundStatusTool?: string;
  userQuestionTool: string;
  progressTool: string;
  hostStatusSurface?: string;
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
  delegatedExecution: 'instruction-only',
  parallelDelegation: 'instruction-only',
  runtimeHooks: 'unknown',
  mcpConfiguration: 'supported',
  skillPackaging: 'supported',
  rolePermissions: 'instruction-only',
  parentContextInjection: 'instruction-only',
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

export const OPENCODE_PROMPT_DIALECT: HarnessPromptDialect = {
  harness: 'opencode',
  tools: {
    delegationTool: 'task',
    backgroundDelegationTool: 'task(background=true)',
    backgroundStatusTool: 'task_status',
    userQuestionTool: 'question',
    progressTool: 'todowrite',
    hostStatusSurface: 'task_status',
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
    delegationTool: 'Codex custom-agent task',
    backgroundDelegationTool: 'Codex background role-agent run',
    backgroundStatusTool: 'Codex host status surface',
    userQuestionTool: 'request_user_input',
    progressTool: 'Codex progress tracking surface',
    hostStatusSurface: 'Codex host status surface',
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
        return 'Codex custom-agent task';
      case 'synchronous-task-only':
        return 'synchronous Codex custom-agent task only';
    }
  },
  renderRoleInvocation(role) {
    return role === 'orchestrator'
      ? 'orchestrator role agent'
      : `${role} subagent`;
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

  throw new Error(`Unsupported prompt dialect: ${harness}`);
}
