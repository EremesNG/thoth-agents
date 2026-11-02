// The SDK iterator can settle before Claude Code finishes flushing its file.
// Use the documented custom-spawn hook to observe the real child's close.
import { spawnClaudeRuntime } from "./claude-runtime.js";
import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";

export class QueryProcess {
	private started = false;
	private child: SpawnedProcess | undefined;
	private closed = false;
	private stderrTail = "";
	private resolveExit!: () => void;
	readonly exited = new Promise<void>((resolve) => { this.resolveExit = resolve; });
	constructor(private stderr?: (data: string) => void) {}
	spawn = (options: SpawnOptions): SpawnedProcess => {
		if (this.closed || this.started) throw new Error("Query process spawned after close or more than once");
		const child = spawnClaudeRuntime(options, (data) => {
			this.stderrTail = (this.stderrTail + data).slice(-8_192);
			this.stderr?.(data);
		});
		// Only a returned child can close; a synchronous spawn failure leaves none.
		this.started = true;
		this.child = child;
		child.once("close", () => this.resolveExit());
		return child;
	};
	/** The SDK's custom launcher does not add its usual stderr-tail diagnostic. */
	withStderr(error: unknown): unknown {
		const tail = this.stderrTail.trim();
		if (error instanceof Error && /^Claude Code process (?:exited|killed)/.test(error.message) && tail) {
			error.message += `. stderr: ${tail}`;
		}
		return error;
	}
	/** A query constructor can throw after spawning, before returning a handle. */
	terminate(): void {
		this.close();
		if (this.child && !this.child.killed) this.child.kill("SIGTERM");
	}
	/** Called only after closing the SDK query, which forbids a deferred spawn. */
	close(): void {
		this.closed = true;
		if (!this.started) this.resolveExit();
	}
}
