import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  createAdaptiveToolRegistrar,
  publishToolDefinitions,
  type ToolDefinitionHandle,
  type ToolDefinitionLike,
} from '@thoth-agents/pi-core';
import { registerAskCodexTool } from './ask-tool.js';

export default function askCodex(pi: ExtensionAPI): void {
  const definitions = new Map<string, ToolDefinitionLike>();
  let publication: ToolDefinitionHandle | undefined;
  const occasional = createAdaptiveToolRegistrar({
    ...pi,
    registerTool(tool) {
      pi.registerTool(tool);
      definitions.set(tool.name, tool);
      publication?.publish([tool]);
    },
  });
  registerAskCodexTool({ registerTool: occasional.register });
  pi.on('session_start', (_event, ctx) => {
    if (ctx.hasUI && definitions.size)
      publication ??= publishToolDefinitions([...definitions.values()]);
  });
  pi.on('session_shutdown', () => {
    publication?.withdraw();
    publication = undefined;
  });
}
