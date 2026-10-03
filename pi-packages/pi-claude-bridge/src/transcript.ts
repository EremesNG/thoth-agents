/**
 * Translate pi's transcript-shaped provider input into the prompt/tools fields used by
 * the bridge's downstream consumers.
 *
 * System messages carry the base prompt and tool set plus later section patches and tool
 * deltas. pi-ai replays that state, but preserves section replay order. Prompt capture
 * keys come from pi's canonical section builder, so a deleted and re-added section must
 * be ranked back into canonical order before the bridge performs its exact-key lookup.
 */
import {
	contentText,
	getCurrentSystemMessage,
	getCurrentTools,
	type Context,
	type SystemMessage,
} from "@earendil-works/pi-ai";

/** pi's canonical built-in section order; custom sections follow their replay position.
 *  Known limitation, inherited from the pre-swap replay: if pi reorders existing custom
 *  sections while patching an unrelated one, the replay diverges from getSystemPrompt()
 *  and the exact-key capture lookup throws on that legitimate turn. Untriggered today:
 *  pi builds custom sections in one patch per render. */
const SECTION_RANK = new Map<string, number>([
	["preamble", 0], ["tools", 1], ["rules", 2], ["docs", 3], ["addendum", 4],
	["project_context", 5], ["skills", 6], ["cwd", 7],
]);

/**
 * The map's entries, stably sorted by canonical rank. An unknown name inherits the
 * highest rank seen before it, preserving an already-canonical replay. A newly added
 * addendum can land after cwd; it must not pull custom sections re-added after it ahead
 * of project_context/skills/cwd. Every section value is retained byte-for-byte, and
 * prompt capture still requires an exact match of the complete rendered prompt.
 */
function stableRanked(sections: Map<string, string>, ranks: Map<string, number>): Map<string, string> {
	let prefixRank = -1;
	const ranked = [...sections].map(([name, value]) => {
		const rank = ranks.get(name) ?? prefixRank;
		prefixRank = Math.max(prefixRank, rank);
		return { name, value, rank };
	});
	ranked.sort((a, b) => a.rank - b.rank);
	return new Map(ranked.map(({ name, value }) => [name, value]));
}

/** Render replayed system state in the same section order as pi's prompt builder. */
function canonicalSystemPrompt(message: SystemMessage | undefined): string | undefined {
	if (!message) return undefined;
	const sections = new Map<string, string>(
		Object.entries(message.sections ?? {}).filter((entry): entry is [string, string] => entry[1] !== null),
	);
	const parts = [contentText(message.content), ...stableRanked(sections, SECTION_RANK).values()]
		.filter((part) => part.length > 0);
	return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * Restore the prompt and tools fields expected by the bridge and remove prompt-state
 * messages from conversation history. Contexts without system messages are returned
 * unchanged because systemless one-off calls already use the bridge-compatible shape.
 */
export function toBridgeContext(context: Context): Context {
	if (!context.messages.some((message) => message.role === "system")) return context;
	const tools = getCurrentTools(context.messages);
	return {
		...context,
		systemPrompt: canonicalSystemPrompt(getCurrentSystemMessage(context.messages)),
		tools: tools.length > 0 ? tools : undefined,
		messages: nonSystemMessages(context.messages),
	};
}

/** `messages` with every prompt-state system message removed from conversation history. */
export function nonSystemMessages<T extends { role: string }>(messages: readonly T[]): T[] {
	return messages.filter((message) => message.role !== "system");
}
