import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CC_CHILD_ENV } from "../src/cc-child.js";
import { resolveSdkClaudeExecutable } from "../src/claude-runtime.js";
import { QueryProcess } from "../src/query-process.js";

const MODEL = "claude-haiku-4-5";
const SERVER = "custom-tools";
const names = ["alpha", "beta"];
const fallbackBlocks = [
	{ type: "text", text: "Before the calls." },
	...names.map((name) => ({ type: "tool_use", id: `toolu_${name}`, name: `mcp__${SERVER}__${name}`, input: {} })),
	{ type: "text", text: "After the calls." },
];
const usage = { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const message = (id, content = [], stop_reason = null) => ({ id, type: "message", role: "assistant", model: MODEL, content, stop_reason, stop_sequence: null, usage });
const event = (type, fields = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;

const secondBlocks = fallbackBlocks.map((block) => block.type === "tool_use" ? { ...block, id: `${block.id}_again` } : block);

function fakeMessagesApi(requests, repeatFallback = false, firstBlocks = fallbackBlocks) {
	return createServer(async (req, res) => {
		if (req.method !== "POST" || new URL(req.url, "http://localhost").pathname !== "/v1/messages") {
			res.writeHead(404).end();
			return;
		}
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks));
		const call = requests.push(body);
		if (call === 4 && body.stream === false) {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify(message("msg_fallback", firstBlocks, "tool_use")));
			return;
		}
		if (repeatFallback && call === 8 && body.stream === false) {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify(message("msg_fallback_again", secondBlocks, "tool_use")));
			return;
		}
		if (call === (repeatFallback ? 9 : 5)) {
			// The mid-stream overloads trigger fallback but may emit no api_retry.
			// A distinct overload before the final answer exercises the retry notice.
			res.writeHead(529, { "content-type": "application/json", "retry-after": "0.1" });
			res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
			return;
		}
		res.writeHead(200, { "content-type": "text/event-stream" });
		res.write(event("message_start", { message: message(`msg_stream_${call}`) }));
		if (call <= 3 || (repeatFallback && call >= 5 && call <= 7)) {
			res.end(event("error", { error: { type: "overloaded_error", message: "Overloaded" } }));
			return;
		}
		res.end(event("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
			+ event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "OK" } })
			+ event("content_block_stop", { index: 0 })
			+ event("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } })
			+ event("message_stop"));
	});
}

function captureLines(receive) {
	let pending = "";
	return (data) => {
		const lines = (pending + data).split("\n");
		pending = lines.pop();
		for (const line of lines) if (line.trim()) receive(JSON.parse(line));
	};
}

