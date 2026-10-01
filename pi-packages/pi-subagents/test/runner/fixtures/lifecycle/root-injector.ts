import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
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
}
