import type { HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";

interface RecordingEpoch {
	recorded: string;
	effective: string;
}

/** State belongs to a CC recording epoch, not to a Pi prompt-capture key. */
export class AppendInstructions {
	private readonly epochs = new Map<string, RecordingEpoch>();

	start(sessionId: string, append: string): RecordingEpoch {
		const epoch = { recorded: append, effective: append };
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
		if (epoch.effective === append) return undefined;
		let attempted = false;
		const hook: HookCallback = async (input, _toolUseId, options) => {
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
						additionalContext: [
							"<claude-bridge-appended-instructions>",
							"This version supersedes all earlier appended-instructions versions, including the session-start version. The full current appended instructions follow:",
							append || "(none — there are no current appended instructions)",
							"</claude-bridge-appended-instructions>",
						].join("\n"),
					},
				};
				// Registration is not delivery. Commit only when this callback returns context.
				epoch.effective = append;
				return output;
			} catch {
				// Keep the last effective version so a later query retries delivery.
				return {};
			}
		};
		return { UserPromptSubmit: [{ hooks: [hook] }] };
	}
}
