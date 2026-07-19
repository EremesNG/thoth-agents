import type { McpName } from '../config';
import { context7 } from './context7';
import { exa } from './exa';
import { grep_app } from './grep-app';
import type { McpConfig } from './types';

export type { LocalMcpConfig, McpConfig, RemoteMcpConfig } from './types';

function createAllBuiltinMcps(): Record<McpName, McpConfig> {
  return {
    exa,
    context7,
    grep_app,
  };
}

/**
 * Creates MCP configurations, excluding disabled ones
 */
export function createBuiltinMcps(
  disabledMcps: readonly string[] = [],
): Record<string, McpConfig> {
  const allBuiltinMcps = createAllBuiltinMcps();

  return Object.fromEntries(
    Object.entries(allBuiltinMcps).filter(
      ([name]) => !disabledMcps.includes(name),
    ),
  );
}
