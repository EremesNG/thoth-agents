import { networkInterfaces } from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { startMcpServer, TOKEN_HEADER } from '../src/mcp-server.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
const schema = {
  type: 'object',
  properties: { path: { type: 'string', pattern: '^/' } },
  required: ['path'],
  additionalProperties: false,
};

test('MCP bridge binds only loopback, rejects missing/wrong secrets, and preserves JSON Schema', async () => {
  const server = await startMcpServer({
    getTools: () => [
      { name: 'read', description: 'Read file', parameters: schema },
    ],
    onCall: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  });
  cleanups.push(server.close);
  expect(new URL(server.url).hostname).toBe('127.0.0.1');
  for (const address of Object.values(networkInterfaces()).flat()) {
    if (address?.family === 'IPv4' && !address.internal) {
      await expect(
        fetch(server.url.replace('127.0.0.1', address.address), {
          signal: AbortSignal.timeout(500),
        }),
      ).rejects.toThrow();
    }
  }
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  for (const token of ['', 'wrong']) {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TOKEN_HEADER]: token },
      body,
    });
    expect(response.status).toBe(403);
  }
  const response = await fetch(server.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      [TOKEN_HEADER]: server.token,
    },
    body,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    result: { tools: [{ name: 'read', inputSchema: schema }] },
  });
});

test('MCP rejects oversized/malformed bodies and unadvertised tools without dispatch', async () => {
  let dispatched = 0;
  const server = await startMcpServer({
    getTools: () => [],
    onCall: async () => {
      dispatched++;
      return { content: [] };
    },
  });
  cleanups.push(server.close);
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    [TOKEN_HEADER]: server.token,
  };
  expect(
    (
      await fetch(server.url, {
        method: 'POST',
        headers,
        body: 'x'.repeat(1_000_001),
      })
    ).status,
  ).toBe(413);
  expect(
    (await fetch(server.url, { method: 'POST', headers, body: '{bad' })).status,
  ).toBe(400);
  const response = await fetch(server.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'absent' },
    }),
  });
  expect(await response.json()).toMatchObject({ result: { isError: true } });
  expect(dispatched).toBe(0);
});
