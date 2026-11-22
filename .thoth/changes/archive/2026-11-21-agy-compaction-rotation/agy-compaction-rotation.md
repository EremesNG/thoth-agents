# Change: agy-compaction-rotation

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: high

## Exploration

Upstream `EstebanForge/pi-extensions` `packages/pi-antigravity-bridge` commits `59376a72c`, `806e71291`, `79f8cde2f` and the compaction-relevant subset of `ec307b546` are unported. Read-only exploration at local HEAD `2eb4bbd3` (after the approval-gate safety sync `49d539e8`; paths relative to `pi-packages/pi-antigravity-bridge`):

- Binding: the Pi-session/cwd/engine key and binding read are at `src/provider.ts:390,1608–1610`. Dispatch passes the bound ID (`:1974–1981`); portable fallback uses a fresh ID (`:1968`). `commitParkedTurn` creates/updates the binding plus guard and staged-agent metadata (`:1788–1808`, called `:2004,2029`). Replay/live continuation reuses the originating handle (`:825–849,1624–1627`); shared settlement writes on OK (`:2102–2114`), deletes on changed ID (`:2098–2100`) and on silent drop/poisoned resume (`:2042–2053`). Quota classification returns before settlement mutations (`:2078–2087`, late `:1756–1761`). Stranded delivery claims by owner conversation and marks delivered after dispatch (`:1711–1768`); a later pass on the captured handle can reach shared settlement. `/agy clear` clears the store (`extensions/index.ts:1401`); there is no `session_compact` subscriber. ACP loads a requested ID or creates a new session (`src/acp/driver.ts:324–346`); stream-json tracks its process conversation (`src/driver.ts:458,620–635`) and recycles a bound process for fresh requests (`:857–858`).
- Usage: ACP emits observed occupancy `used` (`src/acp/driver.ts:502`) and substitutes it for `total_tokens` (`:417,919`, synthetic `:850–853,897–925`). Stream-json forwards counters (`src/driver.ts:620–635,706–718`) whose documented `total_tokens` excludes cache. Both reach `toPiUsage` (`src/provider.ts:1375`), which recomputes totals from components and prices them (`src/stream-events.ts:112–125`). Pi 1.6.0 silent-overflow detection for `stop` uses `input + cacheRead > contextWindow` (`pi-ai/dist/utils/overflow.js`), so inflated aggregated input/cacheRead can trigger phantom overflow compaction. Upstream `59376a7` clamps input/cacheRead proportionally to `total − output` (or `total`) when finite reported `total ≤ window` but `input + cacheRead > window`, leaving total, output and pricing unchanged.
- Helpers: Pi calls carrying `cacheRetention: "none"` or `disableContinuation: true` (e.g. the compaction summary) take the regular path (no branch before `:1608–1627,1777`) and can read/replay/sweep live bindings.
- Rotation races: upstream `806e712` rechecks the rotation latch at continuation settlement; `79f8cde` extends it to strand-targeted pre-rotation conversations and first-park binds. Locally a per-key generation must follow each handle through park/replay/strand ownership and fence every binding write and delete (including staged-agent and guard metadata). `ToolRoundTrips.replayEpoch` (`:779,863–867`) is not a per-key binding fence.
- Digest: off by default (`src/config.ts:209`); count-watermark framing assumes agy has prior history (`src/provider.ts:129–207,266–316,1855–1874`). Compaction handoff needs: latest summary detection, fresh framing plus bridge-owned retained turns, inclusion of a trailing assistant/tool-result tail with a synthetic resume when there is no user prompt, ACP `embeddedContext` vs stream-json inline, UTF-8 byte budgeting including framing, and handoff recorded only after actual delivery. `ec307b5`'s global default-on digest, toast and persisted fingerprints are not required.
- Gate invariants (from `agy-upstream-safety-sync`): gate mode latched at bridge start (`extensions/index.ts:860–861`), owned hook delivery verified at the prompt-write boundary (`src/acp/driver.ts:284,324`; `src/driver.ts:280,336`). Stale settlement can restore stale `runCommandGuardActive` metadata.
- Test seams: `tests/helpers/fake-acp-server.mjs`, `tests/helpers/fake-agy-bin/agy.mjs`, `tests/provider-{digest,watermark,resume,late-result,quota,carrier-retry}.test.ts`, `tests/gate-delivery.test.ts`.

