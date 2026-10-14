import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  type JsonObject,
} from '@earendil-works/pi-ai';
import type { ProviderConfig } from '@earendil-works/pi-coding-agent';

export interface ScriptStep {
  text?: string;
  calls?: { name: string; args: JsonObject }[];
  cost?: number;
  wait?: boolean;
  gate?: Promise<void>;
}

/** An entirely local stream implementation: no HTTP client or network fallback. */
export function syntheticProvider(
  steps: ScriptStep[],
  hooks: { started?: (step: ScriptStep) => void; aborted?: () => void } = {},
): ProviderConfig & {
  streamSimple: NonNullable<ProviderConfig['streamSimple']>;
} {
  let index = 0;
  return {
    api: 'openai-completions',
    apiKey: 'offline',
    baseUrl: 'https://fixture.invalid',
    models: [
      {
        id: 'fixture',
        name: 'Offline evaluation fixture',
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 1024,
      },
    ],
    streamSimple(model, _context, options) {
      const step = steps[index++] ?? { text: 'Done.' };
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: 'assistant',
        api: model.api,
        provider: model.provider,
        model: model.id,
        timestamp: Date.now(),
        stopReason: step.calls ? 'toolUse' : 'stop',
        content: step.calls?.map((call, i) => ({
          type: 'toolCall' as const,
          id: `eval-${index}-${i}`,
          name: call.name,
          arguments: call.args,
        })) ?? [{ type: 'text', text: step.text ?? 'Done.' }],
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: {
            input: 0,
            output: step.cost ?? 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: step.cost ?? 0,
          },
        },
      };
      hooks.started?.(step);
      let finished = false;
      const abort = () => {
        if (finished) return;
        finished = true;
        hooks.aborted?.();
        message.stopReason = 'aborted';
        stream.push({ type: 'error', reason: 'aborted', error: message });
        stream.end(message);
      };
      const done = () => {
        if (finished) return;
        finished = true;
        options?.signal?.removeEventListener('abort', abort);
        stream.push({
          type: 'done',
          reason: step.calls ? 'toolUse' : 'stop',
          message,
        });
        stream.end(message);
      };
      if (step.wait || step.gate) {
        stream.push({ type: 'start', partial: message });
        if (options?.signal?.aborted) abort();
        else options?.signal?.addEventListener('abort', abort, { once: true });
        if (step.gate) void step.gate.then(done, abort);
      } else done();
      return stream;
    },
  };
}
