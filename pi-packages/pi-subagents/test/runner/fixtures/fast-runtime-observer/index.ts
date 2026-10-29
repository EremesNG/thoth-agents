import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { trace } from '../provider-fixture.js';

export default function fastRuntimeObserver(pi: ExtensionAPI) {
  pi.on('session_start', () => trace('fast-observer:session_start'));
  pi.on('before_agent_start', (_event, ctx) => {
    const virtualModels = ctx.modelRegistry
      .getAll()
      .filter((model) => model.api === 'pi-virtual');
    trace(`fast-observer:virtual-models:${virtualModels.length}`);
  });
}
