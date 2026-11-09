import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAdaptiveToolRegistrar, publishToolDefinitions, type ToolDefinitionHandle, type ToolDefinitionLike } from "@thoth-agents/pi-core";

/** Keep the host definitions available to viewers only for interactive sessions. */
export function createPublishedToolRegistrar(pi: ExtensionAPI): {
	registerTool: ExtensionAPI["registerTool"];
	registerAdaptiveTool: ExtensionAPI["registerTool"];
} {
	const definitions = new Map<string, ToolDefinitionLike>();
	let publication: ToolDefinitionHandle | undefined;
	const registerTool: ExtensionAPI["registerTool"] = (definition) => {
		pi.registerTool(definition);
		definitions.set(definition.name, definition);
		publication?.publish([definition]);
	};
	const occasional = createAdaptiveToolRegistrar({ ...pi, registerTool });
	pi.on("session_start", (_event, ctx) => {
		if (ctx.hasUI && !publication) publication = publishToolDefinitions([...definitions.values()]);
	});
	pi.on("session_shutdown", () => {
		publication?.withdraw();
		publication = undefined;
	});
	return { registerTool, registerAdaptiveTool: occasional.register };
}
