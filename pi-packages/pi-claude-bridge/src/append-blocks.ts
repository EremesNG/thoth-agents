export interface AppendBlock {
	key: string;
	text: string;
}

export interface SegmentedAppend {
	blocks: AppendBlock[];
	ambiguous: boolean;
}

export interface BlockDiff {
	blocks: AppendBlock[];
	removed: string[];
	full: boolean;
}

const tagSource = String.raw`<(?<closing>/?)(?<tagName>[A-Za-z][\w:.-]*)(?<attributes>(?:[^>"']|"[^"]*"|'[^']*')*)>`;
const regionSource = String.raw`<!--\s*(?<regionName>[\w:.-]+):(?<boundary>start|end)\s*-->`;

/** XML-like bodies are opaque; only same-tag nesting determines their boundary. */
function xmlEnd(text: string, start: number, name: string): number | undefined {
	const tags = new RegExp(tagSource, "g");
	tags.lastIndex = start;
	let depth = 0;
	for (let tag = tags.exec(text); tag; tag = tags.exec(text)) {
		const { tagName, closing, attributes } = tag.groups ?? {};
		if (tagName !== name) continue;
		if (closing) {
			if (attributes.trim()) return undefined;
			depth--;
		} else if (!attributes.trimEnd().endsWith("/")) depth++;
		if (depth === 0) return tags.lastIndex;
	}
	return undefined;
}

function regionEnd(text: string, start: number, name: string): number | undefined {
	const regions = new RegExp(regionSource, "g");
	regions.lastIndex = start;
	let depth = 0;
	for (let region = regions.exec(text); region; region = regions.exec(text)) {
		const { regionName, boundary } = region.groups ?? {};
		if (regionName !== name) continue;
		depth += boundary === "start" ? 1 : -1;
		if (depth === 0) return regions.lastIndex;
	}
	return undefined;
}

function xmlKey(name: string, attributes: string): string | undefined {
	const values = new Map<string, string>();
	const source = attributes.replace(/\/\s*$/, "").trimEnd();
	const attrs = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>'"=]+))/gy;
	let cursor = 0;
	while (cursor < source.length) {
		const attr = attrs.exec(source);
		if (!attr || values.has(attr[1])) return undefined;
		values.set(attr[1], attr[2] ?? attr[3] ?? attr[4]);
		cursor = attrs.lastIndex;
	}
	const identity = values.has("path") ? "path" : values.has("name") ? "name" : undefined;
	return `xml:${name}${identity ? `:${identity}=${JSON.stringify(values.get(identity))}` : ""}`;
}

/** A duplicate identity or missing boundary disables deltas for the entire append. */
export function segment(text: string): SegmentedAppend {
	const blocks: AppendBlock[] = [];
	let freeOrdinal = 0;
	const free = (run: string) => {
		if (run.trim()) blocks.push({ key: `free:${++freeOrdinal}`, text: run });
	};
	const parse = (source: string, recurse: boolean): boolean => {
		const starts = new RegExp(
			String.raw`^[\t ]*(?:${regionSource}|${tagSource}|</?[A-Za-z][\w:.-]*(?=[\s/>]|$)|<!--\s*[\w:.-]+:(?:start|end)\b)`,
			"gm",
		);
		let cursor = 0;
		for (let start = starts.exec(source); start; start = starts.exec(source)) {
			free(source.slice(cursor, start.index));
			const { regionName, boundary, closing, tagName, attributes } = start.groups ?? {};
			if (boundary === "end" || closing || (!regionName && !tagName)) return false;
			const key = regionName ? `comment:${regionName}` : xmlKey(tagName, attributes);
			if (key === undefined) return false;
			const selfClosing = !regionName && attributes.trimEnd().endsWith("/");
			const end = regionName
				? regionEnd(source, start.index, regionName)
				: selfClosing
					? starts.lastIndex
					: xmlEnd(source, start.index, tagName);
			if (end === undefined) return false;
			if (tagName === "project_context" && recurse && !selfClosing) {
				const close = source.lastIndexOf("</project_context", end);
				// The wrapper is independent of its children, which keep their own keys.
				blocks.push({ key, text: start[0] + source.slice(close, end) });
				if (!parse(source.slice(starts.lastIndex, close), false)) return false;
			} else {
				blocks.push({
					key,
					text: source.slice(start.index, end),
				});
			}
			cursor = end;
			starts.lastIndex = end;
		}
		free(source.slice(cursor));
		return true;
	};
	if (!parse(text, true) || new Set(blocks.map((block) => block.key)).size !== blocks.length) {
		return { blocks: [{ key: "full", text }], ambiguous: true };
	}
	return { blocks, ambiguous: false };
}

const partFrame = (slice: string, part: number, total: number): string =>
	[
		"<claude-bridge-appended-instructions>",
		`Part ${part}/${total} of one update. Concatenate the slices in part order without extra separators; apply only the complete update.`,
		"",
		slice,
		"</claude-bridge-appended-instructions>",
	].join("\n");

/** The cap includes framing and labels, and counts UTF-16 units, just like CC. */
export function splitParts(payload: string, limit: number): string[] {
	if (!Number.isSafeInteger(limit)) throw new RangeError("Context limit must be an integer");
	let total = 1;
	for (;;) {
		const capacity = limit - partFrame("", total, total).length;
		if (capacity < 2) throw new RangeError("Context limit is too small for part framing");
		const slices: string[] = [];
		for (let start = 0; start < payload.length; ) {
			let end = Math.min(start + capacity, payload.length);
			// Do not strand half an astral character in a separately transported value.
			if (end < payload.length && /[\uD800-\uDBFF]/.test(payload[end - 1]) && /[\uDC00-\uDFFF]/.test(payload[end]))
				end--;
			slices.push(payload.slice(start, end));
			start = end;
		}
		if (!slices.length) slices.push("");
		if (slices.length === total) return slices.map((slice, index) => partFrame(slice, index + 1, total));
		// More digits in the total consume capacity; recompute until the count agrees.
		total = slices.length;
	}
}

export function diffBlocks(effective: string, current: string): BlockDiff {
	const before = segment(effective);
	const after = segment(current);
	const oldByKey = new Map(before.blocks.map((block) => [block.key, block.text]));
	const newKeys = new Set(after.blocks.map((block) => block.key));
	const oldOrder = before.blocks.filter((block) => newKeys.has(block.key)).map((block) => block.key);
	const newOrder = after.blocks.filter((block) => oldByKey.has(block.key)).map((block) => block.key);
	if (before.ambiguous || after.ambiguous || oldOrder.some((key, index) => key !== newOrder[index])) {
		return { full: true, blocks: [{ key: "full", text: current }], removed: [] };
	}
	return {
		full: false,
		blocks: after.blocks.filter((block) => oldByKey.get(block.key) !== block.text),
		removed: before.blocks.filter((block) => !newKeys.has(block.key)).map((block) => block.key),
	};
}
