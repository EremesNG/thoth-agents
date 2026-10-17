import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  publishToolDefinitions,
  type ToolDefinitionHandle,
  type ToolDefinitionLike,
} from '@thoth-agents/pi-core';
import { registerAskCodexTool } from './ask-tool.js';

export default function askCodex(pi: ExtensionAPI): void {
  const definitions: ToolDefinitionLike[] = [];
  registerAskCodexTool({
    registerTool: (tool) => {
      definitions.push(tool);
      pi.registerTool(tool);
    },
  });
  let publication: ToolDefinitionHandle | undefined;
  pi.on('session_start', (_event, ctx) => {
    if (ctx.hasUI && definitions.length)
      publication ??= publishToolDefinitions(definitions);
  });
  pi.on('session_shutdown', () => {
    publication?.withdraw();
    publication = undefined;
  });
}
