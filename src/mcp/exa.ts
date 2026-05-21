import type { LocalMcpConfig } from './types';

/**
 * Exa AI web search - real-time web search
 * @see https://exa.ai/docs/reference/exa-mcp
 */
export const exa: LocalMcpConfig = {
  type: 'local',
  command: ['npx', '-y', 'exa-mcp-server'],
};
