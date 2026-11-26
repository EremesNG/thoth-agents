import { createAssistantMessageEventStream, parseStreamingJson, type AssistantMessage, type AssistantMessageEvent, type AssistantMessageEventStream, type Context, type ImageContent, type Model, type SimpleStreamOptions, type TextContent, type Tool, type UserMessage } from "@earendil-works/pi-ai";
import { getModels } from "@earendil-works/pi-ai/compat";
import { isToolCallEventType, VERSION as PI_VERSION, type ExtensionAPI, type ExtensionContext, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { query, type EffortLevel, type SDKMessage, type SDKRateLimitInfo, type SettingSource, type ThinkingConfig } from "@anthropic-ai/claude-agent-sdk";
import type { Base64ImageSource, ContentBlockParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources";
import { createSession, deleteSession, getSessionPath } from "cc-session-io";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, realpathSync, statSync } from "fs";
import { dirname } from "path";
import { PROVIDER_ID, messageContentToText } from "./convert.js";
import { NARRATION_HOLD_CHARS, isNarrationBlock } from "./narration.js";
import { mcpToolUseId, QueryProcess, type ConsumedRawFact } from "./query-process.js";
import { readTranscript, recordedToolResults, resolveRecordingCut, savePrefixSession } from "./session-transcript.js";
import { debugLogPath, diagLogPath } from "./log-paths.js";
import { applyLongContext, buildModels, claudeCodeModelId, extraUsageByChoice, type LongContextSettings } from "./models.js";
import { MCP_SERVER_NAME, MCP_TOOL_PREFIX } from "./skills.js";
import { MCP_TOOL_NAME_NOTE } from "./mcp-tool-note.js";
import { verifyWrittenSession as _verifyWrittenSession } from "./session-verify.js";
import { extractAllToolResults as _extractAllToolResults, type McpResult } from "./extract-tool-results.js";
import { digestMessage, digestMessages } from "./message-digests.js";
import { compareHistory, copyRecording, importHistory, LiveRecording, type Recording, type SessionState } from "./session-sync.js";
import { deleteSessionState, loadSessionState, saveSessionState } from "./session-store.js";
import { newAssistantOutput, QueryContext, type AssistantStep, type FallbackBatch } from "./query-state.js";
import { makePromptStream, userMessage, type PromptStream } from "./prompt-stream.js";
import { claudeCodeSettings, loadConfig, type Config } from "./config.js";
import {
	projectPromptCapture,
	sharedPromptCaptures,
	type PromptCapture,
} from "./prompt-capture.js";
import { collectCarriedAttachments } from "./attachments.js";
import { createToolServer, omittedToolSchemaWarning } from "./mcp-server.js";
import { normalizeToolSchema } from "./tool-schema.js";
import { nonSystemMessages, toBridgeContext } from "./transcript.js";
import { updateUsage, type SdkUsage } from "./usage.js";
import { AppendInstructions, parseAppendState } from "./append-instructions.js";
import { reportClaudeProviderLimit } from "./provider-limits.js";
import { fetchClaudeQuota } from "./quota.js";
import { forgetSessionCwd, rememberSessionCwd, rememberSummarySession, sessionCwdFor, summarySessionFor } from "./session-cwd.js";
import { rateLimitResponse } from "./rate-limit.js";
import { resolveAuxiliaryClaudeExecutable, resolveSdkClaudeExecutable } from "./claude-runtime.js";
import { BRIDGE_VERSION, packageVersion, setTraceNotifier, traceAssertReady, traceEvent, traceId, traceInput, traceQueryStart, traceSignalId, traceSnapshot, traceStrict } from "./cache-trace.js";

import { DEBUG, debug, makeCliDebugOptions, moduleInstanceId } from "./debug.js";
import { CC_CHILD_ENV, ccChildEnv, CLAUDE_MD_EXCLUDES, errorMessage, REASONING_TO_EFFORT, resultErrorText } from "./cc-child.js";

function claudeChildOptions(cwd = process.cwd()) {
	const executable = providerSettings.pathToClaudeCodeExecutable;
	return { cwd, env: ccChildEnv(), ...(executable ? { pathToClaudeCodeExecutable: executable } : {}) };
}

// Resolve auxiliary executables separately. Summary/quota keep the SDK launcher;
// the provider uses QueryProcess to observe its session writer exiting.
function makeAuxiliaryCliOptions(tag: string, executable?: string) {
	const resolved = resolveAuxiliaryClaudeExecutable(executable);
	return {
		...(resolved ? { pathToClaudeCodeExecutable: resolved } : {}),
		...makeCliDebugOptions(tag),
	};
}

/** Unconditional diagnostic dump — for "should never happen" paths. Creates pi's agent
 *  dir itself: callers run inside streamSimple, where a missing dir must not throw. */
function diagDump(label: string, data: Record<string, unknown>) {
	const ts = new Date().toISOString();
	const entry = { ts, moduleInstanceId, label, ...data };
	const logPath = diagLogPath();
	mkdirSync(dirname(logPath), { recursive: true });
	appendFileSync(logPath, JSON.stringify(entry) + "\n");
	debug(`DIAG: ${label} (see ${logPath})`);
}

// --- Constants ---

// Marks which bridge module instance owns the registered provider's stream fn.
// Full registration policy (first vs later instances, shared vs own registry):
// see the "--- Provider ---" block in activate() below.
const ACTIVE_STREAM_SIMPLE_KEY = Symbol.for("claude-bridge:activeStreamSimple");

// MODELS is buildModels(getModels("anthropic")) — projection kept in models.js.
const MODELS = buildModels(getModels("anthropic"));
let providerSettings: NonNullable<Config["provider"]> = {};
let longContextSettings: LongContextSettings = { plan: "pro", longContextExtraUsage: false };


// --- Session persistence ---

/** Mirror of the CC conversation one pi session's turns are running on. One
 *  entry per pi session: a bridge process serves several sessions at once
 *  (pi-subagents children run their own AgentSessions), and a single shared
 *  slot forced them to fight over it — a length-matching foreign sync could
 *  REUSE or rebuild another session's CC file, and the completion capture was
 *  last-writer-wins (a foreground child in the parent's first turn permanently
 *  reassigned the parent's conversation). Keyed lookup removes the fight: each
 *  session's reads, writes and teardown marks touch only its own mirror.
 *
 *  One registry per process, shared by every module instance (Symbol.for, like
 *  MARK_REBUILD_HOOKS_KEY): a /reload or worktree instance must see the newest
 *  in-memory state, compare-and-set against the same objects, and wait on the
 *  same stopping children, or an old instance's post-exit save could overwrite
 *  a newer pointer. */
const SESSION_REGISTRY_KEY = Symbol.for("claude-bridge:sessionRegistry");
interface SessionRegistry {
	states: Map<string, SessionState>;
	/** Keys whose persisted state has been read once; memory is authoritative after. */
	loaded: Set<string>;
	/** Real pi session ids this process has read or written state for. */
	known: Set<string>;
	writers: Map<string, Promise<void>>;
}
const sessionRegistry: SessionRegistry = ((globalThis as Record<symbol, unknown>)[SESSION_REGISTRY_KEY] as SessionRegistry | undefined)
	?? { states: new Map(), loaded: new Set(), known: new Set(), writers: new Map() };
(globalThis as Record<symbol, unknown>)[SESSION_REGISTRY_KEY] = sessionRegistry;
const sharedSessions = sessionRegistry.states;
const appendInstructions = new AppendInstructions();
const loadedSessionStates = sessionRegistry.loaded;
const knownSessionIds = sessionRegistry.known;

/** The mirror for `piSessionId`, or null when this session has none yet. A pi
 *  session reads its persisted pointer on first use (restart, /reload).
 *  Unattributed calls (a host that omits options.sessionId) cannot safely share a
 *  mirror, so they have none and always import independently. */
function sessionStateFor(piSessionId: string | null | undefined): SessionState | null {
	if (piSessionId == null) return null;
	if (!loadedSessionStates.has(piSessionId)) {
		knownSessionIds.add(piSessionId);
		const stored = loadSessionState(piSessionId, (message) => diagDump("session_state_rejected", { piSessionId, message }));
		loadedSessionStates.add(piSessionId);
		if (stored) sharedSessions.set(piSessionId, stored);
	}
	return sharedSessions.get(piSessionId) ?? null;
}

/** A pi fork or clone starts from its parent's state, dirty, so its first turn
 *  forks the parent's CC session instead of importing pi's history. Memory only:
 *  the parent's own pointer is saved only once its child exits. */
async function inheritSessionState(parentFile: string, piSessionId: string): Promise<void> {
	// An existing child pointer wins, including on a resume after a Pi restart.
	if (sessionStateFor(piSessionId)) return;
	let text: string;
	try { text = readFileSync(parentFile, "utf8"); }
	catch (error) {
		// pi writes a session file at its first message, so a parent without one has no state.
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	const header = JSON.parse(text.split("\n", 1)[0]);
	if (header?.type !== "session" || typeof header.id !== "string") throw new Error(`no session header in ${parentFile}`);
	// A provisional commit precedes child exit and append-evidence validation.
	// Copy only after that source writer has flushed its final recording.
	await waitForSessionWriter(sessionStateFor(header.id)?.ccSessionId);
	const parent = sessionStateFor(header.id);
	if (!parent || sessionStateFor(piSessionId)) return;
	setSessionStateFor(piSessionId, { ...parent, ...copyRecording(parent), appendState: parseAppendState(parent.appendState), dirtyTail: true });
	debug(`session_start:fork: inherited ${parent.ccSessionId} from piSession=${header.id} ${sessionTag(piSessionId)}`);
}

/** Replace (or plant) the mirror for `piSessionId`. */
function setSessionStateFor(piSessionId: string, state: SessionState | null): void {
	knownSessionIds.add(piSessionId);
	loadedSessionStates.add(piSessionId);
	if (state === null) sharedSessions.delete(piSessionId);
	else sharedSessions.set(piSessionId, state);
}

// pi replaced one of its sessions' history (compact, tree) rather than appending
// to it. Copied onto that session's parked queries (armStaleContexts), whose
// historyStale the tool-result path checks — the one provider call that never
// reaches syncSharedSession — so a query parked at a tool boundary is discarded
// rather than resumed (issue #101). Keyed by pi session id, not process-global: a bridge
// process serves several pi sessions at once (subagents run their own
// AgentSessions and can compact mid-run while the parent is parked), and
// marking across that boundary kills healthy queries (or, worse, rebuilds the
// parent around a compaction that never touched it).
const historyRewrittenBySession = new Set<string>();

/** Handlers that arm rewrite staleness, one per module instance. Worktree-
 *  spawned subagents can load this module fresh (pi's loader cache is keyed on
 *  cwd, and a worktree cwd clears it), while the serving instance — whose
 *  streamSimple the pi sessions actually call — is whoever registered first.
 *  A fresh instance must forward its session's rewrites to the serving one.
 *  Symbol.for: one registry per process, like SHARED_CAPTURES_KEY below. */
const MARK_REBUILD_HOOKS_KEY = Symbol.for("claude-bridge:markRebuildHooks");
type MarkRebuildHook = (piSession: string | null, event: string) => void;
const markRebuildHooks: Set<MarkRebuildHook> =
	((globalThis as Record<symbol, unknown>)[MARK_REBUILD_HOOKS_KEY] as Set<MarkRebuildHook> | undefined) ?? new Set();
(globalThis as Record<symbol, unknown>)[MARK_REBUILD_HOOKS_KEY] = markRebuildHooks;

/** pi mutated its messages array out from under us: force the next
 *  syncSharedSession down REBUILD, and arm the discard above. `piSession`
 *  is never null from an event handler (each pi session has its own runner);
 *  a null one marks nothing, since an unattributed caller has no mirror. */
function markRebuildForSession(piSession: string | null, event: string): void {
	// The rewriting session's own mirror: the rewrite changed the history it was
	// built from, so its next sync must REBUILD rather than REUSE. Every other
	// session's mirror stays untouched — its conversation was never rewritten.
	const state = piSession != null ? sharedSessions.get(piSession) : undefined;
	if (!state) {
		debug(`${event}: history rewritten, no session to mark yet ${sessionTag(piSession)}`);
	} else {
		state.dirtyTail = true;
		debug(`${event}: marking dirtyTail on session ${state.ccSessionId.slice(0, 8)} ${sessionTag(piSession)}`);
	}
	// Arming parked contexts cannot wait for delivery: the entry checks
	// `resultCtx.historyStale`, and a rewrite usually lands *while* the query is
	// parked (compaction runs inside pi's turn loop, not between provider calls).
	if (piSession) historyRewrittenBySession.add(piSession);
	armStaleContexts();
}

/** Copy each armed session's mark onto the parked queries built from it. */
function armStaleContexts(): void {
	for (const c of activeQueryContexts) {
		if (c.piSessionId && historyRewrittenBySession.has(c.piSessionId)) c.historyStale = true;
	}
}

// This instance enlists. Session ids reaching any hook equal options.sessionId
// on the serving instance's provider calls, so forwarding is safe: only the
// owning instance's contexts and SessionState match the key.
markRebuildHooks.add(markRebuildForSession);

/** Event handlers call this: it fans the rewrite out to every module instance
 *  in the process, of which exactly one is serving provider traffic for any
 *  given pi session. */
function sponsorMarkRebuildForSession(piSession: string | null, event: string): void {
	for (const hook of markRebuildHooks) hook(piSession, event);
}

// Pi doesn't pass tool results directly — it appends them to the context and calls
// the provider again. Thin wrapper over extract-tool-results.js that adds per-turn
// debug logging at the extraction boundary.
function extractAllToolResults(context: Context): McpResult[] {
	const results = _extractAllToolResults(context.messages as unknown as Array<{ role: string; [key: string]: unknown }>);
	if (DEBUG) {
		debug(`extractAllToolResults: ${results.length} results from ${context.messages.length} msgs`);
		debug(`extractAllToolResults: all msg roles:`, context.messages.map((m, i) => `[${i}]${m.role}`).join(" "));
		for (let r = 0; r < results.length; r++) {
			debug(`extractAllToolResults: result[${r}] id=${results[r].toolCallId}${results[r].isError ? " ERROR" : ""} preview:`, JSON.stringify(results[r].content).slice(0, 150));
		}
	}
	return results;
}

/** Index of the first message of the current user turn — the trailing run of
 *  user messages that has not been written into the Claude Code session yet.
 *  Equals messages.length when the last message is not a user message.
 *
 *  Single source of truth for the history/prompt split: everything before this
 *  index is replayed as session history, everything from it onward becomes the
 *  prompt. Deriving both halves from one index is what keeps a message from
 *  landing in both — an extension appending a display-only user message after
 *  the real one (see issue #34) makes the turn longer than one message. */
function turnStart(messages: Context["messages"]): number {
	let i = messages.length;
	while (i > 0 && messages[i - 1].role === "user") i--;
	return i;
}

/** The user messages each pi session's last request ended with, to notice when pi
 *  never keeps them: an extension's `context` hook appending a message to every
 *  request (issue #246). Claude Code records each copy and puts its cache marker
 *  on it, so cutting the copy out on the next request leaves nothing cached past
 *  the system prompt. pi hands the provider a plain user message, so the warning
 *  can only quote it, not name the extension. */
const sentTurns = new Map<string, { index: number; digests: string[]; texts: string[]; dropped: number }>();
const DROPPED_TURNS_BEFORE_WARNING = 3;

function noticeDroppedTurn(piSessionId: string, messages: Context["messages"]): void {
	const start = turnStart(messages);
	const previous = sentTurns.get(piSessionId);
	const rewritten = historyRewrittenBySession.has(piSessionId);
	// A retry neither adds to nor breaks the streak; a rewrite (compaction, /tree) resets it.
	let dropped = previous && start === previous.index && !rewritten ? previous.dropped : 0;
	if (previous && start > previous.index && !rewritten) {
		const missing = previous.digests.findIndex((digest, i) => {
			const now = messages[previous.index + i];
			return now?.role !== "user" || digestMessage(now) !== digest;
		});
		if (missing !== -1) {
			dropped = previous.dropped + 1;
			const text = previous.texts[missing].replace(/\s+/g, " ").trim();
			debug(`provider: pi did not keep a message the previous request sent (${dropped} in a row): ${text.slice(0, 80)} ${sessionTag(piSessionId)}`);
			if (dropped === DROPPED_TURNS_BEFORE_WARNING) {
				const quote = text.length > 60 ? `${text.slice(0, 60)}...` : text;
				piUI?.notify(`Claude bridge: an extension adds a message to every request without saving it ("${quote}"), so every request rewrites the whole prompt cache. `
					+ "Disable that extension, or ask its author to save the message with pi.sendMessage instead of adding it in a context hook. "
					+ "See \"Extensions that add a message to every request\" in the pi-claude-bridge README.", "warning");
			}
		}
	}
	const turn = messages.slice(start) as UserMessage[];
	sentTurns.set(piSessionId, {
		index: start,
		digests: turn.map(digestMessage),
		texts: turn.map((m) => (typeof m.content === "string" ? m.content : messageContentToText(m.content))),
		dropped,
	});
}

/** Extract the current user turn as a prompt string. Returns null if the last message is not a user message. */
function extractUserPrompt(messages: Context["messages"]): string | null {
	const turn = messages.slice(turnStart(messages)) as UserMessage[];
	if (turn.length === 0) return null;
	// Drop empties before joining so an all-empty turn still yields "" and trips
	// the caller's empty-prompt guard rather than sending bare newlines.
	return turn
		.map((m) => (typeof m.content === "string" ? m.content : messageContentToText(m.content)))
		.filter((text) => text)
		.join("\n");
}

/** Extract the current user turn as ContentBlockParam[] (preserving images).
 *  Returns null if no images — caller should fall back to string prompt. */
function extractUserPromptBlocks(messages: Context["messages"]): ContentBlockParam[] | null {
	const turn = messages.slice(turnStart(messages)) as UserMessage[];
	if (turn.length === 0) return null;

	let hasImage = false;
	const blocks: ContentBlockParam[] = [];
	for (const message of turn) {
		const content: (TextContent | ImageContent)[] = typeof message.content === "string"
			? [{ type: "text", text: message.content }]
			: message.content;
		// Off-type content violates UserMessage's contract, so fail rather than
		// degrade — but name the shape, since the cause is almost always another
		// extension appending a malformed message, not this file.
		if (!Array.isArray(content)) {
			throw new Error(
				`extractUserPromptBlocks: user message content must be a string or block array, got ${typeof content} — likely a malformed message from another extension`,
			);
		}
		for (const block of content) {
			if (block.type === "text" && block.text) {
				blocks.push({ type: "text", text: block.text });
			} else if (block.type === "image") {
				// Guard before logging: data-less image blocks do occur, and reading
				// .length off the missing field in the debug template would throw
				// before this check ever runs (template args evaluate unconditionally).
				if (!block.data || !block.mimeType) {
					debug(`image block missing data or mimeType, skipping: keys=${Object.keys(block).join(",")}`);
					continue;
				}
				debug(`image block: mimeType=${block.mimeType}, data length=${block.data.length}`);
				hasImage = true;
				blocks.push({
					type: "image",
					source: {
						type: "base64",
						media_type: block.mimeType as Base64ImageSource["media_type"],
						data: block.data,
					},
				});
			}
		}
	}
	debug(`extractUserPromptBlocks: ${turn.length} msgs in turn, ${blocks.length} blocks, types=${blocks.map((b) => b.type).join(",")}`);
	return hasImage ? blocks : null;
}

/** Name a failure as a rate limit when a rejection preceded it.
 *
 *  pi has no typed rate-limit error — `stopReason` is only ever `"error"` and the sole carrier
 *  is `errorMessage` — so everything that reacts to a rate limit pattern-matches that string:
 *  pi-subagents gates `fallbackModels` on its own pattern list, and key-rotating extensions use
 *  their own. Claude Code words a subscription limit as "You're out of extra usage · resets
 *  6:30pm", which matches none of them, so an exhausted quota reads as a fatal error and the
 *  fallback chain never runs (issue #58).
 *
 *  Leading with "Claude quota exceeded — rate limit" rather than appending keeps both phrases
 *  in any truncated render, and avoids the `<tool> failed (exit N):` shape that pi-subagents
 *  treats as a tool failure and refuses to retry. "quota exceeded" is on pi-ai's non-retryable
 *  list, which wins over its retryable "rate limit" pattern, so pi hands the rejected window
 *  straight to fallback instead of retrying a limit that resets in hours (issue #183). */
function describeRateLimitFailure(rejection: { rateLimitType?: string; resetsAt?: number }, failure: string): string {
	const kind = rejection.rateLimitType ? ` (${rejection.rateLimitType})` : "";
	const resets = rejection.resetsAt ? ` — resets ${new Date(rejection.resetsAt * 1000).toLocaleTimeString()}` : ""; // resetsAt: Unix seconds (unit undocumented in the SDK; observed)
	return `Claude quota exceeded — rate limit${kind}${resets}: ${failure}`;
}

/** A qualified suspicion for unexplained Extra Usage billing/refusal, not a
 *  confirmed cause (diag/EXTRA-USAGE-400.md). */
const THIRD_PARTY_SUSPECT = "no plan limit was reported as reached, so Anthropic may have read the system prompt as a third-party app";

/** Report before the next stream event. Hook failures are provisional until
 *  this attempt stages a served fallback tool. */
async function reportHeldRateLimit(c: QueryContext, model: Model<any>): Promise<void> {
	const info = c.heldRateLimit;
	const stream = c.currentPiStream;
	if (!info || !stream || !c.currentOnResponse) return;
	c.heldRateLimit = undefined;
	try {
		await c.currentOnResponse(rateLimitResponse(info), model);
	} catch (error) {
		if (c.currentPiStream !== stream) return;
		// The reducer awaits this hook before it can process a retry.
		latchFallbackViolation(c, asError(error));
		if (!c.observedFailure) logCleanupFailure("rate limit: onResponse failed", error);
	}
}

/** `context` must already be in bridge shape (toBridgeContext). */
function isolatedStreamFn(model: Model<any>, context: Context, options?: SimpleStreamOptions, traceCallId?: string): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();
	void runIsolatedSummary(model, context, options, stream, traceCallId);
	return stream;
}

async function runIsolatedSummary(
	model: Model<any>,
	context: Context,
	options: SimpleStreamOptions | undefined,
	stream: AssistantMessageEventStream,
	traceCallId?: string,
): Promise<void> {
	// pi delivers compaction/branch-summary requests as a transcript: the summarization
	// prompt folded into a leading system message ahead of the lone user message
	// (issue #106). toBridgeContext restores the prompt/tools fields the extraction
	// assertion below assumes; the summarization prompt still reaches CC as its systemPrompt.
	context = toBridgeContext(context);
	// Summary routing ids can be synthetic; use the owning Pi session for cwd and quota.
	const piSessionId = summarySessionFor(options?.signal) ?? options?.sessionId;
	let sdkQuery: ReturnType<typeof query> | undefined;
	let wasAborted = false;
	const traceQueryId = traceId("summary");
	const onAbort = () => {
		wasAborted = true;
		void sdkQuery?.interrupt().catch(() => {});
		try { sdkQuery?.close(); } catch {}
	};

	try {
		const promptText = extractUserPrompt(context.messages);
		if (!promptText) throw new Error("runIsolatedSummary: one-off summary without a user prompt (last message is not user?)");
		const cwd = sessionCwdFor(piSessionId);
		const claudeExecutable = providerSettings.pathToClaudeCodeExecutable;
		const cliModel = claudeCodeModelId(model, longContextSettings);
		// Honour the caller's reasoning level, same mapping as the provider path.
		const effort = effortForReasoning(model, options?.reasoning);
		const thinking = thinkingForReasoning(model, options?.reasoning);
		debug(`compact summary: spawn model=${cliModel} registeredModel=${model.id} effort=${effort ?? "default"}${thinking ? " thinking=disabled" : ""} promptLen=${promptText.length}`);

		sdkQuery = auxiliaryQueryImpl({
			prompt: promptText,
			options: {
				cwd,
				env: traceQueryStart(traceQueryId, { kind: "isolated-summary", callId: traceCallId, model: cliModel }, ccChildEnv(options?.env)),
				settings: { autoMemoryEnabled: false },
				tools: [],
				strictMcpConfig: true,
				settingSources: [] as SettingSource[],
				skills: [],
				persistSession: false,
				systemPrompt: context.systemPrompt,
				model: cliModel,
				maxTurns: 1,
				...(effort ? { effort } : {}),
				...(thinking ? { thinking } : {}),
				...makeAuxiliaryCliOptions("compact-summary", claudeExecutable),
			},
		});

		if (options?.signal) {
			if (options.signal.aborted) onAbort();
			else options.signal.addEventListener("abort", onAbort, { once: true });
		}

		let assistantText = "";
		let finalText = "";
		let errorText: string | undefined;
		let firstEventLogged = false;

		for await (const message of sdkQuery) {
			reportClaudeProviderLimit(message, piSessionId);
			if (!firstEventLogged) {
				debug(`compact summary: first event type=${message.type}`);
				firstEventLogged = true;
			}
			if (wasAborted) break;

			if (message.type === "assistant") {
				for (const block of (message as any).message?.content ?? []) {
					if (block.type === "text" && typeof block.text === "string") assistantText += block.text;
				}
			} else if (message.type === "result") {
				logServedContextWindow("compact summary", message, model);
				errorText = resultErrorText(message);
				if (!errorText && message.subtype === "success") finalText = message.result || assistantText;
			}
		}

		if (wasAborted) {
			const output = newAssistantOutput(model, "", "aborted", "Operation aborted");
			debug("compact summary: aborted");
			endStream(stream, { type: "error", reason: "aborted", error: output });
			return;
		}

		const text = finalText || assistantText;
		if (errorText || !text.trim()) {
			const msg = errorText ?? "Claude Code summary returned empty text";
			debug(`compact summary: error ${msg}`);
			endStream(stream, { type: "error", reason: "error", error: newAssistantOutput(model, "", "error", msg) });
			return;
		}

		debug(`compact summary: done textLen=${text.length}`);
		endStream(stream, { type: "done", reason: "stop", message: newAssistantOutput(model, text, "stop") });
	} catch (err) {
		const msg = errorMessage(err);
		debug("runIsolatedSummary threw; pushing terminal error", err);
		endStream(stream, { type: "error", reason: "error", error: newAssistantOutput(model, "", "error", msg) });
	} finally {
		options?.signal?.removeEventListener("abort", onAbort);
		if (sdkQuery) traceEvent("query-end", { queryId: traceQueryId, aborted: wasAborted });
		try { sdkQuery?.close(); } catch {}
	}
}

interface SyncResult {
	sessionId: string | null;
	targetSessionId: string;
	created: boolean;
	/** The system prompt and refresh-bearing records belong to an existing epoch. */
	retained: boolean;
	forkAt?: string;
	recorded: Recording;
	/** Identity token, retained until progress/completion commits this query. */
	state: SessionState | null;
}

// Children that are stopping or finishing, registered before their state is
// committed. Readers of their file wait for actual child exit, never just SDK
// iterator settlement. A healthy parked query is absent: it only appends past
// every committed cut, so a reader never waits on it. Process-wide (see
// SESSION_REGISTRY_KEY).
const sessionWriters = sessionRegistry.writers;
async function waitForSessionWriter(sessionId: string | undefined, signal?: AbortSignal): Promise<void> {
	const exited = sessionId ? sessionWriters.get(sessionId) : undefined;
	if (!exited) return;
	signal?.throwIfAborted();
	if (!signal) return exited;
	await new Promise<void>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		void exited.then(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		});
	});
}
function prefixRecording(recorded: Recording, count: number): Recording {
	return { digests: recorded.digests.slice(0, count), uuids: recorded.uuids.slice(0, count), cuttable: recorded.cuttable.slice(0, count) };
}

