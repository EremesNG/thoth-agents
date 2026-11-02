import type { HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";
import { diffBlocks, splitParts } from "./append-blocks.js";
import type { readTranscript } from "./session-transcript.js";

type Transcript = ReturnType<typeof readTranscript>;

export interface AppendState {
	/** null means the retained recording's original append is unknown. */
	base: string | null;
	/** UUIDs of the actual carrier records; null value marks partial delivery. */
	refreshes: { positions: string[]; value: string | null }[];
}

/** Bad append evidence must not reject an otherwise usable recording. */
export function parseAppendState(value: unknown): AppendState | undefined {
	if (!value || typeof value !== "object") return undefined;
	const state = value as AppendState;
	if ((state.base !== null && typeof state.base !== "string") || !Array.isArray(state.refreshes)) return undefined;
	if (state.refreshes.some((refresh) => !refresh || !Array.isArray(refresh.positions) || !refresh.positions.length
		|| refresh.positions.some((position) => typeof position !== "string" || !position)
		|| (refresh.value !== null && typeof refresh.value !== "string"))) return undefined;
	return { base: state.base, refreshes: state.refreshes.map((refresh) => ({ ...refresh, positions: [...refresh.positions] })) };
}

function contexts(record: Transcript[number]): string[] {
	const attachment = record.type === "attachment" ? record.attachment as { type: string; hookEvent?: string; content?: unknown } : undefined;
	return attachment?.type === "hook_additional_context" && attachment.hookEvent === "UserPromptSubmit" && Array.isArray(attachment.content)
		? attachment.content.filter((part): part is string => typeof part === "string" && part.startsWith("<claude-bridge-appended-instructions>\n")) : [];
}

const sameParts = (actual: string[], expected: string[]): boolean =>
	JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const unknownState = (): AppendState => ({ base: null, refreshes: [] });
const effectiveState = (state: AppendState) => {
	const value = state.refreshes.at(-1)?.value ?? (state.refreshes.length ? null : state.base);
	return { recorded: state.base ?? "", effective: value ?? "", uncertain: value === null };
};

function updatePayload(effective: string, append: string, forceReplacement: boolean): string {
	const diff = forceReplacement ? undefined : diffBlocks(effective, append);
	if (!diff || diff.full) {
		return [
			"This version supersedes all earlier appended-instructions versions, including the session-start version. The full current appended instructions follow:",
			append || "(none — there are no current appended instructions)",
		].join("\n");
	}
	return [
		"These added or changed blocks supersede the same-keyed blocks of all earlier appended-instructions versions, including the session-start version. Remove the listed keys; all unlisted blocks remain as previously given. The project_context wrapper and its children are keyed independently.",
		`Removed block keys: ${JSON.stringify(diff.removed)}`,
		...diff.blocks.map((block) => `Added or changed block ${JSON.stringify(block.key)}:\n${block.text}`),
		...(append ? [] : ["(none — there are no current appended instructions)"]),
	].join("\n");
}

export interface RecordingEpoch {
	recorded: string;
	effective: string;
	uncertain: boolean;
	state: AppendState;
	priorRecords: Set<string>;
	pending?: { parts: string[]; returned: Set<string>; value: string };
}

/** State belongs to a CC recording epoch, not to a Pi prompt-capture key. */
export class AppendInstructions {
	private readonly epochs = new Map<string, RecordingEpoch>();

	start(sessionId: string, append: string): RecordingEpoch {
		const epoch: RecordingEpoch = { recorded: append, effective: append, uncertain: false,
			state: { base: append, refreshes: [] }, priorRecords: new Set() };
		this.epochs.set(sessionId, epoch);
		return epoch;
	}

	ensure(sessionId: string, append: string): RecordingEpoch {
		return this.epochs.get(sessionId) ?? this.start(sessionId, append);
	}

	/** Validate against the source file, then retain by physical record membership,
	 * never by pi slots or the source session's latest in-memory value. */
	restore(sessionId: string, value: unknown, records: Transcript, retained = records.length): void {
		let state = parseAppendState(value) ?? unknownState();
		const kept = records.slice(0, retained);
		const keptUuids = new Set(kept.flatMap((record) => record.uuid ?? []));
		const indicesByUuid = new Map<string, number>();
		records.forEach((record, index) => {
			if (record.uuid && !indicesByUuid.has(record.uuid)) indicesByUuid.set(record.uuid, index);
		});
		let previous = -1;
		let effective = state.base ?? "", uncertain = state.base === null;
		for (const refresh of state.refreshes) {
			const indices = refresh.positions.map((uuid) => indicesByUuid.get(uuid) ?? -1);
			const parts = indices.flatMap((index) => index < 0 ? [] : contexts(records[index]));
			const expected = refresh.value === null ? undefined : splitParts(updatePayload(effective, refresh.value, uncertain), 9_000);
			if (indices.some((index, i) => index <= (i ? indices[i - 1] : previous)) || !parts.length
				|| (expected && !sameParts(parts, expected))) {
				state = unknownState();
				break;
			}
			previous = indices.at(-1)!;
			uncertain = refresh.value === null;
			if (refresh.value !== null) effective = refresh.value;
		}
		state.refreshes = state.refreshes.flatMap((refresh) => {
			const positions = refresh.positions.filter((uuid) => keptUuids.has(uuid));
			return positions.length ? [{ positions, value: positions.length === refresh.positions.length ? refresh.value : null }] : [];
		});
		const covered = new Set(state.refreshes.flatMap((refresh) => refresh.positions));
		// A verified full replacement covers unknown earlier context. An untracked
		// later update, however, makes even otherwise valid append evidence unsafe.
		let lastReplacement = -1;
		for (const refresh of state.refreshes) {
			if (refresh.value === null) continue;
			const parts = refresh.positions.flatMap((uuid) => contexts(records[indicesByUuid.get(uuid)!]));
			if (sameParts(parts, splitParts(updatePayload("", refresh.value, true), 9_000))) {
				lastReplacement = indicesByUuid.get(refresh.positions.at(-1)!)!;
			}
		}
		if (kept.some((record, index) => index > lastReplacement && contexts(record).length && !covered.has(record.uuid!))) state = unknownState();
		this.epochs.set(sessionId, { ...effectiveState(state), state, priorRecords: keptUuids });
	}

	/** Called only after the target writer exits. Hook returns are intentions;
	 * only matching context in that target's actual file is durable evidence. */
	snapshot(sessionId: string, records: Transcript): AppendState | undefined {
		const epoch = this.epochs.get(sessionId);
		if (!epoch) return undefined;
		const pending = epoch.pending;
		if (pending?.returned.size) {
			const carriers = records.filter((record) => record.uuid && !epoch.priorRecords.has(record.uuid) && contexts(record).some((part) => pending.returned.has(part)));
			const actual = carriers.flatMap(contexts);
			const complete = pending.parts.every((part) => actual.includes(part));
			if (carriers.length) epoch.state.refreshes.push({ positions: carriers.map((record) => record.uuid!), value: complete ? pending.value : null });
			else epoch.state = unknownState();
			epoch.pending = undefined;
		}
		Object.assign(epoch, effectiveState(epoch.state));
		return parseAppendState(epoch.state);
	}

	forget(sessionId: string): void {
		this.epochs.delete(sessionId);
	}

	clear(): void {
		this.epochs.clear();
	}

	hooks(sessionId: string, append: string, isQueryActive: () => boolean): Options["hooks"] {
		const epoch = this.ensure(sessionId, append);
		if (!epoch.uncertain && epoch.effective === append) return undefined;
		const parts = splitParts(updatePayload(epoch.effective, append, epoch.uncertain), 9_000);
		let delivered = 0;
		const pending = epoch.pending = { parts, returned: new Set<string>(), value: append };
		const hooks = parts.map((additionalContext): HookCallback => {
			let attempted = false;
			return async (input, _toolUseId, options) => {
				if (attempted) return {};
				attempted = true;
				try {
					if (
						!isQueryActive() ||
						options.signal.aborted ||
						input.hook_event_name !== "UserPromptSubmit" ||
						input.session_id !== sessionId ||
						this.epochs.get(sessionId) !== epoch
					)
						return {};
					const output = {
						hookSpecificOutput: {
							hookEventName: "UserPromptSubmit" as const,
							additionalContext,
						},
					};
					// Partial delivery is not atomic in CC. Keep the old effective version,
					// but require a full replacement on the next query until every part returns.
					delivered++;
					pending.returned.add(additionalContext);
					epoch.uncertain = delivered !== parts.length;
					if (!epoch.uncertain) epoch.effective = append;
					return output;
				} catch {
					// Keep the last effective version (and any uncertainty) for a later query.
					return {};
				}
			};
		});
		return { UserPromptSubmit: [{ hooks }] };
	}
}
