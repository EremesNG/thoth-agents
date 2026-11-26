// The SDK iterator can settle before Claude Code finishes flushing its file.
// Use the documented custom-spawn hook to observe the real child's close.
import { PassThrough } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import { spawnClaudeRuntime } from "./claude-runtime.js";
import type { SDKMessage, SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";

export type McpRequestId = string | number;
export interface McpCallIngress {
	readonly sequence: number;
	readonly controlRequestId: string;
	readonly toolUseId?: string;
}

export type McpWireMessage = {
	method?: string; id?: McpRequestId; jsonrpc?: string;
	params?: { requestId?: McpRequestId; reason?: unknown; name?: unknown; _meta?: Record<string, unknown> };
};

// Claude Code adds this nonstandard field in src/services/mcp/client.ts.
// Use it for pairing; dispatch order need not match assistant block order.
export const TOOL_USE_ID_META = "claudecode/toolUseId";

export function mcpToolUseId(message: McpWireMessage | undefined): string | undefined {
	const id = message?.params?._meta?.[TOOL_USE_ID_META];
	return typeof id === "string" && id.length ? id : undefined;
}

type WireFrame = {
	type?: string;
	subtype?: string;
	sdk_host_only?: boolean;
	state?: string;
	request_id?: string;
	response?: unknown;
	is_error?: boolean;
	errors?: unknown;
	request?: { subtype?: string; server_name?: string; message?: McpWireMessage; tool_use_id?: string;
		tool_name?: unknown; input?: unknown; callback_id?: unknown };
	status?: string;
	command_uuid?: unknown;
	uuid?: unknown;
	isReplay?: unknown;
	filePath?: unknown;
	entries?: unknown;
};

// SDK 0.3.321's query reader consumes these instead of yielding them.
export type ConsumedRawFact =
	| { kind: "control_request"; subtype?: string; toolUseId?: string; mcp?: { server: string | undefined; message: McpWireMessage | undefined; collision?: McpRequestId } }
	| { kind: "control_request" | "control_cancel_request"; cancellation: { toolUseId?: string; reason?: string } }
	| { kind: "control_response"; malformed: boolean; error?: string }
	| { kind: "sdk_reply"; toolUseId?: string; error?: string; permission: boolean; toolResultError?: string }
	| { kind: "request_collision"; requestId: string }
	| { kind: "raw_observer_error"; error: Error }
	| { kind: "malformed_result" | "malformed_frame" | "malformed_control_request" | "keep_alive" | "transcript_mirror" | "blank" }
	| { kind: "host_session_state"; state?: string }
	| { kind: "malformed_raw_payload"; frameType: string };

type YieldedFrame = { json: string; violation?: string };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class QueryProcess {
	private started = false;
	private child: SpawnedProcess | undefined;
	private closed = false;
	private stderrTail = "";
	private trackIngress = false;
	private sequenced = 0;
	private reduced = 0;
	private reducingConsumed = false;
	// In wire order: a yield (or an unknown frame) blocks reduction of all later facts.
	private readonly pending = new Map<number, ConsumedRawFact | YieldedFrame | null>();
	private readonly mcpCalls = new Map<string, Map<McpRequestId, McpCallIngress>>();
	private readonly liveControls = new Map<string, WireFrame["request"]>();
	// IDs for the opposite direction: a child request cannot authorize a child reply.
	private readonly liveOutboundControls = new Map<string, string>();
	// CLI 2.1.321 echoes the exact SDK tools/call reply, even when Pi's
	// result has isError=true. Only a one-shot, exact echo is ordinary traffic.
	private readonly pendingToolReplyEchoes = new Map<string, unknown>();
	private readonly outboundUserIds = new Set<string>();
	// Only for AwaitReplacement: a serial stale call may reply before its cancellation.
	private readonly lastMcpToolUseIds = new Map<string, Map<McpRequestId, string>>();
	private resolveExit!: () => void;
	readonly exited = new Promise<void>((resolve) => { this.resolveExit = resolve; });
	constructor(
		private stderr?: (data: string) => void,
		private onFailure?: (error: Error, pipe?: "stdin" | "stderr") => void,
		private onOutputEnd?: () => void,
		private onConsumedAvailable?: () => void,
		private reduceFact?: (fact: ConsumedRawFact, sequence: number) => void,
		private onRawFrame?: (line: string, sequence: number) => void,
	) {}
	private readonly rawObserverErrors = new Map<number, Error>();

	/** Opt in before spawning: an observer must have a consumer to acknowledge SDK messages. */
	enableOrderedIngress(): void {
		if (this.closed || this.started) throw new Error("Ordered ingress must be enabled before spawn");
		this.trackIngress = true;
	}

	get observingIngress(): boolean { return this.trackIngress && this.started; }
	get ingressWatermark(): number { return this.sequenced; }
	get reducedWatermark(): number { return this.reduced; }

	/** A close caused by a malformed frame must not overtake its wire prefix. */
	get hasPendingSdkReaderFault(): boolean {
		for (const fact of this.pending.values()) {
			if (fact && "kind" in fact && (fact.kind === "malformed_result"
				|| (fact.kind === "control_response" && fact.malformed))) return true;
		}
		return false;
	}

	/** Per process/query and server; use the nested JSON-RPC id from the MCP handler. */
	getMcpCall(server: string, requestId: McpRequestId): McpCallIngress | undefined {
		return this.mcpCalls.get(server)?.get(requestId) ?? undefined;
	}

	/** Wire-time validation for a frame the SDK still yields; correlation must not use callback-time state. */
	yieldedViolation(message: SDKMessage): string | undefined {
		const expected = this.pending.values().next().value;
		return expected && "json" in expected && expected.violation && expected.json === JSON.stringify(message)
			? expected.violation : undefined;
	}

	/** Call once after reducing each SDK yield, in iterator order. A mismatch cannot fill a gap. */
	acknowledge(message: SDKMessage): number | undefined {
		const next = this.pending.entries().next();
		if (next.done) return undefined;
		const [sequence, expected] = next.value;
		if (!expected || !("json" in expected) || JSON.stringify(message) !== expected.json) return undefined;
		this.pending.delete(sequence);
		this.reduced = sequence;
		if (!this.reduceFact) this.reduceConsumed();
		return sequence;
	}

	/** Reduce only the contiguous consumed prefix, never crossing a pending SDK yield. */
	reduceConsumed(): void {
		if (this.reducingConsumed) return;
		this.reducingConsumed = true;
		try {
			for (const [sequence, fact] of this.pending) {
				if (fact === null) break;
				const observerError = this.rawObserverErrors.get(sequence);
				if (observerError) {
					this.rawObserverErrors.delete(sequence);
					if (this.reduceFact) this.reduceFact({ kind: "raw_observer_error", error: observerError }, sequence);
					else this.onFailure?.(observerError);
				}
				if ("json" in fact) break;
				this.reduceFact?.(fact, sequence);
				this.pending.delete(sequence);
				this.reduced = sequence;
			}
		} finally {
			this.reducingConsumed = false;
		}
	}

	private classifyLine(line: string, frame: WireFrame | undefined, sequence: number): ConsumedRawFact | YieldedFrame {
		if (!line.trim()) return { kind: "blank" };
		if (typeof frame?.type !== "string") return { kind: "malformed_frame" };
		switch (frame.type) {
			case "control_request": return this.classifyControlRequest(frame, sequence);
			case "control_cancel_request": {
				const control = typeof frame.request_id === "string" ? this.liveControls.get(frame.request_id) : undefined;
				// Retain only the current control owner for AwaitReplacement's stale-traffic exception.
				if (typeof frame.request_id === "string") this.forgetControl(frame.request_id, control);
				return { kind: frame.type, cancellation: { toolUseId: this.controlToolUseId(control) } };
			}
			case "command_lifecycle": {
				let violation: string | undefined;
				if (typeof frame.command_uuid !== "string" || !frame.command_uuid || typeof frame.state !== "string" || !frame.state) {
					violation = "malformed command_lifecycle";
				} else if (frame.state === "cancelled" || frame.state === "failed") {
					violation = `command_lifecycle ${frame.state} for ${JSON.stringify(frame.command_uuid)}`;
				}
				return { json: JSON.stringify(frame), violation };
			}
			case "result":
				// SDK 0.3.321 maps and trims error strings before enqueueing the
				// result. A malformed list aborts the reader instead of yielding.
				if (frame.is_error && frame.subtype !== "success"
					&& (!Array.isArray(frame.errors) || frame.errors.some((error) => typeof error !== "string"))) {
					return { kind: "malformed_result" };
				}
				break;
			case "keep_alive": return { kind: frame.type };
			case "transcript_mirror":
				return typeof frame.filePath === "string" && frame.filePath && Array.isArray(frame.entries)
					&& frame.entries.every((entry) => isObject(entry) && typeof entry.type === "string")
					? { kind: frame.type } : { kind: "malformed_raw_payload", frameType: frame.type };
			case "system":
				if (frame.subtype === "session_state_changed" && frame.sdk_host_only === true) {
					return frame.state === "idle" || frame.state === "running" || frame.state === "requires_action"
						? { kind: "host_session_state", state: frame.state }
						: { kind: "malformed_raw_payload", frameType: frame.subtype };
				}
		}
		return { json: JSON.stringify(frame) };
	}

	private correlateHostTraffic(frame: WireFrame | undefined): ConsumedRawFact | YieldedFrame | undefined {
		if (frame?.type === "control_response") return this.classifyControlResponse(frame.response);
		if (frame?.type === "system" && frame.subtype === "control_request_progress") {
			const id = frame.request_id;
			const violation = (frame.status !== "started" && frame.status !== "api_retry") || typeof id !== "string" || !id
				? "malformed control_request_progress"
				: this.liveOutboundControls.get(id) !== "side_question" ? `uncorrelatable control_request_progress for request id ${JSON.stringify(id)}` : undefined;
			return { json: JSON.stringify(frame), violation };
		}
		if (frame?.type === "user" && frame.isReplay === true && (typeof frame.uuid !== "string" || !this.outboundUserIds.has(frame.uuid))) {
			return { json: JSON.stringify(frame), violation: `uncorrelatable user replay for UUID ${JSON.stringify(frame.uuid)}` };
		}
		return undefined;
	}

	private classifyControlResponse(reply: unknown): ConsumedRawFact {
		// Only a null/missing body makes the installed SDK throw while reading request_id.
		const malformed = reply == null;
		const id = isObject(reply) ? reply.request_id : undefined;
		let correlated = false;
		if (typeof id === "string") {
			correlated = this.liveOutboundControls.delete(id);
			const echo = this.pendingToolReplyEchoes.get(id);
			this.pendingToolReplyEchoes.delete(id);
			correlated ||= echo !== undefined && isDeepStrictEqual(echo, reply);
		}
		let error: string | undefined;
		if (!isObject(reply) || typeof id !== "string" || !id
			|| (reply.subtype !== "success" && reply.subtype !== "error")
			|| (reply.subtype === "success" && reply.response !== undefined && !isObject(reply.response))) {
			error = "malformed control_response";
		} else if (reply.subtype === "error") {
			error = this.replyError(reply.error);
		} else if (!correlated) {
			error = `uncorrelatable control_response for request id ${JSON.stringify(id)} (unknown or retired)`;
		}
		return { kind: "control_response", malformed, error };
	}

	private classifyControlRequest({ request, request_id }: WireFrame, sequence: number): ConsumedRawFact {
		if (typeof request_id !== "string" || !request_id || typeof request?.subtype !== "string") return { kind: "malformed_control_request" };
		// The SDK skips duplicate outer deliveries; nevertheless they are not inert.
		if (this.liveControls.has(request_id)) return { kind: "request_collision", requestId: request_id };
		this.liveControls.set(request_id, request);
		if (request.subtype !== "mcp_message") {
			// These are the only non-MCP child controls used by this bridge. The
			// SDK can allow malformed permission input or leave a control unanswered.
			const valid = request.subtype === "can_use_tool"
				? typeof request.tool_name === "string" && !!request.tool_name && typeof request.tool_use_id === "string" && !!request.tool_use_id && isObject(request.input)
				: request.subtype === "hook_callback" && typeof request.callback_id === "string" && !!request.callback_id && isObject(request.input);
			return valid ? { kind: "control_request", subtype: request.subtype, toolUseId: this.controlToolUseId(request) }
				: { kind: "malformed_control_request" };
		}
		const { server_name: server, message } = request;
		if (message?.method === "notifications/cancelled") {
			const { requestId, reason } = message.params ?? {};
			const toolUseId = typeof server === "string" && message.jsonrpc === "2.0" && message.id === undefined
				&& (typeof requestId === "string" || typeof requestId === "number") && (reason === undefined || typeof reason === "string")
				? this.lastMcpToolUseIds.get(server)?.get(requestId) : undefined;
			return { kind: "control_request", cancellation: { toolUseId, reason: typeof reason === "string" ? reason : undefined } };
		}
		const collision = message?.method === "tools/call" && typeof server === "string" && typeof request_id === "string"
			? this.indexMcpCall(server, request_id, message, sequence) : undefined;
		return { kind: "control_request", subtype: request.subtype, mcp: { server, message, collision } };
	}

	// Only the dispatch fence needs request identity. An overlap never overwrites
	// the real handler's binding; a completed request can legally free its id.
	private indexMcpCall(server: string, controlRequestId: string, message: McpWireMessage, sequence: number): McpRequestId | undefined {
		const id = message.id;
		if (message.jsonrpc !== "2.0" || (typeof id !== "string" && typeof id !== "number")) return undefined;
		let calls = this.mcpCalls.get(server);
		if (!calls) this.mcpCalls.set(server, calls = new Map());
		if (calls.has(id)) return id;
		const toolUseId = mcpToolUseId(message);
		calls.set(id, { sequence, controlRequestId, toolUseId });
		let previous = this.lastMcpToolUseIds.get(server);
		if (!previous) this.lastMcpToolUseIds.set(server, previous = new Map());
		if (toolUseId) previous.set(id, toolUseId);
		else previous.delete(id);
		return undefined;
	}

	private controlToolUseId(control: WireFrame["request"]): string | undefined {
		if (control?.subtype === "can_use_tool") return control.tool_use_id;
		if (control?.subtype === "mcp_message" && control.message?.method === "tools/call") return mcpToolUseId(control.message);
		return undefined;
	}

	private forgetControl(requestId: string, control: WireFrame["request"]): void {
		this.liveControls.delete(requestId);
		const { server_name: server, message } = control ?? {};
		if (typeof server !== "string" || message?.id === undefined) return;
		const calls = this.mcpCalls.get(server);
		if (calls?.get(message.id)?.controlRequestId === requestId) calls.delete(message.id);
	}

	private replyError(error: unknown): string {
		return typeof error === "string" && error ? error : "SDK rejected the request";
	}

	/** Observe request lifetimes and reply errors that the SDK never yields. */
	private observeSdkWrite(data: string): boolean {
		if (this.closed) return false;
		let addedFact = false;
		for (const line of data.split("\n")) {
			if (!line) continue;
			let frame: WireFrame;
			try { frame = JSON.parse(line) as WireFrame; } catch { continue; }
			if (frame?.type === "control_request" && typeof frame.request_id === "string" && typeof frame.request?.subtype === "string") {
				this.liveOutboundControls.set(frame.request_id, frame.request.subtype);
			} else if (frame?.type === "control_cancel_request" && typeof frame.request_id === "string") {
				this.liveOutboundControls.delete(frame.request_id);
			} else if (frame?.type === "user" && typeof frame.uuid === "string" && frame.uuid) {
				this.outboundUserIds.add(frame.uuid);
			}
			if (frame?.type !== "control_response") continue;
			const reply = frame.response as { request_id?: unknown; subtype?: unknown; error?: unknown; response?: {
				behavior?: unknown; message?: unknown; mcp_response?: { error?: { message?: unknown }; result?: { isError?: boolean; content?: unknown } };
			} } | undefined;
			const id = reply?.request_id;
			const control = typeof id === "string" ? this.liveControls.get(id) : undefined;
			if (typeof id === "string") this.forgetControl(id, control);
			const mcp = reply?.response?.mcp_response;
			if (typeof id === "string" && control?.subtype === "mcp_message" && control.message?.method === "tools/call"
				&& reply?.subtype === "success" && mcp?.result && !mcp.error) {
				this.pendingToolReplyEchoes.set(id, reply);
			}
			const error = reply?.subtype === "error" ? this.replyError(reply.error)
				: mcp?.error ? this.replyError(mcp.error.message)
				: reply?.response?.behavior === "deny" ? this.replyError(reply.response.message)
				: reply?.subtype !== "success" || !control ? "malformed or uncorrelatable SDK control reply" : undefined;
			this.pending.set(++this.sequenced, { kind: "sdk_reply", toolUseId: this.controlToolUseId(control),
				error, permission: control?.subtype === "can_use_tool",
				toolResultError: mcp?.result?.isError === true ? `MCP tool reply reported an error: ${JSON.stringify(mcp.result.content)}` : undefined });
			addedFact = true;
		}
		return addedFact;
	}

	spawn = (options: SpawnOptions): SpawnedProcess => {
		if (this.closed || this.started) throw new Error("Query process spawned after close or more than once");
		let failed = false;
		const reportFailure = (error: Error, pipe?: "stdin" | "stderr") => {
			if (failed || this.closed) return;
			failed = true;
			this.onFailure?.(error, pipe);
		};
		const onStdinError = (error: Error) => reportFailure(error, "stdin");
		const onStderrError = (error: Error) => reportFailure(error, "stderr");
		const onError = (error: Error) => reportFailure(error);
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			if (signal) reportFailure(new Error(`Claude Code process terminated by signal ${signal}`));
			else if (code !== null && code !== 0) reportFailure(new Error(`Claude Code process exited with code ${code}`));
		};
		const child = spawnClaudeRuntime(options, (data) => {
			this.stderrTail = (this.stderrTail + data).slice(-8_192);
			try { this.stderr?.(data); }
			catch (error) { onStderrError(error instanceof Error ? error : new Error(String(error))); }
		});
		// The SDK can wait for child exit before rejecting next(), and doesn't
		// listen to the custom launcher's stderr at all. Keep guards through close.
		this.started = true;
		this.child = child;
		const onInputClose = () => {
			if (!child.stdin.writableEnded && child.exitCode === null && child.signalCode === null && !child.killed) {
				onStdinError(new Error("Claude Code stdin closed unexpectedly"));
			}
		};
		child.stdin.on("error", onStdinError);
		child.stdin.once("close", onInputClose);
		const rawStdout = child.stdout;
		rawStdout.on("error", onError);
		let partial = "";
		let outputEnded = false;
		let nextDelivery: NodeJS.Immediate | undefined;
		const queued = new Set<{ sequence: number; line: string; terminator: string; frame: WireFrame | undefined; correlated?: ConsumedRawFact | YieldedFrame }>();
		const sdkOutput = this.trackIngress ? new PassThrough() : undefined;
		const wakeReducer = () => {
			if (!this.reduceFact) this.reduceConsumed();
			else if (this.onConsumedAvailable) queueMicrotask(this.onConsumedAvailable);
		};
		const enqueue = (line: string, terminator: string) => {
			let frame: WireFrame | undefined;
			try { frame = JSON.parse(line) as WireFrame; } catch { /* unknown frame */ }
			const sequence = ++this.sequenced;
			// Snapshot SDK→child identities at raw ingress, not after a delayed
			// delivery that may allow an unrelated write to claim an orphan.
			const correlated = this.closed ? undefined : this.correlateHostTraffic(frame);
			queued.add({ sequence, line, terminator, frame, correlated });
			if (this.closed) return;
			this.pending.set(sequence, null);
			try { this.onRawFrame?.(line, sequence); }
			catch (error) {
				this.rawObserverErrors.set(sequence, error instanceof Error ? error : new Error(String(error)));
			}
		};
		const deliver = () => {
			nextDelivery = undefined;
			if (!sdkOutput || sdkOutput.writableEnded) return;
			const lines: string[] = [];
			for (const entry of queued) {
				queued.delete(entry);
				const { sequence, line, terminator, frame, correlated } = entry;
				lines.push(line + terminator);
				if (this.closed) continue;
				this.pending.set(sequence, correlated ?? this.classifyLine(line, frame, sequence));
				if (frame?.type === "control_request" || frame?.type === "control_cancel_request") {
					// Let the pinned SDK reader consume this control and write any
					// immediate reply before we associate the next control owner.
					// Waiting a turn, not for a reply, keeps parked calls live.
					nextDelivery = setImmediate(deliver);
					break;
				}
			}
			if (lines.length) {
				sdkOutput.write(lines.join(""));
				if (!this.closed) wakeReducer();
			}
			if (outputEnded && !queued.size) sdkOutput.end();
		};
		const onData = (chunk: string) => {
			const lines = (partial + chunk).split("\n");
			partial = lines.pop()!;
			// Reserve the whole raw chunk before making any of it visible to the
			// SDK. Undelivered frames still block the fallback publish gate.
			for (const line of lines) enqueue(line, "\n");
			if (!nextDelivery) deliver();
		};
		if (sdkOutput) {
			sdkOutput.on("error", onError);
			child.stdout = sdkOutput;
			const stdin = child.stdin;
			const write = stdin.write;
			stdin.write = (chunk: unknown, ...args: unknown[]): boolean => {
				const written = Reflect.apply(write, stdin, [chunk, ...args]);
				if (typeof chunk === "string" && this.observeSdkWrite(chunk)) wakeReducer();
				return written;
			};
			child.once("close", () => { stdin.write = write; });
			rawStdout.setEncoding("utf8");
			rawStdout.on("data", onData);
		}
		const stopObservingOutput = () => {
			rawStdout.off("data", onData);
			rawStdout.off("end", onOutputEnd);
			rawStdout.off("close", onOutputEnd);
		};
		const onOutputEnd = () => {
			if (sdkOutput && partial) { enqueue(partial, ""); partial = ""; }
			outputEnded = true;
			stopObservingOutput();
			if (!this.closed) this.onOutputEnd?.();
			if (!nextDelivery) deliver();
		};
		rawStdout.once("end", onOutputEnd);
		rawStdout.once("close", onOutputEnd);
		child.stderr.on("error", onStderrError);
		child.on("error", onError);
		child.once("exit", onExit);
		child.once("close", () => {
			child.stdin.off("error", onStdinError);
			child.stdin.off("close", onInputClose);
			rawStdout.off("error", onError);
			sdkOutput?.off("error", onError);
			if (this.closed && nextDelivery) {
				clearImmediate(nextDelivery);
				deliver();
			}
			stopObservingOutput();
			child.stderr.off("error", onStderrError);
			child.off("error", onError);
			child.off("exit", onExit);
			this.resolveExit();
		});
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
		this.liveOutboundControls.clear();
		this.pendingToolReplyEchoes.clear();
		this.outboundUserIds.clear();
		if (!this.started) this.resolveExit();
	}
}
