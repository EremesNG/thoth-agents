import fs from 'node:fs';
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai';
import type { ProviderConfig } from '@earendil-works/pi-coding-agent';

export function trace(event: string): void {
  const file = process.env.PI_SUBAGENTS_PROVIDER_TRACE;
  if (file) fs.appendFileSync(file, `${event}\n`);
}

export function fixtureProvider(reply: string): ProviderConfig {
  return {
    api: 'openai-completions',
    apiKey: 'not-used',
    baseUrl: 'https://fixture.invalid',
    models: [
      {
        id: 'fixture',
        name: 'Fixture',
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 4096,
        maxTokens: 1024,
      },
    ],
    streamSimple(model, context, options) {
      trace(`stream:${reply}`);
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: 'assistant',
        content: [],
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
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const prompt = JSON.stringify(context.messages);
      if (prompt.includes('fixture-wait')) {
        const finish = () => {
          message.stopReason = 'aborted';
          message.errorMessage = 'Fixture aborted';
          stream.push({ type: 'error', reason: 'aborted', error: message });
          stream.end(message);
        };
        if (options?.signal?.aborted) finish();
        else options?.signal?.addEventListener('abort', finish, { once: true });
        stream.push({ type: 'start', partial: message });
      } else if (prompt.includes('fixture-failure')) {
        message.stopReason = 'error';
        message.errorMessage = 'Fixture provider failed';
        stream.push({ type: 'error', reason: 'error', error: message });
        stream.end(message);
      } else {
        message.content = [{ type: 'text', text: reply }];
        stream.push({ type: 'done', reason: 'stop', message });
        stream.end(message);
      }
      return stream;
    },
  };
}