## Intent

After a successful Pi compaction, the next Antigravity turn for that Pi session runs in a fresh agy conversation that receives a one-shot handoff of the compaction summary plus bridge-owned retained context, and nothing from before the rotation (parked continuations, replays, stranded or late results) can re-bind the old conversation. Pi helper calls never touch live bindings, and ACP-reported occupancy prevents phantom context-overflow compaction.

## Non-goals

- Default-on context digest for ordinary turns, provider-switch toast, persisted digest fingerprints (`ec307b5` beyond the compaction subset).
- Agent-directory resolution (`8dee43b`), ACP startup timeout (`f6fb22d`), Gemini catalog work.
- Changing pricing/cost reporting, stream-json usage semantics without proven occupancy, or any approval-gate behavior.
- Package version bumps or releases.

## Acceptance

- AC-1: When a turn's ACP-reported occupancy (`used`) is a finite positive value not above the model context window but aggregated `input + cacheRead` exceeds the window, the usage reported to Pi has `input` and `cacheRead` scaled proportionally (rounded, remainder to `cacheRead`) so that `input + cacheRead` equals `occupancy − output` when `0 ≤ output < occupancy`, else `occupancy`; `output`, `totalTokens` semantics and cost are unchanged. Usage without proven occupancy (stream-json, synthetic without `used`, invalid counters) is unchanged. A genuine overflow (`occupancy > window`) is not hidden.
- AC-2: A provider call carrying `cacheRetention: "none"` or `disableContinuation: true` runs in a fresh agy conversation on a dedicated ephemeral dispatch path that is independent of the session's shared driver turn queue and of any live parked handle (so a compaction summary requested while the original turn is parked completes instead of waiting on that park), bounded by its own deadline, with latched-mode prompt-boundary gate verification performed against that helper connection's own staged home (never the last-staged shared home); its ACP session keeps the canonical tool surface, but every bridge tool call, hook approval request or native approval originating from the helper connection is denied fail-closed by that connection's own handler with a fixed message and is never routed to the shared driver's active handle or the parked owner; it never reads, writes or deletes the session binding, never consumes replay/park state or stranded results, and never claims a pending compaction handoff. Tests use a genuinely blocked predecessor park on both carriers.
- AC-3: A successful Pi `session_compact` for a Pi session rotates that session's agy binding: it increments a per-key generation, clears the binding (and its staged-agent/guard metadata), and arms a one-shot handoff; an aborted or failed compaction (no `session_compact`) changes nothing.
- AC-4: Every binding write or delete (first park, park update, OK settle, changed-ID delete, silent-drop/poisoned-resume delete, staged-agent and guard metadata) is fenced by the generation captured atomically with binding selection, before any asynchronous driver startup or queueing, and inherited unchanged by recovery paths (carrier retry, replay, stranded redelivery); each write re-checks the current generation immediately before mutating; a handle created before a rotation — including when its settlement happens after a newer turn bound the fresh conversation, via live replay, parked continuation, stranded redelivery or late result — never writes, overwrites or deletes the post-rotation binding and never consumes the pending handoff. Already-delivered tool results are never re-executed because of the fence.
- AC-5: The first eligible non-helper turn after rotation sends a fresh-framed handoff containing the latest compaction summary and bridge-owned retained turns after it, including a trailing assistant/tool-result tail followed by a synthetic resume instruction when the turn has no user prompt; ACP carries it as embedded context and stream-json inline, both bounded by a UTF-8 byte budget including framing. The handoff is a generation-scoped exclusive claim: exactly one request of the current generation may claim it (a competing or queued request of the same generation that finds the handoff claimed and no binding published fails visibly with a fixed retry message before any prompt write, performing no dispatch, no binding write or delete and no claim; a request of an older generation can never claim it), and the claimer re-checks generation and claim ownership immediately before the prompt write. Claim resolution is exhaustive over carrier outcomes (park, OK, ERROR, UNKNOWN, abort, quota notice, dispatch failure): the claim commits if and only if the turn reaches its first park, or the prompt write was acknowledged and real model output was observed (stream-json `modelOutputSeen`; on ACP an observed `agent_message_chunk`, `agent_thought_chunk` or `tool_call` session update, recorded as model-output evidence by this change) and the outcome is neither abort nor quota notice; every other outcome, including UNKNOWN, an ERROR or OK without observed model output (stream-json silent drop), abort, quota notice and dispatch failure, releases the claim back to pending. On commit the claimer performs a generation-fenced handoff-specific binding write of the fresh conversation ID reported by the carrier (ACP `session/new` result; stream-json init/step identity), independent of ordinary OK-only settlement, so a post-output ERROR still publishes the binding; if no carrier conversation ID was observed the claim releases instead. After commit, later requests of the generation use the published binding through ordinary resume; after release, the next request may claim. A newer compaction supersedes any claim and re-arms the handoff for the new generation; when the digest would be empty (no summary and no retained turns) the handoff is discarded as nothing-to-deliver rather than left pending. Rotated-away conversations are abandoned: stranded escalated results whose owner conversation was rotated away are not re-delivered as prompts on either carrier (no cross-conversation write, no acknowledgement as delivered). Each strand dispatch carries its owner generation, and both carriers re-check it at the actual strand prompt-write boundary (the same boundary that runs gate delivery verification), so a strand reserved before rotation but written after it is cancelled with zero writes, no delivery acknowledgement and its reservation returned to pollable. Rotated-away escalated calls keep exactly today's registry and pollability behavior (settled from tool-result messages on provider passes, pollable through the existing poll path); this change adds no new notice, no new completion input and no change to how results are recorded, and never adds them to the handoff or to any agy prompt. Stranded results of non-rotated conversations keep the existing redelivery contract. Ordinary-turn digest behavior and its default remain unchanged.
- AC-6: Approval-gate invariants hold on every new path (rotation, fresh helper conversation, handoff turn): latched gate mode and prompt-boundary delivery verification run before dispatch, and stale settlement cannot restore stale `runCommandGuardActive` metadata.

