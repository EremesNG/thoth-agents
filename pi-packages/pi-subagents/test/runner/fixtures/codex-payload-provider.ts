import {
  type AssistantMessage,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function codexPayloadProvider(pi: ExtensionAPI) {
  pi.registerProvider('codex-payload-fixture', {
    api: 'openai-codex-responses',
    apiKey: 'not-used',
    baseUrl: 'https://fixture.invalid',
    models: [
      {
        id: 'gpt-fixture',
        name: 'GPT Fixture',
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 4096,
        maxTokens: 1024,
      },
    ],
    streamSimple(model, _context, options) {
      const stream = createAssistantMessageEventStream();
      // Mirror Pi's real adapters: build the body, let onPayload replace it, then send it.
      const body = { model: model.id, input: [] };
      Promise.resolve(options?.onPayload?.(body, model)).then((replacement) => {
        const message: AssistantMessage = {
          role: 'assistant',
          content: [
            { type: 'text', text: JSON.stringify(replacement ?? body) },
          ],
          api: model.api,
          provider: model.provider,
          model: model.id,
          stopReason: 'stop',
          timestamp: Date.now(),
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
        };
        stream.push({ type: 'done', reason: 'stop', message });
        stream.end(message);
      });
      return stream;
    },
  });
}
