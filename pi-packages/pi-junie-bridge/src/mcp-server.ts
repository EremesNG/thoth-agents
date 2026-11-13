import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { Tool } from '@earendil-works/pi-ai';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool as McpTool,
} from '@modelcontextprotocol/sdk/types.js';

export const TOKEN_HEADER = 'x-pi-junie-token';
export type McpResult = Pick<CallToolResult, 'content' | 'isError'>;
export interface McpServerHandle {
  url: string;
  token: string;
  close(): Promise<void>;
}
export async function startMcpServer(deps: {
  getTools(): Tool[];
  onCall(name: string, args: Record<string, unknown>): Promise<McpResult>;
}): Promise<McpServerHandle> {
  const token = randomBytes(32).toString('hex');
  const servers = new Set<Server>();
  const http = createServer(async (req, res) => {
    try {
      const secret = req.headers[TOKEN_HEADER];
      if (
        typeof secret !== 'string' ||
        Buffer.byteLength(secret) !== Buffer.byteLength(token) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(token))
      ) {
        res.writeHead(403).end();
        return;
      }
      if (req.url !== '/mcp') {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1_000_000) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400).end();
        return;
      }
      // Stateless transport: each POST owns its SDK server until its response closes.
      const server = new Server(
        { name: 'pi', version: '0.1.0' },
        { capabilities: { tools: {} } },
      );
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      servers.add(server);
      res.on('close', () => {
        servers.delete(server);
        void server.close().catch(() => {});
      });
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: deps.getTools().map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters as McpTool['inputSchema'],
        })),
      }));
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (!deps.getTools().some((tool) => tool.name === request.params.name))
          return {
            content: [
              { type: 'text', text: `Unknown Pi tool: ${request.params.name}` },
            ],
            isError: true,
          };
        return deps.onCall(request.params.name, request.params.arguments ?? {});
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
      else res.end();
    }
  });
  http.requestTimeout = 30000;
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', () => {
      http.off('error', reject);
      resolve();
    });
  });
  const address = http.address();
  if (!address || typeof address === 'string')
    throw new Error('Junie MCP failed to bind loopback');
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    token,
    async close() {
      await Promise.all([...servers].map((server) => server.close()));
      await new Promise<void>((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()));
        http.closeAllConnections();
      });
    },
  };
}