/**
 * Ensure the shared session has all messages up to (but not including) the last user message.
 * Returns session ID to resume from, or null if no resume needed.
 */
// Read the session file we just wrote and sanity-check it. Warns instead of
// throwing — CC may be more tolerant than our checks, so a false positive
// shouldn't block the user. Pure logic is in session-verify.js; this wrapper
// fans each warning out to debug log + piUI notify + diagDump.
function verifyWrittenSession(
	jsonlPath: string,
	expectedSessionId: string,
	expectedRecordCount: number,
	cwd: string,
): void {
	const warnings = _verifyWrittenSession(jsonlPath, expectedSessionId, expectedRecordCount);
	for (const msg of warnings) {
		debug(`WARNING session verify: ${msg}`);
		piUI?.notify(
			`Session file issue: ${msg}\n` +
			`cwd=${cwd} realpath=${safeRealpath(cwd)} CLAUDE_CONFIG_DIR=${process.env.CLAUDE_CONFIG_DIR ?? "(unset)"}\n` +
			`Please copy and paste this message into a new issue at https://github.com/elidickinson/pi-claude-bridge/issues/new` +
			(DEBUG ? ` and attach ${debugLogPath()}` : ` (rerun with CLAUDE_BRIDGE_DEBUG=1 to capture a debug log)`),
			"warning",
		);
		diagDump("session_verify_fail", { msg, jsonlPath, cwd, realpath: safeRealpath(cwd), claudeConfigDir: process.env.CLAUDE_CONFIG_DIR ?? null });
	}
}

function safeRealpath(p: string): string {
	try { return realpathSync(p); } catch (e) { return `<failed: ${(e as Error).message}>`; }
}

// Diagnostic snapshot of where a session file was just written. Catches the
// class of bugs where pi writes to ~/.claude/projects/<X> but CC SDK reads
// from ~/.claude/projects/<Y> (symlinks, CLAUDE_CONFIG_DIR, hash mismatch).
function debugSessionPaths(label: string, cwd: string, jsonlPath: string): void {
	if (!DEBUG) return;
	const realCwd = safeRealpath(cwd);
	let fileSize: number | null = null;
	let fileExists = false;
	try {
		const st = statSync(jsonlPath);
		fileExists = true;
		fileSize = st.size;
	} catch { /* file may not exist yet */ }
	debug(`${label}: cwd=${cwd}`);
	if (realCwd !== cwd) debug(`${label}: realpath(cwd)=${realCwd} (DIFFERS — symlink-resolved path is what CC SDK uses)`);
	debug(`${label}: jsonlPath=${jsonlPath}`);
	debug(`${label}: fileExists=${fileExists}${fileSize != null ? ` size=${fileSize}` : ""}`);
	debug(`${label}: env.CLAUDE_CONFIG_DIR=${process.env.CLAUDE_CONFIG_DIR ?? "(unset)"} HOME=${process.env.HOME ?? "(unset)"}`);
}

// Compare pi's values, then retain CC's own records up to the last valid cut.
function syncSharedSession(
	messages: Context["messages"],
	cwd: string,
	customToolNameToSdk?: Map<string, string>,
	modelId = "",
	piSessionId?: string | null,
	traceCallId?: string,
	wrappedToolNames?: ReadonlySet<string>,
): SyncResult {
	let state = piSessionId != null ? sessionStateFor(piSessionId) : null;
	const before = state;
	const history = nonSystemMessages(messages);
	const priors = history.slice(0, turnStart(history));
	const compared = state ? compareHistory(digestMessages(priors), state) : { commonPrefix: 0, cutCount: 0, equal: false };
	let missingFile = false;
	if (state) {
		try { statSync(getSessionPath(state.ccSessionId, state.cwd, process.env.CLAUDE_CONFIG_DIR)); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			missingFile = true;
			debug(`sync: missing transcript ${state.ccSessionId} in recorded cwd=${state.cwd}; importing pi history`);
			setSessionStateFor(piSessionId!, null);
			deleteSessionState(piSessionId!);
			state = null;
		}
	}
	const cwdChanged = Boolean(state && safeRealpath(state.cwd) !== safeRealpath(cwd));
	const row = piSessionId == null ? 0 : !state ? (priors.length ? 2 : 1) : state.model !== modelId ? 3
		: cwdChanged ? 5
		: compared.equal && !state.dirtyTail ? 4 : !compared.cutCount ? 5 : compared.cutCount === priors.length ? 6 : 7;
	const reason = piSessionId == null ? "unattributed-history" : missingFile ? "missing-transcript" : !state ? "no-state"
		: state.model !== modelId ? "model-changed" : cwdChanged ? "cwd-changed"
		: row === 4 ? "equal-digests" : state.dirtyTail && compared.equal ? "dirty-tail" : "history-difference";
	const decision = (path: string, after: string) => {
		traceStrict("decision", {
			callId: traceCallId, piSessionId: piSessionId ?? null, row, path, reason,
			commonPrefix: compared.commonPrefix, cutCount: compared.cutCount,
			ccSessionBefore: before?.ccSessionId ?? null, ccSessionAfter: after, priors: priors.length,
			dirtyTail: Boolean(state?.dirtyTail), missingFile, cwdChanged, cwd, mirrorCwd: before?.cwd ?? null,
		});
		debug(`syncResult: path=${path} sessionId=${after} from=${before?.ccSessionId ?? "none"} priors=${priors.length} commonPrefix=${compared.commonPrefix} cutCount=${compared.cutCount} row=${row} ${sessionTag(piSessionId)}`);
	};
	if (row === 4) {
		decision("reuse", state!.ccSessionId);
		appendInstructions.restore(state!.ccSessionId, state!.appendState, readTranscript(state!));
		return { sessionId: state!.ccSessionId, targetSessionId: state!.ccSessionId, created: false, retained: true, recorded: copyRecording(state!), state };
	}
	if (state) traceSnapshot({ callId: traceCallId, ccSession: state.ccSessionId, cwd: state.cwd, reason: "rebuild-rotate", writer: "no-known-writer" }, true);
	const session = createSession({ projectPath: cwd, claudeDir: process.env.CLAUDE_CONFIG_DIR, model: modelId });
	const targetSessionId = session.sessionId;
	let recorded: Recording;
	let records = 0;
	if (row === 6 || row === 7) {
		const transcript = readTranscript(state!);
		const cut = resolveRecordingCut(transcript, state!, compared.cutCount);
		recorded = prefixRecording(state!, compared.cutCount);
		appendInstructions.restore(targetSessionId, state!.appendState, transcript, cut.index + 1);
		if (row === 6) {
			decision("fork", targetSessionId);
			return { sessionId: state!.ccSessionId, targetSessionId, created: true, retained: true, forkAt: cut.uuid, recorded, state };
		}
		const rest = priors.slice(compared.cutCount);
		const replaced = transcript.slice(cut.index + 1);
		const suffix = importHistory(session, rest, customToolNameToSdk, collectCarriedAttachments(replaced), recordedToolResults(replaced, state!.digests, rest), wrappedToolNames);
		recorded = { digests: [...recorded.digests, ...suffix.digests], uuids: [...recorded.uuids, ...suffix.uuids], cuttable: [...recorded.cuttable, ...suffix.cuttable] };
		records = savePrefixSession(session, transcript.slice(0, cut.index + 1), cut.uuid);
	} else {
		// Nothing is kept, but unchanged messages retain their file expansions and
		// verbatim CC tool results. Both are validated against Pi history.
		const transcript = state ? readTranscript(state) : [];
		recorded = importHistory(session, priors, customToolNameToSdk, collectCarriedAttachments(transcript), recordedToolResults(transcript, state?.digests ?? [], priors), wrappedToolNames);
		session.save();
		records = session.records.length;
	}
	if (records) verifyWrittenSession(session.jsonlPath, targetSessionId, records, cwd);
	decision(row === 7 ? "prefix-write" : records ? "rebuild" : "clean-start", targetSessionId);
	traceEvent("rebuild-written", { callId: traceCallId, piSessionId: piSessionId ?? null, ccSessionAfter: targetSessionId, records });
	debugSessionPaths(targetSessionId.slice(0, 8), cwd, session.jsonlPath);
	return { sessionId: records ? targetSessionId : null, targetSessionId, created: true, retained: row === 7, recorded, state };
}

// Provider doubles must not swap out the isolated summary subprocesses.
let queryImpl: typeof query = query;
let auxiliaryQueryImpl: typeof query = query;

// @internal
export const __test = {
	setQuery(fn: typeof query | null) {
		queryImpl = fn ?? query;
	},
	setAuxiliaryQuery(fn: typeof query | null) {
		auxiliaryQueryImpl = fn ?? query;
	},
	isolatedStreamFn,
	resetSharedSession(piSessionId?: string) {
		// No id: full reset (the pre-map semantics — tests start from a blank slate),
		// including the persisted pointers of ids this process used, and only those.
		if (piSessionId === undefined) {
			for (const id of knownSessionIds) deleteSessionState(id);
			knownSessionIds.clear();
			sharedSessions.clear();
			loadedSessionStates.clear();
			appendInstructions.clear();
		} else {
			setSessionStateFor(piSessionId, null);
			deleteSessionState(piSessionId);
		}
		historyRewrittenBySession.clear();
		sentTurns.clear();
	},
	noticeDroppedTurn,
	/** A restart: drop memory, keep every persisted pointer. */
	forgetSessionMemory() {
		sharedSessions.clear();
		loadedSessionStates.clear();
		appendInstructions.clear();
	},
	markRebuildForSession,
	historyRewrittenBySession,
	armStaleContexts,
	discardRewrittenQuery,
	contextForToolResults,
	get activeQueryContexts() {
		return activeQueryContexts;
	},
	setSharedSession(piSessionId: string, state: SessionState | null) {
		setSessionStateFor(piSessionId, state);
	},
	getSharedSession(piSessionId?: string | null) {
		return sessionStateFor(piSessionId);
	},
	setPiUI(ui: ExtensionUIContext | null) {
		piUI = ui;
	},
	toBridgeContext,
	effortForReasoning,
	thinkingForReasoning,
	syncSharedSession,
	extractUserPromptBlocks,
	consumeQuery,
	finalizeCurrentStream,
	resultErrorText,
	deliverToolResults,
	drainForAbort,
	CC_CHILD_ENV,
	ccChildEnv,
	buildMcpServers,
	get promptCaptures() {
		return promptCaptures;
	},
};

// --- Provider helpers: tool name mapping ---

// Provider path: the query runs with `tools: []`, so the only tools CC can
// legitimately call are the pi tools we serve over MCP. Any other name is the
// model hallucinating a builtin (`bash`, `Bash`, `Edit`, an MCP server we don't
// serve). CC answers those itself with "No such tool available" and retries
// inside the same query, never dispatching them to our MCP server — so a tool
// call under such a name must not reach pi. Forwarding one ran a tool CC never
// dispatched (real side effects) and, because the retry carries a fresh
// tool_use id, left the handler for the retry with no result to release it:
// pi's result arrived keyed to the dead id, and both sides deadlocked.
// Names match exactly: CC dispatches only the name we serve, so a served name
// in the wrong case is one of these too.
function piToolNameFor(name: string, customToolNameToPi: Map<string, string>): string | undefined {
	return customToolNameToPi.get(name);
}

// Renames for Claude Code SDK param names that differ from pi's native names.
// Keys not listed here pass through unchanged, so new pi params work automatically.
const SDK_KEY_RENAMES: Record<string, Record<string, string>> = {
	read:  { file_path: "path" },
	write: { file_path: "path" },
	edit:  { file_path: "path", old_string: "oldText", new_string: "newText", old_text: "oldText", new_text: "newText" },
};

// Maps SDK tool args to pi tool args via key renaming + pass-through.
// Pi's own prepareArguments hooks handle any structural transforms (e.g. edit oldText/newText → edits[]).
function mapToolArgs(
	toolName: string, args: Record<string, unknown> | undefined,
	wrappedToolNames?: ReadonlySet<string>,
): Record<string, unknown> {
	const input = (wrappedToolNames?.has(toolName) ? args?.input as Record<string, unknown> | undefined : args) ?? {};
	const renames = SDK_KEY_RENAMES[toolName.toLowerCase()];
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		const piKey = renames?.[key] ?? key;
		if (!(piKey in result)) result[piKey] = value; // first alias wins
	}
	if (toolName.toLowerCase() === "edit") {
		const single = (value: unknown): boolean => Boolean(value && typeof value === "object"
			&& typeof (value as Record<string, unknown>).oldText === "string" && typeof (value as Record<string, unknown>).newText === "string");
		if (typeof result.edits === "string") {
			try {
				const parsed: unknown = JSON.parse(result.edits);
				if (Array.isArray(parsed)) result.edits = parsed;
				else if (single(parsed)) result.edits = [parsed];
			} catch { /* Invalid JSON is left for pi's argument validation. */ }
		} else if (single(result.edits)) result.edits = [result.edits];
	}
	return result;
}

// --- Query state ---
// QueryContext lives in query-state.js so tests can import it without
// activating the extension.

// Global (not query state):
let piUI: ExtensionUIContext | null = null;
setTraceNotifier((message) => {
	debug(message);
	piUI?.notify(message, "error");
});
let piMode: ExtensionContext["mode"] | null = null;
const activeQueryContexts = new Set<QueryContext>();

// Children may evaluate a fresh module but inherit the parent's pinned stream.
// Attribute warning dedup to the Pi session, shared across module instances.
const TOOL_SCHEMA_SESSIONS_KEY = Symbol.for("claude-bridge:toolSchemaSessions");
interface ToolSchemaSession {
	warnedTools: Set<string>;
	ui?: ExtensionUIContext;
	mode?: ExtensionContext["mode"];
}
const toolSchemaSessions: Map<string | null, ToolSchemaSession> =
	(globalThis as Record<symbol, any>)[TOOL_SCHEMA_SESSIONS_KEY] ??=
		new Map<string | null, ToolSchemaSession>();

function toolSchemaSessionFor(piSessionId: string | null): ToolSchemaSession {
	let session = toolSchemaSessions.get(piSessionId);
	if (!session) {
		session = { warnedTools: new Set() };
		toolSchemaSessions.set(piSessionId, session);
	}
	return session;
}

function warnOmittedTool(toolName: string, piSessionId: string | null): void {
	const session = toolSchemaSessionFor(piSessionId);
	if (session.warnedTools.has(toolName)) return;
	session.warnedTools.add(toolName);
	const message = omittedToolSchemaWarning(toolName);
	let uiNotified = false;
	try {
		session.ui?.notify?.(message, "warning");
		uiNotified = typeof session.ui?.notify === "function" && (session.mode === "tui" || session.mode === "rpc");
	} catch { /* A warning must not turn an omitted tool into a failed request. */ }
	// SDK children can have a no-op UI or never emit session_start. Stderr is
	// observable without DEBUG, unlike ui.notify alone; do not notify a parent's UI.
	if (!uiNotified) console.warn(`${message} (session: ${piSessionId ?? "(none)"})`);
	try {
		debug(`WARNING ${message} session=${piSessionId ?? "(none)"}`);
		diagDump("tool_schema_omitted", { piSessionId, toolName, message });
	} catch { /* UI/stderr still reports the warning if diagnostic storage is unavailable. */ }
}

// Captures of what pi assembled per agent; see src/prompt-capture.ts for why this
// is keyed rather than held in a single slot. One process-wide instance, shared
// across every extension module instance: isolated subagents re-evaluate this
// module, and the pinned stream they all route through resolves against it.
const promptCaptures = sharedPromptCaptures((diagnostic) => {
	const first = diagnostic.matches[0];
	debug(
		`prompt-capture: no match for ${diagnostic.systemPrompt.length}-char system prompt. `
		+ (first
			? `closest known (${first.key.length}-char) shares its first ${first.firstDivergent} chars and diverges at offset ${first.firstDivergent}: `
			  + JSON.stringify(diagnostic.systemPrompt.slice(first.firstDivergent - 40, first.firstDivergent + 60))
			: "no known captures to compare against."
		) + ` known keys=${diagnostic.matches.length}`,
	);
});

/** Close every query a shutting-down pi session still holds, keeping its progress
 *  for a later resume. Scoped to that session: subagents run in the parent's
 *  process and shut down while the parent's query is still live.
 *
 *  A live query here is expected: a tool that returns `terminate: true` ends pi's
 *  run with Claude Code still parked on its result, and that child would keep the
 *  process alive after pi is done (issue #210). A context with no query is a leak
 *  that costs something real: it routes a later orphaned tool result into the
 *  delivery path and returns a stream nobody ends. That leak was present on every
 *  single happy-path run and no test noticed, because nothing asserted that
 *  anything ends clean — so assert it where the real sessions are, and let
 *  diag/audit-warnings.mjs scan for it. */
function closeSessionQueries(piSessionId: string): void {
	for (const c of [...activeQueryContexts]) {
		if (c.piSessionId !== piSessionId) continue;
		debug(
			`${c.activeQuery ? "session_shutdown: closing parked query" : "WARNING: session_shutdown left a context with no query"} — `
			+ `pendingToolCalls=${c.pendingToolCalls.size} promptStream=${c.promptStream !== null}`,
		);
		discardRewrittenQuery(c);
	}
}

/** The parked query of this pi session that these results answer. Tool-call ids
 *  repeat across sessions whenever one copies another's history (a fork, a worker
 *  seeded from its host), so an id alone could deliver one session's turn into
 *  another's Claude Code query. */
function contextForToolResults(results: McpResult[], piSessionId: string | null): QueryContext | undefined {
	for (const result of results) {
		const id = result.toolCallId;
		if (!id) continue;
		for (const queryCtx of activeQueryContexts) {
			if (queryCtx.piSessionId !== piSessionId) continue;
			if (queryCtx.pendingToolCalls.has(id) || queryCtx.pendingResults.has(id) || queryCtx.turnToolCallIds.includes(id)) {
				return queryCtx;
			}
		}
	}
	return undefined;
}

function resolveMcpTools(context: Context): {
	mcpTools: Tool[];
	customToolNameToSdk: Map<string, string>;
	customToolNameToPi: Map<string, string>;
	wrappedToolNames: Set<string>;
} {
	const mcpTools: Tool[] = [];
	const customToolNameToSdk = new Map<string, string>();
	const customToolNameToPi = new Map<string, string>();
	const wrappedToolNames = new Set<string>();

	if (!context.tools) return { mcpTools, customToolNameToSdk, customToolNameToPi, wrappedToolNames };

	for (const tool of context.tools) {
		mcpTools.push(tool); // Keep omitted tools here so server construction reports them.
		const advertisedSchema = normalizeToolSchema(tool.parameters);
		if (!advertisedSchema) continue;
		if (advertisedSchema !== tool.parameters) {
			wrappedToolNames.add(tool.name);
			wrappedToolNames.add(tool.name.toLowerCase());
		}
		const sdkName = `${MCP_TOOL_PREFIX}${tool.name}`;
		customToolNameToSdk.set(tool.name, sdkName);
		customToolNameToSdk.set(tool.name.toLowerCase(), sdkName);
		customToolNameToPi.set(sdkName, tool.name);
	}

	return { mcpTools, customToolNameToSdk, customToolNameToPi, wrappedToolNames };
}

// Reply only to Claude Code. A tool error releases serial MCP dispatch without
// involving Pi, and is not itself a transport or protocol failure.
const retiredToolResult: McpResult = {
	content: [{ type: "text", text: "Claude Code retried the response for this tool call" }], isError: true,
};

