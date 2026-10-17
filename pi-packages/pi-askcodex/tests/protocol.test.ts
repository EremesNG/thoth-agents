import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ComputerUseElicitationMeta,
  JsonRpcResponse,
  ServerNotification,
  ServerRequest,
  ServerRequestHandler,
  ServerRequestResponse,
  ThreadTokenUsage,
  TurnStartParams,
} from '../src/protocol.js';

describe('frozen app-server contract', () => {
  it('supports the spike text input and complete token breakdown', () => {
    const params: TurnStartParams = {
      threadId: 'thread-1',
      input: [{ type: 'text', text: 'Hello', text_elements: [] }],
      effort: 'low',
    };
    const usage: ThreadTokenUsage = {
      total: {
        totalTokens: 15,
        inputTokens: 10,
        cachedInputTokens: 2,
        cacheWriteInputTokens: 0,
        outputTokens: 5,
        reasoningOutputTokens: 3,
      },
      last: {
        totalTokens: 15,
        inputTokens: 10,
        cachedInputTokens: 2,
        cacheWriteInputTokens: 0,
        outputTokens: 5,
        reasoningOutputTokens: 3,
      },
      modelContextWindow: null,
    };
    const event: ServerNotification = {
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: params.threadId,
        turnId: 'turn-1',
        tokenUsage: usage,
      },
    };
    expect(event.params.tokenUsage.last.reasoningOutputTokens).toBe(3);
  });

  it('narrows known server requests separately from unknown wire methods', async () => {
    const handler: ServerRequestHandler = async (req, { signal }) => {
      expect(signal.aborted).toBe(false);
      switch (req.method) {
        case 'mcpServer/elicitation/request':
          expectTypeOf(req.params.serverName).toEqualTypeOf<string>();
          return {
            action: 'accept',
            content: { persist: 'session' },
            _meta: null,
          };
        case 'item/commandExecution/requestApproval':
          expectTypeOf(req.params.command).toEqualTypeOf<
            string | null | undefined
          >();
          return { decision: 'decline' };
        case 'item/fileChange/requestApproval':
          expectTypeOf(req.params.grantRoot).toEqualTypeOf<
            string | null | undefined
          >();
          return { decision: 'decline' };
        case 'item/permissions/requestApproval':
          expectTypeOf(req.params.permissions.network).toEqualTypeOf<{
            enabled: boolean | null;
          } | null>();
          return { permissions: {}, scope: 'turn' };
        case 'unknown':
          expectTypeOf(req.originalMethod).toEqualTypeOf<string>();
          return {
            error: { code: -32601, message: 'Unsupported server request' },
          };
      }
    };
    const meta: ComputerUseElicitationMeta = {
      connector_id: 'computer-use',
      persist: ['session', 'always'],
      tool_params: { app: 'notepad.exe' },
    };
    const request: ServerRequest = {
      id: 0,
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        serverName: 'node_repl',
        mode: 'form',
        message: 'Allow Codex to use notepad?',
        requestedSchema: { type: 'object', properties: {} },
        _meta: meta,
      },
    };
    const ctx = { signal: new AbortController().signal };
    expect(await handler(request, ctx)).toEqual({
      action: 'accept',
      content: { persist: 'session' },
      _meta: null,
    });
    expect(
      await handler(
        {
          id: 'next',
          method: 'unknown',
          originalMethod: 'future/request',
          params: {},
        },
        ctx,
      ),
    ).toEqual({
      error: { code: -32601, message: 'Unsupported server request' },
    });
  });

  it('preserves structured approval decisions and exclusive response envelopes', () => {
    const result: ServerRequestResponse = {
      decision: {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ['git', 'status'],
        },
      },
    };
    const response: JsonRpcResponse<ServerRequestResponse> = { id: 1, result };
    expect(response.result).toEqual(result);
    // @ts-expect-error A JSON-RPC response cannot carry both result and error.
    const invalid: JsonRpcResponse = {
      id: 1,
      result: {},
      error: { code: -1, message: 'invalid' },
    };
    expectTypeOf(invalid).toEqualTypeOf<JsonRpcResponse>();
  });
});
