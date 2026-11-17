import fs from 'node:fs';
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ProviderConfig,
} from '@earendil-works/pi-coding-agent';

/**
 * Faux provider for model fallback regression tests. Model `one` calls the
 * `read` tool on its first turn, then fails the provider request on the next
 * turn. Model `two` records the full context it receives and finishes.
 */
function record(event: string, payload?: unknown): void {
  const file = process.env.PI_SUBAGENTS_FALLBACK_TRACE;
  if (file) fs.appendFileSync(file, `${JSON.stringify({ event, payload })}\n`);
}

function fallbackProvider(): ProviderConfig {
  const model = (id: string) => ({
    id,
    name: id,
    reasoning: false,
    input: ['text' as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 1024,
  });
  return {
    api: 'openai-completions',
    apiKey: 'not-used',
    baseUrl: 'https://fixture.invalid',
    models: [model('one'), model('two')],
    streamSimple(m, context) {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: 'assistant',
        content: [],
        api: m.api,
        provider: m.provider,
        model: m.id,
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      record(`stream:${m.id}`, context.messages);
      const sawToolResult = context.messages.some(
        (entry: any) => entry.role === 'toolResult',
      );
      if (m.id === 'one' && !sawToolResult) {
        message.stopReason = 'toolUse';
        message.content = [
          {
            type: 'toolCall',
            id: 'call_notes',
            name: 'read',
            arguments: { path: 'notes.txt' },
          },
        ];
        stream.push({ type: 'done', reason: 'toolUse', message });
      } else if (m.id === 'one') {
        message.stopReason = 'error';
        message.errorMessage = 'Fixture model rejected the request';
        stream.push({ type: 'error', reason: 'error', error: message });
      } else {
        message.content = [{ type: 'text', text: 'finished on two' }];
        stream.push({ type: 'done', reason: 'stop', message });
      }
      stream.end(message);
      return stream;
    },
  };
}

export default function fallbackProviderExtension(pi: ExtensionAPI) {
  pi.registerProvider('fallback-fixture', fallbackProvider());
}