## Clarifications

- Scope: user asked to continue with the compaction port as a separate change after `agy-upstream-safety-sync` (2026-11-21).
- No material human-owned decision is open: rotation-on-compaction and the compaction-only handoff follow upstream behavior; the occupancy clamp is restricted to proven ACP occupancy to avoid hiding real overflow on stream-json.

## Decisions

- Port upstream behavior adapted to the fork: rotate on successful `session_compact`, one-shot handoff independent of the ordinary digest setting.
- Per-key generation counter (in-memory, owned by the provider/session store) is the rotation fence; a pending boolean alone is insufficient.
- Ephemeral helper detection uses either `cacheRetention: "none"` or `disableContinuation: true`, matching upstream.
- Helper calls use a dedicated ephemeral dispatch (own driver instance/connection outside the shared turn queue) with its own deadline; the ACP tool surface stays canonical (no spec exception), while helper-originated tool calls and approvals are denied fail-closed per connection and gate verification reads the helper connection's own home.
- Same-generation concurrency is resolved by failing fast: while the handoff is claimed and no binding is published, any other request of that generation fails visibly with a retry message before writing anything (no follower continuation, so no strict-resume requirement on cold stream-json carriers).
- Rotated-away strands are not prompted into any conversation (neither carrier can prove owner identity before the prompt write on a cold stream-json resume, and prompting a dead conversation has no value). User decision (2026-11-21): no rotation notices or new completion wiring for rotated-away calls; their registry/pollability behavior stays exactly as today.
- Claim resolution is exhaustive with a handoff-specific fenced binding write on commit (see AC-5).
- Generation is captured with binding selection and inherited by recovery paths; the handoff is an exclusive generation-scoped claim with explicit commit/release rules (see AC-5).
- After rotation, a retry-dropped tail with no bound conversation is resumed in the fresh conversation through the handoff's synthetic resume instead of failing; this is a deliberate exception to the existing retry-tail requirement, stated as a MODIFIED delta. Strand redelivery for rotated-away owners is suppressed (no prompt), stated as a MODIFIED delta.
- Occupancy clamp applies only with ACP-observed occupancy; stream-json and synthetic-without-occupancy usage are unchanged. Pricing is computed from unclamped billing counters exactly as today.
- No live paid probe is required; behavior is verified through fake ACP/stream-json seams. If a live probe is later desired it needs explicit user authorization.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge rotates its agy conversation after Pi compaction** — After a successful Pi compaction the Antigravity bridge MUST start the next non-helper turn of that Pi session in a fresh agy conversation that receives a one-shot handoff of the compaction summary and bridge-owned retained context, MUST prevent any handle created before the rotation from writing or deleting the post-rotation binding, MUST run Pi helper calls (`cacheRetention: "none"` or `disableContinuation: true`) in fresh conversations without touching bindings, and MUST clamp aggregated input/cache-read usage to ACP-reported occupancy when that occupancy fits the context window.
  - GIVEN an Antigravity-backed Pi session with a bound agy conversation and a parked tool round trip; WHEN Pi compaction succeeds, the parked continuation later settles, and the next user turn runs; THEN the stale settlement leaves the new binding untouched, the next turn starts a fresh agy conversation carrying the compaction summary once, and ACP occupancy within the window does not report an overflow .
