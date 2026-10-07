import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { trace } from '../provider-fixture.js';

export default function observer(pi: ExtensionAPI) {
  const observe = async (event: { type: string }, ctx: ExtensionContext) => {
    await Promise.resolve();
    trace(`observer:${event.type}`);
    if (!ctx.getSystemPrompt()) throw new Error('Missing child context');
  };
  pi.on('before_agent_start', observe);
  pi.on('agent_start', observe);
  pi.on('turn_start', observe);
  pi.on('session_start', async (event) => {
    await Promise.resolve();
    if (event.reason !== 'startup') throw new Error('Wrong startup reason');
    trace('observer:session_start');
    if (process.env.PI_SUBAGENTS_FIXTURE_START === 'throw')
      throw new Error('Fixture startup failed');
  });
  pi.on('context', () => {
    trace('observer:context');
    return { messages: [] };
  });
  pi.on('agent_end', () => trace('observer:agent_end'));
  pi.on('model_select', () => trace('observer:model_select'));
  pi.on('session_before_tree', (event) => {
    event.signal.throwIfAborted();
    event.preparation.customInstructions = 'LIVE TREE MUTATION';
    trace('observer:session_before_tree');
    return { cancel: true };
  });
  pi.on('session_shutdown', () => trace('observer:session_shutdown'));
}