// Pair query-scoped calls and results by tool-use ID; either may arrive first.
function buildMcpServers(tools: Tool[], queryCtx: QueryContext): Record<string, ReturnType<typeof createToolServer>> | undefined {
	if (!tools.length) return undefined;
	const generation: NonNullable<QueryContext["mcpGeneration"]> = { closeRequested: false };
	queryCtx.mcpGeneration = generation;
	const isClosing = () => queryCtx.mcpGeneration !== generation || generation.closeRequested;
	const mcpTools = tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		inputSchema: tool.parameters,
		handler: async (toolCallId: string, requestId: string | number) => {
			if (isClosing() || queryCtx.discarded || queryCtx.observedFailure) throw new Error("Claude Code query has ended");
			if (queryCtx.invalidatedFallbackToolIds.has(toolCallId)) return retiredToolResult;
			const ingress = queryCtx.queryProcess?.getMcpCall(MCP_SERVER_NAME, requestId);
			const previous = validatedFallbackDispatch(queryCtx, toolCallId);
			if (ingress && ingress.sequence > queryCtx.fallbackRetrySequence
				&& (!previous || ingress.sequence < previous.ingress.sequence)) {
				queryCtx.fallbackDispatches.set(toolCallId, { name: tool.name, ingress, requestId });
				// Report the dispatch before parking. Only the coordinator can publish.
				queueMicrotask(() => queryCtx.checkFallbackGate?.());
			}
			queryCtx.dispatchedToolCalls.add(toolCallId);
			if (queryCtx.pendingResults.has(toolCallId)) {
				const result = queryCtx.pendingResults.get(toolCallId)!;
				queryCtx.pendingResults.delete(toolCallId);
				debug(`mcp handler: ${tool.name} [${toolCallId}] → resolved from queue (${queryCtx.pendingResults.size} remaining)`);
				queryCtx.unacknowledgedPiToolResults.add(toolCallId);
				return result;
			}
			debug(`mcp handler: ${tool.name} [${toolCallId}] → waiting`);
			return new Promise<McpResult>((resolve) => {
				queryCtx.pendingToolCalls.set(toolCallId, { toolName: tool.name, resolve });
			});
		},
	}));
	const server = createToolServer(MCP_SERVER_NAME, mcpTools,
		(toolName) => warnOmittedTool(toolName, queryCtx.piSessionId),
		(error) => {
			if (isClosing()) return;
			// One failed MCP reply need not disconnect the SDK. Reduce the available
			// wire prefix, then keep the unsequenced error local to the fallback attempt.
			reduceRawPrefix(queryCtx);
			latchFallbackViolation(queryCtx, asError(error));
		}, () => queryCtx.queryProcess?.observingIngress === true);
	server.instance.server.onclose = () => {
		// SDK teardown after EOF or a known reader fault isn't an independent
		// disconnect. Let the iterator and raw reducer report the ordered cause.
		if (isClosing() || queryCtx.outputEnded || queryCtx.queryProcess?.hasPendingSdkReaderFault || generation.disconnect) return;
		generation.disconnect = new Error("Claude Code MCP server disconnected before the tool turn completed");
		queryCtx.checkFallbackGate?.();
	};
	return { [MCP_SERVER_NAME]: server };
}

// --- Usage helpers ---

// One process serves several pi sessions at once (in-process subagents), so log
// lines diag/audit-cache.mjs pairs on carry the pi session they belong to.
function sessionTag(piSessionId: string | null | undefined): string {
	return `piSession=${piSessionId ?? "none"}`;
}

// The counter mapping lives in usage.ts; the debug line is this side's job, so every
// call site logs the same way rather than three times over.
function recordUsage(output: AssistantMessage, usage: SdkUsage, model: Model<any>, piSessionId: string | null): void {
	const { cachePct, reasoning } = updateUsage(output, usage, model);
	const reasoningText = reasoning == null ? "" : ` reasoning=${reasoning}`;
	debug(`usage: in=${output.usage.input} out=${output.usage.output} cacheRead=${output.usage.cacheRead} cacheWrite=${output.usage.cacheWrite} total=${output.usage.totalTokens}${reasoningText} cachePct=${cachePct}% model=${model.id} ${sessionTag(piSessionId)}`);
}

// Log the *served* context window reported by an SDK result message
// (modelUsage[id].contextWindow), which can differ from the window pi
// registered (model.contextWindow) when the runtime entitlement doesn't
// match the docs — e.g. bare Opus served 200K on Pro, or [1m] not honored.
// The result message's modelUsage is otherwise discarded; this makes the
// gap observable. See issue #18.
function logServedContextWindow(label: string, message: SDKMessage, model: Model<any>): void {
	if (!DEBUG) return;
	const modelUsage = (message as any).modelUsage as Record<string, { contextWindow?: number; maxOutputTokens?: number }> | undefined;
	if (!modelUsage) return;
	for (const [k, v] of Object.entries(modelUsage)) {
		debug(`${label}: served contextWindow=${v.contextWindow ?? "?"} maxOutputTokens=${v.maxOutputTokens ?? "?"} servedModel=${k} registered=${model.contextWindow}`);
	}
}

// --- Effort level mapping ---

const VALID_EFFORTS = new Set<string>(["low", "medium", "high", "xhigh", "max"]);

// Prefer the model's own thinkingLevelMap (per-model overrides — e.g. a map can
// route xhigh→xhigh where the generic table maps xhigh→max). pi-ai's catalog
// ships a map for most Claude models; the table above covers models without
// one, and the levels a map leaves unnamed. A null entry means the level is
// unsupported on that model: no effort argument is sent, so Claude Code's own
// default applies rather than the generic table's value. Map values are
// provider-generic strings, so a map value is trusted only when it names a
// level CC accepts.
function effortForReasoning(model: Model<any>, reasoning: string | undefined): EffortLevel | undefined {
	if (!reasoning) return undefined;
	const mapped = model.thinkingLevelMap?.[reasoning];
	if (mapped === undefined) return REASONING_TO_EFFORT[reasoning];
	return VALID_EFFORTS.has(mapped as EffortLevel) ? mapped as EffortLevel : undefined;
}

// Pi sends no reasoning level when thinking is off, and Claude Code then applies
// its own default (thinking on). Disable thinking the way pi-ai's Anthropic
// provider does: for reasoning models, unless the model's thinkingLevelMap marks
// "off" unsupported (null), as on models that always think.
function thinkingForReasoning(model: Model<any>, reasoning: string | undefined): ThinkingConfig | undefined {
	if (reasoning || !model.reasoning || model.thinkingLevelMap?.["off"] === null) return undefined;
	return { type: "disabled" };
}

// --- Provider helpers: misc ---

function mapStopReason(reason: string | undefined): "stop" | "length" | "toolUse" {
	switch (reason) {
		case "tool_use": return "toolUse";
		case "max_tokens": return "length";
		case "end_turn": default: return "stop";
	}
}

function parsePartialJson(input: string, fallback: Record<string, unknown>): Record<string, unknown> {
	if (!input) return fallback;
	try { return JSON.parse(input); } catch { return fallback; }
}


// --- Provider: streaming function ---
//
// Push-based streaming with MCP tool bridge:
// 1. streamSimple starts a query() and kicks off consumeQuery() in background
// 2. consumeQuery() iterates the SDK generator, pushing events to currentPiStream
// 3. On tool_use: ends the current pi stream, nulls it out. The MCP handler
//    blocks the generator naturally — no events arrive until resolved.
// 4. Pi executes the tool, calls streamSimple again. We swap in the new stream,
//    resolve the MCP handler, and the generator unblocks — events flow to new stream.
//
// Completed SDK echoes are recorded even while no UI stream is attached.
// Each fresh query owns a separate context, including during discard/exit.

/** Port of upstream PR #212, with a private hold: pi shares output.content on redraw,
 * so even an unannounced block must stay outside it until classified or released.
 * SDK content blocks arrive sequentially; only one thinking block can be open.
 * Keying by stream, and checking output identity, isolates aborts and turn resets. */
type HeldThinkingBlock = { type: "thinking"; thinking: string; thinkingSignature: string; index?: number };
const heldThinking = new WeakMap<object, { output: AssistantMessage; block: HeldThinkingBlock }>();
const completedStreams = new WeakSet<object>();

/** Push a stream's terminal event and end it. Marked complete before end():
 *  claimCurrentPiStream's stale-stream warning and bindRunSignal read the mark. */
function endStream(stream: AssistantMessageEventStream, event: AssistantMessageEvent): void {
	stream.push(event);
	heldThinking.delete(stream);
	completedStreams.add(stream);
	stream.end();
}

/** End the context's current pi stream with `event` and detach it. The caller
 *  must have checked that there is one. */
function endCurrentPiStream(c: QueryContext, event: AssistantMessageEvent): void {
	c.finishFallback(event.type === "error" && event.reason === "error" ? "Failed" : "Cancelled");
	c.fallbackViolation = undefined;
	c.fallbackDispatches.clear();
	if (event.type === "done" && event.reason === "toolUse") {
		for (const block of event.message.content) if (block.type === "toolCall") c.publishedToolCalls.set(block.id, block.name);
	}
	endStream(c.currentPiStream!, event);
	c.currentPiStream = null;
}

/** The turn stopped on a tool call: end pi's stream so pi runs the tool. */
function endToolUseTurn(c: QueryContext): void {
	if (c.observedFailure || !c.currentPiStream || !c.turnOutput) return;
	c.turnOutput.stopReason = "toolUse";
	recordAssistantEmission(c);
	endCurrentPiStream(c, { type: "done", reason: "toolUse", message: c.turnOutput });
}

// Two minutes exceeds Claude Code's tool_progress cadence and leaves room for
// dispatch and ordered reduction. The watchdog can only fail.
const FALLBACK_WATCHDOG_MS = 120_000;

type AssistantFrame = Extract<SDKMessage, { type: "assistant" }>;
type EmitEvent = (event: AssistantMessageEvent) => void;

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(errorMessage(error));
}

/** Diagnostics must not rethrow from detached failure/cleanup paths. */
function logCleanupFailure(label: string, error: unknown): void {
	try { debug(label, error); } catch { /* best effort */ }
}

function endCurrentPiStreamWithError(c: QueryContext, error: string, reason: "error" | "aborted" = "error"): void {
	if (!c.currentPiStream || !c.turnOutput) return;
	c.turnOutput.stopReason = reason;
	c.turnOutput.errorMessage ??= error;
	endCurrentPiStream(c, { type: "error", reason, error: c.turnOutput });
}

function commitFailedRecording(c: QueryContext, saveAfterExit = false): void {
	const commit = c.commitRecording;
	c.commitRecording = null;
	commit?.(true, saveAfterExit);
}

// This accepts terminal failures only. Provisional violations still go through
// latchFallbackViolation, which escalates only once a served tool is staged.
function failFallbackBatch(c: QueryContext, error: Error): Error {
	const cause = c.observedFailure ??= error;
	const batch = c.pendingFallback;
	const ownsFallback = batch ? batch.stream === c.currentPiStream && batch.process === c.queryProcess : !!c.fallbackWatchdog;
	if (ownsFallback && c.currentPiStream && c.turnOutput) {
		activeQueryContexts.delete(c);
		endCurrentPiStreamWithError(c, cause.message);
		// A rejection's acknowledged prefix belongs to this query even when
		// iterator.return() never settles. Commit before asking the child to stop.
		try { commitFailedRecording(c, true); }
		catch (error) { logCleanupFailure("Claude Code fallback recording failed", error); }
		c.stopProcess?.();
	}
	return cause;
}

function renderFallback(c: QueryContext, batch: FallbackBatch, model: Model<any>, names: Map<string, string>, emit?: EmitEvent): void {
	if (c.turnStreamOpen) dropAbandonedStreamBlocks(c, `non-streaming fallback ${batch.messageId}`);
	c.turnToolCallIds = [];
	for (const frame of batch.frames) {
		const id = frame.message.id;
		c.turnStreamMessageId = id;
		if (!c.turnAssistantIds.includes(id)) c.turnAssistantIds.push(id);
		recordAssistantFrame(frame, names, c);
		processAssistantMessage(frame, model, names, c, emit);
	}
}

function fallbackDispatchMismatch(id: string, dispatched: string, staged: string): Error {
	return new Error(`Claude Code dispatched ${dispatched} for staged tool ${staged} (${id})`);
}

function fallbackTerminalBoundary(batch: FallbackBatch, action: string): Error {
	const expected = batch.state === "AwaitReplacement" ? "a replacement response after retry" : "the fallback completion fence";
	return new Error(`Claude Code ${action} before ${expected}`);
}

function incompleteFallbackAtEof(batch: FallbackBatch): Error {
	return batch.tools.size || batch.state === "AwaitReplacement" ? fallbackTerminalBoundary(batch, "output ended")
		: new Error("Claude Code output ended during fallback narration without an SDK result");
}

function reduceRawPrefix(c: QueryContext): void {
	const process = c.queryProcess;
	if (process?.observingIngress) process.reduceConsumed();
}

// A violation belongs to the current Pi stream/attempt, not to a tool or
// request. It is terminal only once the attempt stages a served tool.
function latchFallbackViolation(c: QueryContext, error: Error): void {
	if (!c.currentPiStream) return;
	c.fallbackViolation ??= error;
	if (c.pendingFallback?.tools.size) failFallbackBatch(c, c.fallbackViolation);
}

function stagedFallback(c: QueryContext): FallbackBatch | undefined {
	const batch = c.pendingFallback;
	return batch?.state !== "AwaitReplacement" ? batch : undefined;
}

// Explicit inert entries. Keep-alive and blank lines carry no payload; a user
// replay only acknowledges host input, never a CC tool result. The three scoped
// retry notices describe side work; unscoped api_retry is a transition, not inert.
// The installed-SDK replays qualify these shapes; don't add general SDK/MCP
// control traffic here without evidence from the pinned executable or SDK.
function fallbackInertFrame(input: { raw: ConsumedRawFact } | { message: SDKMessage }): string | undefined {
	if ("raw" in input) {
		const { kind } = input.raw;
		return kind === "blank" || kind === "keep_alive" ? kind : undefined;
	}
	const frame = input.message;
	switch (frame.type) {
		case "rate_limit_event": {
			const info = frame.rate_limit_info;
			return (info?.status === "allowed" || info?.status === "allowed_warning" || info?.status === "rejected")
				&& !hardQuotaDenial(info) ? "rate-limit" : undefined;
		}
		case "user": return frame.parent_tool_use_id === null && "isReplay" in frame && frame.isReplay === true && !!frame.uuid
			&& (typeof frame.message?.content === "string" || (Array.isArray(frame.message?.content)
				&& frame.message.content.every((block) => block.type === "text" || block.type === "image"))) ? "pi-user-replay" : undefined;
		case "system":
			if (frame.subtype === "control_request_progress" && frame.status === "api_retry" && frame.request_id) return "side-question-retry";
			if (frame.subtype === "model_refusal_fallback" && frame.direction === "retry" && frame.scope === "local") return "local-refusal-retry";
			return undefined;
		case "tool_progress": return frame.parent_tool_use_id && frame.subagent_retry ? "subagent-retry" : undefined;
	}
	return undefined;
}

function reduceFallbackRawFact(c: QueryContext, fact: ConsumedRawFact, sequence: number, server?: ReturnType<typeof createToolServer>): void {
	if (c.observedFailure || c.discarded) return;
	const batch = stagedFallback(c);
	const awaiting = c.pendingFallback?.state === "AwaitReplacement";
	const inert = fallbackInertFrame({ raw: fact });
	if (inert) {
		if (batch) c.onFallbackDecision?.(sequence, inert);
		return;
	}
	const reject = (error: Error) => {
		if (batch) c.onFallbackDecision?.(sequence, "violation");
		latchFallbackViolation(c, error);
	};
	const isRetired = (id?: string) => awaiting && !!id && c.invalidatedFallbackToolIds.has(id);
	if (fact.kind === "raw_observer_error") {
		c.failLiveQuery?.(fact.error);
		return;
	}
	if (fact.kind === "malformed_result" || (fact.kind === "control_response" && fact.malformed)) {
		const error = new Error(fact.kind === "malformed_result" ? "Claude Code emitted a malformed error result" : "Claude Code emitted a malformed control_response");
		reject(error);
		// The pinned SDK reader cannot continue past this input; keep the ordinary
		// broken-query path as well (it will not yield a later assistant frame).
		c.failLiveQuery?.(error);
		return;
	}
	if (fact.kind === "host_session_state" && fact.state === "idle" && (batch || awaiting)) {
		const error = fallbackTerminalBoundary(c.pendingFallback!, "became idle");
		if (awaiting) failFallbackBatch(c, error);
		else reject(error);
		return;
	}
	if ("cancellation" in fact) {
		const { toolUseId, reason } = fact.cancellation;
		if (!isRetired(toolUseId)) reject(new Error(`Claude Code ${toolUseId ? `MCP call ${toolUseId}` : "control or MCP request"} cancelled${reason ? `: ${reason}` : ""}`));
		return;
	}
	if (fact.kind === "sdk_reply") {
		// A successful JSON-RPC response carrying Pi's tool result may itself
		// have isError (e.g. a command failed). Only protocol/SDK failures latch
		// before staging; no SDK reply is allowed once staging begins.
		if (!isRetired(fact.toolUseId) && (batch || fact.error)) {
			const detail = fact.error ?? fact.toolResultError ?? "not allowed before fallback publication";
			reject(new Error(`Claude Code ${fact.permission ? "permission" : "SDK control"} reply${fact.toolUseId ? ` for ${fact.toolUseId}` : ""}: ${detail}`));
		}
		return;
	}
	if (fact.kind === "control_response" && fact.error) {
		reject(new Error(`Claude Code control response: ${fact.error}`));
		return;
	}
	if (fact.kind === "request_collision") {
		reject(new Error(`Claude Code reused control request id ${JSON.stringify(fact.requestId)}`));
		return;
	}
	if (fact.kind === "malformed_raw_payload") {
		reject(new Error(`Claude Code emitted a malformed ${fact.frameType}`));
		return;
	}
	if (fact.kind === "malformed_frame" || fact.kind === "malformed_control_request") {
		reject(new Error(`Claude Code emitted a malformed ${fact.kind === "malformed_frame" ? "stdout frame" : "control_request"}`));
		return;
	}
	if ("mcp" in fact && fact.mcp) {
		const { server: route, message, collision } = fact.mcp;
		const id = mcpToolUseId(message);
		if (collision !== undefined) {
			reject(new Error(`Claude Code reused MCP request id ${JSON.stringify(collision)} across in-flight tool calls`));
			return;
		}
		if (isRetired(id) && message?.method === "tools/call") return;
		if (route !== server?.name || !server) {
			reject(new Error(`SDK MCP server not found: ${route ?? "(missing server name)"}`));
			return;
		}
		if (message?.method === "tools/call") {
			const rejection = server.inspectToolCall(message);
			if (rejection || !id) {
				// MCP rejects the call itself. Without a Pi stream there is no
				// fallback attempt to fail, and the parked query can still be used.
				reject(rejection?.error ?? new Error("MCP tools/call is missing a tool-use id"));
				return;
			}
			if (!batch) {
				// In AwaitReplacement an old fragment can reveal the parked call's id
				// later; only a call of a replacement tool before its block is inverted.
				if (!awaiting && !c.turnToolCallIds.includes(id) && !c.pendingResults.has(id) && !c.publishedToolCalls.has(id)) reject(invertedFallbackDispatch(id));
				return;
			}
			const tool = batch.tools.get(id);
			if (!tool || c.invalidatedFallbackToolIds.has(id)) {
				reject(invertedFallbackDispatch(id));
				return;
			}
			if (message.params?.name !== tool.name) {
				reject(fallbackDispatchMismatch(id, String(message.params?.name), tool.name));
				return;
			}
			if (batch.fence) {
				reject(new Error(`Claude Code dispatched a second MCP tools/call (${id}) before fallback publication`));
				return;
			}
			batch.fence = { toolUseId: id, sequence };
			c.onFallbackDecision?.(sequence, "fence");
			return;
		}
		const protocolFailure = server.inspectProtocolMessage(message);
		if (protocolFailure) {
			reject(protocolFailure);
			return;
		}
		if (message?.method !== "initialize" && message?.method !== "notifications/initialized" && message?.method !== "tools/list") {
			reject(new Error(`Claude Code emitted unexpected MCP method ${message?.method ?? "(missing)"}`));
			return;
		}
	}
	if ("subtype" in fact && fact.subtype === "can_use_tool" && isRetired(fact.toolUseId)) return;
	if (batch) reject(new Error(`Claude Code emitted unlisted ${fact.kind}${"subtype" in fact ? `:${fact.subtype ?? "unknown"}` : ""} before fallback publication`));
}

function validatedFallbackDispatch(c: QueryContext, id: string) {
	const fact = c.fallbackDispatches.get(id);
	if (!fact || fact.ingress.sequence <= c.fallbackRetrySequence || (fact.ingress.toolUseId !== undefined && fact.ingress.toolUseId !== id)
		|| c.queryProcess?.getMcpCall(MCP_SERVER_NAME, fact.requestId) !== fact.ingress) return undefined;
	return fact;
}

function invertedFallbackDispatch(id: string): Error {
	return new Error(`Claude Code dispatched non-staged or retired tool ${id} before its assistant frame`);
}

/** The only fallback publish site. No await between validating the fence and publishing. */
function publishFallbackIfReady(c: QueryContext, model: Model<any>, names: Map<string, string>, wasAborted: () => boolean): void {
	const batch = c.pendingFallback;
	const process = c.queryProcess;
	if (!batch?.tools.size || batch.state === "AwaitReplacement" || !process || process !== batch.process
		|| batch.stream !== c.currentPiStream || !c.turnOutput || c.discarded || wasAborted() || c.observedFailure) return;
	if (c.outputEnded || process.reducedWatermark < process.ingressWatermark) return;
	// On the qualified transport the ordered raw reducer selects exactly one
	// fence. Its handler must independently validate the same ingress identity.
	let fenceSequence: number | undefined;
	if (process.observingIngress) {
		const fence = batch.fence;
		if (fence && validatedFallbackDispatch(c, fence.toolUseId)?.ingress.sequence === fence.sequence) fenceSequence = fence.sequence;
	} else {
		// Direct consumer replays substitute a stub process/handler for ordered ingress.
		for (const [id, tool] of batch.tools) {
			const fact = validatedFallbackDispatch(c, id);
			if (!fact || tool.sequence === undefined) continue;
			if (fact.ingress.sequence <= tool.sequence) { failFallbackBatch(c, invertedFallbackDispatch(id)); return; }
			if (fact.name !== tool.name) { failFallbackBatch(c, fallbackDispatchMismatch(id, fact.name, tool.name)); return; }
			if (fenceSequence === undefined || fact.ingress.sequence < fenceSequence) fenceSequence = fact.ingress.sequence;
		}
	}
	batch.state = fenceSequence !== undefined ? "ReadyLive" : "Collecting";
	if (fenceSequence === undefined) return;
	if (batch.lastSequence !== undefined && batch.lastSequence >= fenceSequence) {
		failFallbackBatch(c, new Error("Claude Code emitted fallback blocks after the completion fence"));
		return;
	}
	if (!c.fallbackQualified) {
		failFallbackBatch(c, new Error("Claude Code fallback completion fence is not qualified for this executable"));
		return;
	}

	const events: AssistantMessageEvent[] = [];
	const original = c.turnOutput;
	try {
		c.turnOutput = { ...original, usage: structuredClone(original.usage), content: [...original.content] };
		renderFallback(c, batch, model, names, (event) => events.push(event));
		c.turnOutput.stopReason = "toolUse";
		recordAssistantEmission(c, true);
	} catch (error) {
		c.turnOutput = original;
		failFallbackBatch(c, asError(error));
		return;
	}
	if (c.pendingFallback !== batch || c.currentPiStream !== batch.stream || c.queryProcess !== process
		|| c.discarded || wasAborted() || c.observedFailure) return;
	c.finishFallback("Committed");
	for (const event of events) batch.stream.push(event);
	endCurrentPiStream(c, { type: "done", reason: "toolUse", message: c.turnOutput });
}