- `MODIFIED pi-ecosystem` **Antigravity bridge resumes retry-dropped tails** — `@thoth-agents/pi-antigravity-bridge` MUST resume a bound conversation with a synthetic continuation prompt when a provider turn's context ends in an assistant or tool-result message with no new user input, images or late results, MUST keep failing visibly when no conversation is bound unless a compaction handoff is pending for that Pi session (in which case the tail is resumed in a fresh agy conversation through the one-shot handoff with its synthetic resume), and MUST bind a conversation at a turn's first park only from that turn's originating handle.
  - GIVEN a bound Antigravity conversation; WHEN Pi retries a turn whose context ends in an assistant or tool-result message without new user input; THEN the bridge dispatches a continuation prompt into that conversation instead of erroring; and GIVEN two concurrent turns; WHEN one parks first; THEN only its own conversation is bound; and GIVEN a Pi session whose binding was rotated by a successful compaction with a pending handoff; WHEN Pi retries a tool-result-ending turn without new user input; THEN the tail is resumed in a fresh conversation carrying the handoff instead of failing .
- `MODIFIED pi-ecosystem` **Antigravity bridge re-delivers unpolled escalated results** — `@thoth-agents/pi-antigravity-bridge` MUST re-deliver, exactly once and at the next turn boundary, each escalated bridge call result that completed but was never returned by a poll, as a late prompt in the conversation it belongs to, keeping it pollable and leaving a result with no known conversation pollable without prompting; when the result's conversation was rotated away by a Pi compaction it MUST NOT prompt any conversation with it and MUST keep its existing pollability unchanged.
  - GIVEN an escalated bridge call that completes after the model ended its turn without polling; WHEN the next turn boundary is reached; THEN the result is delivered once as a late prompt in its conversation and remains pollable; and GIVEN such a result whose conversation was rotated away by a successful compaction; WHEN the next turn boundary is reached; THEN no conversation is prompted with it, it remains pollable through the existing poll path .

## Plan

All writes in `pi-packages/pi-antigravity-bridge/` (src, extensions, tests, CHANGELOG.md `[Unreleased]`, UPSTREAM-CHANGELOG.md / README sync notes, docs as needed). Test-first (installed `tdd` skill). One Worker session, sequential units, single writer.

