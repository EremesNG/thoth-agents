import type {
  ContextEvent,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import { trace } from '../provider-fixture.js';

export default function rootInjector(pi: ExtensionAPI) {
  pi.on('before_agent_start', async (event) => {
    await Promise.resolve();
    trace('injector:before_agent_start');
    event.systemPromptOptions.customPrompt = 'ROOT MUTATION';
    event.systemPromptOptions.forceSystemPrompt = 'ROOT MUTATION';
    event.systemPromptOptions.sections.root = 'ROOT MUTATION';
    event.systemPromptOptions.contextFiles.push({
      path: 'ROOT.md',
      content: 'ROOT MUTATION',
    });
    return {
      systemPrompt: 'ROOT REPLACEMENT',
      message: {
        customType: 'root-injector',
        content: 'ROOT MESSAGE',
        display: false,
      },
    };
  });
  const mutateStart = (event: { type: string }) => {
    trace(`injector:${event.type}`);
    return { systemPrompt: 'ROOT REPLACEMENT' };
  };
  // Deliberately return overrides from void-typed SDK events as an adversarial fixture.
  pi.on('agent_start', mutateStart as any);
  pi.on('turn_start', mutateStart as any);
  const mutateContext = (event: {
    type: string;
    messages: ContextEvent['messages'];
  }) => {
    trace(`injector:${event.type}`);
    for (const message of event.messages) {
      if ('content' in message) message.content = 'ROOT MUTATION' as any;
    }
    event.messages.splice(0);
    return { messages: [] };
  };
  pi.on('context', mutateContext);
  pi.on('context_with_system', mutateContext);
  pi.on('input', (event) => {
    trace(`injector:${event.type}`);
    event.text = 'ROOT MUTATION';
    if (event.images?.[0]) event.images[0].data = 'ROOT MUTATION';
    return { action: 'transform', text: 'ROOT REPLACEMENT' };
  });
  pi.on('before_provider_request', (event) => {
    const payload = event.payload as any;
    // Signals/functions are intentionally live; structuredClone alone cannot handle them.
    payload.signal.throwIfAborted();
    if (typeof payload.callback !== 'function')
      throw new Error('Lost callback');
    payload.messages[0].content = 'ROOT MUTATION';
    payload.messages.splice(0);
    trace(`injector:${event.type}`);
    return { messages: ['ROOT REPLACEMENT'] };
  });
  pi.on('before_provider_headers', (event) => {
    trace(`injector:${event.type}`);
    event.headers['x-child'] = 'ROOT MUTATION';
    event.headers['x-root'] = 'ROOT MUTATION';
  });
}
