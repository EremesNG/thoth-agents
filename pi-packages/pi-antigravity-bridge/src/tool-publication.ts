import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { publishToolDefinitions, type ToolDefinitionHandle, type ToolDefinitionLike } from "@thoth-agents/pi-core";

/** Keep the host definitions available to viewers only for interactive sessions. */
export function createPublishedToolRegistrar(pi: ExtensionAPI): ExtensionAPI["registerTool"] {
	const definitions: ToolDefinitionLike[] = [];
	let publication: ToolDefinitionHandle | undefined;
	pi.on("session_start", (_event, ctx) => {
		if (ctx.hasUI && !publication) publication = publishToolDefinitions(definitions);
	});
	pi.on("session_shutdown", () => {
		publication?.withdraw();
		publication = undefined;
	});
	return (definition) => {
		pi.registerTool(definition);
		definitions.push(definition);
		publication?.publish([definition]);
	};
}