1. Occupancy clamp (AC-1): carry ACP observed occupancy through the driver result into `toPiUsage` (`src/provider.ts:~1375`, `src/stream-events.ts:~112–125`, `src/acp/driver.ts:~417,502,850–925`) as an explicit field; apply the clamp only when present and valid; pricing from unclamped counters. Tests: boundaries, invalid counters, absent occupancy, stream-json unchanged, true overflow kept, cost unchanged.
2. Helper isolation (AC-2): early ephemeral branch before binding lookup/replay/strand sweep (`src/provider.ts:~1608–1627,1711–1777`) that dispatches through a dedicated ephemeral driver instance/connection outside the shared turn queue (`src/turn-queue.ts:9–21`), with its own deadline, no store or handoff access; gate verification against the helper connection's own staged home; helper-originated bridge tool calls and approvals denied fail-closed in the helper connection's own handler (`extensions/index.ts:374–393,440–464,540–558,1058–1072`, `src/provider.ts:943–974` currently assume a singleton active handle/home). Tests with both the helper and the parked owner connections live: helper approval never reaches the owner, verification uses the helper home. Tests on both transports for each flag with a genuinely blocked predecessor park (the helper completes while the park stays live and untouched), plus a pending stranded result left untouched.
3. Rotation + generation fence (AC-3, AC-4): subscribe to `session_compact` in `extensions/index.ts` and derive the binding key from `ctx.sessionManager.getSessionId()` plus the provider's existing cwd/engine key derivation (`src/provider.ts:390–400`), rotate the key's binding; capture generation atomically with binding selection before async startup/queueing and inherit it through carrier retry, replay and strand recovery; re-check before each write; in the provider/session store (`src/sessions.ts`, `src/provider.ts`), add per-key generation captured on handle creation and threaded through `ToolRoundTrips` park/replay/strand ownership; fence all writers/deletes (`:1788–1808,2042–2053,2098–2114`) including staged-agent and guard metadata. Tests: compaction success vs none; first/repeated parks; live and settled replay; strand-then-park; stale OK and stale delete after a newer bind; quota outcome preserving binding and pending handoff; no double execution of delivered tool results.
4. Compaction handoff (AC-5): one-shot digest builder for fresh conversations (summary detection, fresh framing, retained bridge turns, trailing non-user tail + synthetic resume), ACP `embeddedContext` vs stream-json inline, UTF-8 byte budget including framing; generation-scoped exclusive claim with pre-write recheck; exhaustive commit/release rule using real model-output evidence (add ACP model-output evidence from session updates, `src/acp/driver.ts`, `src/driver-types.ts:93–109`); generation-fenced handoff-specific binding write on commit; same-generation fail-fast for non-claimers; rotated-away strands skipped from prompt redelivery with owner-generation recheck at the prompt-write boundary (`src/provider.ts:84–113,1711–1778`) with registry/pollability unchanged; retry-tail exception per MODIFIED delta. Tests on both carriers: two concurrent same-generation fresh requests: one handoff, the other fails visibly with zero prompt writes and no binding change, final binding equals the claimer's conversation; each outcome branch (park, OK with output, ERROR after output, OK without output, ERROR before output after an acknowledged write, UNKNOWN, abort, quota, dispatch failure) resolves the claim as specified and is followed by a next request whose binding and handoff presence are asserted; commit without an observed carrier conversation ID releases; rotated-away strand with a cold stream-json resume and with the ACP load-fails fixture: zero result prompt writes, no acknowledgement, still pollable, call ID absent from every agy prompt; multibyte budget; empty digest discarded; older generation cannot claim; second compaction supersedes; retained tool-result tail resumed once with zero repeated tool executions; strand reserved before rotation and written after it on both carriers (zero writes, no acknowledgement, pollable again); ordinary (non-rotated) redelivery tests unchanged and green; ordinary digest default unchanged.
5. Gate invariants (AC-6): regression tests that rotation, helper and handoff paths run latched-mode prompt-boundary verification and that stale settlement cannot restore stale guard metadata.