function fallbackToolBlockViolation(block: Extract<AssistantFrame["message"]["content"][number], { type: "tool_use" }>, names: Map<string, string>): string | undefined {
	const { id, name, input } = block;
	if (typeof id !== "string" || !id) return "Claude Code emitted an invalid fallback tool ID";
	if (typeof name !== "string" || !name) return `Claude Code emitted an invalid fallback tool name for ${id}`;
	// The bundled CLI can reject these inputs after the first (valid) tool's
	// MCP fence. Pi still owns validation against the advertised tool schema.
	if (!input || typeof input !== "object" || Array.isArray(input)) return `Claude Code emitted non-object fallback input for tool ${id}`;
	// Match the CLI 2.1.321 parse check: only the outer wrapper must be exact.
	// The CLI checks the types of raw and len but allows extra inner fields.
	const entries = Object.entries(input);
	const [key, marker] = entries[0] ?? [];
	if (entries.length === 1 && key === "__unparsedToolInput" && marker !== null && typeof marker === "object") {
		const { raw, len } = marker as Record<string, unknown>;
		if (typeof raw === "string" && typeof len === "number") {
			return `Claude Code emitted unparsed fallback input for tool ${id}`;
		}
	}
	if (name.startsWith(MCP_TOOL_PREFIX) && !names.has(name)) {
		return `Claude Code emitted unserved fallback bridge tool ${name} (${id})`;
	}
	return undefined;
}

function stageFallback(c: QueryContext, frame: AssistantFrame, names: Map<string, string>, wasAborted: () => boolean): void {
	const pending = c.pendingFallback;
	const batch: FallbackBatch = pending && pending.state !== "AwaitReplacement" && pending.messageId === frame.message.id ? pending : (c.fallbackBatch = {
		state: "Collecting", stream: c.currentPiStream!, process: c.queryProcess, messageId: frame.message.id,
		// Earlier narration is still private. A text-only exit may render it;
		// a retry discards it along with the latest fragment.
		frames: pending?.frames ?? [], tools: new Map(),
	});
	armFallbackWatchdog(c, wasAborted);
	if (batch.fence) {
		latchFallbackViolation(c, new Error("Claude Code emitted fallback blocks after the completion fence"));
		return;
	}
	const replay = batch.frames.some((part) => part.uuid === frame.uuid && part.uuid !== undefined);
	if (!replay) batch.frames.push(frame);
	for (const block of frame.message.content) {
		if (block.type !== "tool_use") continue;
		const violation = fallbackToolBlockViolation(block, names);
		if (violation) {
			latchFallbackViolation(c, new Error(violation));
			if (c.observedFailure) return;
		}
		if (replay) continue;
		const name = piToolNameFor(block.name, names);
		if (!name) continue;
		if (batch.tools.has(block.id)) {
			latchFallbackViolation(c, new Error(`Claude Code emitted duplicate fallback tool ID ${block.id}`));
			return;
		}
		batch.tools.set(block.id, { name });
		const failure = c.fallbackViolation ?? c.mcpDisconnect
			?? (c.invalidatedFallbackToolIds.has(block.id) ? new Error(`Claude Code staged retired tool ${block.id} after retry`) : undefined);
		if (failure) {
			failFallbackBatch(c, failure);
			return;
		}
	}
}

function armFallbackWatchdog(c: QueryContext, wasAborted: () => boolean): void {
	const stream = c.currentPiStream;
	const process = c.queryProcess;
	if (c.fallbackWatchdog || !stream || wasAborted() || c.discarded || c.observedFailure) return;
	const rawDeadline = c.rawFallbackDeadlines[0];
	const delay = rawDeadline ? Math.max(0, rawDeadline.expiresAt - Date.now()) : FALLBACK_WATCHDOG_MS;
	const watchdog = setTimeout(() => {
		if (c.fallbackWatchdog !== watchdog || c.currentPiStream !== stream || c.queryProcess !== process || wasAborted() || c.discarded) return;
		// Raw evidence can precede any reduced batch, e.g. while a hook is pending.
		const pending = c.pendingFallback;
		const waitingOn = !pending ? "ordered SDK reductions and onResponse hooks"
			: pending.state === "AwaitReplacement" ? "a replacement response after retry"
			: pending.tools.size ? "a completion fence and ordered SDK reductions" : "an SDK result or a fallback completion fence";
		failFallbackBatch(c, c.outputEnded && pending ? incompleteFallbackAtEof(pending)
			: new Error(`Claude Code fallback watchdog expired waiting for ${waitingOn}`));
	}, delay);
	c.fallbackWatchdog = watchdog;
	watchdog.unref();
}

/** Observe only deadline evidence here. The ordered reducer remains the sole
 * authority for assistant content, retries, hook outcomes and publication. */
function observeFallbackIngress(c: QueryContext, names: Map<string, string>, wasAborted: () => boolean): (line: string, sequence: number) => void {
	let owner = c.currentPiStream;
	let streamingId: string | undefined;
	let sawCandidate = false;
	return (line, sequence) => {
		let frame: SDKMessage | undefined;
		try { frame = JSON.parse(line) ?? undefined; } catch { return; } // Ordered ingress classifies malformed lines.
		if (owner !== c.currentPiStream) {
			owner = c.currentPiStream;
			sawCandidate = false;
		}
		if (frame?.type === "stream_event" && !frame.parent_tool_use_id && frame.event?.type === "message_start") {
			streamingId = frame.event.message?.id;
			sawCandidate = false;
		} else if (frame?.type === "result") sawCandidate = false;
		else if (!sawCandidate && owner && frame?.type === "assistant" && !frame.parent_tool_use_id && frame.message
			&& frame.message.model !== "<synthetic>" && (!streamingId || frame.message.id !== streamingId)
			&& !c.invalidatedFallbackMessageIds.has(frame.message.id) && !c.assistantSteps.get(frame.message.id)?.emitted
			&& (frame.message.id || frame.message.content?.some((block) => block.type === "tool_use" && piToolNameFor(block.name, names)))) {
			sawCandidate = true;
			c.rawFallbackDeadlines.push({ sequence, expiresAt: Date.now() + FALLBACK_WATCHDOG_MS });
			armFallbackWatchdog(c, wasAborted);
		}
	};
}

function leaveFallbackWindow(c: QueryContext, wasAborted: () => boolean): void {
	// Called while reducing a permitted boundary, after the preceding raw
	// prefix. Don't drop later fallback evidence from the same raw chunk.
	const boundary = (c.queryProcess?.reducedWatermark ?? 0) + 1;
	const later = c.rawFallbackDeadlines.filter(({ sequence }) => sequence > boundary);
	c.finishFallback("Cancelled");
	if (later.length) {
		c.rawFallbackDeadlines = later;
		armFallbackWatchdog(c, wasAborted);
	}
}

function retireFallbackTools(c: QueryContext, frame: AssistantFrame): void {
	for (const block of frame.message.content) {
		if (block.type !== "tool_use") continue;
		const { id } = block;
		c.invalidatedFallbackToolIds.add(id);
		c.fallbackDispatches.delete(id);
		c.dispatchedToolCalls.delete(id);
		c.pendingResults.delete(id);
		c.unacknowledgedPiToolResults.delete(id);
		const handler = c.pendingToolCalls.get(id);
		c.pendingToolCalls.delete(id);
		handler?.resolve(retiredToolResult);
	}
}

function awaitFallbackReplacement(c: QueryContext, batch: FallbackBatch, wasAborted: () => boolean): void {
	if (batch.state === "AwaitReplacement") return;
	batch.state = "AwaitReplacement";
	c.invalidatedFallbackMessageIds.add(batch.messageId);
	for (const frame of batch.frames) {
		c.invalidatedFallbackMessageIds.add(frame.message.id);
		retireFallbackTools(c, frame);
	}
	batch.frames.length = 0;
	batch.tools.clear();
	batch.fence = undefined;
	// Keep the staged deadline running through AwaitReplacement.
	armFallbackWatchdog(c, wasAborted);
}

/** Append a complete text block to the turn and stream it to pi. */
function pushTextBlock(c: QueryContext, text: string, textSignature?: string, emit: EmitEvent = (event) => c.currentPiStream?.push(event)): void {
	ensureTurnStarted(c, emit);
	c.turnBlocks.push({ type: "text", text, ...(textSignature !== undefined ? { textSignature } : {}) });
	const idx = c.turnBlocks.length - 1;
	emit({ type: "text_start", contentIndex: idx, partial: c.turnOutput });
	emit({ type: "text_delta", contentIndex: idx, delta: text, partial: c.turnOutput });
	emit({ type: "text_end", contentIndex: idx, content: text, partial: c.turnOutput });
}

function claimCurrentPiStream(stream: AssistantMessageEventStream, label: string, c: QueryContext, options: SimpleStreamOptions | undefined): void {
	if (c.currentPiStream && !completedStreams.has(c.currentPiStream as object)) {
		debug(`WARNING: currentPiStream overwritten before terminal event (${label}); activeQuery=${Boolean(c.activeQuery)} pendingHandlers=${c.pendingToolCalls.size}`);
	}
	c.currentPiStream = stream;
	c.currentOnResponse = options?.onResponse;
}

function ensureTurnStarted(c: QueryContext, emit: EmitEvent = (event) => c.currentPiStream?.push(event)): void {
	if (!c.turnStarted && c.currentPiStream && c.turnOutput) {
		emit({ type: "start", partial: c.turnOutput });
		c.turnStarted = true;
	}
}

/** Snapshot only messages actually emitted with done. SDK completed blocks
 * can arrive before or after done; equality proves the whole step is covered. */
function recordAssistantEmission(c: QueryContext, prepareFallback = false): void {
	const output = c.turnOutput;
	if (!output || output.stopReason === "error" || output.stopReason === "aborted" || c.turnEmissionRecorded) return;
	c.turnEmissionRecorded = true;
	const id = c.turnStreamMessageId ?? c.lastAssistantMessageId;
	if (!id) {
		c.recording.gap();
		debug("recording gap: emitted assistant has no completed SDK message id");
		return;
	}
	let step = c.assistantSteps.get(id);
	if (!step) c.assistantSteps.set(id, step = { content: [], seen: new Set() });
	if (!step.emitted) {
		const digest = digestMessage(output);
		const toolCalls = output.content.filter((b) => b.type === "toolCall").map((b) => b.id);
		const ids = c.turnAssistantIds.length ? [...c.turnAssistantIds] : [id];
		const emission = { digest, template: { ...output, content: [] }, ids };
		// Finish fallible digest preparation before mutating the durable recording.
		const uuid = prepareFallback ? completedAssistantUuid(c, emission) : undefined;
		step.emitted = { ...emission, index: c.recording.assistant(digest, toolCalls, uuid, output.content.length > 0) };
		for (const apiId of ids) {
			const part = c.assistantSteps.get(apiId);
			if (part) part.emitted = step.emitted;
		}
	}
	if (!prepareFallback) completeAssistantRecording(c, step);
}

function completedAssistantUuid(c: QueryContext, emission: Omit<NonNullable<AssistantStep["emitted"]>, "index">): string | undefined {
	const parts = emission.ids.map((id) => c.assistantSteps.get(id));
	const uuid = parts.at(-1)?.uuid;
	if (uuid && parts.every((part) => part?.uuid)
		&& digestMessage({ ...emission.template, content: parts.flatMap((part) => part!.content) }) === emission.digest) return uuid;
	return undefined;
}

function completeAssistantRecording(c: QueryContext, step: AssistantStep): void {
	if (!step.emitted) return;
	const uuid = completedAssistantUuid(c, step.emitted);
	if (uuid) c.recording.completeAssistant(step.emitted.index, uuid);
	else debug(`recording gap: emitted assistant is not fully covered by completed SDK messages (${step.emitted.ids.join(",")})`);
}

/** CC took this input into a turn: record it, and drop it from the steers that
 * keep stdin open. Stdin still stays open until that turn's result, since its
 * MCP calls need it. Returns whether it was still pending. */
function incorporate(c: QueryContext, uuid: string): boolean {
	const recorded = c.recording.acknowledge(uuid);
	return c.pendingSteerUuids.delete(uuid) || recorded;
}

/** Recording precedes the UI guard: echoes after a tool boundary still belong
 * to the emitted step, not to whatever stream is currently attached. */
function tapRecording(message: SDKMessage, names: Map<string, string>, c: QueryContext, staged = false): void {
	if ((message.type === "assistant" && message.parent_tool_use_id === null && message.message.model !== "<synthetic>")
		|| (message.type === "stream_event" && message.parent_tool_use_id === null && ["content_block_start", "content_block_delta"].includes(message.event.type))) {
		c.recording.assistantObserved();
		// CC persists a turn's opening input before calling the API but never
		// replays one holding its own tags (e.g. <task-notification>), so the turn's
		// first output incorporates it.
		if (c.turnOpener && incorporate(c, c.turnOpener)) debug(`recording: turn opener ${c.turnOpener} was never replayed; its first output acknowledges it`);
		c.turnOpener = undefined;
	}
	if (message.type === "result") c.turnOpener = c.pendingSteerUuids.values().next().value;
	if (message.type === "user" && message.parent_tool_use_id === null && message.uuid) {
		if ("isReplay" in message && message.isReplay === true) incorporate(c, message.uuid);
		// A result CC wrote for a call it never dispatched (it rejected it) is not
		// pi's result: pi's slot stays open and the next sync writes the one pi holds.
		if (Array.isArray(message.message.content)) for (const block of message.message.content) {
			if (block.type === "tool_result" && c.dispatchedToolCalls.has(block.tool_use_id)) c.recording.result(block.tool_use_id, message.uuid);
		}
	}
	if (staged || message.type !== "assistant" || message.parent_tool_use_id !== null || message.message.model === "<synthetic>" || message.aborted) return;
	recordAssistantFrame(message, names, c);
}

function recordAssistantFrame(message: AssistantFrame, names: Map<string, string>, c: QueryContext): void {
	if (message.parent_tool_use_id !== null) return;
	const id = message.message.id;
	let step = c.assistantSteps.get(id);
	if (!step) c.assistantSteps.set(id, step = { content: [], seen: new Set() });
	if (step.seen.has(message.uuid)) return;
	step.seen.add(message.uuid);
	if (!step.emitted) c.lastAssistantMessageId = id;
	for (const block of message.message.content) {
		if (block.type === "text" && block.text) step.content.push({ type: "text", text: block.text });
		else if (block.type === "thinking") step.content.push({ type: "thinking", thinking: block.thinking, thinkingSignature: block.signature });
		else if (block.type === "tool_use") {
			const name = piToolNameFor(block.name, names);
			if (name) step.content.push({ type: "toolCall", id: block.id, name, arguments: mapToolArgs(name, block.input as Record<string, unknown>, c.wrappedToolNames) } as AssistantMessage["content"][number]);
		}
	}
	step.uuid = message.uuid;
	completeAssistantRecording(c, step);
}

function finalizeCurrentStream(c: QueryContext): void {
	if (!c.currentPiStream || !c.turnOutput) return;
	debug(`provider: finalizeCurrentStream called, turnOutput=${JSON.stringify({stopReason: c.turnOutput!.stopReason, error: c.turnOutput!.errorMessage})}`);
	if (!c.turnStarted) ensureTurnStarted(c);
	if (c.turnOutput.stopReason === "error") {
		endCurrentPiStream(c, { type: "error", reason: "error", error: c.turnOutput });
	} else {
		const reason = c.turnOutput.stopReason === "length" ? "length" : "stop";
		recordAssistantEmission(c);
		endCurrentPiStream(c, { type: "done", reason, message: c.turnOutput });
	}
}

function heldThinkingBlock(c: QueryContext): HeldThinkingBlock | undefined {
	if (!c.currentPiStream) return undefined;
	const held = heldThinking.get(c.currentPiStream);
	if (held?.output === c.turnOutput) return held.block;
	heldThinking.delete(c.currentPiStream);
	return undefined;
}

/** Insert a held block only when pi is allowed to see it, sending the complete buffer. */
function releaseHeldThinking(c: QueryContext, block: HeldThinkingBlock): number {
	heldThinking.delete(c.currentPiStream!);
	const index = c.turnBlocks.push(block) - 1;
	c.currentPiStream!.push({ type: "thinking_start", contentIndex: index, partial: c.turnOutput! });
	if (block.thinking) c.currentPiStream!.push({ type: "thinking_delta", contentIndex: index, delta: block.thinking, partial: c.turnOutput! });
	return index;
}

/** Classification happens before emission/finalization, never by rewriting pi's history. */
function settleHeldThinking(c: QueryContext, block: HeldThinkingBlock): void {
	delete block.index;
	if (isNarrationBlock({ thinking: block.thinking, signature: block.thinkingSignature })) {
		heldThinking.delete(c.currentPiStream!);
		pushTextBlock(c, block.thinking, block.thinkingSignature);
	} else {
		const index = releaseHeldThinking(c, block);
		c.currentPiStream!.push({ type: "thinking_end", contentIndex: index, content: block.thinking, partial: c.turnOutput! });
	}
}

/** Maps Anthropic stream events to pi stream events (text, thinking, toolcall).
 *  On message_stop with tool_use: ends currentPiStream so pi can execute the tool. */
function processStreamEvent(
	message: SDKMessage,
	customToolNameToPi: Map<string, string>,
	model: Model<any>,
	c: QueryContext,
): void {
	if (!c.currentPiStream || !c.turnOutput) return;
	c.turnSawStreamEvent = true;
	const event = (message as SDKMessage & { event: any }).event;

	if (event?.type === "message_start") {
		// Still open from an earlier message_start: Claude Code gave up on that
		// stream and is retrying it. Its blocks were never completed.
		if (c.turnStreamOpen) dropAbandonedStreamBlocks(c, `restreamed as ${event.message?.id}`);
		c.turnToolCallIds = [];
		c.turnStreamMessageId = event.message?.id;
		if (c.turnStreamMessageId && !c.turnAssistantIds.includes(c.turnStreamMessageId)) c.turnAssistantIds.push(c.turnStreamMessageId);
		c.turnStreamOpen = true;
		c.turnStreamBlockStart = c.turnBlocks.length;
		if (event.message?.usage) recordUsage(c.turnOutput, event.message.usage, model, c.piSessionId);
		return;
	}

	if (event?.type === "content_block_start") {
		ensureTurnStarted(c);
		if (event.content_block?.type === "text") {
			c.turnBlocks.push({ type: "text", text: "", index: event.index });
			c.currentPiStream!.push({ type: "text_start", contentIndex: c.turnBlocks.length - 1, partial: c.turnOutput });
		} else if (event.content_block?.type === "thinking") {
			heldThinking.set(c.currentPiStream, {
				output: c.turnOutput,
				block: { type: "thinking", thinking: "", thinkingSignature: "", index: event.index },
			});
		} else if (event.content_block?.type === "tool_use") {
			const piName = piToolNameFor(event.content_block.name, customToolNameToPi);
			if (!piName) {
				debug(`processStreamEvent: skipping tool_use for unserved tool ${event.content_block.name} [${event.content_block.id}] — CC rejects it and retries`);
				return;
			}
			c.turnToolCallIds.push(event.content_block.id);
			c.turnBlocks.push({
				type: "toolCall", id: event.content_block.id,
				name: piName,
				arguments: (event.content_block.input as Record<string, unknown>) ?? {},
				partialJson: "", index: event.index,
			});
			c.currentPiStream!.push({ type: "toolcall_start", contentIndex: c.turnBlocks.length - 1, partial: c.turnOutput });
		} else {
			debug("processStreamEvent: unhandled content_block_start type", event.content_block?.type);
		}
		return;
	}

	if (event?.type === "content_block_delta") {
		const held = heldThinkingBlock(c);
		const index = c.turnBlocks.findIndex((b: any) => b.index === event.index);
		const block = held?.index === event.index ? held : c.turnBlocks[index];
		if (!block) return;
		if (event.delta?.type === "text_delta" && block.type === "text") {
			block.text += event.delta.text;
			c.currentPiStream!.push({ type: "text_delta", contentIndex: index, delta: event.delta.text, partial: c.turnOutput });
		} else if (event.delta?.type === "thinking_delta" && block.type === "thinking") {
			block.thinking += event.delta.thinking;
			if (block !== held) {
				c.currentPiStream!.push({ type: "thinking_delta", contentIndex: index, delta: event.delta.thinking, partial: c.turnOutput });
			} else if (block.thinking.length > NARRATION_HOLD_CHARS) {
				releaseHeldThinking(c, block);
			}
		} else if (event.delta?.type === "input_json_delta" && block.type === "toolCall") {
			block.partialJson += event.delta.partial_json;
			block.arguments = mapToolArgs(block.name, parseStreamingJson(block.partialJson), c.wrappedToolNames);
			c.currentPiStream!.push({ type: "toolcall_delta", contentIndex: index, delta: event.delta.partial_json, partial: c.turnOutput });
		} else if (event.delta?.type === "signature_delta" && block.type === "thinking") {
			block.thinkingSignature = (block.thinkingSignature ?? "") + event.delta.signature;
		} else {
			debug("processStreamEvent: unhandled content_block_delta type", event.delta?.type);
		}
		return;
	}

	if (event?.type === "content_block_stop") {
		const held = heldThinkingBlock(c);
		if (held?.index === event.index) {
			settleHeldThinking(c, held);
			return;
		}
		const index = c.turnBlocks.findIndex((b: any) => b.index === event.index);
		const block = c.turnBlocks[index];
		if (!block) return;
		delete block.index;
		if (block.type === "text") {
			c.currentPiStream!.push({ type: "text_end", contentIndex: index, content: block.text, partial: c.turnOutput });
		} else if (block.type === "thinking") {
			c.currentPiStream!.push({ type: "thinking_end", contentIndex: index, content: block.thinking, partial: c.turnOutput });
		} else if (block.type === "toolCall") {
			c.turnSawToolCall = true;
			// tapRecording maps completed inputs once into Pi's representation, which
			// is also what recording digests compare. Never unwrap that value again.
			const finished = c.assistantSteps.get(c.turnStreamMessageId!)?.content
				.find((part): part is Extract<typeof part, { type: "toolCall" }> => part.type === "toolCall" && part.id === block.id);
			if (finished) block.arguments = structuredClone(finished.arguments);
			else {
				debug(`WARNING: Claude Code's finished tool_use ${block.id} did not arrive before content_block_stop; keeping the streamed arguments`);
				block.arguments = mapToolArgs(block.name, parsePartialJson(block.partialJson, block.arguments), c.wrappedToolNames);
			}
			delete block.partialJson;
			c.currentPiStream!.push({ type: "toolcall_end", contentIndex: index, toolCall: block, partial: c.turnOutput });
		}
		return;
	}

	if (event?.type === "message_delta") {
		c.turnOutput.stopReason = mapStopReason(event.delta?.stop_reason);
		if (event.usage) recordUsage(c.turnOutput, event.usage, model, c.piSessionId);
		return;
	}

	if (event?.type === "message_stop") {
		dropUnfinishedStreamBlocks(c, `message_stop for ${c.turnStreamMessageId}`);
		c.turnStreamOpen = false;
	}

	if (event?.type === "message_stop" && c.turnSawToolCall) {
		// Tool call complete — end this pi stream. The SDK will still yield an
		// assistant message for this turn, but currentPiStream=null causes
		// consumeQuery to skip it. The MCP handler blocks the generator until
		// pi delivers the tool result via the next streamSimple call.
		endToolUseTurn(c);
		return;
	}

	if (event?.type !== "message_stop" && event?.type !== "ping") {
		debug("processStreamEvent: unhandled event type", event?.type);
	}
}

