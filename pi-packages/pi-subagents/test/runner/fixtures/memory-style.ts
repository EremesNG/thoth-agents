import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { trace } from './provider-fixture.js';

export default function memoryStyle(pi: ExtensionAPI) {
  pi.on('before_agent_start', () => {
    trace('memory:before_agent_start');
    return { systemPrompt: 'ROOT MEMORY INJECTION' };
  });
}