Risks: concurrency between rotation and in-flight turns; double tool execution if fencing suppresses acknowledgment; handoff loss on failure paths; hidden genuine overflow; interaction with approval-gate verification. Closeout gate: package typecheck, full package vitest (default and `--maxWorkers=2`), package build, root `pnpm run check:ci`, root `pnpm run typecheck`; root `pnpm run build` only in an isolated worktree.

## Tasks

- [x] AC-1: ACP occupancy clamps aggregated usage reported to Pi
  - Outcome: occupancy field propagated and clamp applied only with proven occupancy
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/acp/driver.ts, src/provider.ts, src/stream-events.ts; tdd skill
  - Inputs: Exploration; upstream 59376a7 clamp rule
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/**, tests/**
  - Interface boundaries: pricing and stream-json usage unchanged
  - Focused check and PASS evidence: clamp boundary/invalid/absent/stream-json/true-overflow/cost tests green
  - Return milestone: after AC-6 unit in the same Worker session
  - Stop / reassessment: occupancy cannot be carried to settlement without changing the driver outcome contract for other callers
- [x] AC-2: Pi helper calls run ephemeral without touching bindings
  - Outcome: ephemeral branch for cacheRetention none / disableContinuation
  - Known entrypoints and skill paths: src/provider.ts, src/turn-queue.ts, extensions/index.ts:374–393,440–464,540–558,1058–1072; tdd skill
  - Inputs: Exploration
  - Dependencies: AC-1 unit (same writer)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/**, extensions/** (helper-home gate verification and per-connection approval routing in extensions/index.ts), tests/**
  - Interface boundaries: approval-gate prompt-boundary verification still applies
  - Focused check and PASS evidence: both flags, both transports, helper completes with a genuinely blocked predecessor park left live and untouched, stranded result untouched, tests green
  - Return milestone: after AC-6 unit
  - Stop / reassessment: Pi 1.6.0 does not expose these options to the provider stream call
- [x] AC-3: Successful session_compact rotates the session binding
  - Outcome: rotation with per-key generation and armed one-shot handoff
  - Known entrypoints and skill paths: extensions/index.ts, src/sessions.ts, src/provider.ts
  - Inputs: Exploration; upstream 59376a7
  - Dependencies: AC-2 unit (same writer)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/**, extensions/**, tests/**
  - Interface boundaries: /agy clear and gate latch unchanged
  - Focused check and PASS evidence: compaction success rotates; no event changes nothing; tests green
  - Return milestone: after AC-6 unit
  - Stop / reassessment: session_compact cannot be attributed to a binding key
- [x] AC-4: Generation fence blocks stale writes and deletes after rotation
  - Outcome: every binding writer/deleter fenced by origin generation
  - Known entrypoints and skill paths: src/provider.ts (ToolRoundTrips, commitParkedTurn, settlement, strand loop)
  - Inputs: Exploration; upstream 806e712, 79f8cde
  - Dependencies: AC-3 unit (same writer)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/**, tests/**
  - Interface boundaries: delivered tool results never re-executed
  - Focused check and PASS evidence: park/replay/strand/late/quota stale-write and stale-delete tests, queued old-binding request captured before rotation cannot write after it, recovery paths inherit generation, tests green
  - Return milestone: after AC-6 unit
  - Stop / reassessment: fencing a write would suppress an acknowledgment needed to avoid re-execution
- [x] AC-5: One-shot compaction handoff delivered on the first fresh turn
  - Outcome: handoff digest builder and delivery-confirmed consumption
  - Known entrypoints and skill paths: src/provider.ts digest helpers, src/acp/driver.ts, src/driver.ts
  - Inputs: Exploration; upstream 59376a7 and ec307b5 subset
  - Dependencies: AC-4 unit (same writer)
  - Output: code + tests + CHANGELOG/UPSTREAM/README notes
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/**, extensions/** (rotation wiring), tests/**, CHANGELOG.md, UPSTREAM-CHANGELOG.md, README.md, docs/**
  - Interface boundaries: ordinary digest default unchanged
  - Focused check and PASS evidence: Plan step 4 test list green on both carriers (single claim with fail-fast competitor, exhaustive outcome branches with next request, rotated-away strand not prompted, pollability unchanged, budget, supersede, retry-tail exception)
  - Return milestone: after AC-6 unit
  - Stop / reassessment: dispatch confirmation is not observable on a carrier
- [x] AC-6: Approval-gate invariants hold on rotation, helper and handoff paths
  - Outcome: regression coverage for latched mode, prompt-boundary verification and guard metadata
  - Known entrypoints and skill paths: extensions/index.ts, src/acp/driver.ts, src/driver.ts, tests/gate-delivery.test.ts, tests/run-command-guard.test.ts
  - Inputs: agy-upstream-safety-sync invariants
  - Dependencies: AC-5 unit (same writer)
  - Output: tests (+ fixes if any fail)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/**, extensions/**, tests/**
  - Interface boundaries: approval-gate behavior unchanged
  - Focused check and PASS evidence: gate regression tests green; full package suite, typecheck, build, root check:ci and typecheck green
  - Return milestone: Worker final report
  - Stop / reassessment: an invariant cannot hold without changing approval-gate behavior

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: ca0cc548a7759ad82d8e0d8ae33f6834c099c317054b2dd0861fc1f1735b07de

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The current diff satisfies AC-1 through AC-6 and the declared durable deltas. R12’s repair restores helper dispatch under AGY_AGENTS_ROOT without weakening fail-closed isolation or changing ordinary override behavior. AC-5’s settled-replay regression check also passed.",
  "evidence": [
    {"id":"AC1","kind":"source and tests","locator":"src/stream-events.ts:114–138; src/acp/driver.ts:509–515,912–948; tests/message-cost.test.ts:226–273","claim":"Proven ACP occupancy clamps only Pi’s overflow inputs. Raw billing totals and cost, stream-json usage, and genuine overflow are preserved.","basis":"observed","uncertainty":"Fake ACP peer."},
    {"id":"AC2","kind":"source and tests","locator":"src/provider.ts:2460–2530,2564–2568; extensions/index.ts:557–644; tests/provider-resume.test.ts:175–222; tests/run-command-guard.test.ts:1740–1774,1846–1948,2103–2137","claim":"Both flags bypass the shared queue and session state even with a genuinely blocked predecessor. Each carrier uses a private deny-only connection with its own deadline. Under the override, capability, staging, or hook-verification failure produces zero prompt writes; ordinary legacy behavior is unchanged.","basis":"observed","uncertainty":"Fake carriers; no paid probe."},
    {"id":"AC3","kind":"source and tests","locator":"extensions/index.ts:792–804; src/sessions.ts:164–169; tests/run-command-guard.test.ts:1776–1791,2028–2050","claim":"Only successful compaction rotates the active session’s binding and metadata, advances its generation, and arms the latest active-branch checkpoint.","basis":"observed","uncertainty":""},
    {"id":"AC4","kind":"source and tests","locator":"src/provider.ts:1733,1892–1911,2042–2087,2347–2418; tests/provider-watermark.test.ts:465–518; tests/run-command-guard.test.ts:2077–2098","claim":"The binding and generation are selected together before startup. Recovery carries the owner stamp; stale dispatches and settlements cannot write or delete a fresh binding or restore guard metadata. Already-acknowledged work is not replayed as a new dispatch.","basis":"observed","uncertainty":""},
    {"id":"AC5","kind":"source and tests","locator":"src/provider.ts:283–307,1942–2015,2048–2066,2381–2392; tests/provider-digest.test.ts:218–320,763–788; tests/provider-resume.test.ts:226–305","claim":"Both carriers deliver the bounded one-shot handoff, with a synthetic retry-tail resume. Tests verify claim exclusivity, outcome-dependent commit or release, and settled replay after first-park publication. Rotated strands stay pollable with zero prompt writes or delivery acknowledgements; ordinary retry and strand behavior passed focused checks.","basis":"observed","uncertainty":"Fake carriers and simulated outcome branches."},
    {"id":"AC6","kind":"source and tests","locator":"extensions/index.ts:378–398,619–635; src/acp/driver.ts:283–305; src/driver.ts:334–343; tests/run-command-guard.test.ts:1605,1805–1842,1917–1931,2116–2123","claim":"Latched gate verification holds at both prompt boundaries. Helpers verify their own hook, while ordinary gated ACP continues to refuse the legacy override.","basis":"observed","uncertainty":""},
    {"id":"G","kind":"command output","locator":"HEAD 2eb4bbd3 + current bridge working tree","claim":"Package typecheck passed; requested Vitest run passed 685 tests in 14 files; additional lifecycle, isolation-probe, and ACP-carrier checks passed 77 tests in 3 files. Diff whitespace check passed. Record prefix hash matched; --through verify validated the record and spec baseline.","basis":"observed","uncertainty":"Full suite, builds, and root checks were not independently rerun."}
  ],
  "verification": [
    {"check":"AC-1 through AC-6, Decisions, and durable deltas","method":"HEAD-to-working-tree source review and focused fake-carrier checks","outcome":"pass","evidenceIds":["AC1","AC2","AC3","AC4","AC5","AC6","G"],"reason":"No material violation found in the declared scope."},
    {"check":"Record binding and required reruns","method":"Independent SHA-256, record validator, package typecheck, and focused Vitest","outcome":"pass","evidenceIds":["G"],"reason":"Digest matched and all checks exited successfully."}
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root: validate gate delivery and proceed to closeout.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/agy-compaction-rotation/agy-compaction-rotation.md",
    "reviewedRecordSha256": "ca0cc548a7759ad82d8e0d8ae33f6834c099c317054b2dd0861fc1f1735b07de"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | tests/message-cost.test.ts | ACP occupancy clamps overflow inputs only; raw billing/cost and genuine overflow preserved (Oracle R13 AC1)
- AC-2: PASS | tests/provider-resume.test.ts, tests/run-command-guard.test.ts | helpers isolated on private deny-only connections with blocked predecessor, incl. AGY_AGENTS_ROOT; fail-closed with zero prompt writes (Oracle R13 AC2)
- AC-3: PASS | tests/run-command-guard.test.ts | only successful session_compact rotates the active key and arms latest active-branch checkpoint (Oracle R13 AC3)
- AC-4: PASS | tests/provider-watermark.test.ts, tests/run-command-guard.test.ts | generation captured with binding selection; stale writes/deletes/guard metadata fenced; no tool re-execution (Oracle R13 AC4)
- AC-5: PASS | tests/provider-digest.test.ts, tests/provider-resume.test.ts, tests/compaction-routing.test.ts | one-shot bounded handoff, claim exclusivity, commit/release, parity matrices, rotated strands pollable with zero prompt writes (Oracle R13 AC5)
- AC-6: PASS | tests/run-command-guard.test.ts, tests/gate-delivery.test.ts | latched gate verified at both prompt boundaries; helpers verify own hook (Oracle R13 AC6)
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:6c244781f734b8570e347332cf25924e2d36b86d422c9c67b47e97659e98cede

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Final verification PASS on round 13 after 12 FAIL rounds repaired by the same worker (all within AC scope). Worker-reported closeout: package typecheck and build pass; package vitest default and --maxWorkers=2 each 107 files, 2046 passed, 5 skipped (Windows timing flakes passed on unchanged rerun); root check:ci and root typecheck pass; git diff --check clean. Root pnpm run build not run (regenerates generated trees; not required for package-only change). Residuals: fake carriers only, no paid live probe; rotation generations and handoff claims are in-memory and do not survive a bridge restart.
