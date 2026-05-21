import type { RemoteMcpConfig } from './types';

/**
 * grep.app - ultra-fast code search across GitHub repositories
 * @see https://grep.app
 */
export const GREP_APP_MCP_URL = 'https://mcp.grep.app';

export const grep_app: RemoteMcpConfig = {
  type: 'remote',
  url: GREP_APP_MCP_URL,
  oauth: false,
};
