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
  pi.on('session_start', () => trace('observer:session_start'));
  pi.on('context', () => {
    trace('observer:context');
    return { messages: [] };
  });
  pi.on('session_shutdown', () => trace('observer:session_shutdown'));
}
