import type { HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";
import { diffBlocks, splitParts } from "./append-blocks.js";

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

interface RecordingEpoch {
	recorded: string;
	effective: string;
	uncertain: boolean;
}

/** State belongs to a CC recording epoch, not to a Pi prompt-capture key. */
export class AppendInstructions {
	private readonly epochs = new Map<string, RecordingEpoch>();

	start(sessionId: string, append: string): RecordingEpoch {
		const epoch = { recorded: append, effective: append, uncertain: false };
		this.epochs.set(sessionId, epoch);
		return epoch;
	}

	ensure(sessionId: string, append: string): RecordingEpoch {
		return this.epochs.get(sessionId) ?? this.start(sessionId, append);
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
