import type { AgentConfig } from '@opencode-ai/sdk/v2';
import { getAgentConfigs } from '../../agents';
import type { PluginConfig } from '../../config';
import type {
  HarnessAdapter,
  HarnessCapabilities,
  HarnessRenderContext,
  HarnessRenderResult,
} from '../types';

export type OpenCodeAgentConfigs = Record<string, AgentConfig>;

export interface OpenCodeRenderContext extends HarnessRenderContext {
  config?: PluginConfig;
}

export const OPENCODE_CAPABILITIES: HarnessCapabilities = {
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

export function renderOpenCodeAgentConfigs(
  config?: PluginConfig,
): OpenCodeAgentConfigs {
  return getAgentConfigs(config);
}

function hasOpenCodeConfig(
  context: HarnessRenderContext,
): context is OpenCodeRenderContext {
  return 'config' in context;
}

export const opencodeAdapter: HarnessAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  capabilities: OPENCODE_CAPABILITIES,
  render(context): HarnessRenderResult {
    const config = hasOpenCodeConfig(context) ? context.config : undefined;
    const agents = renderOpenCodeAgentConfigs(config);

    return {
      harness: 'opencode',
      artifacts: [
        {
          harness: 'opencode',
          kind: 'agent-config',
          path: 'opencode.agent.config.json',
          description:
            'Current OpenCode AgentConfig output rendered through the harness adapter boundary.',
          content: JSON.stringify(agents, null, 2),
        },
      ],
      diagnostics: [],
    };
  },
};
