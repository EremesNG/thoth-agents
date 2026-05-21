import type { McpName, ThothConfig } from '../config';
import { context7 } from './context7';
import { exa } from './exa';
import { grep_app } from './grep-app';
import { createThothMcp } from './thoth';
import type { McpConfig } from './types';

export type { LocalMcpConfig, McpConfig, RemoteMcpConfig } from './types';

function createAllBuiltinMcps(
  thothConfig?: ThothConfig,
): Record<McpName, McpConfig> {
  return {
    exa,
    context7,
    grep_app,
    thoth_mem: createThothMcp(thothConfig),
  };
}

/**
 * Creates MCP configurations, excluding disabled ones
 */
export function createBuiltinMcps(
  disabledMcps: readonly string[] = [],
  thothConfig?: ThothConfig,
): Record<string, McpConfig> {
  const allBuiltinMcps = createAllBuiltinMcps(thothConfig);

  return Object.fromEntries(
    Object.entries(allBuiltinMcps).filter(
      ([name]) => !disabledMcps.includes(name),
    ),
  );
}
