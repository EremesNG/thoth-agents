import type { RemoteMcpConfig } from './types';

/**
 * Context7 - official documentation lookup for libraries
 * @see https://context7.com
 */
export const CONTEXT7_MCP_URL = 'https://mcp.context7.com/mcp';

export const context7: RemoteMcpConfig = {
  type: 'remote',
  url: CONTEXT7_MCP_URL,
  headers: process.env.CONTEXT7_API_KEY
    ? { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY }
    : undefined,
  oauth: false,
};
