// Scripted fake ACP server for driver tests (stdio JSONL, same wire shape as
// agy_acp_server). Scenario selection via ACP_FAKE_SCENARIO; every received
// request is logged to ACP_FAKE_LOG (one JSON per line) so tests can assert on
// the exact protocol traffic the driver produced.
//
// Scenarios:
//   happy              prompt -> chunks "HE","LLO" -> end_turn
//   permission         prompt -> request_permission (waits for the client's
//                      answer) -> chunks "PER","MIS" -> end_turn
//   cancel-unsupported prompt -> chunk "C1" then chunks every 150ms forever;
//                      session/cancel -> -32601 (RC01 behavior)
//   slow               prompt -> nothing, ever (deadline tests)
//   frame-overflow     prompt -> 34MB without a newline, stays alive until killed
//   load-replay        session/load -> full-text history replay pairs, then
//                      prompt -> chunks "LIVE-1","LIVE-2" -> end_turn
//   auth-required      session/new -> -32000
//   load-fails         session/load -> -32000 (driver must fall back to new)
//   park               prompt -> chunk "P1", then after 2500ms "P2" + end_turn
//                      (overall-timer pause tests: park past a tight deadline)
//   think              prompt -> thought chunks ("TH1","TH2") + text chunk
//                      "HE LLO" -> end_turn (usage synthesis tests; the
//                      multi-word chunk diverges estimate from direct)
//   usage-frame        prompt -> chunk carrying a usage-like key -> chunks
//                      "HE","LLO" -> end_turn (Gate B latch tests: real
//                      usage in any frame must suppress synthesis)
//   tool-diff          prompt -> tool_call (pending, WITH diff content) ->
//                      tool_call_update (in_progress) -> tool_call_update
//                      (completed, rawOutput only, no content) -> chunk
//                      "DONE" -> end_turn (Gate C: diff arrives on the
//                      PENDING frame, run 6:10)

import fs from "node:fs";
import readline from "node:readline";

if (process.argv.includes("--version")) { console.log("1.5.8"); process.exit(0); }
if (process.argv.includes("models")) { console.log("gemini-3.8-flash-low Gemini 3.8 Flash (Low)"); process.exit(0); }

const scenario = process.env.ACP_FAKE_SCENARIO || "happy";
const sessionId = "fake-session-0001";
let pendingPromptId = null;
let streaming = false;
let promptCount = 0;
const timers = [];

// Mimic RC01's signal handler: intercept SIGTERM and linger before dying, so
// driver tests can exercise a replacement connection spawning while the old
// one is still alive (stale-exit race).
if (process.env.ACP_FAKE_SLOW_DEATH_MS) {
	const ms = Number(process.env.ACP_FAKE_SLOW_DEATH_MS) || 1500;
	process.on("SIGTERM", () => {
		process.stderr.write(`fake: slow death ${ms}ms\n`);
		setTimeout(() => process.exit(0), ms);
	});
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}
function error(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
}
function notifyChunk(text) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } },
  });
}
function notifyThoughtChunk(text) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text } } },
  });
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const logPath = process.env.ACP_FAKE_LOG || null;
function logReq(obj) {
	// Synchronous append, never a buffered WriteStream: the driver tears the
	// connection down right after a probe reply (Gate D -32601), and the
	// default SIGTERM exit drops unflushed stream data. Lossy log lines made
	// the "driver should have probed session/cancel" assertion flake ~1-in-3.
	if (logPath) fs.appendFileSync(logPath, JSON.stringify(obj) + "\n");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  logReq(msg);
  void handle(msg).catch(() => {});
});
rl.on("close", () => {
  for (const t of timers) clearTimeout(t);
});