/** Remove the blocks of the message that just stopped which never got their own
 *  content_block_stop, because the stream was cut inside them. A tool call left
 *  that way carries whatever JSON survived the cut — `{}` when no delta landed at
 *  all — under an id Claude Code drops from its own conversation before resuming
 *  the turn, so it will never dispatch that id and nothing could answer a result
 *  keyed to it; pi would reject the call, and its result would sit unmatched while
 *  the resumed call waited in a handler. A thinking block left that way has no
 *  signature.
 *
 *  Per block rather than per message: Claude Code keeps the blocks that did
 *  complete, tool calls included, and one it dispatched while pi was never told is
 *  the same deadlock the other way round. Nothing here ends the pi turn — with no
 *  finished tool call left the resume is more of this same turn, and a turn ended
 *  here would leave the real call with no stream to arrive on. */
function dropUnfinishedStreamBlocks(c: QueryContext, why: string): void {
	if (c.currentPiStream) heldThinking.delete(c.currentPiStream);
	const dropped: string[] = [];
	for (let i = c.turnBlocks.length - 1; i >= c.turnStreamBlockStart; i--) {
		// `index` is deleted at content_block_stop, so it marks a block that never closed.
		if (c.turnBlocks[i].index === undefined) continue;
		dropped.push(`${c.turnBlocks[i].type}${c.turnBlocks[i].id ? `[${c.turnBlocks[i].id}]` : ""}`);
		c.turnBlocks.splice(i, 1);
	}
	if (!dropped.length) return;
	debug(`dropUnfinishedStreamBlocks: ${why}; dropped ${dropped.reverse().join(",")}`);
	c.turnToolCallIds = c.turnBlocks.filter((b: any) => b.type === "toolCall").map((b: any) => b.id);
	c.turnSawToolCall = c.turnBlocks.some((b: any) => b.type === "toolCall");
}

/** Remove the blocks a stream Claude Code abandoned mid-message. Their own
 *  content_block_stop never came, so a thinking block has no signature and a tool
 *  call is one CC will never dispatch; left in, pi would run the tool and the turn
 *  would wait on a handler that never comes, or the next request would replay a
 *  broken block.
 *  The fallback then restarts those indices. pi's normal provider path tolerates that;
 *  pi-agent-core's experimental harness frame encoder keys blocks by contentIndex and
 *  rejects a repeated start, so it would need a change there to drive this provider. */
function dropAbandonedStreamBlocks(c: QueryContext, why: string): void {
	if (c.currentPiStream) heldThinking.delete(c.currentPiStream);
	const dropped = c.turnBlocks.splice(c.turnStreamBlockStart);
	c.turnAssistantIds = c.turnAssistantIds.filter((id) => id !== c.turnStreamMessageId);
	debug(`dropAbandonedStreamBlocks: ${why}; dropped ${dropped.length} blocks from ${c.turnStreamMessageId} types=${dropped.map((b: any) => b.type).join(",")}`);
	c.turnToolCallIds = [];
	c.turnSawToolCall = c.turnBlocks.some((b: any) => b.type === "toolCall");
	c.turnStreamOpen = false;
}

// Render complete blocks that streaming did not deliver. After a streaming
// failure, Claude Code can send one frame per block under a new message ID.
// Rendering does not publish a tool turn; the fallback gate owns that boundary.
function processAssistantMessage(message: AssistantFrame, model: Model<any>, customToolNameToPi: Map<string, string>, c: QueryContext, emit: EmitEvent = (event) => c.currentPiStream?.push(event)): void {
	const assistantMsg = message.message;
	if (!assistantMsg?.content) return;
	// Claude Code reports API failures and its own quota/context notices as a
	// `<synthetic>` assistant message: a report, not model output. Streaming its text
	// pins the turn's output before the failure it describes, and a consumer that only
	// fails over before output commits (pi-model-fallback-alias) then cannot reach the
	// next provider. Keep the wording on the failed turn — the error event carries it —
	// but emit no events, so the turn still reads as a call that produced no output.
	// Issue #162.
	if (assistantMsg.model === "<synthetic>") {
		// The report can follow a stalled stream whose non-streaming retry also failed;
		// drop the abandoned partial blocks (unsigned thinking, a tool call CC will never
		// dispatch) the way the fallback path below would.
		if (c.turnSawStreamEvent && c.turnStreamOpen) dropAbandonedStreamBlocks(c, "synthetic failure report");
		debug(`processAssistantMessage: <synthetic> message, keeping ${assistantMsg.content.length} block(s) off the stream`);
		for (const block of assistantMsg.content) {
			if (block.type === "text" && block.text) c.turnBlocks.push({ type: "text", text: block.text });
			else debug("processAssistantMessage: unhandled <synthetic> block type", block.type);
		}
		if (assistantMsg.usage && c.turnOutput) recordUsage(c.turnOutput, assistantMsg.usage, model, c.piSessionId);
		return;
	}
	debug(`processAssistantMessage fallback: ${assistantMsg.content.length} blocks, types=${assistantMsg.content.map((b) => b.type).join(",")}`);
	for (const block of assistantMsg.content) {
		// Completed narration has no hold/length limit; keep every fallback block.
		const narration = block.type === "thinking" && isNarrationBlock(block);
		if ((block.type === "text" && block.text) || narration) {
			pushTextBlock(c, block.type === "thinking" ? block.thinking : block.text, block.type === "thinking" ? block.signature : undefined, emit);
		} else if (block.type === "thinking") {
			ensureTurnStarted(c, emit);
			c.turnBlocks.push({ type: "thinking", thinking: block.thinking ?? "", thinkingSignature: block.signature ?? "" });
			const idx = c.turnBlocks.length - 1;
			emit({ type: "thinking_start", contentIndex: idx, partial: c.turnOutput });
			if (block.thinking) emit({ type: "thinking_delta", contentIndex: idx, delta: block.thinking, partial: c.turnOutput });
			emit({ type: "thinking_end", contentIndex: idx, content: block.thinking ?? "", partial: c.turnOutput });
		} else if (block.type === "tool_use") {
			const piName = piToolNameFor(block.name, customToolNameToPi);
			if (!piName) {
				debug(`processAssistantMessage: skipping tool_use for unserved tool ${block.name} [${block.id}] — CC rejects it and retries`);
				continue;
			}
			ensureTurnStarted(c, emit);
			c.turnSawToolCall = true;
			c.turnToolCallIds.push(block.id);
			c.turnBlocks.push({
				type: "toolCall", id: block.id,
				name: piName,
				arguments: mapToolArgs(piName, block.input as Record<string, unknown>, c.wrappedToolNames),
			});
			const idx = c.turnBlocks.length - 1;
			const toolBlock = c.turnBlocks[idx];
			emit({ type: "toolcall_start", contentIndex: idx, partial: c.turnOutput });
			emit({ type: "toolcall_end", contentIndex: idx, toolCall: toolBlock as any, partial: c.turnOutput });
		} else {
			debug("processAssistantMessage: unhandled block type", block.type);
		}
	}
	if (assistantMsg.usage && c.turnOutput) recordUsage(c.turnOutput, assistantMsg.usage, model, c.piSessionId);
}

/** Errors of queries that ended on a tool call Claude Code rejected while pi was
 *  running it, by pi session. That session's next provider call takes its entry. */
const rejectedToolCalls = new Map<string | null, { toolCallId: string; error: string }>();

/** Only ordinary/published calls use per-tool rejection routing. */
function toolCallRejection(message: SDKMessage, c: QueryContext, publishedOnly: boolean): { toolCallId: string; describe: (when: string) => string } | undefined {
	if (message.type !== "user" || message.parent_tool_use_id !== null || !Array.isArray(message.message.content)) return undefined;
	for (const block of message.message.content) {
		if (block.type !== "tool_result" || !block.tool_use_id) continue;
		const id = block.tool_use_id;
		if (c.dispatchedToolCalls.has(id)) continue;
		let name = c.publishedToolCalls.get(id);
		if (name === undefined) {
			if (publishedOnly || !c.turnToolCallIds.includes(id)) continue;
			const call = [...c.assistantSteps.values()].flatMap((step) => step.content).find((b) => b.type === "toolCall" && b.id === id);
			if (call?.type !== "toolCall") throw new Error(`Claude Code answered tool call ${id}, but its assistant message never arrived`);
			name = call.name;
		}
		const reason = rejectedToolResultText(block);
		return { toolCallId: id, describe: (when) => `Claude Code rejected pi's tool call "${name}" ${when}. Claude Code said: ${JSON.stringify(reason.trim())}` };
	}
	return undefined;
}

function rejectedToolResultText(block: { content?: unknown }): string {
	return typeof block.content === "string" ? block.content
		: Array.isArray(block.content) ? block.content.map((b) => b?.type === "text" ? b.text : "").join("") : "";
}

class UnrecordableSessionError extends Error {}

// Known yielded envelopes in SDK 0.3.321 (including the reader's extra
// summary and goal frames). Display-only payloads are not used as gate evidence.
const sdkYieldTypes = new Set([
	"assistant", "user", "result", "system", "stream_event", "tool_progress", "auth_status", "tool_use_summary",
	"rate_limit_event", "prompt_suggestion", "conversation_reset", "active_goal", "autocompact_state", "command_lifecycle",
]);
const sdkSystemSubtypes = new Set([
	"api_retry", "background_tasks_changed", "commands_changed", "compact_boundary", "control_request_progress", "elicitation_complete",
	"files_persisted", "hook_progress", "hook_response", "hook_started", "informational", "init", "local_command_output", "memory_recall",
	"mirror_error", "model_refusal_fallback", "model_refusal_no_fallback", "notification", "permission_denied", "plugin_install",
	"post_turn_summary", "session_metadata", "session_state_changed", "session_writes_lost", "status", "task_notification", "task_progress",
	"task_started", "task_summary", "task_updated", "thinking_tokens", "worker_shutting_down",
]);

function malformedFallbackYield(message: SDKMessage): string | undefined {
	if (!sdkYieldTypes.has(message.type)) return `unlisted SDK frame ${message.type}`;
	if (message.type === "system") {
		if (!sdkSystemSubtypes.has(message.subtype)) return `unlisted SDK system frame ${message.subtype}`;
		if ((message.subtype === "api_retry" && ![message.attempt, message.max_retries, message.retry_delay_ms].every(Number.isFinite))
			|| (message.subtype === "model_refusal_fallback" && (message.trigger !== "refusal"
				|| !["retry", "sticky", "revert"].includes(message.direction) || (message.scope !== undefined && !["session", "local"].includes(message.scope))))
			|| (message.subtype === "session_state_changed" && !["idle", "requires_action", "running"].includes(message.state))
			|| (message.subtype === "session_writes_lost" && (!Array.isArray(message.lost)
				|| (message.transcript_session_ids !== undefined && !Array.isArray(message.transcript_session_ids))))) return `malformed system:${message.subtype}`;
	}
	const malformed = `malformed SDK ${message.type} frame`;
	switch (message.type) {
		case "assistant":
		case "user": {
			const content = message.message?.content;
			if (message.type === "user" && typeof content === "string") return undefined;
			if (!Array.isArray(content) || content.some((block) => !block || typeof block.type !== "string")) return malformed;
			break;
		}
		case "stream_event":
			if (!["message_start", "message_delta", "message_stop", "content_block_start", "content_block_delta", "content_block_stop"].includes(message.event?.type)) return malformed;
			break;
		case "conversation_reset":
			if (typeof message.new_conversation_id !== "string") return malformed;
			break;
		case "rate_limit_event":
			if (!["allowed", "allowed_warning", "rejected"].includes(message.rate_limit_info?.status)) return malformed;
			break;
		case "tool_progress": {
			const retry = message.subagent_retry;
			if (retry !== undefined && (!retry || typeof message.parent_tool_use_id !== "string" || !message.parent_tool_use_id
				|| typeof retry.agent_id !== "string" || !retry.agent_id || ![retry.attempt, retry.max_retries, retry.retry_delay_ms].every(Number.isFinite))) return malformed;
			break;
		}
	}
	return undefined;
}

function isFallbackRetry(message: SDKMessage): boolean {
	if (message.type !== "system") return false;
	// On the pinned CLI, api_retry has no origin discriminator. Fail safe even
	// if it came from a non-main quota wait. Side-question and subagent progress
	// have their own wire types and are not used to invalidate the parent batch.
	return message.subtype === "api_retry"
		|| (message.subtype === "model_refusal_fallback" && message.direction === "retry" && message.scope !== "local");
}

function hardQuotaDenial(info: SDKRateLimitInfo | undefined): boolean {
	// overageInUse describes billing, not whether a rejected plan request can
	// continue. Only affirmative active overage makes a plan rejection inert.
	return info?.errorCode === "credits_required" || (info?.status === "rejected"
		&& (info.isUsingOverage !== true || info.overageStatus === "rejected"));
}

/** SDK failures that can surface before a terminal result. */
function fallbackFailureText(message: SDKMessage): string | undefined {
	if (message.type === "auth_status" && message.error) return `Claude Code authentication failed: ${message.error}`;
	if (message.type === "assistant" && !message.parent_tool_use_id) {
		if (message.aborted) return "Claude Code aborted the assistant response";
		const { content, model, stop_reason: stopReason } = message.message;
		// Latch before admitting fallback blocks, but allow a narration-only
		// refusal (or an ordinary streaming turn) to complete as before.
		if (stopReason === "refusal") return "Claude Code refused the assistant response";
		if (stopReason === "model_context_window_exceeded") return "Claude Code exhausted the model context window";
		if (message.error || model === "<synthetic>") {
			const text = (content ?? []).flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
			return text || `Claude Code assistant failed: ${message.error ?? "synthetic failure"}`;
		}
	}
	if (message.type === "rate_limit_event") {
		const info = message.rate_limit_info;
		if (info && hardQuotaDenial(info)) {
			return describeRateLimitFailure(info, info.errorCode === "credits_required" ? "Claude Code requires usage credits" : "Claude Code rejected the request");
		}
	}
	if (message.type === "system") {
		if (message.subtype === "model_refusal_no_fallback") return message.content || "Claude Code refused the tool-use response";
		if (message.subtype === "worker_shutting_down") return `Claude Code is shutting down: ${message.reason}`;
		if (message.subtype === "hook_response" && message.hook_event === "PreToolUse" && message.outcome === "error") {
			return `Claude Code PreToolUse hook failed: ${message.stderr || message.output || message.hook_name}`;
		}
	}
	return undefined;
}

/** Background consumer: streaming tools end at message_stop; fallback tools wait
 *  for the other blocks. The SDK can then park until Pi delivers tool results. */
async function consumeQuery(
	sdkQuery: ReturnType<typeof query>,
	customToolNameToPi: Map<string, string>,
	model: Model<any>,
	wasAborted: () => boolean,
	queryCtx: QueryContext,
	recordingAppend?: string,
	expectedSessionId?: string,
): Promise<{ capturedSessionId?: string; failure?: Error }> {
	queryCtx.checkFallbackGate = () => {
		if (wasAborted() || queryCtx.discarded || queryCtx.observedFailure) return;
		try {
			reduceRawPrefix(queryCtx);
			const process = queryCtx.queryProcess;
			// A queued retry can retire already-staged tools. Let the reducer catch up
			// before failing that batch; any newly staged tool checks the sticky fact itself.
			if (queryCtx.mcpDisconnect && queryCtx.pendingFallback?.tools.size
				&& (!process || process.reducedWatermark === process.ingressWatermark)) {
				failFallbackBatch(queryCtx, queryCtx.mcpDisconnect);
				return;
			}
			publishFallbackIfReady(queryCtx, model, customToolNameToPi, wasAborted);
		} catch (error) {
			const cause = failFallbackBatch(queryCtx, asError(error));
			queryCtx.failLiveQuery?.(cause);
		}
	};
	try {
		const result = await consumeQueryMessages(sdkQuery, customToolNameToPi, model, wasAborted, queryCtx, recordingAppend, expectedSessionId);
		result.failure ??= queryCtx.observedFailure;
		return result;
	} finally {
		queryCtx.checkFallbackGate = undefined;
		queryCtx.finishFallback("Cancelled");
	}
}

