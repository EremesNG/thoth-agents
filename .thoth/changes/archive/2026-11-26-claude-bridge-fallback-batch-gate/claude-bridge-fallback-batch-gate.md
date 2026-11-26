# Change: claude-bridge-fallback-batch-gate

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: high

## Exploration

- Incident (2026-11-25 04:54Z, vfx-foundation): Claude Code (CC) received six Pi tool results, hit 7x HTTP 529 overloaded, then answered with one assistant message carrying 3 `tool_use` blocks (CC transcript `5af54fab…jsonl`, apiBlockIndex 0) that never reached Pi; the Pi turn sat "working…" ~15 min until aborted.
- Reproduced deterministically with a local fault-injection proxy (`ANTHROPIC_BASE_URL=http://127.0.0.1:8529`, 3x HTTP 200 SSE `message_start` + `overloaded_error`): CC retries, then sends `stream:false`; the non-streaming reply reaches the bridge as one SDK `assistant` message per content block (same message id). `processAssistantMessage` (pi-packages/pi-claude-bridge/src/index.ts) called `endToolUseTurn` after the first `tool_use`; later blocks arrived with no `currentPiStream` and were dropped; CC's MCP handler for the next call waited forever (bridge debug log: `processAssistantMessage fallback: 1 blocks`, `mcp handler: ls → waiting`).
- Not caused by commit a41cfa92 (sequential tool batches): an identical batch in the same session resumed in 9 s.
- Upstream (elidickinson/pi-claude-bridge): issue #237 reports this bug; open PR #225 (head cae5a131) batches same-id blocks with a 100 ms quiet timer; open PR #226 adds a 2-minute watchdog; upstream main after our sync base 45fc71d has only the 0.13.0 release commit; SDK pin 0.3.321 matches ours.
- A port of #225 plus four hardening rounds (current uncommitted working tree in pi-packages/pi-claude-bridge) fixed the live proxy scenario but failed four independent Oracle verifications under the strict failure criterion: each round surfaced new timer races (slow onResponse hook, SDK transport failure during cleanup, loop exception during iterator.return(), init session mismatch, unobserved stderr, interleaved replay splitting a batch, success published ahead of queued error/abnormal exit, EOF publishing before failed persistence, correlated MCP rejection, pre-block hook rejection) and a hardening regression (an `api_retry` notice after a pending tool kills the query).
- Plan review round 2 found the resolved bundled Windows CLI reports 2.1.321 (not the design probe's 2.1.285), that its retry-watchdog path can emit unscoped `api_retry` for non-main quota waits with no origin field in the SDK frame, and that the existing save-fault test (tests/unit-query-lifecycle.mjs ~559–600, text-only, no tools) expects a host exit because the provider rethrows a post-exit save error from a detached promise chain (src/index.ts ~2483–2492, ~2594–2606).
- Oracle design review (read-only probe with SDK 0.3.321 + a bundled Windows CLI it reported as 2.1.285 against a fake Messages API): all same-id fallback assistant frames, including trailing text, appear on raw stdout before the first `tools/call`; the CLI serializes non-concurrency-safe MCP calls (bridge advertises no `readOnlyHint`, src/mcp-server.ts), so waiting for all dispatches deadlocks; SDK control requests (MCP) are routed separately from the public message iterator (sdk.mjs), so an MCP callback alone cannot prove the iterator consumed earlier frames; Pi `EventStream.push(done)` resolves `result()` immediately (pi-ai event-stream.js), so `done` is the irreversible publish.

## Intent

When Claude Code falls back to a non-streaming reply, Pi receives every tool call of that reply in exactly one tool-use turn, and the bridge never publishes a successful tool-use turn after it has observed a relevant failure; replaced by an explicit fallback batch state model with a single publish gate instead of a quiet timer.

## Non-goals

- No change to the normal streaming path (`message_stop` ends the turn) beyond sharing the publish gate where unavoidable.
- No guarantee about failures that can only occur after publish (a later tool call failing after an earlier one returns, live-query persistence after the tool round); those follow existing post-publish paths.
- No tool annotation changes (`readOnlyHint`) to make detection work.
- No upstream GitHub comment or PR (user decision); no package version bump.
- No support guarantee for CC executables/transports other than the qualified pinned configuration beyond bounded failure.

## Acceptance

- AC-1: For a non-streaming fallback reply delivered as several same-id SDK assistant frames (tool_use plus any text/thinking), Pi receives all served tool calls in model order with the fallback text/thinking in exactly one tool-use turn, including when prompt/steer replay acknowledgements interleave and when fragments are delayed beyond 100 ms.
- AC-2: The batch publishes only at a completion fence: the first validated MCP `tools/call` correlated to a staged served tool id, identified by query, MCP server and JSON-RPC request identity and bound to the raw-ingress sequence number stored when that request's frame was ingressed (never the counter value at callback time); commit additionally requires that every raw child frame already ingressed at commit time, before or after the fence frame, has been reduced (SDK-yielded frames processed by the consumer; frames the SDK consumes without yielding, such as control traffic, acknowledged and classified by the ingress adapter), so an already-ingressed failure on either side of the fence wins, and a final check finds no failure latched; on the qualified configuration (Agent SDK 0.3.321 with its bundled CLI, proven by the contract test). If the fence or the required reductions do not arrive within a bounded watchdog, or qualification cannot be established, the turn ends with an explicit error; a staged batch is never published by ordinary success paths (including a success `result`) without a fence; the watchdog never publishes success and the turn never hangs.
- AC-3: Every relevant failure the bridge observes before publish (SDK error results and success-with-error, terminal assistant errors, CC rejection/denial of a staged served id, wrong init session or conversation reset, terminal auth/quota rejection, onResponse hook rejection on the owning Pi stream (retained as a stream-scoped fact even before the first block; it becomes terminal as soon as the turn is identified as a fallback batch, while an ordinary streaming turn keeps today's log-and-continue behavior; tested with the same rejected-hook prefix followed by streaming and by fallback), loop/recording exceptions, child spawn/stdio/process failures or abnormal exit, iterator next/cleanup failure, prompt-stream failure relevant to the turn, MCP protocol/send errors, correlated MCP request rejection or cancellation, matching transcript `session_writes_lost`, abort, discard) yields no successful tool-use turn and exactly one terminal error (or aborted) event carrying an actionable cause, with no Pi tool execution for the batch. When several failures are observed, which one is reported as the cause is best-effort (wire order preferred) and is not an acceptance condition; missing a failure or handing the batch over after one is. While a fallback batch is staged (from its first staged frame until publish), the bridge fails closed: any SDK-consumed or MCP-side frame outside an explicit allowlist is itself a relevant failure, without per-tool-id correlation. Blocked-cleanup exception (narrow): only a delay that appears solely while the SDK iterator's own cleanup is held blocked, and that is independently demonstrated identical on base a41cfa92 at a matched checkpoint (for example the post-exit disk save delay, or process shutdown/same-session progress waiting on SDK cleanup), may be accepted as a documented residual with a recorded follow-up; the exception never covers terminal delivery to Pi, precommit recording preparation, the in-memory commit of an acknowledged rejection prefix, stopping the query on a rejection, or never producing a result for an undispatched call; such failures recorded while only narration is staged, or before staging, are provisional and become terminal when a served tool is staged in the same Pi stream and attempt (Decisions "Latch states"), so a confirmed text-only reply or a completed ordinary streaming turn is unaffected. The terminal error is delivered as soon as the failure is latched, bounded and independent of teardown (iterator.return(), child exit, MCP close, persistence finalization); finalizer and cleanup rejections are caught and never become unhandled rejections or host exits. Precommit recording preparation for the batch is part of the gate (its failure is an AC-3 failure, covered by a fallback recording-fault test). Saves that happen after child exit or after publish keep their existing visible error report and no-retry behavior and are outside the batch criterion, but their detached rejection is caught so it never terminates the host; the existing text-only save-fault fixture (tests/unit-query-lifecycle.mjs ~559–600) is updated from expecting a host exit to expecting the visible error without host exit, and stays distinct from the precommit recording-fault test.
- AC-4: A main-attempt `system:api_retry` or main-thread refusal retry invalidates the staged batch and keeps the query open; the replacement attempt (streaming or non-streaming) is delivered normally. Retries attributable to side questions or subagents (verified origin discriminator) do not affect the parent batch. If T1 finds no verified origin discriminator for `api_retry` on the qualified executable and effective flags, an ambiguous `api_retry` received while a batch is staged is treated as a main retry (invalidate and await replacement), so the worst case is a bounded watchdog error, never a wrong success or a hang; this choice and a side/subagent regression check are recorded in tests.
- AC-5: A clean child EOF while a fallback batch is unpublished and no result arrived ends the turn with an explicit error.
- AC-6: Unchanged behavior: normal streaming turns, single-call fallback, normal success, user abort semantics, informational rate-limit/overage events, ordinary steer handling, session resume/persistence identity, post-publish rejection routing and the existing rejected-call recording requirement; exactly one terminal event per Pi stream; no leaked timers/listeners; no uncaught exceptions or unhandled rejections; existing tests that currently expect a host exit on wrong init or save failure during a fallback batch are revised to the no-crash error outcome.
- AC-7: Bridge typecheck, unit suite and build pass; root `pnpm run check:ci` and `pnpm run typecheck` pass; the live fault-injection proxy scenario (3x mid-stream overload → `stream:false` → multiple same-id served calls) completes with all results returned and a final answer.
- AC-8: Bridge CHANGELOG documents the fix (references upstream #237/#225) and the durable delta is synced to `.thoth/specs/pi-ecosystem/spec.md` at archive.

## Clarifications

- Failure horizon: user chose "failures observed before the irreversible publish" (including queued ingress and applicable persistence); future failures are out of scope.
- Completion evidence: user chose first correlated MCP dispatch with an ordered ingress fence plus a failing watchdog, qualified to the pinned configuration, over keeping a 100 ms quiet timer with a relaxed criterion.
- Clean EOF mid-batch without a result: user chose explicit failure.
- Upstream: no comment/PR (user decision); strict acceptance (user decision after round 3).
- Acceptance amendment (user decision after final-verification round 4, 2026-11-25): the safety guarantee stays strict — Pi never receives or executes a fallback batch after the bridge has observed a relevant pre-hand-over failure, and the turn always ends with exactly one explicit error instead of hanging or succeeding; first-cause precedence among several observed failures becomes best-effort. Round-4 findings E3 (late fragment vs later idle) and E4 (reader/transport teardown vs earlier idle) are cause-attribution only and are accepted as residual, non-blocking; E1 (cancellation lost under a duplicate outer request id) and E2 (SDK permission rejection of a staged can_use_tool request treated as inert) are safety findings and must be fixed.
- Verification closure rule (user decision after final-verification round 20, 2026-11-26; refined after plan review): applies only to NEW edge-case findings in final verifications after round 20; it never relaxes existing acceptance obligations. Order of evaluation: a finding that meets a blocker branch blocks and is never reclassified as a residual.
  - Unchanged obligations (always blocking when violated): a violation is established by a failing required check or control named in the task rows, or by evidence independent of any new edge-case replay; a NEW replay that depends on CLI-produced frames or orderings does not by itself establish a violation of AC-3 or of the durable delta unless it meets the branch (a) reachability evidence below. The obligations are: AC-1..AC-8 as amended; every required check and control named in the task rows (including the real-CLI valid-input controls and the ordering/production integration); the canonical rejected-call duties (recording, query stop, error routing) in .thoth/specs/pi-ecosystem/spec.md and the ADDED delta; the bounded explicit error for an unqualified configuration or a missing fence; and the existing narrow AC-3 blocked-cleanup exception, which keeps its own rules.
  - Blocker branch (a) — safety, for a reachable sequence: after a relevant pre-hand-over failure, Pi receives a fallback tool-use turn or a tool executes; or the turn hangs; or it fails to end with exactly one bounded, explicit error (or the applicable abort) carrying an actionable observed cause (a normal stop/success after a relevant failure counts as this violation). Cause precedence stays best-effort.
  - Blocker branch (b) — regression: behavior already verified in this change, or base a41cfa92 behavior on ordinary paths outside the Decisions' declared exceptions, no longer holds.
  - Reachability evidence for branch (a): the pinned configuration (SDK 0.3.321, bundled CLI 2.1.321) with its effective flags as launched by the bridge, plus either a trace captured from the real CLI or a reproducible probe showing that the decisive CLI-produced frames (shape and order) are emitted by the CLI; frames injected by a test harness do not count as CLI output. A faithful replay of CLI-produced frames is acceptable. Host-side faults (bridge, SDK reader, MCP transport, Pi hooks, process/OS faults) are reachable when separately evidenced at a checkpoint the pinned configuration can reach; they are not excluded because the CLI does not emit them.
  - Non-blocking (accepted residual): a new finding that meets neither branch — it relies on CLI frames or orderings not shown to be emitted by the pinned CLI, or it is a false-positive explicit error in an edge case on the degraded fallback path that does not regress verified or base ordinary behavior.
  - Residual recording: each accepted residual is written in this record under Verification ("Residual risks") with: trigger sequence, evidence or the evidence gap, the reason it meets neither blocker branch, and the follow-up (owner and action). Closeout lists the follow-ups.
- Blocked SDK cleanup scope (user decision after final-verification round 11, 2026-11-25): behavior that only appears when the SDK iterator's own cleanup (`iterator.return()`) is held blocked is in scope only where this change introduced or worsened it relative to the base commit a41cfa92. Pre-existing lifecycle fragility under blocked SDK cleanup (e.g. process shutdown or same-session continuation waiting on the SDK iterator, persistence ordering tied to reader cleanup) that behaves the same on a41cfa92 is accepted as a residual risk, recorded under Verification/Closeout, and tracked as a separate follow-up; it does not block this change. The safety guarantees stay unchanged: no hand-over after a relevant failure, exactly one terminal event delivered without waiting for cleanup, bounded termination while a fallback is unpublished.
- Fail-closed allowlist (user decision after final-verification round 7, 2026-11-25): rounds 5–7 kept finding new correlation gaps (nested/outer request-id reuse across attempts, stale dispatch masking a replacement rejection, uncorrelatable schema errors before the first tool block). The user chose to replace per-id failure correlation during a staged fallback batch with a fail-closed allowlist; the accepted cost is that, rarely, a valid fallback batch fails with one explicit error (user retries) instead of being handed over, only on the degraded overload path.

## Decisions

- One coordinator owns the terminal `done`/`toolUse` for fallback batches; SDK reader, MCP server, process callbacks, hooks and watchdog only report facts. Batch states: Collecting → ReadyLive → Committed; Collecting/ReadyLive → AwaitReplacement → Collecting; any uncommitted state → Failed or Cancelled. Candidates are keyed by query/process generation, owning Pi stream, attempt and API message id.
- Staged fallback blocks stay out of Pi's shared `turnOutput` and out of successful assistant recording until commit, so a retry can discard them without retracting events; legitimate prompt/steer acknowledgements keep their independent recording.
- Ordered ingress: a narrow adapter at the spawn boundary (query-process.ts) observes raw child stdout ordering so the fence can prove earlier frames were ingressed; do not depend on private SDK queue internals. Qualification is by executable/transport, verified by a credentials-free contract test.
- Ordered reduction: the ingress adapter assigns a monotonically increasing sequence to every raw child stdout frame, classifies it as SDK-yielded or SDK-consumed (control/raw-only), and for `control_request` frames carrying MCP `tools/call` records the sequence keyed by query, server and request id at ingress time; the MCP server looks up that stored sequence for the validated call (never the current counter). The consumer acknowledges each yielded frame after reducing it; the adapter acknowledges consumed frames itself. Commit requires reducedWatermark ≥ the ingress watermark at commit time (everything already ingressed is reduced, including frames after the fence) plus a final failure-latch check, rechecked after every await. Tests drive the installed SDK with the consumer deliberately stalled and one stdout chunk containing assistant → tools/call → error result (failure after the fence) and error → tools/call (before), proving both win over the fence.
- Retry attribution: T1 records the resolved bundled executable version and effective child environment flags as the qualified configuration and checks whether `api_retry` carries a usable origin discriminator; without one, ambiguous retries during a staged batch invalidate it (AC-4 fail-safe).
- Post-exit save failures: catch the detached rejection, keep the visible error and no retry; update the existing text-only fixture accordingly (in scope by this decision).
- No-fence disposition: a staged fallback batch that sees a success `result`, idle state or clean EOF without a fence ends with an explicit error (never ordinary success).
- Fail-closed allowlist while staged (supersedes per-id failure correlation for the staged window): from the first staged frame of a fallback batch until actual publish (hand-over to Pi, not the fence; frames already ingressed between fence and publish are reduced under the same allowlist), the ordered reducer admits only (a) further same-message assistant frames of the batch (tool_use/text/thinking; stream_event deltas only if the qualified configuration emits them), (b) the fence: the first validated MCP `tools/call` whose tool-use id is a staged served id of the current attempt, (c) an explicit inert set enumerated in code with a test per entry (keep-alive/informational rate-limit/overage events, `system:api_retry`/refusal-retry which keep their AC-4 invalidate-and-await-replacement semantics, and SDK/MCP traffic proven to belong to Pi-side ordinary flow that the qualified configuration emits in this window — each justified by the T1 ordering contract or an installed-SDK replay). Every other frame — any cancellation, any error/rejection/denial reply, permission request or reply, `tools/call` for a non-staged or unknown id, malformed/uncorrelatable/misrouted MCP or control frame, request-id collision, unknown frame type — latches a relevant failure (exactly one terminal error, no hand-over). Window and attempt dispositions (normative; the worker must not choose):
  - Latch scope: one failure latch per (owning Pi stream, retry attempt). An attempt runs from the owning Pi stream's start or a retry invalidation until the next invalidation or the end of that Pi stream. A new Pi stream on the same live SDK query (continuation after publish or after a text turn) starts with an empty latch; nothing carries across Pi streams. Tests: a failure latched in one Pi stream does not fail a fresh continuation on the same query.
  - Latch states: the latch only records; it becomes terminal (one error, immediate, no hand-over) at the moment a served tool_use is staged in the attempt, or immediately if a violation arrives while a served tool is already staged. While nothing is staged or only narration (text/thinking) is staged, the latch is provisional: it never errors by itself.
  - Pre-staging (nothing staged): every potentially relevant failure frame is recorded in the latch — keyed facts by tool-use id (round-6 retention) and any no-id/uncorrelatable failure (SDK-written error reply of any kind, MCP error reply, cancellation, rejection/denial, malformed or misrouted frame).
  - Narration-only window: staging begins at the first same-message assistant frame of a non-streaming reply, including narration-only frames; allowlist violations here are recorded provisionally. If a served tool_use is then staged, the latch turns terminal (one error, no hand-over). If the reply completes text-only (confirmed by the SDK result with no served tool calls), it completes as today's successful text turn and the latch is discarded — a confirmed text-only success is never turned into an error by this change.
  - Provisional stream start: a stream start (message_start/stream_event) does not clear the latch; it is retained passively. If the attempt continues as ordinary streaming and completes, today's streaming behavior applies unchanged (latch discarded at completion, never surfaced). If the attempt silently falls back to a non-streaming reply without an explicit retry frame (existing replay tests/unit-nonstreaming-fallback.mjs:67–100), the retained latch applies to the fallback batch.
  - Invalidation (`system:api_retry`/refusal-retry) → AwaitReplacement: the old batch's contents are discarded and a new attempt (new latch) begins; frames correlated to retired ids of the invalidated attempt (stale calls, cancellations, replies) are inert during AwaitReplacement, so the existing AC-4 stale-traffic controls stand; any no-id/uncorrelatable failure frame during AwaitReplacement is recorded in the new attempt's latch.
  - Replacement streaming: ordinary streaming per "Provisional stream start".
  - Required tests (in addition to the above): no-id failure before any staged frame → tool batch → one error; failure after narration before the first tool block → one error; same failure after narration with a text-only completion → normal text success (control); same failure prefix then ordinary streaming completion → today's behavior (control); failure then silent streaming-to-fallback transition → one error; continuation Pi stream on the same query after a latched failure in a previous stream → unaffected.
  - Replacement fallback staging: full allowlist; any frame for a retired id from now on is outside the allowlist and fails closed. Existing tests that expected such post-staging stale traffic to be inert are superseded: the worker updates them to expect one error and lists each (test name, old→new).
  Per-id correlation code that becomes unnecessary is removed, not kept in parallel; correlation is still required after publish for normal routing (canonical rejected-call requirement) and outside fallback batches (normal streaming unchanged).
- Ordinary-path session-safety exception to AC-6 (from the round-17 audit follow-up): conversation reset and matching transcript `session_writes_lost` (and wrong-session init, as on base) stay fatal on ordinary turns too, because base a41cfa92 can reuse a transcript whose latest acknowledged records are missing (base src/index.ts ~621, ~647, ~2296), silently losing recorded history; the prior valid session pointer is preserved in memory and on disk. All other audited ordinary paths (malformed/missing-metadata MCP traffic on a parked query, auth errors and aborted/error-marked tool-bearing assistant frames, initial prompt-push rejection) were restored to base behavior outside the fallback window.
- Cause attribution (acceptance amendment): replay and unit assertions in scenarios with several competing failures check one terminal error, no hand-over/execution and that the reported cause is one of the observed failures; isolated single-failure replays keep asserting that failure.
- Single serial writer: one thoth-worker owns pi-packages/pi-claude-bridge for all implementation tasks, executed strictly in task order (AC-2 → AC-1 → AC-3 → AC-4 → AC-5 → AC-6); later tasks may revise earlier tests, including the existing host-exit expectations.
- Watchdog default: bounded (implementation picks a value ≥ the existing CC tool-progress cadence, documented in code) and fails the turn.
- Remove from the current tree: `settleFallbackToolUse` and timer cancel/re-arm, generic assistant/user/stream/result flushes, consumeQuery EOF publish, fatal `api_retry` classification, steer-rejection-kills-query. Keep: same-id accumulation, normal `message_stop`, abandoned-stream cleanup, rate-limit UI, late-echo recording, process/stdio observation (coalesced, listeners detached), early init/session checks (scoped effects).

## Durable deltas

- `ADDED pi-ecosystem` **Claude bridge delivers complete non-streaming fallback tool batches** — `@thoth-agents/pi-claude-bridge` MUST, on a Claude Code configuration whose frame-before-dispatch ordering it has qualified, deliver every served tool call of a Claude Code non-streaming fallback reply to Pi in exactly one tool-use turn published only at a verified completion fence; on any configuration it MUST end the turn with an explicit error, never a successful tool-use turn, when it has observed a relevant failure before publishing or when no completion evidence arrives within its bound; rejected-call recording stays as already required.
  - GIVEN a qualified configuration where Claude Code retried an overloaded streaming request and answered with a non-streaming reply containing three tool calls; WHEN the bridge receives the reply as separate same-id assistant frames and Claude Code dispatches the first call; THEN Pi executes all three calls in one turn, whereas an error result or Claude Code rejection observed before publishing ends the turn with one explicit error carrying an observed actionable cause and no tool runs, and a missing fence within the bound or an unqualified configuration ends the turn with an explicit error instead of hanging or publishing success .

## Plan

1. Contract probe + ordered ingress (T1): credentials-free fake Messages API in `tests/int-cc-contracts.mjs` (or a sibling) driving the pinned SDK/CLI through the forced non-streaming fallback; capture raw stdout and MCP ordering; assert all same-id frames precede the first `tools/call`, beta is not dispatched before alpha's reply. Add the ordered ingress adapter at `src/query-process.ts`: per-frame sequence numbers, yielded/consumed classification, consumer acknowledgements, reduced watermark, and per-request stored ingress sequences for MCP `tools/call` control frames keyed by query/server/request id. Prove with the installed SDK and a deliberately stalled consumer that queued blocks, error results or cancellations on either side of the fence are reduced before a fence can commit, and that an unacknowledgeable frame leads to bounded failure, not a hang. Record the resolved bundled executable version and effective flags, and whether `api_retry` carries an origin discriminator.
2. Batch coordinator + publish gate (T2): in `src/query-state.ts` and `src/index.ts`, introduce the fallback batch state machine and single publish gate; stage blocks; fence on first correlated MCP dispatch (via `src/mcp-server.ts`/`buildMcpServers` reporting dispatch facts, never publishing); bounded failing watchdog; retry → AwaitReplacement; clean EOF without result → fail. Revert the timer-based code paths listed in Decisions.
3. Failure wiring (T3): classify MCP failures before name lookup/dispatch and correlate by tool id (including SDK schema rejection and JSON-RPC cancellation outside the handler); latch onResponse rejection per owning stream before any batch exists; route process/stdio/iterator/prompt-stream/recording/persistence failures and staged-id CC rejections into the coordinator; recheck ownership, abort and failure after every await before committing; report an observed actionable cause (first-cause precedence advisory per AC-3).
4. Tests: extend `tests/unit-fallback-parallel-tool-calls.mjs`, `tests/unit-query-lifecycle.mjs`, `tests/unit-query-process.mjs`, `tests/unit-mcp-server.mjs` with replays/probes for every AC-3/AC-4 signal, interleaved replays, >100 ms delayed fragments, pre-block hook rejection, correlated unknown-name/cancel, retry-to-streaming and retry-to-fallback, stale callbacks, abort, clean EOF; real SDK over a fake Node child for success→queued error, success→nonzero exit, pipe faults; full-provider saveSessionState fault. Replace the current "different ID flushes" expectation. Assert one terminal event, exact ordered ids, no execution on failure, all tool results delivered on success.
5. Root live check (T4): fault-injection proxy at 127.0.0.1:8529 (`%TEMP%/bridge-repro-tools/proxy529.mjs`, control `mid 3`), fresh Pi with the built bridge, 6-call batch then 3-call same-message batch; expect `stream:false`, one Pi turn with all 3 calls, final answer.
6. Fresh Oracle final verification, closeout, archive with delta sync.

## Tasks

- [x] AC-2: Pinned-CLI ordering contract test and ordered ingress adapter
  - Outcome: a credentials-free contract test proving same-id fallback frames precede the first MCP tools/call on SDK 0.3.321's bundled CLI, plus an ingress watermark exposed by the spawn adapter
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/query-process.ts, src/claude-runtime.ts, src/mcp-server.ts, tests/int-cc-contracts.mjs, tests/unit-query-process.mjs; skills tdd, vitest (node:test here)
  - Inputs: this record's Exploration and Decisions; Oracle design probe description
  - Dependencies: none
  - Output: passing contract test + adapter API (per-frame sequence, yielded/consumed classification, acknowledgements, reduced watermark, per-request stored ingress sequence) with stalled-consumer unit tests for failures before and after the fence; qualified-configuration note (executable version, effective flags, api_retry origin discriminator yes/no)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/query-process.ts, src/claude-runtime.ts, tests/int-cc-contracts.mjs (or new tests/int-fallback-ordering.mjs), tests/unit-query-process.mjs
  - Interface boundaries: SDK custom spawn hook; QueryProcess public surface used by index.ts
  - Focused check and PASS evidence: contract test and unit-query-process pass; bridge typecheck exit 0
  - Return milestone: contract evidence and adapter API ready for the coordinator
  - Stop / reassessment: if the pinned CLI does not order frames before the first tools/call, stop and return evidence (fence decision must be reopened)
- [x] AC-1: Fallback batch coordinator with single publish gate
  - Outcome: staged same-id fallback batches commit all served calls in one Pi turn only at the correlated-dispatch fence; failing watchdog; clean EOF fails; timer paths removed
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/index.ts (processAssistantMessage, endToolUseTurn, consumeQueryMessages, streamClaudeAgentSdk, reportHeldRateLimit), src/query-state.ts, src/mcp-server.ts
  - Inputs: accepted T1 adapter API and contract evidence
  - Dependencies: AC-2 task accepted
  - Output: coordinator implementation with unit replays for AC-1, AC-2 watchdog, AC-5
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, src/mcp-server.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-nonstreaming-fallback.mjs
  - Interface boundaries: Pi AssistantMessageEventStream terminal semantics; MCP handler/result routing; session recording
  - Focused check and PASS evidence: focused fallback tests pass incl. interleaved replay and >100 ms fragments; existing streaming tests pass
  - Return milestone: coordinator merged in working tree with green focused tests
  - Stop / reassessment: any need to change normal streaming semantics or persistence identity returns to root
- [x] AC-3: Failure contract wiring into the coordinator
  - Outcome: every AC-3 signal observed before publish revokes the batch with one terminal error carrying an observed actionable cause and no tool execution
  - Known entrypoints and skill paths: src/index.ts, src/mcp-server.ts, src/query-process.ts, src/cc-child.ts, tests/unit-query-lifecycle.mjs, tests/unit-mcp-server.mjs, tests/unit-fallback-parallel-tool-calls.mjs
  - Inputs: accepted coordinator
  - Dependencies: AC-1 task accepted
  - Output: wiring plus one replay/probe per signal class listed in AC-3, including a fallback precommit recording-fault test, caught post-exit save rejection with the updated text-only save-fault fixture (visible error, no retry, no host exit), and revised wrong-init expectation
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/mcp-server.ts, src/query-process.ts, tests/unit-query-lifecycle.mjs, tests/unit-mcp-server.mjs, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: MCP SDK protocol error replies; SDK iterator cleanup; saveSessionState CAS/ownership
  - Focused check and PASS evidence: per-signal replays pass; a signal table with file:line returned for review
  - Return milestone: wiring complete with signal table
  - Stop / reassessment: a signal requiring post-publish guarantees returns to root
- [x] AC-4: Retry replacement semantics
  - Outcome: main-attempt api_retry/refusal retry invalidates the staged batch without killing the query; replacement streaming or fallback attempt delivered; side/subagent retries ignored when T1 found a verified origin discriminator, otherwise ambiguous retries during a staged batch invalidate it per AC-4's fail-safe policy
  - Known entrypoints and skill paths: src/index.ts consume loop retry classification; tests/unit-fallback-parallel-tool-calls.mjs
  - Inputs: accepted coordinator
  - Dependencies: AC-1 task accepted
  - Output: retry handling with retry-to-streaming and retry-to-fallback replays, plus a side/subagent retry regression check (ignored with a verified discriminator, or fail-safe invalidation bounded by the watchdog without one)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: SDK api_retry and refusal retry message shapes
  - Focused check and PASS evidence: retry replays pass; no query kill on api_retry
  - Return milestone: retry replays green
  - Stop / reassessment: only retry evidence not covered by AC-4's settled policy (e.g. a discriminator that contradicts T1, or retries that cannot be bounded by the watchdog) returns to root
- [x] AC-4: Order stale MCP facts against retry transitions (final-verification FAIL repair)
  - Outcome: MCP failure facts (cancellation, rejection) keep their raw ingress sequence and are applied in order relative to attempt transitions, so a cancellation of a retired attempt ingressed after the retry cannot kill a valid replacement; late old-message frames that reveal tool ids not seen at retry time retire those ids, and any already-parked stale MCP handler is settled so it cannot block serial replacement dispatch
  - Known entrypoints and skill paths: src/query-process.ts ~85–128; src/index.ts ~953–987, ~1257–1274, ~1840–1853, ~1900–1911; tests/unit-fallback-parallel-tool-calls.mjs
  - Inputs: final-verification FAIL (Oracle task subtask_thoth-oracle_1795632804210_5bdc0118) replays E1 and E2
  - Dependencies: AC-4, AC-3 tasks accepted
  - Output: fix plus installed-SDK replays: (E1) one chunk old assistant → api_retry → stale call + cancellation → replacement + fence publishes the replacement; cancellation before retry still fails; (E2) late frame with an old id unseen at retry whose MCP call parks → stale handler settled, replacement published
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/query-process.ts, src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs
  - Interface boundaries: MCP handler settle results for stale ids must not reach Pi or the replacement batch
  - Focused check and PASS evidence: E1/E2 replays pass; bridge typecheck, test:unit, int-fallback-ordering, build pass
  - Return milestone: repair green
  - Stop / reassessment: an ordering that cannot be decided from ingress sequence returns to root
- [x] AC-3: Reduce every SDK-consumed raw fact in wire order (final-verification round 2 FAIL repair)
  - Outcome: host-only idle, MCP cancellations/rejections and any other SDK-consumed raw fact that affects a batch are reduced as one sequenced fact stream, interleaved by ingress sequence with SDK-yielded frames and attempt transitions (retry, replacement, fence, commit check incl. AwaitReplacement), so a relevant idle or failure is never skipped across a retry nor overtaken by a later fact; wire order is preferred for cause attribution (advisory per AC-3); no relevant failure may be missed
  - Known entrypoints and skill paths: src/query-process.ts ~97–100; src/index.ts ~1185, ~1212–1230, ~1857–1883; tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs
  - Inputs: final-verification round 2 FAIL (Oracle task subtask_thoth-oracle_1795633579630_f17baaf3) replay "idle"
  - Dependencies: AC-4 stale-fact repair accepted
  - Output: generalized ordered raw-fact reduction plus same-chunk installed-SDK replays: old assistant → host-only idle → retry → replacement → fence fails; idle after retry while awaiting replacement fails; host-only idle then MCP cancellation fails with one error (idle preferred as cause, advisory); idle-before-batch control unchanged; prior E1/E2 replays still pass
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/query-process.ts, src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs
  - Interface boundaries: yielded-frame reduction and acknowledgement order unchanged
  - Focused check and PASS evidence: new and prior replays pass; bridge typecheck, test:unit, int-fallback-ordering, build pass
  - Return milestone: repair green with a list of every SDK-consumed raw frame kind and its effect
  - Stop / reassessment: a raw fact whose effect cannot be ordered by ingress sequence returns to root
- [x] AC-2: Fail closed on queued MCP rejections, inverted dispatch order and reader-induced teardown (final-verification round 3 FAIL repair)
  - Outcome: (a) malformed bridge tools/call requests that cannot be correlated (e.g. missing metadata, schema errors) and SDK routing rejections for a currently staged id (e.g. a request routed to an unregistered MCP server) are reduced as ordered failures on either side of the fence, while unrelated or retired ids stay inert; (b) the fence is the earliest validated dispatch for any staged id, and a dispatch that precedes a staged id's own assistant frame (inverted frame-before-dispatch order) fails the batch; (c) reader-induced teardown (MCP close caused by a malformed frame) is routed through the ordered failure path so the turn still fails with one explicit error (keeping an earlier idle as cause is preferred, advisory)
  - Known entrypoints and skill paths: src/index.ts ~996–1002, ~1194–1212, ~1223–1235; src/mcp-server.ts ~119–128; src/query-process.ts ~69–75; tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-mcp-server.mjs, tests/unit-query-process.mjs
  - Inputs: final-verification round 3 FAIL (Oracle task subtask_thoth-oracle_1795635682356_f218b4a3) replays E1–E3
  - Dependencies: AC-3 ordered-reducer repair accepted
  - Output: fixes plus installed-SDK replays for E1 (both sides of the fence; unregistered-server routing), E2 (A → call B → assistant B → call A fails), E3 (idle then malformed result fails with one error; idle as cause preferred, advisory), with unrelated/retired-id controls; all prior replays green
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/mcp-server.ts, src/query-process.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-mcp-server.mjs, tests/unit-query-process.mjs
  - Interface boundaries: inert handling for unrelated or retired ids preserved; normal streaming unchanged
  - Focused check and PASS evidence: new and prior replays pass; bridge typecheck, test:unit, ordering contract, build pass
  - Return milestone: repair green with an updated control_request classification table
  - Stop / reassessment: a case whose correct effect is ambiguous under AC-2/AC-3 returns to root
- [x] AC-3: Fail on cancellation under duplicate outer request ids and on SDK permission rejection of a staged tool (final-verification round 4 FAIL repair)
  - Outcome: (E1) cancellation tracking follows the SDK's live owner of an outer control request id, so a duplicate outer id for an unrelated call (which the SDK skips while the first is in flight) cannot hide a cancellation of a staged call; (E2) an SDK error reply to a `can_use_tool` control request for a staged tool id (e.g. "canUseTool callback is not provided") is reduced in wire order as a failure of that staged id before any hand-over
  - Known entrypoints and skill paths: src/query-process.ts ~135–139, ~160, ~177–186; src/index.ts ~1183, ~2680; tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs
  - Inputs: final-verification round 4 FAIL (Oracle task subtask_thoth-oracle_1795636538828_821f43c4) replays E1, E2; Clarifications acceptance amendment
  - Dependencies: AC-2 round-3 repair accepted
  - Output: fixes plus isolated installed-SDK replays for E1 and E2 proving the named failure defeats an otherwise valid fence with exactly one terminal error and no tool execution, with controls (non-duplicate cancellation, unrelated-id permission traffic, normal permission flow unaffected); prior replays that combine several failures are aligned so they assert one terminal error, no hand-over and an observed actionable cause (no specific cause required); all replays green
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/query-process.ts, src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs
  - Interface boundaries: cause attribution changes are not required; ordinary permission and streaming behavior unchanged
  - Focused check and PASS evidence: E1/E2 replays pass; bridge typecheck, test:unit, ordering contract, build pass
  - Return milestone: repair green
  - Stop / reassessment: a case where correct handling needs CC behavior beyond SDK 0.3.321 evidence returns to root
- [x] AC-6: Nested MCP request-id collisions fail closed; post-publish permission denials keep existing continuation routing (final-verification round 5 FAIL repair)
  - Outcome: (E1) a nested JSON-RPC request id reused across different outer requests while a staged dispatch with that id is in flight is reduced as an ordered failure of the staged batch, so it can neither hide a staged cancellation nor move the earliest-dispatch fence; (E2) the SDK `permission_denied` frame for an already-published (non-staged) tool call no longer ends the query through the fallback fast path: the fallback failure path applies only to staged ids, and published denials keep the existing rejected-call recording and matching-continuation error routing
  - Known entrypoints and skill paths: src/query-process.ts ~172–193; src/index.ts ~1231–1269, ~1792–1794, ~1936–1941, ~1957–1975, ~2370–2377; tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs, existing rejected-call tests
  - Inputs: final-verification round 5 FAIL (Oracle task subtask_thoth-oracle_1795637816907_ec7ef2e1) replays E1, E2
  - Dependencies: round-4 repair row accepted
  - Output: fixes plus installed-SDK replays: E1 cancellation-under-nested-id-reuse and fence-shift variants fail with one error and no hand-over, non-reuse controls unchanged; E2 streaming hand-over → echo → permission_denied → CC tool-result rejection yields one error on the matching continuation (same as without permission_denied), staged-id permission_denied still fails the batch
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/query-process.ts, src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs, the existing rejected-call test file if a regression test belongs there
  - Interface boundaries: canonical requirement "Claude bridge surfaces rejected tool calls" behavior preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, test:unit, ordering contract, build pass
  - Return milestone: repair green
  - Stop / reassessment: an E2 fix that would change existing rejected-call semantics returns to root
- [x] AC-3: Retain pre-staging rejections by tool-use id for the attempt (final-verification round 6 FAIL repair)
  - Outcome: a rejection observed for a tool-use id before that id is staged (permission_denied, unknown tool name, unregistered MCP route) is retained as an ordered, attempt-scoped fact keyed by tool-use id and vetoes hand-over as soon as that id joins the staged batch; unrelated and retired ids stay inert; published-call rejection routing unchanged
  - Known entrypoints and skill paths: src/index.ts ~1216–1231, ~1804–1807, ~1882–1897; tests/unit-fallback-parallel-tool-calls.mjs ~657–681
  - Inputs: final-verification round 6 FAIL (Oracle task subtask_thoth-oracle_1795638578411_1dc1c759) replay E1 (assistant A → rejection of B → assistant B → valid dispatch A, three rejection variants)
  - Dependencies: round-5 repair row accepted
  - Output: fix plus installed-SDK replays for the three variants (one error, no hand-over) with controls (rejection for an id never staged in the attempt stays inert; retired-attempt rejection inert; post-publish rejection routing unchanged)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, src/query-process.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: canonical rejected-call requirement preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, test:unit, ordering contract, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-3: Fail-closed allowlist during the staged fallback window (final-verification round 7 FAIL redesign)
  - Outcome: Decisions "Fail-closed allowlist while staged" implemented in the ordered reducer; round-7 replays (stale dispatch masking a replacement rejection; sequential nested-id reuse hiding a cancellation; uncorrelatable schema-error reply before the first tool block) end with exactly one error and no hand-over; all prior safety replays still fail closed; the happy path still publishes all calls in one turn, proven by a non-skipped integration check that drives the real bundled CLI 2.1.321 wire through the production reducer and publish gate (not only the MCP stub) and asserts the allowlist decision for every frame up to actual publish, including frames ingressed after the fence, plus the reopened root live check; normal streaming, published-call rejection routing, steer, abort and persistence unchanged
  - Known entrypoints and skill paths: src/index.ts ordered reduction (~1187), staging veto (~1325), tool-result routing (~1791), retry boundary (~1960); src/query-process.ts (~174–229); src/query-state.ts (~151); tests/unit-fallback-parallel-tool-calls.mjs; tests/int-fallback-ordering.mjs
  - Inputs: final-verification round 7 FAIL (Oracle task subtask_thoth-oracle_1795639542933_a8baaa7b) E1–E3; user decision Clarifications "Fail-closed allowlist"
  - Dependencies: round-6 repair row accepted
  - Additional required tests: Decisions "Window and attempt dispositions" (pre-staging no-id failure before any frame and after narration, ordinary-streaming control, AwaitReplacement stale inert vs no-id retained, post-replacement-staging stale fails closed with superseded expectations listed)
  - Output: allowlist reducer with the inert set enumerated in one place, one test per allowlisted entry, a generic test that an arbitrary unlisted frame in the window fails closed, the three round-7 replays, existing replays green (multi-failure assertions per Cause attribution); removed per-id correlation that became redundant, listed in the report
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, src/query-process.ts, src/mcp-server.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-query-process.mjs, tests/int-fallback-ordering.mjs
  - Interface boundaries: durable delta and canonical rejected-call requirement preserved; normal streaming path unchanged
  - Focused check and PASS evidence: new and prior replays pass; ordering contract 1/1 on CLI 2.1.321 with the qualified happy-path frames inside the allowlist; bridge typecheck, test:unit, build pass
  - Return milestone: repair green
  - Stop / reassessment: if the qualified happy path emits a frame in the window that cannot be justified as inert, return to root before allowlisting it
- [x] AC-3: Refusal stop_reason and hard quota denial fail closed; Pi's own echoed tool results do not poison a later fallback (final-verification round 8 FAIL repair)
  - Outcome: (R) a fallback assistant frame whose message has stop_reason=refusal (no error field) latches a terminal assistant failure before its blocks are admitted, so the batch never publishes; (Q) a rate-limit/quota event that is a hard denial (status=rejected, e.g. errorCode=credits_required, isUsingOverage=false, with or without overageStatus) is outside the inert set and latches a failure; only genuinely informational quota/overage frames stay inert; (C) CC's echo of tool results that Pi itself delivered (including isError=true results) on the same query is recognized as a confirmed Pi result echo and is not recorded as a CC rejection in a later Pi stream's pre-staging latch; CC-originated rejections before staging and all staged-window checks stay strict
  - Known entrypoints and skill paths: src/index.ts ~1211, ~1914–1927, ~2066–2089; tests/unit-fallback-parallel-tool-calls.mjs ~834; tests/int-fallback-ordering.mjs
  - Inputs: final-verification round 8 FAIL (Oracle task subtask_thoth-oracle_1795641436338_081bf5af) R, Q, C
  - Dependencies: allowlist row accepted
  - Output: fixes plus replays: R (real-CLI or installed-SDK refusal-marked fallback batch → one error, no hand-over; normal refusal text-only turn unchanged), Q (hard denial after fence and before silent fallback → one error; active-overage informational control still inert), C (two overload recoveries on one query with Pi isError=true results echoed before the second fallback → second batch publishes; a CC-originated rejection in the same position still fails)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, src/query-process.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/int-fallback-ordering.mjs
  - Interface boundaries: allowlist dispositions and canonical rejected-call requirement preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, test:unit, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: if a Pi result echo cannot be distinguished from a CC rejection by evidence the bridge already owns (delivered result identity), return to root
- [x] AC-3: Identity-based Pi echo recognition (with AC-5: EOF after a narration-only staged fragment fails; final-verification round 9 FAIL repair)
  - Outcome: (C) a pre-staging CLI tool_result whose tool-use id is one Pi delivered a result for to an MCP handler on the same query is recognized as the echo of that delivered result by identity only (one-shot, consumed on match), without comparing payload, because the CLI transforms payloads (trims whitespace, drops images); a tool_result for an id Pi never delivered stays a CC rejection; post-staging checks stay strict; (EOF) a clean child EOF without an SDK result while any fallback fragment is staged in the attempt (including narration-only, e.g. text with stop_reason=tool_use) ends with one explicit error; a confirmed text-only reply (SDK result received) and ordinary streaming EOF behavior are unchanged
  - Known entrypoints and skill paths: src/index.ts ~1909–1921, ~2113, ~2384–2388; src/query-state.ts ~89, ~169–171; tests/int-fallback-ordering.mjs ~262; tests/unit-fallback-parallel-tool-calls.mjs
  - Inputs: final-verification round 9 FAIL (Oracle task subtask_thoth-oracle_1795642348544_6037c425) C, EOF
  - Dependencies: round-8 repair row accepted
  - Output: fixes plus tests: production-gate variants on CLI 2.1.321 with whitespace-trimmed and image-dropped Pi error echoes publish the second batch; tool_result for a never-delivered id before staging still fails; replay of narration fragment (stop_reason=tool_use) then clean EOF without result → one error; text-only-with-result and ordinary streaming EOF controls unchanged; payload-matching code removed
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/int-fallback-ordering.mjs
  - Interface boundaries: allowlist dispositions and canonical rejected-call requirement preserved
  - Focused check and PASS evidence: new tests pass; bridge typecheck, test:unit, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-3: Bounded termination invariant for every unpublished staged state (final-verification round 10 FAIL repair)
  - Outcome: (E1) whenever any fallback fragment (narration included) is staged and unpublished, or the attempt is in AwaitReplacement, a failing deadline is armed; replacement narration never cancels it without arming another; stdout EOF with a live child while narration is staged ends within the bound with one error; (E2) every terminal error (including SDK success-with-error results after staged narration) is pushed to Pi before any iterator.return()/teardown await, never gated on cleanup; invariant audited across all terminal paths
  - Known entrypoints and skill paths: src/index.ts ~1426, ~2131–2134, ~2196–2226, ~2347–2374
  - Inputs: final-verification round 10 FAIL (Oracle task subtask_thoth-oracle_1795643233401_b1694a25) E1, E2
  - Dependencies: round-9 repair row accepted
  - Output: fixes plus simulated-time replays: tool → retry → narration → silence emits one watchdog error; narration → stdout EOF with live child emits one error within the bound; success-with-error after staged narration with blocked iterator.return() emits the error immediately; controls (retry-only watchdog, valid replacement publishes, text-only success) unchanged; list of audited terminal paths
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved; ordinary streaming unchanged
  - Focused check and PASS evidence: new replays pass; bridge typecheck, test:unit, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-3: Original deadline survives successive narration ids; blocked-cleanup findings compared against base (final-verification round 11 FAIL repair)
  - Outcome: (E1) the original fallback deadline is preserved until a permitted exit from staging (publish, confirmed text success, ordinary streaming replacement, terminal failure, or a retry invalidation that hands it to AwaitReplacement); a new unconfirmed narration message id never re-arms or extends it; (E2/E3) each blocked-cleanup finding is replayed on the base commit a41cfa92 and on this change with the same harness: a finding introduced or worsened by this change is fixed (shutdown requested after error and snapshot without awaiting iterator.return(); acknowledged rejection prefix committed before teardown and saved after child exit independently of reader cleanup); a finding with identical base behavior is documented as a pre-existing residual per Clarifications "Blocked SDK cleanup scope"
  - Known entrypoints and skill paths: src/index.ts ~1164–1173, ~2049–2054, ~2134–2167, ~2245–2256, ~2741, ~3070–3074, ~3178–3180
  - Inputs: final-verification round 11 FAIL (Oracle task subtask_thoth-oracle_1795644230485_ffa9d2a3) E1–E3
  - Dependencies: round-10 repair row accepted
  - Output: E1 fix plus simulated-time replay (narration A, narration B at 119 s, silence → one error at 120 s) with controls; for E2 and E3 a per-observable base-vs-change comparison (isolation: temporary `git worktree` of a41cfa92 outside the repo, removed afterwards) where both versions are driven from the same cleanup-entry barrier (iterator.return() held), each run is first shown to have reached the intended failure, and observables are compared separately at matched checkpoints — E2: (a) terminal delivery, (b) shutdown request/child exit, (c) same-session next-call progress; E3: using a rejection both versions recognize, (a) one error/no hand-over, (b) in-memory acknowledged-prefix commit at child exit, (c) disk save at child exit, all while cleanup stays held; any observable excluded by AC-3's blocked-cleanup exception (terminal delivery, precommit preparation, in-memory prefix commit, query stop, no result for an undispatched call) must pass on this change regardless of base; any other observable that is worse than base is fixed with a test; an observable identical to base at the matched held checkpoint is eligible as a residual only after both runs then release cleanup and each reaches the expected outcome (the save lands with the acknowledged prefix, the child exits, the next same-session call progresses) within a matched bounded completion checkpoint; if the change fails to recover after release while base does, it is a regression and is fixed; eligible residuals are documented (behavior, commits, trigger, follow-up); an unmatched path or checkpoint is inconclusive and returns to root, never a residual
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs, tests/unit-error-result.mjs, tests/unit-query-lifecycle.mjs
  - Interface boundaries: allowlist dispositions and safety guarantees preserved; ordinary streaming unchanged
  - Focused check and PASS evidence: new replays pass; bridge typecheck, test:unit, ordering + production integration, build pass; comparison evidence for E2/E3
  - Return milestone: repair green plus comparison report
  - Stop / reassessment: if a regression fix would require changing the SDK iterator ownership model broadly, return to root with the comparison first
- [x] AC-3: onResponse hook failures scoped to the owning Pi stream and attempt (final-verification round 12 FAIL repair)
  - Outcome: an onResponse hook rejection is recorded in the latch of the owning Pi stream and current attempt and follows Latch states (provisional until that attempt stages a served tool; terminal only then); a rejection observed during AwaitReplacement belongs to the replacement attempt and does not terminate before a served tool stages there; a provisional rejection from an invalidated attempt is discarded at invalidation and never vetoes a clean replacement; a rejection in the same attempt that stages a served tool still vetoes; ordinary streaming keeps today's log-and-continue hook behavior
  - Known entrypoints and skill paths: src/index.ts ~387–398, ~2098–2106, ~2204–2206; src/query-state.ts ~169–172
  - Inputs: final-verification round 12 FAIL (Oracle task subtask_thoth-oracle_1795645788138_940a092e) hook, carry
  - Dependencies: round-11 repair row accepted
  - Output: fix plus installed-SDK replays: staged tool → api_retry → allowed_warning with rejecting hook → valid streaming replacement succeeds and valid text-only replacement succeeds; provisional hook rejection during old narration → api_retry → clean replacement fallback publishes at its fence; controls: hook rejection in the replacement attempt that stages a tool → one error; resolving-hook control publishes
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions and AC-3 hook clause preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, test:unit, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-3: Deadline armed from raw fallback evidence; unconfirmed narration stays private; published-call rejections routed independently (final-verification round 13 FAIL repair)
  - Outcome: (E1) the fallback deadline is armed from raw ingress evidence of a fallback reply (first non-streaming assistant frame ingressed), independently of whether the reducer is blocked by a pending onResponse hook; the hook outcome stays in the publish gate; a pending hook can never strand the turn past the deadline; (E2) unconfirmed fallback narration from any message id stays private (not emitted to Pi, not registered in assistant recording state or turnOutput) until a permitted exit; api_retry discards all of it; (E3) a CC rejection of a tool id already published to Pi in an earlier turn is routed by the existing rejected-call recording and continuation routing regardless of any new fallback latch or narration, never made provisional or dropped by a later text success
  - Known entrypoints and skill paths: src/index.ts ~1457, ~2052, ~2165–2172, ~2268–2284
  - Inputs: final-verification round 13 FAIL (Oracle task subtask_thoth-oracle_1795646515101_cd679430) E1–E3
  - Dependencies: round-12 repair row accepted
  - Output: fixes plus replays: held onResponse → ingressed fallback tool and MCP call → 120 s → one error (and released-reject variant one error, no duplicate); narration A → narration B → api_retry → nothing from A in Pi, recording or turnOutput; previously published tool → narration → CC rejection → success result → matching continuation errors as without narration; controls unchanged
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions, canonical rejected-call requirement preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, test:unit, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-3: Genuine MCP disconnects always go through the owning attempt's provisional latch; unit command exits cleanly (final-verification round 14 FAIL repair)
  - Outcome: (E1) a genuine MCP disconnect is recorded in the owning Pi stream's current attempt latch regardless of watchdog/raw-evidence state (before raw ingress, during narration, during AwaitReplacement) and becomes terminal only once that attempt stages a served tool; a disconnect during AwaitReplacement followed by a text-only replacement completes as today's text success; EOF/reader-induced close exclusions unchanged; (E2) the standard bridge `test:unit` command exits on its own: replay harness children are explicitly closed and awaited
  - Known entrypoints and skill paths: src/index.ts ~999–1006; src/query-state.ts ~172–175; tests/unit-fallback-parallel-tool-calls.mjs ~835–859
  - Inputs: final-verification round 14 FAIL (Oracle task subtask_thoth-oracle_1795647701908_6bd89609) E1, E2
  - Dependencies: round-13 repair row accepted
  - Output: fix plus replays: disconnect before first raw fallback frame → later staging → one error, no hand-over; real Server.close during AwaitReplacement → text-only replacement → success; same close → tool replacement → one error; unmodified `test:unit` run (no force-exit) exits 0 with its count; no live replay child after tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs and any test file whose replay children leak
  - Interface boundaries: allowlist dispositions preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-3: Genuine MCP disconnect is a query-scoped sticky fact (final-verification round 15 FAIL repair)
  - Outcome: a genuine MCP disconnect (EOF/reader-induced close exclusions unchanged) is recorded once as a query-scoped sticky fact, not in any attempt latch, so it cannot be assigned to the wrong attempt or erased by retry reduction; from then on, any staging of a served fallback tool in that query (any attempt, any Pi stream on that query) ends with exactly one error and no hand-over; text-only and ordinary streaming completions are unaffected; rationale: after the bridge MCP server closes, no valid fence can follow, so ordering relative to retries is irrelevant
  - Known entrypoints and skill paths: src/index.ts ~999–1004, ~1215–1218, ~2152–2160; src/query-state.ts
  - Inputs: final-verification round 15 FAIL (Oracle task subtask_thoth-oracle_1795649023696_203686fc) E1, E2
  - Dependencies: round-14 repair row accepted
  - Output: fix plus held-consumer replays: old narration reduced, hook held, raw retry → tool → fence ingressed, real Server.close, release → one error; old tool staged, close after retry ingress but before reduction → text-only replacement → success; close after retry reduction → text-only success; round-14 controls unchanged
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-6: Disconnect fact bound to its SDK/MCP generation; owner-requested teardown excluded (final-verification round 16 FAIL repair)
  - Outcome: the sticky MCP disconnect fact is bound to the SDK query/MCP server generation that observed it; a close requested by the bridge itself (e.g. abandoning a query on the hook-initialization retry, discard, replacement) is never recorded as a genuine disconnect; a replacement SDK query with its own connected MCP transport starts with no inherited disconnect; a close from a stale generation never affects the current one
  - Known entrypoints and skill paths: src/index.ts ~999–1004, ~1456, ~2894, ~3025–3038, ~3192–3200; tests/unit-append-instructions.mjs
  - Inputs: final-verification round 16 FAIL (Oracle task subtask_thoth-oracle_1795649754567_5f0cc92e) E1, E2
  - Dependencies: round-15 repair row accepted
  - Output: fix plus installed-SDK resume replay: hook-init rejection → intentional close → hookless replacement → valid fallback batch publishes (done/toolUse); text-only control; a genuine close in the replacement generation still vetoes; round-15 held-consumer cases unchanged; audit of all bridge-initiated MCP closes
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-append-instructions.mjs, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved; resume/hook-init behavior unchanged
  - Focused check and PASS evidence: new replays pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-6: Recoverable MCP send errors are provisional, not query-fatal (final-verification round 17 FAIL repair)
  - Outcome: a recoverable MCP transport/send error (e.g. a failed tools/list reply) observed by the MCP server onerror wiring is recorded in the owning attempt's provisional latch and becomes terminal only if that attempt stages a served fallback tool; it never calls failLiveQuery by itself, so ordinary streaming and text-only turns behave as on base a41cfa92; genuine disconnects (generation-bound sticky fact) and post-publish routing unchanged
  - Known entrypoints and skill paths: src/index.ts ~994–1002
  - Inputs: final-verification round 17 FAIL (Oracle task subtask_thoth-oracle_1795650630520_65484a6f) E1
  - Dependencies: round-16 repair row accepted
  - Output: fix plus installed-SDK replays: one failed tools/list reply then a second tools/list → pre-streaming and narration-only variants complete done/stop; same fault then a served fallback tool staged → one error, no hand-over; genuine disconnect controls unchanged
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved
  - Focused check and PASS evidence: new replays pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-6: Restore base behavior outside the fallback window for newly-fatal ordinary paths (proactive, from round-17 audit)
  - Outcome: the paths the round-17 audit found newly terminal on ordinary (non-fallback) turns behave as on base a41cfa92 when no fallback fragment is staged/raw-evidenced in the owning attempt, and follow the attempt latch (provisional → terminal on served-tool staging) inside the fallback window: missing MCP tool-use metadata / malformed MCP traffic on a parked query with no open Pi stream (index.ts ~1335, ~1364); auth errors and aborted/error-marked tool-bearing assistant frames outside fallback (~2252–2255); initial prompt-push rejection (~3220, base logged it); conversation reset and matching transcript-write loss on ordinary turns (~2161–2162). Wrong-session init stays fatal as on base. Any item where base behavior is itself a hang or silent data loss is not restored but reported to root with evidence instead
  - Known entrypoints and skill paths: src/index.ts ~1335, ~1364, ~2161–2162, ~2252–2255, ~3220
  - Inputs: round-17 worker audit against a41cfa92 (task subtask_thoth-worker_1795651046746_0793182c)
  - Dependencies: round-17 repair row accepted
  - Output: per item: base behavior on ordinary turns restored (test comparing to base semantics) and fallback-window behavior via latch (test), or a reasoned report why restoring would reintroduce a hang/data loss
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, src/query-state.ts, tests/unit-fallback-parallel-tool-calls.mjs and the existing test files covering those paths
  - Interface boundaries: allowlist dispositions and safety guarantees preserved
  - Focused check and PASS evidence: new tests pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green plus per-item report
  - Stop / reassessment: items whose base behavior is unsafe return to root
- [x] AC-3: Orphan SDK control replies latch provisionally (final-verification round 18 FAIL repair)
  - Outcome: inbound control_response frames are correlated with live outbound SDK control request ids; a reply whose request id the SDK never sent or already retired (orphan/misrouted) is recorded in the owning attempt's provisional latch (terminal once a served fallback tool stages) and never fails an ordinary turn by itself
  - Known entrypoints and skill paths: src/query-process.ts ~148–152, ~227–233; src/index.ts ~1306–1308
  - Inputs: final-verification round 18 FAIL (Oracle task subtask_thoth-oracle_1795651989082_21d720d6) E1
  - Dependencies: round-17 and ordinary-path restore rows accepted
  - Output: fix plus installed-SDK replays: orphan success control_response → fallback fragments → valid fence → one error, no hand-over; same orphan then ordinary streaming / text-only → today's success; correlated replies (normal permission/control flow) unaffected
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/query-process.ts, src/index.ts, tests/unit-query-process.mjs, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved; ordinary control flow unchanged
  - Focused check and PASS evidence: new replays pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-3: Unparsed tool input in a fallback reply fails closed (final-verification round 19 FAIL repair)
  - Outcome: a fallback tool_use block whose input carries the pinned CLI's parse-failure marker (`__unparsedToolInput`, or any non-object input the CLI will reject) is a fallback violation in the owning attempt (terminal once a served tool stages, i.e. immediately for that block) so the batch never reaches Pi; ordinary streaming behavior for such blocks unchanged
  - Known entrypoints and skill paths: src/index.ts ~2021–2039, ~2298–2319; tests/int-fallback-ordering.mjs production harness
  - Inputs: final-verification round 19 FAIL (Oracle task subtask_thoth-oracle_1795653358044_cb7ed492) E1 (real CLI 2.1.321: alpha valid, beta input "malformed-args" → beta's __unparsedToolInput marker before alpha's fence → Pi received both calls; CLI later rejected beta with InputValidationError)
  - Dependencies: round-18 repair row accepted
  - Output: fix plus a non-skipped real-CLI sibling regression in tests/int-fallback-ordering.mjs (one error, no hand-over) and an installed-SDK unit replay; ordinary streaming control unchanged
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, tests/int-fallback-ordering.mjs, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved
  - Focused check and PASS evidence: new tests pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none beyond the safety contract
- [x] AC-1: Parse-failure marker matched by the pinned CLI's exact shape (final-verification round 20 FAIL repair)
  - Outcome: only the pinned CLI's actual parse-failure marker shape (input whose sole field is `__unparsedToolInput` holding the CLI's raw-string/length structure, as observed on 2.1.321) counts as unparsed input; valid object inputs that merely contain a field with that name are handed over normally
  - Known entrypoints and skill paths: src/index.ts ~1449–1450; tests/int-fallback-ordering.mjs
  - Inputs: final-verification round 20 FAIL (Oracle task subtask_thoth-oracle_1795654258284_c1424365) E1
  - Dependencies: round-19 repair row accepted
  - Output: fix plus a real-CLI valid-field control ({"__unparsedToolInput":false,"value":1} publishes) and the round-19 malformed regression still failing
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, tests/int-fallback-ordering.mjs, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved
  - Focused check and PASS evidence: new tests pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none
- [x] AC-3: Parse-failure marker matched as the pinned CLI recognizes it (final-verification round 21 FAIL repair)
  - Outcome: the fallback gate treats as unparsed input exactly what CLI 2.1.321 treats as a parse failure: sole outer key `__unparsedToolInput` whose value is an object with a string `raw` and a numeric `len`, extra inner fields allowed; wrappers with non-string `raw` or non-numeric `len` (which the CLI dispatches) and outer-extra objects publish normally
  - Known entrypoints and skill paths: src/index.ts ~1450–1459; tests/unit-fallback-parallel-tool-calls.mjs ~837–842; tests/int-fallback-ordering.mjs ~183–262
  - Inputs: final-verification round 21 FAIL (Oracle task subtask_thoth-oracle_1795655401404_8cf631f8) wire, guard
  - Dependencies: round-20 repair row accepted
  - Output: fix plus real-CLI regressions without injected stdout (inner-extra marker → one error, no hand-over; non-string raw and non-numeric len controls publish; outer-extra control publishes); the misleading unit expectation replaced
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, tests/int-fallback-ordering.mjs, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: allowlist dispositions preserved
  - Focused check and PASS evidence: new tests pass; bridge typecheck, unmodified test:unit exits cleanly, ordering + production integration, build pass
  - Return milestone: repair green
  - Stop / reassessment: none
- [x] AC-5: Clean child EOF with an unpublished fallback batch fails explicitly
  - Outcome: clean stdout EOF/iterator exhaustion without a result while a fallback batch is unpublished ends the turn with an explicit error; the current toolUse expectation is replaced
  - Known entrypoints and skill paths: src/index.ts consumeQueryMessages EOF path and unparked-result recovery; tests/unit-fallback-parallel-tool-calls.mjs
  - Inputs: accepted coordinator
  - Dependencies: AC-1 task accepted
  - Output: EOF handling with replay test
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/src/index.ts, tests/unit-fallback-parallel-tool-calls.mjs
  - Interface boundaries: existing unparked-result recovery for non-fallback turns stays unchanged
  - Focused check and PASS evidence: clean-EOF replay asserts one error terminal event and no tool execution
  - Return milestone: EOF replay green
  - Stop / reassessment: if ordinary streaming EOF recovery would change, return to root
- [x] AC-6: Non-regression, simplify pass and changelog
  - Outcome: behavior-preserving simplify pass; CHANGELOG entry; full bridge and root checks green
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/CHANGELOG.md; skill simplify
  - Inputs: accepted AC-1..AC-5 implementation
  - Dependencies: AC-3, AC-4 and AC-5 tasks accepted
  - Output: green check outputs (bridge typecheck, test:unit, build; root check:ci, typecheck)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge/CHANGELOG.md and simplify-touched files within the package
  - Interface boundaries: none beyond the package
  - Focused check and PASS evidence: all listed commands exit 0
  - Return milestone: final diff ready for live check
  - Stop / reassessment: failures outside the package are reported, not fixed
- [x] AC-7: Live fault-injection proxy check (reopened: rerun on the allowlist build; OK-Q 2026-11-25 21:15Z)
  - Outcome: real Pi + Claude through proxy completes the forced non-streaming multi-call batch
  - Known entrypoints and skill paths: %TEMP%/bridge-repro-tools/proxy529.mjs; Orca terminal BRIDGE-REPRO
  - Inputs: built bridge from AC-6
  - Dependencies: AC-6 task accepted
  - Output: proxy log showing 3 injected mid-stream errors then stream:false; Pi screen showing all calls and final answer
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: proxy log + "OK" final answer
  - Return milestone: evidence captured
  - Stop / reassessment: hang or missing calls returns to worker
- [x] AC-8: Changelog entry and declared durable delta ready for archive sync
  - Outcome: bridge CHANGELOG documents the final behavior (fixes upstream #237, supersedes the quiet-timer approach of PR #225); the ADDED pi-ecosystem delta is declared with a reviewed source digest so archive can sync it after an independent PASS
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/CHANGELOG.md; skills/thoth-sdd, skills/thoth-archive
  - Inputs: AC-6 changelog update; this record's Durable deltas and Verification Source line
  - Dependencies: AC-6 task accepted
  - Output: changelog text in the diff; delta and source digest in this record
  - Owner: thoth-worker (changelog), root (record)
  - Writes: pi-packages/pi-claude-bridge/CHANGELOG.md; this record
  - Interface boundaries: final Oracle verification and archive follow as the SDD verify/closeout/archive gates, not as a task row
  - Focused check and PASS evidence: CHANGELOG.md:10 entry present; validator verify passes with the source digest
  - Return milestone: ready for final verification
  - Stop / reassessment: stale source digest returns to root

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Round 4 fresh Oracle OKAY (task subtask_thoth-oracle_1795629585869_c092c2dc) after REJECT rounds 1–3 repaired in this record.
**Implementation**: AUTHORIZED
User selected Implement after plan-review OKAY (2026-11-25).
Acceptance amendment (cause attribution best-effort) chosen by the user after final-verification round 4, including authorization to fix E1/E2; amendment plan review round 2 OKAY (Oracle task subtask_thoth-oracle_1795637029280_5168d742) after a round-1 REJECT repaired in this record.
Fail-closed allowlist redesign chosen by the user after final-verification round 7 (2026-11-25); amendment plan review OKAY at round 3 (Oracle task subtask_thoth-oracle_1795640279873_dfb96187) after two REJECTs repaired in this record. Implementation covered by the user's choice of the redesign path (which included implementation and verification).
Verification closure rule chosen by the user after final-verification round 20 (2026-11-26); amendment plan review OKAY at round 3 (Oracle task subtask_thoth-oracle_1795655339818_797e537c) after two REJECTs repaired in this record.
Blocked-cleanup scope decision chosen by the user after final-verification round 11 (2026-11-25), including implementation; amendment plan review OKAY at round 3 (Oracle task subtask_thoth-oracle_1795644992926_83a3c46b) after two REJECTs repaired in this record.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: f54325ae8bc8cceec660cb5ff10ab7a1200179b1361f32a4e9861c68f624fa93
Oracle task: subtask_thoth-oracle_1795656282297_badd0765 (final verification round 22).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. No blocker under either closure branch or the unchanged obligations. Three residuals remain. The durable delta is ready for archive sync; it has not been applied.",
  "evidence": [
    {"id":"unit","kind":"test","locator":"pi-packages/pi-claude-bridge: pnpm run test:unit","claim":"1009 passed, zero failed or skipped; the unmodified command exited 0 without force-exit.","basis":"observed","uncertainty":""},
    {"id":"wire","kind":"integration","locator":"pi-packages/pi-claude-bridge/tests/int-fallback-ordering.mjs:84–319","claim":"12/12 passed without skips. SDK 0.3.321 / CLI 2.1.321 emitted all fragments before serial dispatch. The production gate reduced through the ingress watermark. Native stdout controls confirmed malformed markers fail and all valid marker lookalikes publish.","basis":"observed","uncertainty":"The after-fence keep-alive was injected and is not evidence of native CLI output."},
    {"id":"bounds","kind":"test","locator":"pi-packages/pi-claude-bridge/src/index.ts:1391–1522; tests/unit-fallback-parallel-tool-calls.mjs:148–300","claim":"Missing-fence watchdog, result and EOF controls passed. A read-only real-CLI probe changed a checked launch flag; despite a valid native dispatch, Pi received exactly one unqualified-configuration error and no hand-over.","basis":"observed","uncertainty":""},
    {"id":"cleanup","kind":"comparison","locator":"pi-packages/pi-claude-bridge/tests/unit-query-lifecycle.mjs:177–263; base a41cfa92","claim":"Matched ordinary streaming rejection: both revisions delivered one error, stopped the child, committed the acknowledged prefix in memory, and progressed on the next call. Disk lagged only while iterator cleanup was held and caught up after release. Current fallback rejection saved the prefix even while cleanup was held. No undispatched result was recorded.","basis":"observed","uncertainty":""},
    {"id":"causes","kind":"test","locator":"pi-packages/pi-claude-bridge/tests/unit-fallback-parallel-tool-calls.mjs:929–942,958–959,1581–1584","claim":"Late-fragment/idle and reader-fault/idle controls retained one error and no hand-over; competing causes need not follow wire order.","basis":"observed","uncertainty":"These are installed-SDK replays, not native CLI traces."},
    {"id":"redacted","kind":"probe","locator":"pi-packages/pi-claude-bridge/tests/int-fallback-ordering.mjs:31–39,173–281; src/index.ts:2330–2352","claim":"Using the production harness with only fake API content changed, native CLI 2.1.321 emitted an opaque redacted_thinking block followed by valid tool fragments. Pi received one unsupported-content error and no hand-over. No stdout was injected.","basis":"observed","uncertainty":"The trigger was supplied by the fake Messages API; live-service frequency is unknown."},
    {"id":"checks","kind":"check","locator":"Bridge typecheck/build; root check:ci/typecheck; thoth-sdd --through verify; bridge CHANGELOG.md:10","claim":"Typechecks, root CI check and verify validator exited 0. A read-only esbuild run using the package build settings matched the worker bundle byte-for-byte. Changelog references #237/#225; the durable delta is distinct from the canonical rejected-call requirement and its source digest matches.","basis":"observed","uncertainty":""},
    {"id":"live","kind":"trace","locator":"%TEMP%/bridge-repro-tools/proxy.log, 2026-11-26 01:23Z","claim":"The log corroborates three mid-stream overloads, a stream=false HTTP 200, and a final streaming HTTP 200. Root witnessed Pi execute six then three calls and answer OK-AE.","basis":"observed","uncertainty":"Pi execution and answer are root-witnessed, not independently rerun."}
  ],
  "verification": [
    {"check":"AC-1/2/4/5: batching, fence, retry, qualification and bounds","method":"Inspect gate and run full unit suite, native ordering/production integration and unqualified probe","outcome":"pass","evidenceIds":["unit","wire","bounds"],"reason":"Required controls passed, including delayed fragments, replay interleaving and retry replacements."},
    {"check":"AC-3/6: failure signals, ordinary controls and canonical rejected-call duties","method":"Review failure and rejection paths; run named unit controls and matched base comparison","outcome":"pass","evidenceIds":["unit","wire","cleanup","causes","redacted"],"reason":"No evidenced safety failure or ordinary regression; ordinary disk delay meets the narrow cleanup exception."},
    {"check":"AC-7/8: build, root checks, live recovery and archive readiness","method":"Read-only build comparison, exit checks, proxy log and source digest validation","outcome":"pass","evidenceIds":["unit","checks","live"],"reason":"Required evidence is present; canonical sync belongs to archive."}
  ],
  "risks": [
    {"description":"Ordinary streaming rejection with iterator.return() held delays only the disk save. Matched base/current checkpoints and recovery establish no branch (a) safety failure or branch (b) regression. Bridge maintainer: decouple this save from iterator cleanup.","severity":"low","blocking":false,"evidenceIds":["cleanup"]},
    {"description":"With competing late-fragment/idle or reader-fault/idle failures, Pi may report a different observed cause than the earliest wire event. Replays retain one explicit error and no hand-over; neither branch blocks under the cause-attribution amendment. Bridge maintainer: improve first-cause diagnostics without delaying terminal delivery.","severity":"low","blocking":false,"evidenceIds":["causes"]},
    {"description":"A fallback containing an opaque redacted_thinking block before valid calls is conservatively rejected, as shown on native CLI stdout. This is a degraded-path explicit error, not unsafe hand-over, a hang, or a regression of a verified or ordinary path. Bridge maintainer: evaluate allowing opaque redacted narration and add a native-wire control.","severity":"low","blocking":false,"evidenceIds":["redacted"]}
  ],
  "openQuestions": [],
  "nextAction": "Root: closeout, then archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-bridge-fallback-batch-gate/claude-bridge-fallback-batch-gate.md",
    "reviewedRecordSha256": "f54325ae8bc8cceec660cb5ff10ab7a1200179b1361f32a4e9861c68f624fa93"
  }
}
```

- AC-1: PASS | real-CLI ordering + production integration 12/12 non-skipped (CLI 2.1.321); live overload check | all served calls of a non-streaming fallback published in one tool-use turn; OK-AE 2026-11-26 01:23Z
- AC-2: PASS | fence/watermark gate; missing-fence watchdog; unqualified-configuration probe | publish only at earliest correlated MCP dispatch with reducer through ingress watermark; one explicit error otherwise
- AC-3: PASS | 1009/1009 bridge unit (fail-closed allowlist, attempt latch, held-consumer and native-wire replays) | no hand-over after a relevant pre-hand-over failure; exactly one bounded explicit error; cause precedence best-effort
- AC-4: PASS | retry/AwaitReplacement replays incl. narration-only and silent fallback | retry invalidates the staged batch; valid replacement publishes at its own fence
- AC-5: PASS | clean-EOF replays incl. narration-only staged fragment | explicit error, no false success
- AC-6: PASS | ordinary streaming/text-only/steer/abort/persistence controls; matched base a41cfa92 comparison | ordinary behavior preserved outside declared exceptions (session-safety exception; blocked-cleanup residual)
- AC-7: PASS | bridge typecheck/build; root `pnpm run check:ci` and `pnpm run typecheck` exit 0; live proxy check | recorded above
- AC-8: PASS | bridge CHANGELOG.md:10 (#237/#225); ADDED pi-ecosystem delta ready for archive sync | canonical source digest matched

Residual risks (accepted under Clarifications "Verification closure rule"; follow-ups owned by the bridge maintainer):
- R1 Blocked-cleanup disk save: trigger — ordinary streaming CC rejection while SDK `iterator.return()` is held; evidence — matched base/current checkpoints (tests/unit-query-lifecycle.mjs:177–263): both deliver one error, stop the child, commit the acknowledged prefix in memory, disk catches up after release; why non-blocking — identical to base, recovers within bound, AC-3 blocked-cleanup exception; follow-up — decouple the ordinary-path disk save from SDK reader cleanup.
- R2 Cause attribution: trigger — competing late-fragment/idle or reader-fault/idle failures; evidence — installed-SDK replays (tests/unit-fallback-parallel-tool-calls.mjs:929–942, 958–959, 1581–1584) keep one error and no hand-over; why non-blocking — cause precedence is best-effort per the acceptance amendment; follow-up — improve first-cause diagnostics without delaying terminal delivery.
- R3 Opaque redacted_thinking in a fallback: trigger — fallback reply with a `redacted_thinking` block before valid tool calls; evidence — native CLI 2.1.321 stdout probe yields one unsupported-content error and no hand-over; why non-blocking — degraded-path false-positive explicit error, not unsafe and not a regression; follow-up — evaluate admitting opaque redacted narration in the allowlist with a native-wire control.
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:583b639449c0c73f32b72f6589cec3f258ed26e07b2c4ef3587d1962d69ab7f1

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
Follow-ups (bridge maintainer): R1 decouple ordinary-path disk save from SDK reader cleanup; R2 improve first-cause diagnostics; R3 evaluate admitting opaque redacted_thinking in the fallback allowlist with a native-wire control. Changes remain uncommitted in the working tree per user instruction.