async function handle(msg) {
  const { id, method, params } = msg;

  // Exercise auth failures at every RPC boundary, including a late response
  // racing connection teardown. Never invokes a real server or browser.
  if (method && method === process.env.ACP_FAKE_AUTH_ERROR_METHOD) {
    const delay = Number(process.env.ACP_FAKE_AUTH_ERROR_DELAY_MS) || 0;
    if (delay > 0) {
      notifyChunk("AUTH_PENDING");
      await sleep(delay);
    }
    error(id, -32000, "Authentication required");
    return;
  }

  // Client response to our request_permission probe (permission scenarios).
  // permission: one request (id 100). permission-twice: a second, identical
  // request (id 101) after the first answer, for allow_always memory tests.
  if (method === undefined && (id === 100 || id === 101)) {
    const optionId = msg.result?.outcome?.optionId;
    logReq({ _permissionAnswer: optionId, _permissionOutcome: msg.result?.outcome?.outcome });
    if (scenario === "permission-cancel") {
      result(pendingPromptId, { stopReason: "cancelled" }); pendingPromptId = null; return;
    }
    if (scenario === "permission-twice" && id === 100) {
      send({
        jsonrpc: "2.0",
        id: 101,
        method: "session/request_permission",
        params: {
          sessionId,
          toolCall: { toolCallId: "t2", kind: "edit", status: "pending", title: "Run create_file?" },
          options: [
            { optionId: "allow", name: "Allow", kind: "allow_once" },
            { optionId: "always", name: "Always allow", kind: "allow_always" },
            { optionId: "deny", name: "Deny", kind: "reject_once" },
          ],
        },
      });
      return;
    }
    if (scenario === "permission-late" && id === 100) {
      // The client's dialog loses the park race (its answer lands late).
      // The second, identical request must NOT inherit the late answer.
      setTimeout(() => {
        send({
          jsonrpc: "2.0",
          id: 101,
          method: "session/request_permission",
          params: {
            sessionId,
            toolCall: { toolCallId: "t2", kind: "edit", status: "pending", title: "Run create_file?" },
            options: [
              { optionId: "allow", name: "Allow", kind: "allow_once" },
              { optionId: "always", name: "Always allow", kind: "allow_always" },
              { optionId: "deny", name: "Deny", kind: "reject_once" },
            ],
          },
        });
      }, 400);
      return;
    }
    await streamPrompt();
    return;
  }

  switch (method) {
    case "initialize":
      result(id, {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, audio: true, embeddedContext: true },
          mcpCapabilities: { http: true, sse: true },
          sessionCapabilities: { list: {}, resume: {} },
          auth: { logout: {} },
        },
        authMethods: [],
        agentInfo: { name: "fake-acp", title: "Fake ACP", version: "fake-1" },
      });
      return;

    case "authenticate":
      result(id, {});
      return;

    case "session/new":
      if (scenario === "auth-required") {
        error(id, -32000, "Authentication required", { message: "run /agy auth-manual" });
        return;
      }
      result(id, {
        sessionId,
        modes: { currentModeId: "default", availableModes: [] },
        models: { availableModels: [], currentModelId: "fake-model" },
        configOptions: [],
      });
      return;

    case "session/load":
      if (scenario === "load-replay") {
        send({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId,
            update: { sessionUpdate: "user_message_chunk", content: { type: "text", text: "OLD USER" } },
          },
        });
        notifyChunk("OLD REPLY FULL TEXT");
      }
      if (scenario === "load-fails") {
        error(id, -32000, "unknown session");
        return;
      }
      result(id, { configOptions: [] });
      return;

    case "session/set_config_option":
      if (params.configId === "mode" && process.env.ACP_FAKE_PAUSE_STDIN_MS &&
          (!process.env.ACP_FAKE_PAUSE_STDIN_FILE || fs.existsSync(process.env.ACP_FAKE_PAUSE_STDIN_FILE))) {
        // Stop before acknowledging setup so the next large prompt blocks at
        // the real target pipe, including through the Windows Job facade.
        rl.pause();
        process.stdin.pause();
        logReq({ _stdinPaused: true, pid: process.pid });
        timers.push(setTimeout(() => {
          logReq({ _stdinResumed: true });
          rl.resume();
        }, Number(process.env.ACP_FAKE_PAUSE_STDIN_MS)));
      }
      result(id, {
        configOptions: [
          { id: params.configId, currentValue: params.value, options: [], type: "select", name: params.configId, category: params.configId },
        ],
      });
      return;

    case "session/prompt": {
      pendingPromptId = id;
      // Multi-turn: each new prompt replays the scenario's frames again.
      streaming = false;
      if (scenario === "tool-diff") {
        // Run-6 wire shapes verbatim: diff on the PENDING tool_call, the
        // completed update carries only rawOutput under a DIFFERENT id
        // (the supersede quirk).
        send({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId,
            update: {
              toolCallId: "33eb71a04aae4d4c9b85081f20ab5169",
              title: "Run create_file?",
              kind: "edit",
              status: "pending",
              content: [{ newText: "hello\n", path: "/w/probe.txt", _meta: { kind: "add" }, type: "diff" }],
              locations: [{ path: "/w/probe.txt" }],
              rawInput: { file_path: "/w/probe.txt" },
              sessionUpdate: "tool_call",
            },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId,
            update: { toolCallId: "fake-session-0001:7", kind: "edit", status: "in_progress", sessionUpdate: "tool_call_update" },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId,
            update: { toolCallId: "fake-session-0001:7", status: "completed", rawOutput: "Create probe.txt", sessionUpdate: "tool_call_update" },
          },
        });
        notifyChunk("DONE");
        result(id, { stopReason: "end_turn" });
        pendingPromptId = null;
        streaming = false;
        return;
      }
      if (scenario.startsWith("tfail-")) {
        // agy-upstream-safety-sync AC-3: a tool fails, the model may never speak,
        // and the server ends the turn with the stopReason named by the variant.
        // Variants: <provenance>[-text][-<stop>]; provenance = native | mcp | foreign | unknown | secret.
        const [prov, ...rest] = scenario.slice(6).split("-");
        const withText = rest.includes("text");
        const stop = rest.includes("endturn") ? "end_turn" : rest.includes("maxtokens") ? "max_tokens" : rest.includes("refusal") ? "refusal" : "stop";
        const tool = { toolCallId: "fake-session-0001:9", kind: "execute", status: "pending", sessionUpdate: "tool_call" };
        if (prov === "readfile") {
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { ...tool, kind: "read", title: "Running read_file", rawInput: { Path: "/w/x" } } } });
        } else if (prov === "genericstart") {
          // Start frame maps to the generic kind name ("read"); the failed update names read_file.
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { ...tool, kind: "read", title: "Reading file", rawInput: { Path: "/w/x" } } } });
        } else if (prov === "native" || prov === "secret") {
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { ...tool, title: "Running run_command", rawInput: { CommandLine: "boom-cmd" } } } });
        } else if (prov === "mcp") {
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { ...tool, title: "Run bash?", _meta: { mcp: { server: "pi-agy-aabbccdd", tool: "bash" } }, rawInput: { arguments: { command: "x" } } } } });
        } else if (prov === "partialmcp") {
          // Partial metadata: _meta.mcp.tool present WITHOUT a server, colliding with a native name.
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { ...tool, title: "Running run_command", _meta: { mcp: { tool: "run_command" } }, rawInput: { arguments: { CommandLine: "x" } } } } });
        } else if (prov === "partialfail") {
          // Native-looking start; the failed update itself carries serverless MCP metadata.
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { ...tool, title: "Running run_command", rawInput: { CommandLine: "x" } } } });
        } else if (prov === "foreign") {
          // Metadata-less foreign MCP call (acp-events fixture shape): no mcp marker, unknown name.
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { ...tool, name: "mcp_my_server_hyphen-tool", title: "Run arbitrary display text" } } });
        }
        // "unknown": a failure update with no start record at all.
        // Failed update carrying explicit tool identity with no start record.
        const failId = (prov === "named" || prov === "genericstart") ? { name: "read_file" } : prov === "namedmcp" ? { name: "read_file", _meta: { mcp: { server: "foreign-srv" } } } : prov === "namedunknown" ? { name: "mystery_tool" } : prov === "partialfail" ? { _meta: { mcp: { tool: "run_command" } } } : {};
        const raw = process.env.ACP_FAKE_TOOL_FAILURE ?? (prov === "secret"
          ? "boom: Authorization: Bearer abc123SECRETvalue\nsecond line\t" + "x".repeat(400)
          : "boom: exit 1");
        send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { toolCallId: "fake-session-0001:9", status: "failed", rawOutput: raw, sessionUpdate: "tool_call_update", ...failId } } });
        if (withText) notifyChunk("Recovered and here is the summary.");
        if (rest.includes("hang")) return; // never settles: abort path
        result(id, { stopReason: stop });
        pendingPromptId = null;
        streaming = false;
        return;
      }
      if (scenario === "permission" || scenario === "permission-twice" || scenario === "permission-late" || scenario === "permission-cancel") {
        send({
          jsonrpc: "2.0",
          id: 100,
          method: "session/request_permission",
          params: {
            sessionId,
            toolCall: { toolCallId: "t1", kind: "edit", status: "pending", title: "Run create_file?" },
            options: [
              { optionId: "allow", name: "Allow", kind: "allow_once" },
              { optionId: "always", name: "Always allow", kind: "allow_always" },
              { optionId: "deny", name: "Deny", kind: "reject_once" },
            ],
          },
        });
        return; // resumed by the client's response above
      }
      if (scenario === "permission-then-die") {
        send({
          jsonrpc: "2.0",
          id: 100,
          method: "session/request_permission",
          params: {
            sessionId,
            toolCall: { toolCallId: "t1", kind: "edit", status: "pending", title: "Run create_file?" },
            options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
          },
        });
        // Die with the request still parked: the client must settle the
        // pending permission and fail the turn, never hang.
        setTimeout(() => process.exit(0), 50);
        return;
      }
      await streamPrompt();
      return;
    }

    case "session/cancel":
      if (process.env.ACP_FAKE_CANCEL_IGNORED === "1") {
        for (const timer of timers) clearTimeout(timer);
        return;
      }
      if (scenario === "permission-cancel") return; // settle after the permission cancellation reply
      if (pendingPromptId !== null) {
        result(pendingPromptId, { stopReason: "cancelled" });
        pendingPromptId = null;
      }
      if (id !== undefined) result(id, {});
      return;

    case "session/close":
      result(id, {});
      return;

    default:
      error(id, -32601, "Method not found", { method });
  }
}