async function consumeQueryMessages(
	sdkQuery: ReturnType<typeof query>,
	customToolNameToPi: Map<string, string>,
	model: Model<any>,
	wasAborted: () => boolean,
	queryCtx: QueryContext,
	recordingAppend: string | undefined,
	expectedSessionId: string | undefined,
): Promise<{ capturedSessionId?: string; failure?: Error }> {
	const { traceQueryId, piSessionId } = queryCtx;
	let capturedSessionId: string | undefined;
	let failure: Error | undefined;
	const noteReduced = (message: SDKMessage, staged = false, decision?: string) => {
		const sequence = queryCtx.queryProcess?.acknowledge(message);
		if (sequence !== undefined) {
			if (decision) queryCtx.onFallbackDecision?.(sequence, decision);
			const batch = staged ? stagedFallback(queryCtx) : undefined;
			if (batch && message.type === "assistant") {
				batch.lastSequence = sequence;
				for (const block of message.message.content) {
					const tool = block.type === "tool_use" ? batch.tools.get(block.id) : undefined;
					if (!tool || block.type !== "tool_use" || tool.sequence !== undefined) continue;
					tool.sequence = sequence;
					// A parked call observed in AwaitReplacement cannot later become
					// a dispatch for a replacement block that had not yet arrived.
					const dispatch = validatedFallbackDispatch(queryCtx, block.id);
					if (dispatch && dispatch.ingress.sequence <= sequence) latchFallbackViolation(queryCtx, invertedFallbackDispatch(block.id));
				}
			}
		}
		queryCtx.checkFallbackGate?.();
	};
	const flushNarration = (batch: FallbackBatch) => {
		if (batch.frames.length) renderFallback(queryCtx, batch, model, customToolNameToPi);
		leaveFallbackWindow(queryCtx, wasAborted);
	};

	const reduce = async (message: SDKMessage): Promise<boolean> => {
		// Reduce raw facts that precede this yield before reading attempt state.
		reduceRawPrefix(queryCtx);
		if (queryCtx.observedFailure) return false;
		const owningStream = queryCtx.currentPiStream;
		const owningProcess = queryCtx.queryProcess;
		const stillLive = () => !wasAborted() && !queryCtx.discarded && !queryCtx.observedFailure;
		const stillOwnsTurn = () => owningStream === queryCtx.currentPiStream && owningProcess === queryCtx.queryProcess;
		const pending = queryCtx.pendingFallback;
		const awaitingReplacement = pending?.state === "AwaitReplacement";
		const stagedBatch = awaitingReplacement ? undefined : pending;
		const waitingForTools = !!stagedBatch?.tools.size;
		const blocking = waitingForTools || awaitingReplacement;
		// CLAUDE_BRIDGE_RECORD_STREAM=<path> appends every SDK message consumeQuery
		// sees, one JSON object per line. Used by tests/lib/record-sdk-streams.mjs to
		// capture replay fixtures, so unit tests assert against message shapes Claude
		// Code really emitted rather than ones we imagined.
		const recordStreamPath = process.env.CLAUDE_BRIDGE_RECORD_STREAM;
		if (recordStreamPath) appendFileSync(recordStreamPath, `${JSON.stringify(message)}\n`);
		if (wasAborted() || queryCtx.discarded) return false;
		const malformed = owningProcess?.yieldedViolation?.(message) ?? malformedFallbackYield(message);
		if (malformed) {
			latchFallbackViolation(queryCtx, new Error(`Claude Code emitted ${malformed}`));
			noteReduced(message, false, stagedBatch ? "violation" : undefined);
			return !queryCtx.observedFailure;
		}
		// Identity changes and known transcript loss are unsafe even for ordinary
		// turns: a successful result could otherwise advance the resume pointer
		// past records that do not exist in its target transcript.
		let unrecordable: UnrecordableSessionError | undefined;
		if (message.type === "system" && expectedSessionId !== undefined) {
			if (message.subtype === "init" && message.session_id !== expectedSessionId) {
				unrecordable = new UnrecordableSessionError(`Claude Code initialized unexpected session ${message.session_id}; expected ${expectedSessionId}`);
			} else if (message.subtype === "session_writes_lost" && message.lost.includes("transcript")
				&& (message.transcript_session_ids?.includes(expectedSessionId) ?? message.session_id === expectedSessionId)) {
				unrecordable = new UnrecordableSessionError(`Claude Code lost transcript writes for ${expectedSessionId}: ${message.error_code}`);
			}
		}
		if (message.type === "conversation_reset") {
			unrecordable = new UnrecordableSessionError(`Claude Code reset the conversation to ${message.new_conversation_id}`);
		}
		if (unrecordable) {
			failure = failFallbackBatch(queryCtx, unrecordable);
			queryCtx.failLiveQuery?.(failure);
			return false;
		}
		if (isFallbackRetry(message)) {
			queryCtx.fallbackAttempt++;
			queryCtx.fallbackViolation = undefined;
			if (pending) awaitFallbackReplacement(queryCtx, pending, wasAborted);
			const sequence = queryCtx.queryProcess?.acknowledge(message);
			if (sequence !== undefined) {
				queryCtx.fallbackRetrySequence = sequence;
				if (stagedBatch) queryCtx.onFallbackDecision?.(sequence, "retry");
			}
			queryCtx.checkFallbackGate?.();
			return true;
		}
		if (message.type === "assistant" && !message.parent_tool_use_id && queryCtx.invalidatedFallbackMessageIds.has(message.message.id)) {
			if (stagedBatch) latchFallbackViolation(queryCtx, new Error(`Claude Code emitted retired fallback message ${message.message.id} after replacement staging`));
			else retireFallbackTools(queryCtx, message);
			noteReduced(message, false, stagedBatch ? "violation" : undefined);
			return !queryCtx.observedFailure;
		}
		// A rejection of a published id belongs to the existing continuation,
		// not the new batch's provisional latch (even after private narration).
		const rejection = toolCallRejection(message, queryCtx, !!stagedBatch);
		if (rejection) {
			// Stop CC even if pi already returned its result: CC could retry a tool
			// pi executed. If pi is still running it, its next provider call fails on
			// the note. An open stream fails now; its blocks stay so queued event
			// indices remain valid.
			const running = !queryCtx.currentPiStream;
			const beforePi = queryCtx.turnBlocks.some((b: any) => b.id === rejection.toolCallId);
			debug(`consumeQuery: Claude Code rejected tool call [${rejection.toolCallId}] ${running ? "while pi runs it" : beforePi ? "before pi got it" : "after pi ran it"}, ending the query`);
			const error = rejection.describe(running ? "after pi had started running it" : beforePi ? "before pi started running it" : "after pi ran it");
			if (running) rejectedToolCalls.set(queryCtx.piSessionId, { toolCallId: rejection.toolCallId, error });
			queryCtx.discarded = true;
			activeQueryContexts.delete(queryCtx);
			endCurrentPiStreamWithError(queryCtx, error);
			// Commit in this same turn, before another call can sync. Discarding
			// above prevents a second commit and rejects requests during teardown.
			try { queryCtx.commitRecording?.(true); }
			catch (error) { logCleanupFailure("Claude Code rejected tool recording failed", error); }
			finally { queryCtx.stopProcess?.(); }
			traceEvent("query-end", { queryId: traceQueryId, outcome: "error", error });
			return false;
		}
		const sdkFailure = fallbackFailureText(message);
		const denied = message.type === "system" && message.subtype === "permission_denied" ? message : undefined;
		const userResults = message.type === "user" && Array.isArray(message.message?.content)
			? message.message.content.filter((block) => block.type === "tool_result") : [];
		const retired = (id: string | undefined) => awaitingReplacement && !!id && queryCtx.invalidatedFallbackToolIds.has(id);
		if ((denied && retired(denied.tool_use_id)) || (userResults.length && message.type === "user"
			&& userResults.length === message.message.content.length && userResults.every((block) => retired(block.tool_use_id)))) {
			noteReduced(message);
			return true;
		}
		let rejected: ToolResultBlockParam | undefined;
		const mainThreadResults = message.type === "user" && message.parent_tool_use_id === null;
		for (const block of userResults) {
			if (retired(block.tool_use_id)) continue;
			// The CLI can trim text or drop images. Consume one echo by delivered id,
			// never by payload and never after fallback staging has started.
			if (!stagedBatch && mainThreadResults && queryCtx.unacknowledgedPiToolResults.delete(block.tool_use_id)) continue;
			if (mainThreadResults || block.is_error === true || stagedBatch) rejected ??= block;
		}
		const stage = message.type === "assistant" && !!queryCtx.currentPiStream && !message.parent_tool_use_id
			&& message.message.model !== "<synthetic>" && !queryCtx.assistantSteps.get(message.message.id)?.emitted
			&& (!queryCtx.turnSawStreamEvent || !!message.message.id && (message.message.id !== queryCtx.turnStreamMessageId || pending?.messageId === message.message.id))
			&& (!!message.message.id || message.message.content?.some((block) => block.type === "tool_use" && piToolNameFor(block.name, customToolNameToPi)));
		const nextContent = (stage && message.message.id !== pending?.messageId)
			|| (message.type === "stream_event" && !message.parent_tool_use_id && message.event.type === "message_start");
		const terminal = message.type === "result" || (message.type === "system" && message.subtype === "session_state_changed" && message.state === "idle");
		let decision = fallbackInertFrame({ message });
		const admissibleAssistant = stage && Array.isArray(message.message.content) && message.message.content.length > 0
			&& message.message.content.every((block) => block.type === "text" || block.type === "thinking" || block.type === "tool_use");
		const violation = sdkFailure ?? (denied && `Claude Code denied tool call ${denied.tool_name}`)
			?? (rejected && `Claude Code rejected tool call ${rejected.tool_use_id || "(no id)"} before pi started running it: ${rejectedToolResultText(rejected)}`)
			?? (stagedBatch && !terminal && (nextContent || (!decision && !admissibleAssistant))
				? nextContent ? "Claude Code started another response before the fallback completion fence"
					: `Claude Code emitted unlisted ${message.type}${"subtype" in message ? `:${message.subtype}` : ""} before fallback publication`
				: undefined);
		if (violation) {
			decision = "violation";
			latchFallbackViolation(queryCtx, new Error(violation));
			if (queryCtx.observedFailure) {
				noteReduced(message, false, decision);
				return false;
			}
		}
		if (pending && nextContent && !stage) flushNarration(pending);
		tapRecording(message, customToolNameToPi, queryCtx, stage);
		if (stage) {
			if (!admissibleAssistant) latchFallbackViolation(queryCtx, new Error("Claude Code emitted unsupported fallback assistant content"));
			decision ??= stagedBatch ? "assistant" : "stage";
			stageFallback(queryCtx, message, customToolNameToPi, wasAborted);
			if (queryCtx.observedFailure) {
				noteReduced(message, false, "violation");
				return false;
			}
			if (typeof message.message.id !== "string" || !message.message.id) {
				failure = failFallbackBatch(queryCtx, new Error("Claude Code fallback is missing its API message id"));
				return false;
			}
		}

		// Everything below the currentPiStream guard is content, which there is
		// nowhere to put once a turn has ended on a tool call. Handle lifecycle
		// messages before that gate:
		//
		// - stdin: nothing else closes the CLI's stdin now that the prompt is a
		//   streamed generator (isSingleUserTurn=false), so missing this hangs the query.
		// - the failure a `result` carries: it is the only record that the turn
		//   failed at all. Behind the guard, a 429 arriving at a tool boundary
		//   logged nothing. It fails turnOutput only while the turn's stream is
		//   open; once ended, turnOutput is the message pi already recorded.
		// - rate-limit events: notifications to the user, which are most likely to
		//   fire during exactly the long tool-using turns the guard was skipping.
		if (message.type === "stream_event" && (message as any).event?.type === "message_start") {
			const started = (message as any).event.message;
			traceEvent("api-message", { queryId: traceQueryId, apiMessageId: started?.id ?? null, model: started?.model ?? null, usage: started?.usage ?? null });
		}
		let resultError: string | undefined;
		if (message.type === "result") {
			queryCtx.sawResult = true;
			traceEvent("query-result", { queryId: traceQueryId, subtype: message.subtype, isError: (message as any).is_error ?? null, ccSession: message.session_id, numTurns: (message as any).num_turns ?? null, usage: (message as any).usage ?? null });
			logServedContextWindow("result", message, model);
			resultError = resultErrorText(message);
			// A result ends a turn, not necessarily the query: steers not yet replayed
			// can still start a later turn.
			if (resultError !== undefined) {
				// Consume the rejection alongside the failure it caused, so a later
				// unrelated failure on this query doesn't inherit the label.
				if (queryCtx.rateLimitRejection) {
					resultError = describeRateLimitFailure(queryCtx.rateLimitRejection, resultError);
					queryCtx.rateLimitRejection = null;
				} else if (resultError.includes("out of extra usage") && !extraUsageByChoice(model, longContextSettings)) {
					// Extra Usage off or empty, and no plan window was rejected first.
					resultError += ` (${THIRD_PARTY_SUSPECT})`;
				}
				debug(`consumeQuery: error result, subtype=${message.subtype}, error=${resultError}`);
				// for-await implicitly calls and awaits iterator.return() on break.
				// Publish the terminal failure now, even without a staged tool.
				activeQueryContexts.delete(queryCtx);
				failure = failFallbackBatch(queryCtx, new Error(resultError));
				if (stillOwnsTurn()) endCurrentPiStreamWithError(queryCtx, failure.message);
				// Establish the dirty snapshot and writer barrier, then stop the
				// child without depending on iterator.return() to release that barrier.
				if (!pending) {
					commitFailedRecording(queryCtx, true);
					queryCtx.stopProcess?.();
				}
				queryCtx.promptStream?.end();
				if (stagedBatch) noteReduced(message, false, "violation");
				else queryCtx.queryProcess?.acknowledge(message);
				return false;
			}
			if (queryCtx.pendingSteerUuids.size === 0) queryCtx.promptStream?.end();
		}
		if (terminal) {
			if (pending && blocking) {
				failure = failFallbackBatch(queryCtx, fallbackTerminalBoundary(pending, message.type === "result" ? "returned a result" : "became idle"));
				noteReduced(message, false, "violation");
				return false;
			}
			if (message.type === "result") {
				if (stagedBatch) {
					flushNarration(stagedBatch);
					decision = "text-result";
				}
			} else if (stagedBatch) {
				latchFallbackViolation(queryCtx, fallbackTerminalBoundary(stagedBatch, "became idle"));
				decision = "violation";
			}
		}

		await reportHeldRateLimit(queryCtx, model);
		if (!stillLive()) return false;
		if (owningProcess !== queryCtx.queryProcess) return false;
		if (message.type === "rate_limit_event") {
			const info = (message as any).rate_limit_info;
			debug("consumeQuery: rate_limit_event", JSON.stringify(info).slice(0, 300));
			if (info) queryCtx.heldRateLimit = info;
			await reportHeldRateLimit(queryCtx, model);
			if (!stillLive() || owningProcess !== queryCtx.queryProcess) return false;
			// CC sets isUsingOverage only when a rejected plan window is served from Extra
			// Usage; overageInUse alone means the request was billed there anyway.
			if (info?.overageInUse === true && info.status !== "rejected" && info.isUsingOverage !== true
				&& !extraUsageByChoice(model, longContextSettings) && !queryCtx.warnedUnplannedOverage) {
				queryCtx.warnedUnplannedOverage = true;
				piUI?.notify(`Claude Code request billed to Extra Usage: ${THIRD_PARTY_SUSPECT}, or this model needs usage credits on your plan`, "warning");
			}
			if (info?.status === "rejected") {
				// Held so the failure Claude Code sends next can be named as a rate limit.
				queryCtx.rateLimitRejection = info;
				// The "rate limit reached" notice below supersedes warnings; re-arm so the next
				// window's warnings fire even if it opens straight into allowed_warning.
				queryCtx.lastRateLimitWarnStep = null;
				queryCtx.lastRateLimitWarnThreshold = undefined;
				// resetsAt is Unix seconds, not milliseconds.
				const resetsAt = info.resetsAt ? new Date(info.resetsAt * 1000).toLocaleTimeString() : undefined;
				// isUsingOverage: the plan limit is hit but Extra Usage is serving (and billing) requests.
				piUI?.notify(info.isUsingOverage
					? `Claude subscription rate limit reached (${info.rateLimitType ?? "unknown"}) — requests are now billed to Extra Usage${resetsAt ? ` until ${resetsAt}` : ""}`
					: `Claude subscription rate limit reached (${info.rateLimitType ?? "unknown"}) — resets at ${resetsAt ?? "unknown"}`, "warning");
			} else if (info?.status === "allowed") {
				// Back under the threshold (window reset) — re-arm the warning dedupe.
				queryCtx.lastRateLimitWarnStep = null;
				queryCtx.lastRateLimitWarnThreshold = undefined;
			} else if (info?.status === "allowed_warning") {
				// utilization is a fraction (0..1); allowed_warning fires once it crosses surpassedThreshold.
				const percent = Math.round((info.utilization ?? 0) * 100);
				// The SDK emits one event per request, so only re-notify when the level
				// rises past a new 5% step or the threshold changes.
				const step = Math.floor(percent / 5);
				const rose = queryCtx.lastRateLimitWarnStep === null || step > queryCtx.lastRateLimitWarnStep;
				if (rose || info.surpassedThreshold !== queryCtx.lastRateLimitWarnThreshold) {
					queryCtx.lastRateLimitWarnStep = step;
					queryCtx.lastRateLimitWarnThreshold = info.surpassedThreshold;
					piUI?.notify(`Claude rate limit warning: ${percent}% used (${info.rateLimitType ?? ""})`, "warning");
				}
			}
			noteReduced(message, false, stagedBatch ? decision : undefined);
			return true;
		}
		if (message.type === "system" && message.subtype === "init") {
			capturedSessionId = message.session_id;
			queryCtx.fallbackQualified = queryCtx.qualifiedFallbackRuntime && message.claude_code_version === "2.1.321";
			if (recordingAppend !== undefined && !queryCtx.discarded && !queryCtx.historyStale) appendInstructions.ensure(capturedSessionId, recordingAppend);
			traceEvent("query-init", { queryId: traceQueryId, ccSession: capturedSessionId, claudeCodeVersion: message.claude_code_version });
		}
		if (message.type === "system" && message.subtype === "compact_boundary" && recordingAppend !== undefined && !queryCtx.discarded && !queryCtx.historyStale) {
			appendInstructions.start(message.session_id, recordingAppend);
		}
		if (!stillOwnsTurn() || !queryCtx.currentPiStream || !queryCtx.turnOutput) {
			noteReduced(message);
			return true;
		}

		switch (message.type) {
			case "stream_event":
				if (!waitingForTools && (!awaitingReplacement || nextContent)) processStreamEvent(message, customToolNameToPi, model, queryCtx);
				break;
			case "assistant":
				// A completed echo can trail tool-result delivery. Record it for
				// its original step, never render it again into the new pi stream.
				if (!stage && !waitingForTools && (message.message.model === "<synthetic>" || (!queryCtx.turnSawStreamEvent && !queryCtx.assistantSteps.get(message.message.id)?.emitted))) {
					processAssistantMessage(message, model, customToolNameToPi, queryCtx);
				}
				break;
			case "result": {
				// The failure itself was recorded above the guard, along with the served
				// context window. What is left here is the success path: push the result
				// text when no assistant message already delivered it.
				if (resultError === undefined && !queryCtx.turnSawStreamEvent && !queryCtx.turnStarted && message.subtype === "success") {
					pushTextBlock(queryCtx, message.result || "");
				}
				break;
			}
			case "system":
				break;
			case "user":
				// Prompt/tool-result echoes have no content events to emit. With
				// replay-user-messages, queued steers also arrive as user replays;
				// their lifecycle acknowledgement is handled above the stream guard.
				break;
			default:
				debug("consumeQuery: unhandled SDK message type", message.type);
				break;
		}
		noteReduced(message, stage, stage || stagedBatch ? decision : undefined);
		return true;
	};
	const observeReaderFailure = (error: unknown) => {
		if (wasAborted() || queryCtx.discarded) return;
		if (queryCtx.observedFailure) logCleanupFailure("Claude Code iterator cleanup failed", error);
		failure = failFallbackBatch(queryCtx, asError(error));
		queryCtx.failLiveQuery?.(failure);
	};
	const mcpGeneration = queryCtx.mcpGeneration;
	try {
		for await (const message of sdkQuery) {
			try {
				reportClaudeProviderLimit(message, piSessionId);
				if (!wasAborted() && !queryCtx.discarded && !queryCtx.observedFailure && await reduce(message)) continue;
			}
			catch (error) {
				// Report before for-await awaits iterator.return(), which can hang or reject.
				observeReaderFailure(error);
			}
			// Breaking the loop implicitly calls SDK iterator.return(), which closes MCP.
			if (mcpGeneration) mcpGeneration.closeRequested = true;
			break;
		}
	} catch (error) {
		// The SDK can reject next() instead of yielding a reader-fault frame.
		// A consumed prefix (idle, cancellation, etc.) still comes first.
		if (!failure && !queryCtx.observedFailure && !wasAborted() && !queryCtx.discarded) reduceRawPrefix(queryCtx);
		observeReaderFailure(error);
	}

	if (!failure && !queryCtx.observedFailure && !wasAborted() && !queryCtx.discarded) {
		// A result flushes confirmed text-only narration. At EOF any remaining
		// staged fragment is incomplete, even if no served tool has arrived yet.
		const batch = queryCtx.pendingFallback;
		if (batch) failure = failFallbackBatch(queryCtx, incompleteFallbackAtEof(batch));
	}

	// DEBUG: trace when consumeQuery exits
	debug(`consumeQuery: for-await loop exited, wasAborted=${wasAborted()}, capturedSessionId=${capturedSessionId?.slice(0, 8) ?? "none"}`);

	return { capturedSessionId, failure };
}

/** The trailing user turn as content blocks, or null if there isn't one.
 *  Blocks rather than text so image steers keep their images. */
function steerBlocks(messages: Context["messages"]): ContentBlockParam[] | null {
	const blocks = extractUserPromptBlocks(messages);
	if (blocks) return blocks;
	const text = extractUserPrompt(messages);
	return text ? [{ type: "text", text }] : null;
}

/** Releases this turn's tool results to their MCP handlers, after first pushing
 *  any steer to CC.
 *
 *  The ordering is mandatory, not an optimization. The steer and the MCP tool
 *  result travel back to CC over the same stdin FIFO. Awaiting the push ack
 *  (which resolves only once the SDK's write to stdin completed) before
 *  resolving any handler guarantees CC enqueues the steer *before* it reads the
 *  tool result, so its post-tool-call drain sees it and acts on it this turn.
 *  Resolve first and the steer misses the drain, silently degrading to
 *  follow-up semantics.
 *
 *  Both the post-tool-call drain and the FIFO ordering are CC CLI internals,
 *  not SDK contract — tests/int-tool-message.mjs is the tripwire if they move. */
async function deliverToolResults(
	c: QueryContext,
	results: McpResult[],
	steer: ContentBlockParam[] | null,
	contextLength: number,
	messages?: Context["messages"],
): Promise<void> {
	const stream = c.currentPiStream;
	if (messages) c.recording.results(messages);
	if (steer) {
		const text = steer.map((b) => (b.type === "text" ? b.text : "[image]")).join("\n");
		if (!c.promptStream) {
			debug(`WARNING: steer with no prompt stream, dropping: ${text.slice(0, 60)}`);
		} else {
			const uuid = randomUUID();
			// Register before awaiting stdin: a result can arrive during the write.
			c.pendingSteerUuids.add(uuid);
			if (messages) c.recording.users(messages, turnStart(messages), uuid, false);
			try {
				await c.promptStream.push({ ...userMessage(steer, "next"), uuid });
				debug(`provider: steer written to CC stdin before tool result: ${text.slice(0, 60)}`);
			} catch (error) {
				// No replay acknowledgement means no coverage slot. The next sync
				// imports the steer from pi instead of trusting this write.
				c.pendingSteerUuids.delete(uuid);
				debug(`provider: steer push rejected:`, error);
			}
		}
	}

	if (c.discarded || c.observedFailure || c.currentPiStream !== stream) return;
	debug(`provider: tool results, ${results.length} results, ${c.pendingToolCalls.size} waiting handlers, ctx.msgs=${contextLength}`);
	for (const result of results) {
		const id = result.toolCallId;
		if (id && c.pendingToolCalls.has(id)) {
			const pending = c.pendingToolCalls.get(id)!;
			c.pendingToolCalls.delete(id);
			if (DEBUG) debug(`provider: resolving ${pending.toolName} [${id}]${result.isError ? " (error)" : ""}`, JSON.stringify(result.content).slice(0, 200));
			c.unacknowledgedPiToolResults.add(id);
			pending.resolve(result);
		} else if (id) {
			c.pendingResults.set(id, result);
			debug(`provider: queued result [${id}] (${c.pendingResults.size} pending)`);
		} else {
			debug(`WARNING: tool result without toolCallId, cannot match`);
		}
		if (c.pendingToolCalls.size > 0 && c.pendingResults.size > 0) {
			debug(`BUG: both maps non-empty! handlers=${c.pendingToolCalls.size} results=${c.pendingResults.size}`);
		}
	}
	if (c.pendingToolCalls.size > 0) {
		debug(`WARNING: ${c.pendingToolCalls.size} MCP handlers still waiting after delivering ${results.length} results`);
		piUI?.notify(`Claude bridge: ${c.pendingToolCalls.size} tool handler(s) still waiting — provider may be stuck`, "warning");
	}
}

/** Abort teardown for one query: settle everything that would otherwise be left
 *  awaiting a subprocess we are about to kill. The pump abandons iteration on
 *  abort, so an in-flight prompt-stream push would hang forever and take
 *  tool-result delivery with it. */
function drainForAbort(c: QueryContext, promptStream: PromptStream): void {
	c.finishFallback("Cancelled");
	promptStream.fail(new Error("Operation aborted"));
	c.releasePendingToolCalls("Operation aborted");
}

/** The prompt a continuation query is opened with: the pi turn goes on, but its
 *  last message is a tool result rather than a prompt, and query() cannot resume
 *  a session without one. */
const CONTINUE_AFTER_REWRITE_PROMPT =
	"[Your context was compacted. What precedes this is a summary plus the most recent messages, "
	+ "ending with the tool result you were waiting for. Continue the task from there.]";

/** The prompt a resumed tool result is opened with: no query of this process
 *  was parked on it (a restart, a crash, a stall), so the turn goes on from
 *  history that ends at the result. */
const CONTINUE_AFTER_RESUME_PROMPT =
	"[Your session was interrupted and resumed. What precedes this ends with the tool result "
	+ "you were waiting for. Continue the task from there.]";

/** Drop a Claude Code query parked at a tool boundary whose conversation pi has
 *  since rewritten (/compact, tree navigation).
 *
 *  Delivering the turn's tool result into that query hands Claude Code the
 *  context pi just shrank: one pi turn is one CC query, and the query keeps its
 *  own context inside the CLI whatever pi does to its transcript. It answers off
 *  the pre-compaction conversation, reports the pre-compaction usage back, and pi
 *  crosses the same threshold at the next boundary — measured as one compaction
 *  per tool call with usage never dropping (issue #101). Dirty-tail marking
 *  alone does not prevent it: tool-result delivery never runs session sync.
 *
 *  The caller then takes the fresh-query path, where REBUILD imports pi's
 *  rewritten history — this tool result included, since it is already in that
 *  history — so the turn continues instead of ending here. Nothing is lost by
 *  killing the subprocess: pi owns the only copy of the conversation that counts. */
function discardRewrittenQuery(c: QueryContext): void {
	c.requestMcpClose();
	c.finishFallback("Cancelled");
	c.discarded = true;
	c.activeQuery = null;
	activeQueryContexts.delete(c);
	c.turnToolCallIds = [];
	endCurrentPiStreamWithError(c, "Conversation replaced");
	// A failed commit reaches the caller, but never leaves the query parked.
	try { c.commitRecording?.(true); }
	finally {
		c.promptStream?.fail(new Error("conversation rewritten"));
		c.promptStream = null;
		c.releasePendingToolCalls("Context changed; this query was discarded.");
		// Null when no query is running (a context discarded before launch).
		c.stopProcess?.();
		if (c.piSessionId) historyRewrittenBySession.delete(c.piSessionId);
		debug("provider: discarded parked query; its recorded prefix remains available for a fork");
	}
}

/** Provider entry point. Pi calls this for each new prompt and each tool result.
 *  Two cases: tool result delivery (active query) or fresh query. */
