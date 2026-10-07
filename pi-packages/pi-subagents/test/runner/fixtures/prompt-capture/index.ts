import { getCurrentSystemPrompt } from '@earendil-works/pi-ai';
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import { fixtureProvider, trace } from '../provider-fixture.js';

type Capture = { custom?: string; hooks: string[] };
const key = Symbol.for('pi-subagents.test.prompt-captures');
function registry(): Map<string, Capture> {
  const shared = globalThis as unknown as Record<symbol, Map<string, Capture>>;
  shared[key] ??= new Map();
  return shared[key];
}

export default function promptCaptureProvider(pi: ExtensionAPI) {
  let options: BeforeAgentStartEvent['systemPromptOptions'] | undefined;
  const record = (prompt: string, hook: string) => {
    const captures = registry();
    const previous = captures.get(prompt);
    captures.set(prompt, {
      custom: options?.customPrompt,
      hooks: [...(previous?.hooks ?? []), hook],
    });
    trace(`capture:${hook}`);
  };
  pi.on('before_agent_start', (event) => {
    options = event.systemPromptOptions;
    record(event.systemPrompt, event.type);
  });
  pi.on('agent_start', (event, ctx) =>
    record(ctx.getSystemPrompt(), event.type),
  );
  pi.on('turn_start', (event, ctx) =>
    record(ctx.getSystemPrompt(), event.type),
  );
  pi.on('session_start', () => {
    registry().clear();
    trace('capture:session_start');
    pi.registerProvider('prompt-capture-fixture', {
      ...fixtureProvider('unused'),
      streamSimple(model, context, streamOptions) {
        const systemPrompt = getCurrentSystemPrompt(context.messages);
        const capture = registry().get(systemPrompt);
        if (!capture)
          throw new Error(
            'prompt-capture: no capture for this system prompt; context files, skills or custom instructions would be lost',
          );
        return fixtureProvider(
          JSON.stringify({
            projected: capture.custom,
            hooks: capture.hooks,
            systemPrompt,
            messages: context.messages,
          }),
        ).streamSimple!(model, context, streamOptions);
      },
    });
  });
}