async function streamPrompt() {
  if (streaming) return;
  streaming = true;
  promptCount += 1;
  if (scenario === "slow") return; // never emits, never completes
  if (scenario === "frame-overflow") {
    // Never self-exit: a successful outcome must prove transport teardown,
    // not merely race a fixture exiting after its stdout write drains.
    process.stdout.write("x".repeat(34 * 1024 * 1024));
    return;
  }
  if (scenario === "cancel-native") {
    notifyChunk("C1");
    const t = setInterval(() => {
      if (pendingPromptId === null) {
        clearInterval(t);
        return;
      }
      notifyChunk("tick");
    }, 150);
    timers.push(t);
    return;
  }
  if (scenario === "park") {
    notifyChunk("P1");
    const t = setTimeout(() => {
      notifyChunk("P2");
      if (pendingPromptId !== null) {
        result(pendingPromptId, { stopReason: "end_turn" });
        pendingPromptId = null;
      }
    }, 2500);
    timers.push(t);
    return;
  }
  if (scenario === "load-replay") {
    notifyChunk("LIVE-1");
    await sleep(20);
    notifyChunk("LIVE-2");
    if (pendingPromptId !== null) {
      result(pendingPromptId, { stopReason: "end_turn" });
      pendingPromptId = null;
    }
    return;
  }
  if (scenario === "think") {
    notifyThoughtChunk("TH1");
    await sleep(20);
    notifyThoughtChunk("TH2");
    await sleep(20);
    notifyChunk("HE LLO");
    if (pendingPromptId !== null) {
      result(pendingPromptId, { stopReason: "end_turn" });
      pendingPromptId = null;
    }
    return;
  }
  if (scenario === "usage-frame") {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId, update: { sessionUpdate: "agent_message_chunk", usage: { totalTokens: 99 }, content: { type: "text", text: "HE" } } },
    });
    await sleep(20);
    notifyChunk("LLO");
    if (pendingPromptId !== null) {
      result(pendingPromptId, { stopReason: "end_turn" });
      pendingPromptId = null;
    }
    return;
  }
  if (scenario === "exact-usage") {
    notifyChunk("estimated answer");
    await sleep(20);
    if (pendingPromptId !== null) {
      result(pendingPromptId, { stopReason: "end_turn", usage: {
        inputTokens: 1000, outputTokens: 2000, totalTokens: 10000,
        cachedReadTokens: 3000, cachedWriteTokens: 4000,
      } });
      pendingPromptId = null;
    }
    return;
  }
  if (scenario === "usage-batches-reset") {
    const update = (body) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: body } });
    if (promptCount === 1) {
      const call = { sessionUpdate: "tool_call", toolCallId: "duplicate", name: "run_command" };
      update(call); update(call);
      update({ sessionUpdate: "tool_call_update", toolCallId: "duplicate", status: "completed" });
      notifyThoughtChunk("next inference");
      update({ ...call, toolCallId: "second-batch" });
    }
    notifyChunk("DONE");
    result(pendingPromptId, { stopReason: "end_turn", usage: { inputTokens: 1000, outputTokens: 50, cachedReadTokens: 800, totalTokens: 1850 } });
    pendingPromptId = null; streaming = false; return;
  }
  if (scenario === "usage-single" || scenario === "usage-total" || scenario === "usage-occupancy" || scenario === "usage-parallel" || scenario === "usage-parallel-split" || scenario === "usage-occ-only" || scenario === "usage-occ-once") {
    // Aggregate shape from the live probe (2026-11-10, values hard-coded so
    // CI needs no captures): total = in+out+cache = 1850.
    const usage = { inputTokens: 1000, outputTokens: 50, cachedReadTokens: 800, totalTokens: 1850 };
    if (scenario === "usage-total" || scenario === "usage-parallel" || scenario === "usage-parallel-split") {
      const ids = scenario === "usage-total" ? ["u1"] : ["u1", "u2"];
      if (scenario === "usage-parallel-split") {
        send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { toolCallId: "u1", title: "Run run_command?", kind: "execute", status: "pending", rawInput: { CommandLine: "echo x" }, sessionUpdate: "tool_call" } } });
        send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { toolCallId: "u1", status: "completed", rawOutput: "x", sessionUpdate: "tool_call_update" } } });
        send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { toolCallId: "u2", title: "Run run_command?", kind: "execute", status: "pending", rawInput: { CommandLine: "echo y" }, sessionUpdate: "tool_call" } } });
        send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { toolCallId: "u2", status: "completed", rawOutput: "y", sessionUpdate: "tool_call_update" } } });
      } else {
        for (const id of ids) {
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { toolCallId: id, title: "Run run_command?", kind: "execute", status: "pending", rawInput: { CommandLine: "echo x" }, sessionUpdate: "tool_call" } } });
        }
        for (const id of ids) {
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { toolCallId: id, status: "completed", rawOutput: "x", sessionUpdate: "tool_call_update" } } });
        }
      }
    }
    if ((scenario === "usage-occupancy" || scenario === "usage-occ-only") || (scenario === "usage-occ-once" && promptCount === 1)) {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "usage_update", used: 42000, size: 1000000 } } });
    }
    notifyChunk("DONE");
    if (pendingPromptId !== null) {
      result(pendingPromptId, { stopReason: "end_turn", ...(scenario === "usage-occ-only" ? {} : { usage }) });
      pendingPromptId = null;
    }
    streaming = false;
    return;
  }
  // happy / permission
  notifyChunk(scenario === "permission" ? "PER" : "HE");
  await sleep(20);
  notifyChunk(scenario === "permission" ? "MIS" : "LLO");
  if (pendingPromptId !== null) {
    result(pendingPromptId, { stopReason: "end_turn" });
    pendingPromptId = null;
  }
}