function streamClaudeAgentSdk(model: Model<any>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
	// pi hands providers a transcript (prompt/tools folded into system messages) — fold it
	// back out to the prompt/tools fields every syncSharedSession call and
	// prompt-capture lookup below assumes (issue #106).
	const traceCallId = traceId("call");
	const sourceContext = context;
	context = toBridgeContext(context);
	traceInput(traceCallId, sourceContext, context, model, options);

	// Pi's compaction, branch-summary and bug-report calls use cacheRetention:"none"
	// in completeSummarization. Their prompts bypass the capture boundaries, so route
	// them to an isolated persistSession:false CC process without session sync.
	if (options?.cacheRetention === "none") {
		debug(`provider: one-off summarizer call (cacheRetention none) routed to isolated summary, msgs=${context.messages.length}`);
		traceEvent("route", { callId: traceCallId, route: "isolated-summary" });
		return isolatedStreamFn(model, context, options, traceCallId);
	}

	if (options?.sessionId) noticeDroppedTurn(options.sessionId, context.messages);

	const stream = createAssistantMessageEventStream();
	// Report a failure before any query exists on the stream, as pi-ai's provider
	// contract expects, rather than as a synchronous exception.
	const failBeforeQuery = (err: unknown) => {
		const output = newAssistantOutput(model, "", "error", errorMessage(err));
		queueMicrotask(() => endStream(stream, { type: "error", reason: "error", error: output }));
		traceEvent("route", { callId: traceCallId, route: "failed-before-query", error: errorMessage(err) });
		return stream;
	};

	// DEBUG: trace followUp message triggering
	const lastMsgRole = context.messages[context.messages.length - 1]?.role;
	debug(`provider: streamClaudeAgentSdk called, activeContexts=${activeQueryContexts.size}, lastMsgRole=${lastMsgRole}`);

	// The result of a call Claude Code rejected while pi ran it ends the turn with
	// that error. Taken on every call, so it never outlives this one, and checked
	// before routing: the ending query can still look parked on the call. An aborted
	// run fails the same way, since the rejection is what ended the query.
	const rejected = rejectedToolCalls.get(options?.sessionId ?? null);
	rejectedToolCalls.delete(options?.sessionId ?? null);
	if (rejected && extractAllToolResults(context).some((r) => r.toolCallId === rejected.toolCallId)) {
		return failBeforeQuery(new Error(rejected.error));
	}

	let activeQuery = activeQueryContexts.size > 0;
	const allResults = activeQueryContexts.size > 0 ? extractAllToolResults(context) : [];
	let resultCtx = allResults.length > 0 ? contextForToolResults(allResults, options?.sessionId ?? null) : undefined;

	// pi rewrote its history while this query sat parked at a tool boundary, so the
	// query answers about a conversation that no longer exists. Discard it and let
	// this tool result carry the turn into a fresh query over the rewritten history.
	// The staleness mark is per pi session: a subagent's compaction (its own
	// AgentSession, sharing this process) must not discard the parent's parked
	// query, and vice versa. Extensions can also edit the selected history without
	// a rewrite event; compare the live prefix before feeding this query a result.
	let divergence: ReturnType<LiveRecording["divergence"]>;
	try {
		divergence = resultCtx && !resultCtx.historyStale ? resultCtx.recording.divergence(nonSystemMessages(context.messages)) : undefined;
	} catch (error) {
		// A history that can't be checked can't continue the query either.
		traceEvent("route", { callId: traceCallId, route: "discard-rewritten", queryId: resultCtx!.traceQueryId, reason: "digest-error" });
		try { discardRewrittenQuery(resultCtx!); }
		catch (discardError) { return failBeforeQuery(discardError); }
		return failBeforeQuery(error);
	}
	const rewrittenUnderQuery = Boolean(resultCtx && (resultCtx.historyStale || divergence !== undefined));
	if (resultCtx && rewrittenUnderQuery) {
		traceEvent("route", {
			callId: traceCallId, route: "discard-rewritten", queryId: resultCtx.traceQueryId,
			reason: resultCtx.historyStale ? "rewrite-event" : "history-diverged", divergence,
		});
		try { discardRewrittenQuery(resultCtx); }
		catch (error) { return failBeforeQuery(error); }
		resultCtx = undefined;
		// Recomputed, not cleared: a reentrant subagent may still hold a query of its own.
		activeQuery = activeQueryContexts.size > 0;
	}

	const isReentrantUserQuery = activeQuery && lastMsgRole === "user" && allResults.length === 0;
	if (isReentrantUserQuery) {
		debug(`provider: active query user-only call treated as reentrant fresh query, ctx.msgs=${context.messages.length}`);
	}

	// --- Tool result delivery ---
	// Pi appends tool results to context and calls back. Extract this turn's results
	// (everything after the last assistant message) and match against waiting MCP
	// handlers. Results that arrive before their handler get queued in pendingResults.
	if (resultCtx) {
		claimCurrentPiStream(stream, "tool-result", resultCtx, options);
		resultCtx.resetTurnState(model);
		resultCtx.bindRunSignal?.(options?.signal, stream);
		// User messages (steer/followUp) pi injected into context during the
		// active query: a steer sent while a tool was executing, drained by pi at
		// the turn boundary and appended alongside the tool result.
		const steer = lastMsgRole === "user" ? steerBlocks(context.messages) : null;
		traceEvent("route", { callId: traceCallId, route: "tool-result", queryId: resultCtx.traceQueryId, signal: traceSignalId(options?.signal), results: allResults.map((r) => r.toolCallId), steer: Boolean(steer) });
		// Delivery is async because the steer must reach CC's stdin *before* the
		// tool result does — see deliverToolResults. Detached so the provider
		// still returns its stream synchronously.
		const owner = resultCtx;
		void deliverToolResults(owner, allResults, steer, context.messages.length, context.messages).catch((error) => {
			if (owner.currentPiStream === stream) owner.failLiveQuery?.(error);
		});
		return stream;
	}

	// --- Orphaned tool result (e.g. user aborted a tool call) ---
	// The query is gone but pi still delivered the result. Nothing to do — just
	// emit end_turn so pi waits for the next real user message. The discard
	// branch above already siphoned off the stale-query case, which goes on to a
	// rebuild instead — that one has somewhere to deliver the result to.
	// Only when this call's own signal is aborted: after an abort during a tool
	// call, pi calls back with the run's (already aborted) signal. A result that
	// arrives otherwise -- after a restart (a durable host resuming a run), a
	// crash, a stall, or an overflow/quota retry -- has no parked query either, and
	// falls through to the fresh-query path, which resumes the CC session and
	// delivers it.
	const lastMsg = context.messages[context.messages.length - 1];
	const unparkedToolResult = lastMsg?.role === "toolResult" && !rewrittenUnderQuery;
	if (unparkedToolResult && options?.signal?.aborted) {
		debug(`provider: orphaned tool result after abort, emitting end_turn`);
		traceEvent("route", { callId: traceCallId, route: "orphan-after-abort" });
		// No query owns this result, so there is no context to reset: resetTurnState
		// on a live parent's context would replace its turnOutput mid-stream,
		// stranding the blocks it had already emitted.
		const message = newAssistantOutput(model, "", "stop");
		queueMicrotask(() => endStream(stream, { type: "done", reason: "stop", message }));
		return stream;
	}

	// A fresh request replaces a parked query of this same pi session. Its
	// synchronous progress commit happens before sync takes a state identity.
	try {
		if (options?.sessionId) for (const parked of [...activeQueryContexts]) {
			if (parked.piSessionId === options.sessionId) discardRewrittenQuery(parked);
		}
	} catch (error) { return failBeforeQuery(error); }

	// --- Fresh query ---

	// 1. Determine reentrancy. Reentrant queries get their own QueryContext so
	//    background subagents can run concurrently with the parent query.
	const isReentrant = activeQuery;
	const queryCtx = new QueryContext();
	debug(`provider: fresh query setup, isReentrant=${isReentrant}, activeContexts=${activeQueryContexts.size}`);

	// Resolved first: an unaccountable system prompt fails this query before anything
	// is claimed or reset, leaving no half-built query behind — in particular no stream
	// claimed on the shared context that nobody will ever end.
	const { mcpTools, customToolNameToSdk, customToolNameToPi, wrappedToolNames } = resolveMcpTools(context);
	// Build from what Pi loaded for this run, so `--no-context-files` and
	// `--no-skills` reach Claude Code by leaving nothing to forward. A sub-agent's
	// custom override embeds its parent's assembled Pi prompt; recursive projection
	// replaces that exact inherited prompt with its already-safe portable parts.
	// Derive the key from the transcript replay (toBridgeContext), NOT from the
	// recorded keys: under a forced prompt the transcript head is projected via
	// transformContext after turn_start, so ctx.getSystemPrompt() is not the head.
	let promptCapture: PromptCapture | undefined;
	let systemPromptAppend: string | undefined;
	try {
		traceAssertReady();
		promptCapture = promptCaptures.resolveOrDerive(context.systemPrompt);
		const projectedPrompt = promptCapture
			? projectPromptCapture(promptCapture, {
				hasReadTool: mcpTools.some((tool) => tool.name === "read"),
			})
			: undefined;
		// Only this outer boundary emits the note, including for inherited children.
		// The map excludes omitted schemas; mcpTools intentionally retains them.
		systemPromptAppend = [customToolNameToSdk.size > 0 ? MCP_TOOL_NAME_NOTE : undefined, projectedPrompt]
			.filter(Boolean).join("\n\n") || undefined;
	} catch (err) {
		// resolveOrDerive and projectPromptCapture throw to stop a turn that would lose
		// its instructions or leak pi's harness text. Report it on the stream, as pi-ai's
		// provider contract expects, so any caller — not only pi's agent loop, which
		// catches a throw — sees a failed turn rather than a synchronous exception.
		diagDump("prompt_capture_unresolved", {
			promptChars: context.systemPrompt?.length ?? 0,
			knownKeys: promptCaptures.size,
			reentrantUserQuery: isReentrantUserQuery,
			error: errorMessage(err),
		});
		return failBeforeQuery(err);
	}

	queryCtx.piSessionId = options?.sessionId ?? null;
	queryCtx.wrappedToolNames = wrappedToolNames;
	queryCtx.resetTurnState(model);
	claimCurrentPiStream(stream, "fresh-query", queryCtx, options);
	activeQueryContexts.add(queryCtx);
	let createdBeforeLaunch: { id: string; cwd: string } | undefined;
	void (async () => {
		await waitForSessionWriter(sessionStateFor(queryCtx.piSessionId)?.ccSessionId, options?.signal);
		if (queryCtx.discarded) return;

		const traceQueryId = queryCtx.traceQueryId = traceId("query");

		const cwd = sessionCwdFor(options?.sessionId);
		// cliModel is the actual id sent to Claude Code (may carry [1m]); model.id is the
		// pi-registered id. Log cliModel so debug lines reflect what CC actually received.
		const cliModel = claudeCodeModelId(model, longContextSettings);
		// Which pi session this query serves — the attribution key for history
		// rewrites (session_compact / session_tree) and for SessionState above.
		const piSessionId = options?.sessionId ?? null;
		// Read before the consume below: with no query parked (an overflow retried
		// after compaction), the session's mark is the only sign of the rewrite.
		const historyRewritten = rewrittenUnderQuery || (piSessionId !== null && historyRewrittenBySession.has(piSessionId));
		const syncResult = syncSharedSession(context.messages, cwd, customToolNameToSdk, cliModel, piSessionId, traceCallId, wrappedToolNames);
		if (syncResult.created) createdBeforeLaunch = { id: syncResult.targetSessionId, cwd };
		// This query starts from the history pi has now: consume this session's
		// armed rewrite — a sibling pi session's stays armed for its own queries.
		if (piSessionId) historyRewrittenBySession.delete(piSessionId);
		const { sessionId: resumeSessionId } = syncResult;
		const recording = queryCtx.recording = new LiveRecording(syncResult.recorded, nonSystemMessages(context.messages));
		const promptBlocks = extractUserPromptBlocks(context.messages);
		let promptText = extractUserPrompt(context.messages) ?? "";

		// A turn continuing past a rewrite ends at its tool result, not at a
		// prompt, so say what happened rather than falling into the empty-prompt
		// recovery below — that one is for a shape we do not expect, and this is one
		// we do. The rebuilt session already ends with the tool result, placed after
		// the tool call it answers.
		if (historyRewritten && !promptText && !promptBlocks) {
			promptText = CONTINUE_AFTER_REWRITE_PROMPT;
			debug(`provider: continuing the turn after a rewritten history, ${context.messages.length} msgs rebuilt`);
		}
		if (unparkedToolResult && !promptText && !promptBlocks) {
			promptText = CONTINUE_AFTER_RESUME_PROMPT;
			debug(`provider: resuming the turn at a tool result with no parked query, ${context.messages.length} msgs`);
		}

		// Guard: empty prompt means the last context message isn't a user message.
		// This should never happen with per-query state — dump diagnostics if it does.
		if (!promptText && !promptBlocks) {
			diagDump("empty_prompt", {
				contextLength: context.messages.length,
				lastMsgRole: lastMsg?.role,
				isReentrant,
				activeQueryContexts: activeQueryContexts.size,
				activeQueryExists: queryCtx.activeQuery !== null,
				sharedSession: sessionStateFor(piSessionId),
				messageRoles: context.messages.map((m, i) => `[${i}]${m.role}`).join(" "),
			});
			// Recover: use a continuation prompt so the SDK doesn't send an empty text block
			promptText = "[continue]";
		}

		// Always stream the prompt rather than passing a string: a parked input
		// generator is what lets us write steers to CC's stdin mid-turn. The cost is
		// that `isSingleUserTurn` is false, so the SDK no longer closes stdin on the
		// first result — consumeQuery ends the stream explicitly instead, or the
		// query would never terminate.
		let inputSubmitted = false;
		const makeQueryPromptStream = () => {
			const input = makePromptStream();
			const stream = (async function* () {
				for await (const message of input.stream) {
					inputSubmitted = true;
					yield message;
				}
			})();
			const promptStream = { ...input, stream };
			queryCtx.promptStream = promptStream;
			return promptStream;
		};
		let promptStream = makeQueryPromptStream();
		const promptUuid = randomUUID();
		// A durable tool-result continuation has no user slot. Its synthetic
		// instruction belongs to the following assistant's boundary, not the
		// imported prior result: cuts before that assistant stop before the prompt.
		// Like a steer, the prompt is recorded on replay or its first output
		// (tapRecording): a stdin write does not prove CC persisted its record.
		recording.users(context.messages, turnStart(context.messages), promptUuid, false, false);
		queryCtx.turnOpener = promptUuid;
		const initialPrompt = { ...userMessage(promptBlocks ?? [{ type: "text", text: promptText }]), uuid: promptUuid };
		if (!syncResult.retained) appendInstructions.start(syncResult.targetSessionId, systemPromptAppend ?? "");
		const appendRefreshEnabled = process.env.CLAUDE_BRIDGE_TESTING_DISABLE_APPEND_REFRESH !== "1";
		let appendRefreshActive = true;
		const appendRefreshHooks = resumeSessionId && appendRefreshEnabled
			? appendInstructions.hooks(syncResult.targetSessionId, systemPromptAppend ?? "", () => appendRefreshActive && !queryCtx.historyStale && !queryCtx.discarded)
			: undefined;
		const mcpServers = buildMcpServers(mcpTools, queryCtx);

		// MCP auto-loading suppression: CC reads MCP servers from ~/.claude.json (top-level
		// + per-project) and .mcp.json. Since pi executes tools (not CC), those are pure
		// token overhead. --strict-mcp-config tells the binary to use ONLY mcpServers passed
		// programmatically and ignore filesystem MCP entries.
		const strictMcpConfigEnabled = providerSettings.strictMcpConfig !== false;
		const claudeExecutable = providerSettings.pathToClaudeCodeExecutable;

		const effort = effortForReasoning(model, options?.reasoning);
		const thinking = thinkingForReasoning(model, options?.reasoning);

		const extraArgs: Record<string, string | null> = { "replay-user-messages": null };
		// Opus 4.7 defaults thinking.display to "omitted" (empty thinking text in stream).
		// Force summarized so thinking_delta events arrive. See anthropics/claude-agent-sdk-python#830.
		if (effort) extraArgs["thinking-display"] = "summarized";

		// Suppress claude.ai cloud MCP servers (Figma/Canva/etc. auto-discovered via OAuth
		// when the user is logged into Anthropic). These are a separate code path from
		// filesystem MCP and are NOT blocked by --strict-mcp-config or settingSources.
		// The native CC binary gates them on env var ENABLE_CLAUDEAI_MCP_SERVERS: setting it
		// to "0"/"false"/"no"/"off" makes the loader return early before any cloud fetch.
		// DISABLE_AUTO_COMPACT=1: pi owns context-management and propagates its own
		// /compact via session_compact (see handler in default export). Letting CC
		// also autocompact would double-flush the prompt cache and races pi's
		// threshold with CC's, including CC's anti-thrashing guard (issue #8).
		// Manual /compact in CC still works (we never invoke it).
		const childEnv = traceQueryStart(traceQueryId, {
			kind: "provider", callId: traceCallId, piSessionId, reentrant: isReentrant, resume: resumeSessionId ?? null,
			model: cliModel, effort: effort ?? null, servedToolNames: Object.fromEntries(customToolNameToSdk), mcpTools: mcpTools.map((t) => t.name),
			signal: traceSignalId(options?.signal), digests: { systemPromptAppend },
		}, ccChildEnv(options?.env));
		const cliDebug = makeCliDebugOptions("provider");
		let wasAborted = false;
		const onTransportFailure = (error: Error) => {
			if (wasAborted || queryCtx.discarded) return;
			// The reader may wait for child exit before rejecting next().
			const cause = asError(childProcess.withStderr(error));
			if (queryCtx.failLiveQuery) queryCtx.failLiveQuery(cause);
			else queryCtx.observedFailure ??= cause;
		};
		const makeProcess = (stderr: (data: string) => void, servers: ReturnType<typeof buildMcpServers>) => {
			const process = new QueryProcess(stderr, (error) => {
				if (queryCtx.queryProcess === process) onTransportFailure(error);
			}, () => {
				if (queryCtx.queryProcess === process) queryCtx.outputEnded = true;
			}, () => {
				if (queryCtx.queryProcess === process) queryCtx.checkFallbackGate?.();
			}, (fact, sequence) => {
				if (queryCtx.queryProcess === process) reduceFallbackRawFact(queryCtx, fact, sequence, servers?.[MCP_SERVER_NAME]);
			}, observeFallbackIngress(queryCtx, customToolNameToPi, () => wasAborted));
			process.enableOrderedIngress();
			queryCtx.queryProcess = process;
			queryCtx.fallbackQualified = false;
			queryCtx.qualifiedFallbackRuntime = false;
			queryCtx.fallbackDispatches.clear();
			queryCtx.fallbackViolation = undefined;
			queryCtx.fallbackRetrySequence = 0;
			queryCtx.invalidatedFallbackMessageIds.clear();
			queryCtx.invalidatedFallbackToolIds.clear();
			return process;
		};
		const bundledExecutable = resolveSdkClaudeExecutable();
		const spawnOrdered = (process: QueryProcess): QueryProcess["spawn"] => (options) => {
			// Qualification is limited to the bundled CLI/transport exercised by
			// int-fallback-ordering and confirmed by the matching SDK init version.
			queryCtx.qualifiedFallbackRuntime = !!bundledExecutable && options.command === bundledExecutable
				&& Object.entries(CC_CHILD_ENV).every(([name, value]) => options.env?.[name] === value);
			return process.spawn(options);
		};
		let childProcess = makeProcess((data) => queryOptions.stderr?.(data), mcpServers);
		const queryOptions: NonNullable<Parameters<typeof query>[0]["options"]> = {
			cwd,
			env: childEnv,
			tools: [],
			permissionMode: "bypassPermissions",
			includePartialMessages: true,
			// User settings only. A repo's .claude/settings.json and settings.local.json can
			// carry hooks, apiKeyHelper, env and plugins, and Claude Code trusts the workspace
			// when it isn't interactive, so they would run with no prompt. ~/.claude/settings.json
			// still loads: Bedrock/Vertex users keep env and apiKeyHelper there.
			settingSources: ["user"] as SettingSource[],
			// includeGitInstructions:false drops the gitStatus block from the preset.
			// That block is the trailing suffix of the cached system block, and a
			// git-state transition (new file, staging, commit) rewrites it — busting
			// the prompt cache for the whole conversation from there on (see
			// diag/probe-git-cache.mjs). The bridge re-invokes CC per turn, so this
			// hit on every transition. Cost here is nil: the setting also strips
			// CC's git-workflow guidance from its Bash tool prompt, but the provider
			// path runs CC with `tools: []`, so those definitions never ship.
			settings: {
				...claudeCodeSettings(providerSettings),
				claudeMdExcludes: CLAUDE_MD_EXCLUDES,
				includeGitInstructions: false,
				outputStyle: "default",
			},
			systemPrompt: {
				type: "preset", preset: "claude_code",
				append: systemPromptAppend ? systemPromptAppend : undefined,
			},
			model: cliModel,
			strictMcpConfig: strictMcpConfigEnabled,
			extraArgs,
			...(effort ? { effort } : {}),
			...(thinking ? { thinking } : {}),
			...(mcpServers ? { mcpServers } : {}),
			...(resumeSessionId ? { resume: resumeSessionId } : {}),
			...(syncResult.forkAt ? { forkSession: true, resumeSessionAt: syncResult.forkAt } : {}),
			// --session-id names a fresh launch or a fork's target; a prewritten
			// import resumes its own id, and CC rejects --session-id beside it.
			...(syncResult.created && (!resumeSessionId || syncResult.forkAt) ? { sessionId: syncResult.targetSessionId } : {}),
			...(claudeExecutable ? { pathToClaudeCodeExecutable: claudeExecutable } : {}),
			...cliDebug,
			spawnClaudeCodeProcess: spawnOrdered(childProcess),
			...(appendRefreshHooks ? { hooks: appendRefreshHooks } : {}),
		};

		debug("provider: fresh query",
			`model=${cliModel} msgs=${context.messages.length} tools=${mcpTools.length}`,
			`resume=${resumeSessionId?.slice(0, 8) ?? "none"} effort=${effort ?? "default"}`,
			`ctxFiles=${promptCapture?.contextFiles.length ?? 0} strictMcp=${strictMcpConfigEnabled} ${sessionTag(queryCtx.piSessionId)}`,
			`prompt=${promptText.slice(0, 60)}${promptBlocks ? " [+images]" : ""}`);

		// 3. Start SDK query and claim it for this context
		const stopWriting = () => { sessionWriters.set(syncResult.targetSessionId, childProcess.exited); };
		const releaseWriter = () => {
			if (sessionWriters.get(syncResult.targetSessionId) === childProcess.exited) sessionWriters.delete(syncResult.targetSessionId);
		};
		const withoutHooks = { ...queryOptions };
		delete withoutHooks.hooks;
		let registeredHooks = Boolean(queryOptions.hooks);
		const retryWithoutHooks = async (error: unknown) => {
			appendRefreshActive = false;
			queryCtx.requestMcpClose();
			promptStream.fail(error instanceof Error ? error : new Error(String(error)));
			childProcess.terminate();
			await childProcess.exited;
			if (wasAborted || options?.signal?.aborted || queryCtx.discarded) throw error;
			queryCtx.observedFailure = undefined;
			queryCtx.outputEnded = false;
			const retryMcpServers = buildMcpServers(mcpTools, queryCtx);
			if (retryMcpServers) withoutHooks.mcpServers = retryMcpServers;
			childProcess = makeProcess((data) => withoutHooks.stderr?.(data), retryMcpServers);
			withoutHooks.spawnClaudeCodeProcess = spawnOrdered(childProcess);
			promptStream = makeQueryPromptStream();
			registeredHooks = false;
			return queryImpl({ prompt: promptStream.stream, options: withoutHooks });
		};
		let sdkQuery: ReturnType<typeof query>;
		try {
			try { sdkQuery = queryImpl({ prompt: promptStream.stream, options: queryOptions }); }
			catch (error) {
				if (!registeredHooks || inputSubmitted) throw error;
				debug("provider: hook registration failed; proceeding without append refresh", error);
				sdkQuery = await retryWithoutHooks(error);
			}
		}
		catch (error) {
			const cause = queryCtx.observedFailure ??= asError(error);
			const reason = options?.signal?.aborted ? "aborted" : "error";
			const output = newAssistantOutput(model, "", reason, cause.message);
			activeQueryContexts.delete(queryCtx);
			if (queryCtx.currentPiStream === stream) endCurrentPiStream(queryCtx, { type: "error", reason, error: output });
			stopWriting();
			queryCtx.requestMcpClose();
			try { childProcess.terminate(); await childProcess.exited; }
			finally { releaseWriter(); }
			// The outer catch removes the session created before launch.
			throw cause;
		}
		createdBeforeLaunch = undefined;
		let expectedState = syncResult.state;
		/** The latest snapshot this query committed and has not saved yet. */
		let unsaved: SessionState | null = null;
		// Every commit ends this query's writing (abort, discard, failure, completion),
		// so later readers of its file wait for the child to exit. Memory is
		// authoritative at once; the file is saved after exit (persistRecording).
		const commitRecording = (dirty: boolean, saveAfterExit = false) => {
			stopWriting();
			// A mismatched session or damaged transcript must not become a resume point.
			if (queryCtx.observedFailure instanceof UnrecordableSessionError) return;
			if (!dirty && (recording.hasGaps || (syncResult.created && !recording.hasProgress))) debug(`recording: clean end left messages unrecorded ${sessionTag(piSessionId)}`);
			if (piSessionId == null || sessionStateFor(piSessionId) !== expectedState || (syncResult.created && !recording.hasProgress)) return;
			const state: SessionState = { ...copyRecording(recording.recorded), ccSessionId: syncResult.targetSessionId, cwd, model: cliModel,
				dirtyTail: dirty || queryCtx.historyStale || recording.hasGaps };
			setSessionStateFor(piSessionId, state);
			expectedState = unsaved = state;
			traceEvent("session-recorded", { queryId: traceQueryId, piSessionId, ...state });
			if (saveAfterExit) void saveRecordingAfterExit().catch((error) => logCleanupFailure("Claude Code query cleanup save failed", error));
		};
		// A replayed uuid can precede its record on disk, so a pointer saved before
		// exit could outlive a crash naming records that never land. Save once per
		// snapshot, after the child exits, and only while it is still the current one.
		let closingQuery: typeof sdkQuery | undefined;
		const closeQuery = () => {
			if (closingQuery === sdkQuery) return;
			queryCtx.requestMcpClose();
			const sdk = closingQuery = sdkQuery;
			const process = childProcess;
			void (async () => { await sdk.close(); })().catch((error) => {
				logCleanupFailure("Claude Code close failed", error);
				try { process.terminate(); }
				catch (cause) { logCleanupFailure("Claude Code termination failed", cause); }
			});
		};
		const saveRecordingAfterExit = async () => {
			await childProcess.exited;
			const state = unsaved;
			unsaved = null;
			if (state && sharedSessions.get(piSessionId!) === state) {
				state.appendState = appendInstructions.snapshot(syncResult.targetSessionId, readTranscript(state));
				saveSessionState(piSessionId!, state);
			}
		};
		const persistRecording = () => {
			closeQuery();
			childProcess.close();
			return saveRecordingAfterExit();
		};
		queryCtx.commitRecording = commitRecording;
		queryCtx.activeQuery = sdkQuery;

		// 4. Capture context for abort handling
		const abortCtx = queryCtx;

		let unbindRunSignal = () => {};
		let stopRequested = false;
		const requestAbort = () => {
			if (stopRequested) return;
			stopRequested = true;
			queryCtx.requestMcpClose();
			options?.signal?.removeEventListener("abort", onAbort);
			unbindRunSignal();
			stopWriting();
			// interrupt() asks the CLI to stop gracefully; close() kills it immediately.
			// Both are needed — interrupt alone lets the current API call finish.
			try { void sdkQuery.interrupt().catch(() => {}); } catch {}
			closeQuery();
			childProcess.close();
			promptStream.fail(new Error("query ended"));
			queryCtx.releasePendingToolCalls("Query ended");
		};
		queryCtx.stopProcess = requestAbort;
		// End the live Pi stream before starting fallible or potentially stalled teardown.
		const failStream = (error: unknown) => {
			queryCtx.activeQuery = null;
			activeQueryContexts.delete(queryCtx);
			endCurrentPiStreamWithError(queryCtx, errorMessage(error), wasAborted ? "aborted" : "error");
			traceEvent("query-end", { queryId: traceQueryId, outcome: wasAborted ? "aborted" : "error", error: errorMessage(error) });
		};
		const failQuery = (error: unknown) => {
			if (queryCtx.discarded) return;
			const cause = queryCtx.observedFailure ??= asError(error);
			failStream(cause);
			if (!wasAborted) commitFailedRecording(queryCtx);
		};
		queryCtx.failLiveQuery = (error) => {
			if (wasAborted || queryCtx.discarded || !queryCtx.activeQuery) return;
			const cause = failFallbackBatch(queryCtx, asError(error));
			failStream(cause);
			requestAbort();
			try { childProcess.terminate(); }
			catch (error) { logCleanupFailure("Claude Code termination failed", error); }
		};

		const onAbort = () => {
			if (wasAborted || queryCtx.discarded || queryCtx.observedFailure) return;
			wasAborted = true;
			queryCtx.requestMcpClose();
			appendRefreshActive = false;
			failStream(new Error("Operation aborted"));
			try { commitRecording(true); }
			catch (error) { logCleanupFailure("Claude Code abort recording failed", error); }
			finally {
				activeQueryContexts.delete(abortCtx);
				abortCtx.turnToolCallIds = [];
				traceEvent("query-abort", { queryId: traceQueryId });
				drainForAbort(abortCtx, promptStream);
				requestAbort();
			}
		};
		if (options?.signal) {
			if (options.signal.aborted) onAbort();
			else options.signal.addEventListener("abort", onAbort, { once: true });
		}
		// A later run continuing this query from a tool result brings its own signal;
		// only the latest one is bound, and it is unbound when the query ends. Its abort
		// counts only while that run's stream is live: hosts that abort each request's
		// signal after it ends would otherwise kill the query parked at the next tool call.
		const bindRunSignal = (signal: AbortSignal | undefined, runStream: AssistantMessageEventStream) => {
			unbindRunSignal();
			unbindRunSignal = () => {};
			if (!signal || signal === options?.signal) return;
			const onRunAbort = () => {
				traceEvent("run-signal-abort", { queryId: traceQueryId, signal: traceSignalId(signal), runStreamEnded: completedStreams.has(runStream as object) });
				if (!completedStreams.has(runStream as object)) onAbort();
			};
			if (signal.aborted) return onRunAbort();
			signal.addEventListener("abort", onRunAbort, { once: true });
			unbindRunSignal = () => signal.removeEventListener("abort", onRunAbort);
		};
		queryCtx.bindRunSignal = bindRunSignal;

		// Withhold initial input until hooks are ready. Yielded steers also
		// prohibit replay: a failed ack cannot prove no input reached Claude.
		const initializeHooks = async () => {
			if (registeredHooks && sdkQuery.initializationResult) {
				try { await sdkQuery.initializationResult(); }
				catch (error) {
					if (wasAborted || queryCtx.discarded || queryCtx.observedFailure || inputSubmitted) throw error;
					debug("provider: hook initialization failed; proceeding without append refresh", error);
					closeQuery();
					sdkQuery = await retryWithoutHooks(error);
					queryCtx.activeQuery = sdkQuery;
				}
			}
			if (queryCtx.observedFailure) throw queryCtx.observedFailure;
			if (wasAborted || queryCtx.discarded) return;
			const owner = queryCtx.currentPiStream;
			const attempt = queryCtx.fallbackAttempt;
			void promptStream.push(initialPrompt).catch((error) => {
				debug("provider: initial prompt push rejected:", error);
				// The SDK observes pump/transport failures independently. A lost
				// acknowledgement alone only invalidates a served fallback batch.
				if (queryCtx.currentPiStream === owner && queryCtx.fallbackAttempt === attempt
					&& !wasAborted && !queryCtx.discarded && !queryCtx.observedFailure) {
					latchFallbackViolation(queryCtx, asError(error));
				}
			});
		};

		// Background consumer — its recording and CAS token belong to this query.
		void initializeHooks().then(() => consumeQuery(sdkQuery, customToolNameToPi, model, () => wasAborted, queryCtx, systemPromptAppend ?? "", syncResult.targetSessionId))
			.then(async ({ failure }) => {
				if (queryCtx.discarded) return;
				if (failure) return failQuery(failure);
				if (wasAborted || options?.signal?.aborted) return failQuery(new Error("Operation aborted"));
				if (queryCtx.currentPiStream) recordAssistantEmission(queryCtx);
				commitRecording(!queryCtx.sawResult);
				// Completion waits for the save, so a failed one ends the turn with it.
				try { await persistRecording(); }
				catch (error) {
					// A post-exit save is outside the query-failure retry path.
					failStream(queryCtx.observedFailure ??= asError(error));
					logCleanupFailure("Claude Code final save failed", error);
					return;
				}
				if (queryCtx.discarded || queryCtx.observedFailure || wasAborted) return;
				queryCtx.activeQuery = null;
				activeQueryContexts.delete(queryCtx);
				finalizeCurrentStream(queryCtx);
				traceEvent("query-end", { queryId: traceQueryId, outcome: "complete", ccSession: syncResult.targetSessionId });
			}, failQuery)
			.catch((error) => {
				if (!queryCtx.discarded) failStream(queryCtx.observedFailure ??= asError(error));
				logCleanupFailure("Claude Code query finalization failed", error);
			})
			.finally(async () => {
				appendRefreshActive = false;
				options?.signal?.removeEventListener("abort", onAbort);
				unbindRunSignal();
				queryCtx.bindRunSignal = null;
				queryCtx.commitRecording = null;
				queryCtx.stopProcess = null;
				queryCtx.failLiveQuery = null;
				queryCtx.requestMcpClose();
				promptStream.fail(new Error("query ended"));
				queryCtx.promptStream = null;
				queryCtx.releasePendingToolCalls("Query ended");
				queryCtx.activeQuery = null;
				activeQueryContexts.delete(queryCtx);
				stopWriting();
				try { await persistRecording(); }
				finally {
					try { if (syncResult.created && !recording.hasProgress) deleteSession(syncResult.targetSessionId, cwd, process.env.CLAUDE_CONFIG_DIR); }
					finally { releaseWriter(); }
				}
			}).catch((error) => logCleanupFailure("Claude Code query cleanup failed", error));

	})().catch((error) => {
		queryCtx.finishFallback("Failed");
		activeQueryContexts.delete(queryCtx);
		if (!queryCtx.discarded && queryCtx.currentPiStream === stream) {
			const reason = options?.signal?.aborted ? "aborted" : "error";
			const output = newAssistantOutput(model, "", reason, errorMessage(error));
			endCurrentPiStream(queryCtx, { type: "error", reason, error: output });
		}
		queryCtx.requestMcpClose();
		queryCtx.promptStream?.fail(asError(error));
		queryCtx.promptStream = null;
		if (createdBeforeLaunch) deleteSession(createdBeforeLaunch.id, createdBeforeLaunch.cwd, process.env.CLAUDE_CONFIG_DIR);
	}).catch((error) => logCleanupFailure("Claude Code launch cleanup failed", error));
	return stream;
}