test("pinned Claude Code emits every fallback block before serial SDK MCP dispatch", { timeout: 45_000 }, async (t) => {
	const executable = resolveSdkClaudeExecutable();
	if (!executable) return t.skip("bundled Claude Code executable is not installed for this platform");
	const version = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5_000, windowsHide: true });
	if (version.error || version.status !== 0) return t.skip(`bundled CLI cannot run --version: ${version.error ?? (version.stderr || version.status)}`);
	const require = createRequire(import.meta.url);
	assert.equal(JSON.parse(readFileSync(join(dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "package.json"), "utf8")).version, "0.3.321");
	t.diagnostic(`${executable}: ${version.stdout.trim()}`);

	const cwd = mkdtempSync(join(tmpdir(), "cc-fallback-ordering-"));
	const requests = [];
	const api = fakeMessagesApi(requests).listen(0, "127.0.0.1");
	const mcp = new McpServer({ name: SERVER, version: "1.0.0" }, { capabilities: { tools: {} } });
	mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: names.map((name) => ({ name, inputSchema: { type: "object", properties: {} } })) }));
	mcp.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
		// Hold alpha long enough for a concurrent dispatch to appear on stdout.
		if (params.name === "alpha") await delay(200);
		return { content: [{ type: "text", text: `${params.name}-VALUE` }] };
	});

	const wire = [];
	const abortController = new AbortController();
	const watchdog = setTimeout(() => abortController.abort(), 35_000);
	let stderr = "";
	const observer = new QueryProcess((data) => { stderr += data; });
	observer.enableOrderedIngress();
	try {
		await once(api, "listening");
		// Use no inherited credentials, provider selectors or proxy overrides.
		const env = {
			[process.platform === "win32" ? "Path" : "PATH"]: process.env.Path ?? process.env.PATH,
			SystemRoot: process.env.SystemRoot,
			TEMP: process.env.TEMP, TMP: process.env.TMP, HOME: cwd, USERPROFILE: cwd,
			CLAUDE_CONFIG_DIR: cwd, ANTHROPIC_API_KEY: "local-test-key",
			ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.address().port}`,
			...CC_CHILD_ENV,
		};
		let result;
		for await (const frame of query({ prompt: "Call alpha and beta, then say OK.", options: {
			cwd, env, abortController, model: MODEL, tools: [], permissionMode: "bypassPermissions",
			persistSession: false, includePartialMessages: true, maxTurns: 3,
			extraArgs: { "strict-mcp-config": null }, settingSources: [],
			mcpServers: { [SERVER]: { type: "sdk", name: SERVER, instance: mcp } },
			spawnClaudeCodeProcess(options) {
				assert.equal(options.command, executable, "the SDK must select its bundled CLI");
				const child = observer.spawn(options);
				// Capture the raw child pipe, before the SDK-facing ordered delivery adapter.
				child.stdio[1].on("data", captureLines((value) => wire.push({ direction: "stdout", value })));
				const write = child.stdin.write.bind(child.stdin);
				const captureInput = captureLines((value) => wire.push({ direction: "stdin", value }));
				child.stdin.write = (chunk, ...args) => { captureInput(chunk); return write(chunk, ...args); };
				return child;
			},
		} })) {
			if (frame.type === "result") result = frame;
			assert.notEqual(observer.acknowledge(frame), undefined, `unmatched SDK frame: ${frame.type}/${frame.subtype ?? ""}`);
		}

		assert.deepEqual(requests.map((body) => body.stream), [true, true, true, false, true, true]);
		const stdout = wire.filter((entry) => entry.direction === "stdout").map((entry) => entry.value);
		const fragments = stdout.filter((frame) => frame.type === "assistant" && frame.message?.id === "msg_fallback");
		assert.deepEqual(fragments.map((frame) => frame.message.content), fallbackBlocks.map((block) => [block]));
		const calls = stdout.filter((frame) => frame.type === "control_request" && frame.request?.message?.method === "tools/call");
		assert.deepEqual(calls.map((frame) => frame.request.message.params.name), names);
		const position = (frame) => wire.findIndex((entry) => entry.value === frame);
		assert.ok(fragments.every((frame) => position(frame) < position(calls[0])),
			`fallback frames at ${fragments.map(position)}; first tools/call at ${position(calls[0])}`);
		const alphaReply = wire.findIndex(({ direction, value }) => direction === "stdin" && value.type === "control_response"
			&& value.response?.request_id === calls[0].request_id && JSON.stringify(value).includes("alpha-VALUE"));
		assert.ok(alphaReply > position(calls[0]) && alphaReply < position(calls[1]), `alpha reply at ${alphaReply}; calls at ${calls.map(position)}`);
		assert.equal(result?.subtype, "success", JSON.stringify(result));
		assert.equal(observer.reducedWatermark, observer.ingressWatermark);
		const finalRequest = JSON.stringify(requests.at(-1).messages);
		for (const name of names) assert.ok(finalRequest.includes(`${name}-VALUE`), `missing ${name} result in API request`);
		const retries = stdout.filter((frame) => frame.type === "system" && frame.subtype === "api_retry");
		assert.ok(retries.length > 0, "the post-tool HTTP 529 did not exercise api_retry");
		t.diagnostic(`wire positions: assistant=${fragments.map(position)}; calls=${calls.map(position)}; alpha reply=${alphaReply}; api_retry keys=${JSON.stringify(retries.map(Object.keys))}`);
	} catch (error) {
		t.diagnostic(`requests: ${JSON.stringify(requests.map((body) => ({ stream: body.stream, model: body.model })))}; stderr: ${stderr}`);
		throw error;
	} finally {
		clearTimeout(watchdog);
		abortController.abort();
		observer.terminate();
		await observer.exited;
		await new Promise((resolve) => { api.close(resolve); api.closeAllConnections(); });
		rmSync(cwd, { recursive: true, force: true });
	}
});

let provider;
const parseFailure = { raw: "malformed-args", len: 14 };
for (const [variant, alphaContent, alphaEcho, beta, rejection] of [
	["whitespace-trimmed", [{ type: "text", text: "  alpha-VALUE" }, { type: "text", text: "extra detail  " }], "alpha-VALUE\nextra detail"],
	["image-dropped", [{ type: "text", text: "alpha-VALUE" }, {
		type: "image", mimeType: "image/png",
		data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+kcAAAAASUVORK5CYII=",
	}], "alpha-VALUE"],
	["unparsed input", null, null, { input: "malformed-args" }, /unparsed.*toolu_beta/i],
	["unknown served-looking name", null, null, { name: `mcp__${SERVER}__missing` }, /unserved.*missing/i],
	["missing tool name", null, null, { name: undefined }, /invalid fallback tool name.*toolu_beta/i],
	["advertised schema mismatch", [{ type: "text", text: "alpha-VALUE" }], "alpha-VALUE", { input: { requiredNumber: "not a number" } }],
	["valid __unparsedToolInput field", [{ type: "text", text: "alpha-VALUE" }], "alpha-VALUE", { input: { __unparsedToolInput: false, value: 1 } }],
	["marker with extra inner field", null, null, { input: { __unparsedToolInput: { ...parseFailure, kind: "extra" } } }, /unparsed.*toolu_beta/i],
	// Object input controls: the CLI dispatches these arguments unchanged.
	...[ // Only the wrapper is under test; keep both fallback batches otherwise identical.
		["marker with non-string raw", { __unparsedToolInput: { ...parseFailure, raw: 14 } }],
		["marker with non-numeric len", { __unparsedToolInput: { ...parseFailure, len: "14" } }],
		["marker with extra outer field", { __unparsedToolInput: parseFailure, kind: "extra" }],
	].map(([label, input]) => [label, [{ type: "text", text: "alpha-VALUE" }], "alpha-VALUE", { input }]),
]) test(`bundled CLI 2.1.321 ${rejection ? "fails closed through the production gate" : "publishes both fallback batches through the production gate"} (${variant}${beta ? "" : " Pi error echo"})`, { timeout: 45_000 }, async (t) => {
	await import("./lib/setup.mjs");
	const { default: activate, __test } = await import("../src/index.js");
	const executable = resolveSdkClaudeExecutable();
	assert.ok(executable, "bundled Claude Code must be installed");
	const version = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5_000, windowsHide: true });
	assert.equal(version.status, 0, String(version.error ?? version.stderr));
	assert.match(version.stdout, /^2\.1\.321\b/);
	const requests = [];
	const firstBlocks = fallbackBlocks.map((block) => block.id === "toolu_beta" ? { ...block, ...beta } : block);
	const api = fakeMessagesApi(requests, true, firstBlocks).listen(0, "127.0.0.1");
	const controller = new AbortController();
	const watchdog = setTimeout(() => controller.abort(), 35_000);
	const sessionId = `prod-fallback-ordering-${variant}`;
	const wire = [];
	const decisions = [];
	const heartbeat = { type: "keep_alive" };
	let injectedHeartbeat = false;
	let atPublish;
	let ctx;
	let launches = 0;
	try {
		await once(api, "listening");
		if (!provider) activate({ on() {}, registerProvider: (_id, value) => { provider = value; } });
		const model = provider.models.find((m) => m.id === MODEL);
		assert.ok(model, `bridge must serve ${MODEL}`);
		const tools = names.map((name) => ({ name, description: name, parameters: variant === "advertised schema mismatch" && name === "beta"
			? { type: "object", properties: { requiredNumber: { type: "number" } }, required: ["requiredNumber"] }
			: { type: "object", properties: {} } }));
		const messages = [{ role: "user", content: "Call alpha and beta, then say OK.", timestamp: 1 }];
		__test.setQuery(({ prompt, options }) => {
			++launches;
			ctx = [...__test.activeQueryContexts].find((c) => c.piSessionId === sessionId);
			assert.ok(ctx?.queryProcess);
			ctx.onFallbackDecision = (sequence, decision) => decisions.push({ sequence, decision });
			const piStream = ctx.currentPiStream;
			const push = piStream.push.bind(piStream);
			piStream.push = (entry) => {
				if (entry.type === "done") atPublish = {
					wire: [...wire], decisions: [...decisions], ingress: ctx.queryProcess.ingressWatermark, reduced: ctx.queryProcess.reducedWatermark,
				};
				return push(entry);
			};
			const spawn = options.spawnClaudeCodeProcess;
			const env = {
				[process.platform === "win32" ? "Path" : "PATH"]: process.env.Path ?? process.env.PATH,
				SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
				HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
				ANTHROPIC_API_KEY: "fake-local-test-key", ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.address().port}`,
			};
			for (const name of Object.keys(CC_CHILD_ENV)) env[name] = options.env[name];
			return query({ prompt, options: { ...options, env,
				spawnClaudeCodeProcess(spawnOptions) {
					assert.equal(spawnOptions.command, executable);
					const child = spawn(spawnOptions);
					const raw = child.stdio[1];
					raw.on("data", captureLines((value) => wire.push(value)));
					// All beta-input variants use only native CLI stdout.
					if (!beta) raw.on("data", () => {
						if (injectedHeartbeat || !wire.some((value) => value.request?.message?.method === "tools/call")) return;
						injectedHeartbeat = true;
						// The unmodified CLI parks at its first dispatch until Pi replies.
						// Add one SDK keep-alive to its raw pipe after that real fence has
						// ingressed (before yielding to the publish gate) to make the
						// after-fence reduction obligation deterministic, not vacuous.
						raw.emit("data", JSON.stringify(heartbeat) + "\n");
					});
					return child;
				},
			} });
		});
		const options = { sessionId, signal: controller.signal };
		const events = await Array.fromAsync(provider.streamSimple(model, { messages, tools }, options));
		if (rejection) {
			const betaFrame = wire.find((v) => v.type === "assistant" && v.message?.content?.[0]?.id === "toolu_beta");
			assert.ok(betaFrame, "the real CLI must emit the offending fallback block");
			const block = betaFrame.message.content[0];
			if (variant === "unparsed input") {
				t.diagnostic(`2.1.321 malformed beta input on stdout: ${JSON.stringify(block.input)}`);
				assert.deepEqual(block.input, { __unparsedToolInput: parseFailure });
			} else if (beta.input) {
				assert.deepEqual(block.input, beta.input, "the marker must come from native CLI stdout");
			} else assert.equal(block.name, beta.name);
			const fence = wire.findIndex((v) => v.request?.message?.method === "tools/call");
			if (fence >= 0) assert.ok(wire.indexOf(betaFrame) < fence, "the malformed beta block must precede the first dispatch");
			assert.ok(requests.slice(0, 3).every((request) => request.stream === true));
			assert.equal(requests[3]?.stream, false);
			assert.deepEqual(events.map(({ type }) => type), ["error"]);
			assert.match(events[0].error.errorMessage, rejection);
			assert.deepEqual(events[0].error.content, []);
			assert.equal(atPublish, undefined);
			return;
		}
		const published = events.at(-1)?.message;
		assert.equal(published?.stopReason, "toolUse", JSON.stringify(events));
		assert.equal(events.filter(({ type }) => type === "done" || type === "error").length, 1);
		assert.deepEqual(published.content.map((part) => part.id ?? part.text), ["Before the calls.", "toolu_alpha", "toolu_beta", "After the calls."]);
		if (beta) assert.deepEqual(published.content.find((part) => part.id === "toolu_beta").arguments, beta.input);
		assert.equal(ctx.fallbackQualified, true);
		assert.ok(atPublish, "snapshot the actual irreversible Pi done push");
		assert.equal(atPublish.reduced, atPublish.ingress);
		const first = atPublish.wire.findIndex((v) => v.type === "assistant" && v.message?.id === "msg_fallback");
		assert.ok(first >= 0);
		const window = atPublish.wire.slice(first);
		const afterFence = beta ? [] : ["keep_alive"];
		assert.deepEqual(window.map((v) => v.request?.message?.method ?? v.type), [
			"assistant", "assistant", "assistant", "assistant", "tools/call", ...afterFence,
		], "any additional native frame must be reviewed, not silently allowlisted");
		assert.deepEqual(atPublish.decisions.map(({ decision }) => decision), ["stage", "assistant", "assistant", "assistant", "fence", ...afterFence]);
		assert.deepEqual(atPublish.decisions.map(({ sequence }) => sequence), window.map((_, i) => atPublish.ingress - window.length + i + 1));
		t.diagnostic(`2.1.321 publish at ${atPublish.ingress}: ${atPublish.decisions.map(({ sequence, decision }) => `${sequence}:${decision}`).join(", ")} (${beta ? "native stdout only" : "keep_alive is the injected after-fence stimulus"})`);
		const results = names.map((name) => ({ role: "toolResult", toolCallId: `toolu_${name}`, toolName: name,
			content: name === "alpha" ? alphaContent : [{ type: "text", text: `${name}-VALUE` }], isError: true, timestamp: 2 }));
		const continuation = [...messages, published, ...results];
		const secondEvents = await Array.fromAsync(provider.streamSimple(model, { messages: continuation, tools }, options));
		const second = secondEvents.at(-1)?.message ?? secondEvents.at(-1)?.error;
		const secondStage = wire.findIndex((v) => v.type === "assistant" && v.message?.id === "msg_fallback_again");
		assert.ok(secondStage >= 0, "CLI must reach the second fallback");
		const echoes = wire.slice(0, secondStage).flatMap((v) => v.type === "user" && Array.isArray(v.message?.content) ? v.message.content : [])
			.filter((p) => p.type === "tool_result" && p.is_error === true);
		assert.deepEqual(echoes.map(({ tool_use_id }) => tool_use_id), results.map(({ toolCallId }) => toolCallId), JSON.stringify(echoes));
		assert.equal(echoes[0].content, alphaEcho);
		if (beta) {
			const betaDispatch = wire.find((v) => v.request?.message?.method === "tools/call" && v.request.message.params.name === "beta");
			assert.deepEqual(betaDispatch?.request.message.params.arguments, beta.input, "CLI dispatches beta with the original object arguments");
		}
		t.diagnostic(`2.1.321 Pi error result echoes: ${JSON.stringify(echoes)}`);
		assert.equal(second?.stopReason, "toolUse", JSON.stringify(second));
		assert.deepEqual(secondEvents.filter(({ type }) => type === "done" || type === "error").map(({ type }) => type), ["done"]);
		assert.deepEqual(second.content.map((part) => part.id ?? part.text), secondBlocks.map((part) => part.id ?? part.text));
		const secondResults = results.map((result) => ({ ...result, toolCallId: `${result.toolCallId}_again`,
			content: [{ type: "text", text: `${result.toolName}-SECOND` }], isError: false, timestamp: 3 }));
		const completed = await provider.streamSimple(model, { messages: [...continuation, second, ...secondResults], tools }, options).result();
		assert.equal(completed.stopReason, "stop", JSON.stringify(completed));
		assert.deepEqual(completed.content.map((part) => part.text), ["OK"]);
		assert.equal(launches, 1, "both fallback batches must complete the same live query");
		for (const name of names) {
			assert.match(JSON.stringify(requests[4].messages), new RegExp(`${name}-VALUE`));
			assert.match(JSON.stringify(requests.at(-1).messages), new RegExp(`${name}-SECOND`));
		}
	} finally {
		clearTimeout(watchdog);
		controller.abort();
		__test.setQuery(null);
		await ctx?.queryProcess?.exited;
		await new Promise((resolve) => { api.close(resolve); api.closeAllConnections(); });
	}
});