// --- Extension registration ---

export default function (pi: ExtensionAPI) {
	const config = loadConfig();
	debug(`bridge: version=${BRIDGE_VERSION} sdk=${packageVersion("@anthropic-ai/claude-agent-sdk")} pi=${PI_VERSION}`);
	debug("loadConfig:", JSON.stringify(config));
	const g = globalThis as Record<symbol, any>;
	// A cached factory can be invoked again for a child while the parent streams.
	// Its config must not reconfigure the already-pinned, module-shared provider.
	// A fresh module (or the owner reloading after shutdown) initializes normally.
	const configureStream = g[ACTIVE_STREAM_SIMPLE_KEY] !== streamClaudeAgentSdk;
	if (configureStream) {
		providerSettings = config.provider ?? {};
		// Validate at the boundary: a non-array here would brick every model call.
		const forceTwoHundredK = Array.isArray(providerSettings.forceTwoHundredK)
			? providerSettings.forceTwoHundredK.filter((id): id is string => typeof id === "string")
			: undefined;
		longContextSettings = {
			plan: providerSettings.plan ?? "pro",
			longContextExtraUsage: providerSettings.longContextExtraUsage ?? false,
			forceTwoHundredK,
		};
	}
	const quotaDescription = "Show Claude plan quota (experimental SDK usage API)";
	let quotaConflictNotified = false;
	pi.registerCommand?.("claude", {
		description: quotaDescription,
		handler: async (args, ctx) => {
			if (args.trim() !== "quota") {
				ctx.ui.notify("Usage: /claude quota", "info");
				return;
			}
			const sessionId = ctx.sessionManager.getSessionId();
			const childOptions = claudeChildOptions(sessionCwdFor(sessionId));
			const env: NodeJS.ProcessEnv = childOptions.env;
			// Usage fetches count as non-essential traffic; quota is explicitly
			// user-triggered and short-lived. SDK env replaces the child environment.
			delete env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
			const output = await fetchClaudeQuota(auxiliaryQueryImpl, {
				...childOptions,
				env,
				settings: { ...claudeCodeSettings(providerSettings), claudeMdExcludes: CLAUDE_MD_EXCLUDES, includeGitInstructions: false },
				permissionMode: "bypassPermissions",
				settingSources: ["user"],
				strictMcpConfig: true,
				...makeAuxiliaryCliOptions("quota", childOptions.pathToClaudeCodeExecutable),
			}, sessionId);
			ctx.ui.notify(output, output.startsWith("Claude quota failed:") ? "error" : "info");
		},
	});
	const registeredModels = applyLongContext(MODELS, longContextSettings);
	if (registeredModels.length === 0) {
		console.error("claude-bridge: no models available from pi-ai's anthropic catalog — update @earendil-works/pi-ai (requires >=1.5.0)");
	}

	// Registration belongs to a factory invocation, not a shared stream function.
	let ownsActiveStream = false;
	let instanceSessionId: string | null = null;
	// Session mirrors remain process-wide; only this session's rewrite mark clears.
	const clearSession = (event: string, piSessionId: string | null) => {
		// Mirrors stay: each is keyed by its own pi session id and matches its
		// persisted pointer, so switching to another session erases none of them.
		debug(`${event}: retaining ${sharedSessions.size} shared session${sharedSessions.size === 1 ? "" : "s"}`);
		if (piSessionId) historyRewrittenBySession.delete(piSessionId);

		if (event !== "session_shutdown") return;
		// Clear the global streamSimple if this instance registered it.
		// This allows /reload to work — the old instance clears the flag so
		// the new instance can register fresh without wrapping stale state.
		const g = globalThis as Record<symbol, any>;
		if (ownsActiveStream && g[ACTIVE_STREAM_SIMPLE_KEY] === streamClaudeAgentSdk) {
			ownsActiveStream = false;
			debug(`${event}: clearing ACTIVE_STREAM_SIMPLE_KEY`);
			g[ACTIVE_STREAM_SIMPLE_KEY] = undefined;
		}
	};
	pi.on("session_start", async (event, ctx) => {
		// getCommands is unavailable at activation. Pi may suffix duplicate names
		// (claude:1) or older hosts may shadow our command; warn, never auto-rename.
		const commands = (pi.getCommands?.() ?? []).filter((command) => /^claude(?::\d+)?$/.test(command.name));
		const others = commands.filter((command) => command.description !== quotaDescription);
		if (!quotaConflictNotified && (others.length > 0 || commands.length > 1)) {
			const conflicts = (others.length ? others : commands).map((command) => `/${command.name} (${command.sourceInfo?.path ?? command.description ?? "unknown extension"})`);
			ctx.ui?.notify(`Claude command conflict: ${conflicts.join(", ")}. Resolve duplicate extension commands to restore /claude quota; the bridge command still works when invoked.`, "warning");
			quotaConflictNotified = true;
		}
		piUI = ctx.ui;
		piMode = ctx.mode;
		const sessionId = ctx.sessionManager?.getSessionId() ?? null;
		if (sessionId) rememberSessionCwd(sessionId, ctx.cwd);
		if (event.reason === "new" || event.reason === "resume" || event.reason === "fork") {
			clearSession(`session_start:${event.reason}`, instanceSessionId);
			if (sessionId !== instanceSessionId) clearSession(`session_start:${event.reason}`, sessionId);
		}
		instanceSessionId = sessionId;
		// Clones resumed before their first bridge turn still have no own pointer;
		// Pi's persisted parent header supplies the same inheritance source.
		const parentFile = event.reason === "fork" ? event.previousSessionFile : ctx.sessionManager?.getHeader?.()?.parentSession;
		if (sessionId && parentFile) await inheritSessionState(parentFile, sessionId);
		const schemaSession = toolSchemaSessionFor(sessionId);
		schemaSession.ui = ctx.ui;
		schemaSession.mode = piMode;
	});
	// `--system-prompt` replaces pi's default rather than adding to it, but Claude
	// Code's preset carries its own tool and permission guidance that the bridge
	// still depends on, so both flags are forwarded as an append.
	//
	// Retain Pi's mutable options for later recording boundaries: handlers loaded
	// after the bridge can still add sections. record() snapshots each recording,
	// so query-time projection never reads these options lazily.
	type RecordOptions = Parameters<typeof recordSystemPrompt>[2];
	let lastSystemPromptOptions: RecordOptions | undefined;
	function recordSystemPrompt(source: string, systemPrompt: string | undefined, options: {
		customPrompt?: string;
		appendSystemPrompt?: string;
		sections?: Record<string, string>;
		contextFiles?: { path: string; content: string }[];
		skills?: Parameters<typeof promptCaptures.record>[1]["skills"];
		selectedTools?: string[];
		hiddenTools?: string[];
		toolGuidelines?: Record<string, string[]>;
		promptGuidelines?: string[];
	} | undefined) {
		if (!systemPrompt) return;
		const hasRead = !options?.selectedTools || options.selectedTools.includes("read");
		promptCaptures.record(systemPrompt, {
			custom: options?.customPrompt,
			append: options?.appendSystemPrompt,
			sections: options?.sections,
			selectedTools: options?.selectedTools,
			hiddenTools: options?.hiddenTools,
			toolGuidelines: options?.toolGuidelines,
			promptGuidelines: options?.promptGuidelines,
			contextFiles: options?.contextFiles ?? [],
			skills: hasRead ? options?.skills ?? [] : [],
		}, source);
	}
	pi.on("before_agent_start", (event) => {
		lastSystemPromptOptions = event.systemPromptOptions;
		recordSystemPrompt("before_agent_start", event.systemPrompt, event.systemPromptOptions);
	});
	// The prompt the provider actually queries with is the fully-widened one: MCP tool
	// descriptions merge into the system prompt only after their servers connect, which
	// is after before_agent_start. ctx.getSystemPrompt() returns that widened prompt by
	// agent_start (verified: before_agent_start=10,988 chars vs agent_start/query=23,479).
	// A subagent embeds the widened parent prompt verbatim (pi-subagents reads
	// ctx.getSystemPrompt() at dispatch), so unless the widened prompt is a capture key
	// too, the child's turn resolves against nothing, falls to a verbatim side request,
	// and ships pi's harness — tripping the server's third-party plan-eligibility check
	// ("out of extra usage"). Recording it here, before the query, restores the match.
	//
	// agent_start also captures a handler-returned forceSystemPrompt, which
	// buildSystemPrompt renders verbatim.
	pi.on("agent_start", (_event, ctx) => {
		// A terminating tool can end the previous run without consuming its rejection.
		rejectedToolCalls.delete(ctx.sessionManager.getSessionId());
		recordSystemPrompt("agent_start", ctx.getSystemPrompt(), lastSystemPromptOptions);
	});

	// Mid-run re-renders: turn_start fires before every turn (first turn included)
	// after the turn's prompt is final: prepareNextTurnWithContext has
	// re-rendered the options (pi's section-based prompt) and any mid-run
	// setActiveToolsByName rebuild has already landed. Re-keying at each boundary
	// the prompt can change at keeps exact-match alive mid-run. The stashed options can
	// lag a mid-run tool-loadout change, which skews the hasRead skills filter until the
	// next before_agent_start — accepted: a stale skills list beats failing the turn.
	pi.on("turn_start", (_event, ctx) => {
		recordSystemPrompt("turn_start", ctx.getSystemPrompt(), lastSystemPromptOptions);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		const sessionId = ctx?.sessionManager?.getSessionId() ?? instanceSessionId;
		if (sessionId) {
			forgetSessionCwd(sessionId);
			closeSessionQueries(sessionId);
		}
		clearSession("session_shutdown", sessionId);
		toolSchemaSessions.delete(sessionId);
	});

	// Observe ownership only: Pi and summary extensions generate the summaries.
	pi.on("session_before_compact", (event, ctx) => {
		rememberSummarySession(event.signal, ctx.sessionManager.getSessionId());
	});
	pi.on("session_before_tree", (event, ctx) => {
		rememberSummarySession(event.signal, ctx.sessionManager.getSessionId());
	});

	// pi /compact and session-tree navigation (rewind / fork-at-point /
	// branch switch) mutate pi's messages array. Digest sync sees the new
	// content at the next fresh query; parked queries must be discarded now.
	// /compact in particular triggers CC's autocompact-thrashing guard (issue #8). Force the next
	// call down the REBUILD path so CC sees the current history — and, when a
	// query is parked at a tool boundary while this fires, discard that query
	// instead of resuming it (markRebuild, discardRewrittenQuery).
	//
	// Attributed to the compacting session (ctx.sessionManager belongs to the
	// session whose runner fired this), so a subagent compacting while its
	// parent sits parked on the Agent tool result discards nothing — the parent's
	// query is live and its conversation untouched. Registered by every instance
	// of this module; instances sponsoring stale marks forward them to the
	// serving instance via sponsorMarkRebuildForSession.
	pi.on("session_compact", (event, ctx) =>
		sponsorMarkRebuildForSession(ctx.sessionManager.getSessionId(), `session_compact:${event.reason}:willRetry=${event.willRetry}`));
	pi.on("session_tree", (_event, ctx) => sponsorMarkRebuildForSession(ctx.sessionManager.getSessionId(), "session_tree"));

	// Claude Code models expect bash to time out (CC's default is 120s); pi's bash has none.
	// Set it on the execution copy pi hands tool_call handlers, not in the stored call, so
	// pi's history keeps the arguments CC sent and a rebuild matches CC's records (#203).
	// A `background: true` call (added by an extension) doesn't block the turn, so it gets no default.
	pi.on("tool_call", (event, ctx) => {
		if (isToolCallEventType("bash", event) && event.input.timeout == null && ctx.model?.provider === PROVIDER_ID
			&& (event.input as { background?: unknown }).background !== true) {
			event.input.timeout = 120;
		}
	});

	// --- Provider ---
	//
	// Registration policy across module instances (a subagent session can load
	// this module fresh): the FIRST instance registers unconditionally at load,
	// which is what puts claude-bridge models in the picker before any session
	// starts. Later instances decide at session_start, when ctx.modelRegistry
	// reveals who owns this session's registry:
	//
	// - Registry already has the provider (host passes the parent's registry down,
	//   e.g. pi-subagents >=0.14.3): skip. Re-registering would overwrite the
	//   parent's pinned streamSimple with this instance's fresh — empty-state —
	//   stream fn, and the parent's next tool-result delivery would route into it.
	// - Registry lacks the provider (host gives the child its own, e.g. older
	//   pi-subagents forks): register, or every claude-bridge/* dispatch in the
	//   child fails with "Model not found" (#91). Even loading the bridge via the
	//   agent's `extensions:` frontmatter didn't help there — the module loaded,
	//   hit the old skip-guard, and the child's registry stayed empty.
	//
	// A per-instance stream fn registered into a per-instance registry is
	// self-consistent: that session's traffic flows through this module state,
	// which starts clean and serves only that session.
	//
	// On session_shutdown (including /reload), only the factory that claimed
	// ACTIVE_STREAM_SIMPLE_KEY resets it so a freshly loaded owner can register.

	const providerConfig = {
		baseUrl: "claude-bridge",
		apiKey: "not-used",
		api: "claude-bridge",
		models: registeredModels,
		// Cast: the Provider interface passes a TranscriptContext; the bridge takes plain
		// Context models (toBridgeContext normalizes at the stream entry points).
		streamSimple: streamClaudeAgentSdk as any,
	};
	if (!g[ACTIVE_STREAM_SIMPLE_KEY]) {
		// First instance: store our streamSimple and register.
		g[ACTIVE_STREAM_SIMPLE_KEY] = streamClaudeAgentSdk;
		ownsActiveStream = true;
		pi.registerProvider(PROVIDER_ID, providerConfig);
	} else {
		// Later instance: register only if this session's registry lacks the provider.
		debug(`provider: deferring registration decision to session_start (module=${moduleInstanceId})`);
		pi.on("session_start", (_event, ctx) => {
			if (ctx.modelRegistry.getProvider(PROVIDER_ID)) {
				debug(`provider: registry already has ${PROVIDER_ID}, skipping registration (module=${moduleInstanceId})`);
				return;
			}
			debug(`provider: registry lacks ${PROVIDER_ID}, registering (module=${moduleInstanceId})`);
			pi.registerProvider(PROVIDER_ID, providerConfig);
		});
	}
}
