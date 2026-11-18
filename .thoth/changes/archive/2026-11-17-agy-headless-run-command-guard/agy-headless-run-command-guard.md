# Change: agy-headless-run-command-guard

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Explorers `subtask_thoth-explorer_1794942487865_4ab4dafa` (bridge) and `subtask_thoth-explorer_1794942487882_192494c0` (pi-subagents), live smoke tests, and live discovery probes `subtask_thoth-worker_1794955350137_61cac254` (agy 1.5.9, ACP protocolVersion 1) on 2026-11-17:

- Live: agy native `run_command` exposes `CommandLine`, `IsDaemon`, `toolSummary`, `WaitMsBeforeAsync` (500-10000 ms) and no blocking/timeout flag; any command longer than 10 s becomes an agy background task. `manage_task` (list/kill/status/send_input) has no wait. A subagent child that backgrounded a 6-minute command ended its turn "waiting" and completed half-done. The same command through Pi `bash` on the bridge MCP server (`pi-agy-*/bash`, `timeout: 420`) returned a pending handle and finished via `bridge_poll_result` after ~362 s with no stall.
- Neither carrier marks a backgrounded `run_command` (ACP `src/acp/events.ts:92-98`, `src/acp/driver.ts:495-513`; stream-json `src/driver.ts:660-679`). Task liveness needs `lsof` (`src/tasks.ts:105-115`), unknown on Windows; post-turn ACP updates are dropped (`src/acp/driver.ts:451-454`). A wake-up path is fragile.
- ACP permission refusal is NOT viable (live): agy acp sends `session/request_permission` for `run_command` (options `allow`/allow_once, `deny`/reject_once) when not launched with `--dangerously-skip-permissions`; the bridge auto-allows when `skipPermissions` (default true, `src/config.ts:192-196`; `src/acp/connection.ts:392-397`). Selecting `deny` or `cancelled` ends the turn immediately (`stopReason: end_turn`, empty text, no fallback). ACP v1 has no reason channel in `RequestPermissionResponse`.
- `PreToolUse` hooks work on both carriers (live): a hooks file with `matcher: "run_command"` whose command prints `{"decision":"deny","reason":"..."}` fires before execution and before `session/request_permission`; the turn continues, the model receives `tool call denied by pre-tool hook: <reason>`, and it immediately retried via the bridge MCP `bash`. ACP picks hooks from `--add-dir <dir>` (`.agents/hooks.json`) or `<stagedHome>/config/hooks.json`; stream-json from `--add-dir` (already passed, `src/driver.ts:460`). A run_command-only hook group is independent of the approval gate (`src/approval-hook.ts:101-107,120-181`, which by default is not staged in auto mode, `src/approval-detect.ts:143-151`, and also matches file-mutation tools). ACP wire `tool_call_update` for the denied call carries empty output (the reason is only in model context).
- No agy CLI flag disables `run_command` or forces synchronous execution. Omitting `run_command` from the ACP carrier frontmatter `tools:` (`src/sysprompt-agent.ts:44-63`, `src/acp/home.ts:114-135`) removes the tool on ACP but not on stream-json, is bypassed by `config.agent`/`AGY_AGENTS_ROOT`, and gives no replacement message.
- Hook/MCP staging and ACP launch/permission wiring live in `extensions/index.ts:365-380,539-544,939-1031`, `src/acp/connection.ts:179-186`, `src/acp/home.ts`. Session mode: `getSessionMode` captured in `extensions/index.ts:537-544`; provider `src/provider.ts:411,1819`; `toolPriorityNote(mode)` (`src/provider.ts:173-207`) treats anything but `"tui"` as non-interactive and currently says "run commands in the foreground within the turn", which `run_command` cannot honor. Subagent children are in-process `createAgentSession` sessions (`pi-subagents/src/runner/sdk-runner.ts:471-515`) with non-`tui` mode.
- Bash fallback availability (plan review `subtask_thoth-oracle_1794956369707_b7e5635e`): with default `bridgeTools=all`, the catalog excludes Pi built-in-source tools (`src/bridge-catalog.ts:46-59`; `tests/bridge-catalog.test.ts:148-158`; canonical requirement "Antigravity bridge proxies extension tools"), and direct calls to unexposed tools are rejected (`extensions/index.ts:866-871`). The live probe's bash fallback worked only because `pi-thoth-theme` overrides `bash` with an extension-source tool; with Pi's builtin `bash` the guard would leave agy without a shell.
- pi-subagents completes a child after one `session.prompt` (`pi-subagents/src/runner/event-processing.ts:741,857-933`); no post-turn wake exists.

## Intent

In non-interactive Pi sessions (any session mode other than `tui`, including subagent children), agy models run shell commands through Pi `bash` on the bridge MCP server instead of native `run_command`, so long commands never become agy background tasks that silently end the turn half-done.

## Non-goals

- Waking a Pi session when an agy background task finishes.
- Changing interactive (`tui`) behavior.
- Changing Pi `bash`, pi-subagents, or the bridge park/poll protocol.
- Denying other native tools (`read_file`, `edit_file`, `write_file`, `search_web`, `call_mcp_tool`, `manage_task`, ...) or changing the approval gate's behavior for them.
- Refusing via ACP `session/request_permission`.

## Acceptance

- AC-1: In non-interactive sessions with default settings where a Pi `bash` tool is active and not hidden, on both carriers, a dedicated `PreToolUse` guard (matcher `run_command` only) refuses native `run_command` before execution with a reason naming the session's Pi `bash` bridge tool; the turn continues; the guard is active regardless of `skipPermissions`, approval gate mode or permission-extension detection, and does not affect any other native tool.
- AC-5: While the guard is active, the bridge catalog exposes the session's active, non-hidden Pi `bash` (with its full schema) even when it is Pi built-in-source, and accepts invocations of it; when no Pi `bash` is active or it is hidden, no guard is staged; all other built-in-source tools stay excluded, and sessions without the guard keep the current catalog.
- AC-2: Interactive (`tui`) sessions keep native `run_command` unchanged (no guard staged); a documented bridge config setting (default: guard on in non-interactive sessions) disables the guard everywhere.
- AC-3: When the guard is active, the non-interactive tool-priority note tells the model to use the Pi `bash` bridge tool for every shell command (with its `timeout` argument for long work) and that native `run_command` is refused; when the guard is disabled by the setting, the non-interactive note keeps its current wording; the interactive note is unchanged.
- AC-4: Tests cover AC-1..AC-3 and AC-5 on both carriers (guard staging per carrier and mode, catalog bash exposure, hook output/reason, approval-gate coexistence without double handling of `run_command`, opt-out, other-tool passthrough, prompt text); existing bridge suites pass; root typecheck, check:ci and build pass.

## Clarifications

- Approach (user, 2026-11-17): prevent — refuse native `run_command` outside the TUI and steer to Pi `bash`; wake-up deferred.
- Mid-session changes (user, 2026-11-17): freeze the guard state per Pi session (bridge session lifecycle); setting or bash-availability changes take effect at the next session (`/new`, resume, new subagent); no hot recycling.
- Bash availability (user, 2026-11-17): expose Pi `bash` (including built-in-source) to agy while the guard is active; if no Pi `bash` is active in the session, do not guard.

## Decisions

- "Non-interactive" reuses the existing `getSessionMode() !== "tui"` rule (missing mode = non-interactive), consistent with `toolPriorityNote`.
- Mechanism (from live probes): a dedicated static `PreToolUse` hook group, matcher `run_command`, printing `{"decision":"deny","reason":...}`, staged per carrier: stream-json in the existing `--add-dir` hooks location; ACP via a hooks-only `--add-dir` directory or `<stagedHome>/config/hooks.json` (never a directory that also holds `.agents/mcp_config.json`, to avoid a second MCP config source). ACP permission rejection is not used.
- Precedence: the guard is independent of and takes precedence over the approval gate for `run_command`; when both are staged, `run_command` is handled only by the guard (excluded from the gate's matcher or denied synchronously), so it never parks for approval. Other gated tools keep their current gate behavior.
- Guard state is fixed per agy process launch from the owning bridge instance's session mode and the setting; implementation must confirm agy processes are not shared between Pi sessions with different modes (stop and report otherwise).
- Omitting `run_command` from the ACP carrier frontmatter is out of scope; the hook is the single enforced layer.
- The opt-out is a bridge config setting, not an environment variable.
- Guard activation = non-`tui` mode AND setting enabled AND an active, non-hidden Pi `bash` exists at agy launch; the same predicate drives the catalog exception for built-in `bash`, the hook staging and the prompt note, evaluated from one shared function so they cannot diverge.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge routes non-interactive shell commands through Pi bash** — `@thoth-agents/pi-antigravity-bridge` MUST, in any Pi session whose mode is not `tui` and that has an active, non-hidden Pi `bash` tool, stage a `PreToolUse` guard on both carriers that refuses agy native `run_command` before execution with a model-visible reason naming the bridge server's Pi `bash` tool, without ending the turn and without affecting other native tools, independently of permission and approval-gate settings; it MUST bridge that `bash` tool to agy while guarding even when it is Pi built-in-source; its non-interactive tool-priority note MUST then direct shell commands to that tool; interactive sessions MUST keep native `run_command`, and a documented bridge setting MUST disable the guard in all sessions.
  - GIVEN a subagent child on an antigravity model with default settings; WHEN the model calls native `run_command`; THEN the call is refused without ending the turn, the reason names the Pi `bash` tool, and a retry through Pi `bash` executes; WHEN the same happens in a `tui` session or with the guard disabled; THEN native `run_command` runs as before.

- `MODIFIED pi-ecosystem` **Antigravity bridge proxies extension tools** — `@thoth-agents/pi-antigravity-bridge` MUST keep bridging to agy only the tools that pass its existing catalog filters (in Pi's current active set, not hidden, not bridge-internal, and matching the bridge-tools mode source filter, so Pi built-in-source tools stay excluded, except that while its non-interactive `run_command` guard is active the session's active, non-hidden Pi `bash` is bridged even when it is built-in-source), MUST expose with full schemas only those authorized tools named like Pi's seven default tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`), MUST expose every other authorized tool only through a compact inspection tool and a compact invocation tool whose JSON-string arguments are validated, and MUST re-apply the same filters at invocation time.
  - GIVEN an Antigravity session with an authorized extension tool, a hidden extension tool and a Pi built-in-source tool; WHEN agy lists bridge tools and invokes the extension tools through the invocation proxy; THEN the list shows the proxies instead of the extension schema and omits the built-in-source tool, the authorized tool runs with the parsed arguments and the hidden tool is rejected; and GIVEN a non-interactive session with the guard active and Pi's built-in `bash` active; WHEN agy lists and invokes bridge tools; THEN `bash` is listed with its schema and runs, while other built-in-source tools stay omitted.

## Plan

All writes are in `pi-packages/pi-antigravity-bridge` (single writer, sequential units):

1. Guard: a small module that builds the run_command-only hook group and its deny output (reason names the session's Pi bash bridge tool, e.g. `<server>/bash` with `timeout`); stage it for stream-json alongside but independent of the approval gate staging, and for ACP via a hooks-only `--add-dir` or staged-home hooks file; wire activation from session mode + setting in `extensions/index.ts`, `src/driver.ts`, `src/acp/connection.ts`/`src/acp/home.ts`; make the approval gate skip `run_command` when the guard is active; config setting + README in `src/config.ts`. The hook command must run on Windows and POSIX (reuse the approval-hook command pattern).
1b. Catalog: in `src/bridge-catalog.ts` (and invocation-time re-filtering in `extensions/index.ts`), admit the active, non-hidden Pi `bash` regardless of source while the guard is active, via the shared guard predicate; tests in `tests/bridge-catalog.test.ts`.
2. Prompt: `toolPriorityNote` (`src/provider.ts:173-207`) takes guard state; update its callers (`buildFullPrompt`, `buildPortablePrompt`, `stageSyspromptAgent`, `inlineRetryRequest`).
3. Tests per AC-4; full bridge suite; root `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build`; then a bounded root-run live smoke in a subagent child confirming refusal + Pi bash fallback on the default carrier.

Risks: refusal wording must not cause agy retry loops (live probe showed immediate fallback); Orca native-chat roots report a non-`tui` mode and will also be steered to Pi bash (accepted: same background-task hazard); slightly slower commands due to bridge round-trips; hook process cost per run_command call.

## Tasks

- [x] AC-1: Stage the run_command-only PreToolUse guard on both carriers for non-interactive sessions
  - Outcome: guard staged per carrier, refuses run_command with Pi bash reason, independent of skipPermissions/gate/detection, gate does not double-handle run_command, other tools unaffected
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/extensions/index.ts:365-380,537-544,939-1031; src/approval-hook.ts:101-107,120-181; src/approval-detect.ts:143-151; src/approval-gate.ts:99-103; src/driver.ts:460; src/acp/connection.ts:179-186,392-397; src/acp/home.ts:114-135; src/mcp-server.ts (bridge server naming); pi-packages/pi-junie-bridge/src/native-tool-hooks.ts (precedent); tdd skill
  - Inputs: this record (live probe findings in Exploration)
  - Dependencies: none
  - Output: guard module, staging/wiring, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{extensions/index.ts,src,tests,CHANGELOG.md}
  - Interface boundaries: agy hooks file format, approval gate contract, ACP launch args, staged home layout
  - Focused check and PASS evidence: guard/hook/staging/gate-coexistence tests pass for both carriers
  - Return milestone: both carriers green
  - Stop / reassessment: agy process shared across sessions with different modes; hook not runnable on a platform
- [x] AC-5: Expose Pi bash (including built-in-source) in the bridge catalog while the guard is active
  - Outcome: shared guard predicate; catalog lists and dispatches active non-hidden bash when guarded; no guard without active bash; other built-ins excluded; unguarded catalog unchanged
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/bridge-catalog.ts:46-59; extensions/index.ts:866-871; tests/bridge-catalog.test.ts:148-158
  - Inputs: this record
  - Dependencies: AC-1 unit (same writer)
  - Output: catalog change, shared predicate, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{src/bridge-catalog.ts,extensions/index.ts,src,tests}
  - Interface boundaries: bridge catalog filters, invocation-time re-filtering
  - Focused check and PASS evidence: bridge-catalog tests for guarded/unguarded, builtin and extension bash, hidden/inactive bash
  - Return milestone: green
  - Stop / reassessment: bash identity cannot be determined reliably from Pi tool info
- [x] AC-2: Keep tui passthrough and add the documented guard-disable setting
  - Outcome: no guard in tui; setting (default on) disables the guard everywhere; README documented
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/config.ts, README.md, extensions/index.ts:537-544
  - Inputs: this record
  - Dependencies: AC-1 unit (same writer)
  - Output: config, README, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{src/config.ts,README.md,extensions/index.ts,tests}
  - Interface boundaries: bridge config schema
  - Focused check and PASS evidence: config and passthrough tests pass
  - Return milestone: green
  - Stop / reassessment: none
- [x] AC-3: Steer the non-interactive tool-priority note to Pi bash when the guard is active
  - Outcome: guard-aware note; tui and guard-disabled wording unchanged
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/provider.ts:173-207,1698-1740,1819
  - Inputs: this record
  - Dependencies: AC-1 unit (same writer)
  - Output: code and prompt tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{src/provider.ts,tests}
  - Interface boundaries: buildFullPrompt, buildPortablePrompt, stageSyspromptAgent, inlineRetryRequest
  - Focused check and PASS evidence: provider prompt tests pass
  - Return milestone: green
  - Stop / reassessment: none
- [x] AC-4: Run closeout checks and a live subagent smoke
  - Outcome: bridge suite, typecheck, check:ci and build green; live child refusal + Pi bash fallback observed
  - Known entrypoints and skill paths: package scripts; scripts/build-pi-extensions.mjs
  - Inputs: all unit outputs
  - Dependencies: previous tasks
  - Output: check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: full bridge suite (--maxWorkers=2); `pnpm run typecheck`; `pnpm run check:ci`; `pnpm run build`; live smoke result
  - Return milestone: all green
  - Stop / reassessment: unrelated failures reported with evidence

## Repair round 1 (Oracle FAIL subtask_thoth-oracle_1794963817422_a7987e46)

- [x] R1 (AC-1, Non-goals): approval-gate shadows registered once (`gateShadowsRegistered`, extensions/index.ts ~1081-1117) survive session shutdown while ticket verification captures the first bridge handle, so fresh edit/write approvals after /new or resume are rejected as stale. Rebind shadows/policy to the current bridge lifecycle; shutdown/start regression test. Report whether the defect predates this change.
- [x] R2 (AC-1/2/3/5, Decisions): guard consumers recompute live inputs, but hook sync skips ready drivers and ACP gets `--add-dir` only at launch, so catalog/prompt can diverge from the installed hooks after settings or bash availability change. Use one process-owned guard snapshot shared by hooks, catalog and prompt; recycle/restage when the computed state changes; tests for ready-state enable/disable and hidden/inactive bash transitions.

## Repair round 2 (Oracle FAIL subtask_thoth-oracle_1794965075475_35d6d6dc)

- R1 (approval shadows across restart): verified repaired.
- [x] R3 (AC-1/2/3/5, R2 replacement): the hot-recycle machinery from round 1 left bound conversations with a stale note, queued prompts built from the predecessor snapshot, and could recycle an ACP driver with an active first turn. Per the user's clarification, replace it: compute one guard snapshot per Pi session lifecycle (at session start/first launch, cleared on session_shutdown) used by hooks, catalog admission, invocation re-filter and prompt note; remove drift detection and guard-driven recycling (`shouldRecycle`/drift paths) so no turn can be interrupted; document in README that changes apply from the next session. Regressions: same-session setting/bash changes do not alter hooks, catalog or note; new session picks up the change; no recycle during in-flight or parked turns; R1 test still passes.

## Repair round 3 (Oracle FAIL subtask_thoth-oracle_1794966726864_301ba47d)

- R1 and R3 same-session/queued/in-flight behavior: verified.
- [x] R4 (AC-3): on `/resume` of a Pi session whose agy conversation is already bound (`src/provider.ts:1848-1889`), the guard note is not re-delivered (ACP sends only the user text; stream-json reuses the previous carrier agent), so guidance can contradict the new session snapshot. Record the guard state each binding was instructed with; when a fresh lifecycle's snapshot differs, deliver the current guard note on the next turn (ACP: in the turn's prompt/context; stream-json: restage/refresh the carrier agent or prompt) without mid-turn recycling; same-sessionId resume tests for enabled→disabled and disabled→enabled on both carriers.

## Repair round 4 (Oracle FAIL subtask_thoth-oracle_1794967951864_49870e98)

- Default resume refresh, R1 and R3: verified.
- [x] R5 (AC-3): configured-agent inline refresh (`src/provider.ts` ~1940-1941) leaves the previously staged automatic carrier reusable; when the override is later removed, the stale carrier with contradictory guidance returns. Clear the staged carrier in that branch; three-turn regression.
- [x] R6 (AC-3): inline carrier-retry handles (`src/provider.ts` ~2004-2008) lack the pending guard metadata, so an identity-late park followed by a successful continuation records no guard state and the next turn restages needlessly. Attach retry metadata before draining without retaining the rejected carrier; identity-late parked-retry regression.
- Decision (root, Oracle open question): explicit `systemPrompt: false` keeps its documented opt-out and suppresses guard-refresh notes; the hook still enforces the guard.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED
Plan OKAY by subtask_thoth-oracle_1794956803191_ba1b0453 (recordSha256 3ea422375a88c79b3ca4ac94cacd40273b3eb2d9f661a9c457c93a1cb65b9f80) after two REJECT/repair rounds; user authorized implementation 2026-11-17.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d40e117d1f269690abb635201f46b9af2576fa5bc3fa2b22be364dbfa2018a8f
Fresh Oracle subtask_thoth-oracle_1794969192136_424cb6ec after four FAIL/repair rounds (R1-R6). Live smoke (ACP subagent: refusal + Pi bash fallback, GUARD_OK) ran before the repair rounds; post-repair live smoke not repeated.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. R5/R6 counterexamples now pass; earlier repairs remain intact. AC-1..AC-5 satisfy the record, including systemPrompt:false suppressing guidance without disabling hook enforcement.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/agy-headless-run-command-guard/agy-headless-run-command-guard.md",
      "claim": "Verify gate passes; canonical spec digest matches. Record and bridge input hashes remained unchanged throughout verification.",
      "basis": "observed",
      "uncertainty": "Closeout remains root-owned."
    },
    {
      "id": "E2",
      "kind": "implementation-review",
      "locator": "pi-packages/pi-antigravity-bridge/{extensions/index.ts,src/run-command-guard.ts,src/approval-hook.ts,src/bridge-catalog.ts}",
      "claim": "Session-frozen activation drives dedicated run_command hooks, bash source admission and guidance. Invocation filters remain live; approval handling excludes guarded run_command. Other native tools and permission refusal behavior remain unchanged.",
      "basis": "observed",
      "uncertainty": "Live agy execution was not repeated."
    },
    {
      "id": "E3",
      "kind": "regression-execution",
      "locator": "src/provider.ts:1883-2019; tests/run-command-guard.test.ts; tests/provider-carrier-retry.test.ts",
      "claim": "Focused R4/R5/R6 and systemPrompt:false run: 16 passed. Configured-agent refresh clears the stale carrier; identity-late parked retries retain guard metadata without retaining the rejected carrier.",
      "basis": "observed",
      "uncertainty": "Carrier execution uses fixtures."
    },
    {
      "id": "E4",
      "kind": "suite-execution",
      "locator": "pnpm --dir pi-packages/pi-antigravity-bridge test --maxWorkers=2",
      "claim": "101 files passed; 1480 tests passed, 5 skipped. Includes earlier lifecycle, staging, catalog, prompt and liveness-interaction regressions.",
      "basis": "observed",
      "uncertainty": "Skipped tests were not exercised."
    },
    {
      "id": "E5",
      "kind": "validation-execution",
      "locator": "root typecheck/check:ci; bridge typecheck; read-only esbuild",
      "claim": "All checks exited 0. In-memory bridge build exactly matches existing dist (1081695 bytes); both launcher assets match.",
      "basis": "observed",
      "uncertainty": "Root check:ci reports warnings; full root build was not rerun because it writes workspace outputs."
    },
    {
      "id": "E6",
      "kind": "race-diagnosis",
      "locator": "src/sessions.ts:106-167; tests/run-command-guard.test.ts:1115-1135; HEAD comparison",
      "claim": "Virtual-filesystem probe confirms a newly constructed store before queued persistence loads stale data; construction after persistence sees the binding. This asynchronous persistence behavior predates this change.",
      "basis": "observed",
      "uncertainty": "The reported transient's original failure trace was not supplied."
    },
    {
      "id": "E7",
      "kind": "supplied-check-evidence",
      "locator": "delegated assignment; change record Exploration and Tasks",
      "claim": "Root reports post-repair build exit 0; record reports live hook refusal and continued Pi bash fallback.",
      "basis": "inferred",
      "uncertainty": "These executions were not independently repeated."
    }
  ],
  "verification": [
    {
      "check": "AC-1, AC-2, AC-5; Non-goals, Decisions and Clarifications",
      "method": "Diff inspection and full bridge suite",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Both carriers, opt-out, session freezing, approval coexistence and filtered bash exposure are covered."
    },
    {
      "check": "AC-3; repair rounds 1-4",
      "method": "Lifecycle review, full suite and focused counterexample replay with --maxWorkers=2",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "R5 stale-carrier reuse and R6 identity-late metadata loss no longer reproduce; explicit prompt opt-out is preserved."
    },
    {
      "check": "AC-4",
      "method": "Fresh suite/typechecks/check:ci; read-only artifact comparison; supplied root build evidence",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E7"],
      "reason": "Required checks pass; full root build evidence is supplied rather than independently rerun."
    },
    {
      "check": "Record binding and durable-delta baseline",
      "method": "Bundled verify validator, SHA-256 and final input rehash",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Record prefix and reviewed canonical baseline are current."
    }
  ],
  "risks": [
    {
      "description": "tests/run-command-guard.test.ts:1125-1133 constructs a fresh extension without awaiting persistence. The reported transient is consistent with a test synchronization flake atop a pre-existing durability window, not a new guard defect. Rapid real recreation can also miss an unflushed binding. Await persisted metadata in this fixture; consider shutdown flushing separately.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6"]
    },
    {
      "description": "src/provider.ts:1883-1892 tracks guard activation, not private server identity. Same-state recreation can retain an obsolete server name in historical guidance. This is guidance-only: the current catalog and independent PreToolUse denial name the actual tool.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E2", "E3"]
    }
  ],
  "openQuestions": [],
  "nextAction": "root / verification bookkeeping and closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/agy-headless-run-command-guard/agy-headless-run-command-guard.md",
    "reviewedRecordSha256": "d40e117d1f269690abb635201f46b9af2576fa5bc3fa2b22be364dbfa2018a8f"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | run-command-guard tests both carriers + pre-repair live ACP smoke (refusal, Pi bash fallback, GUARD_OK) | Oracle E2/E4/E7
- AC-2: PASS | config/tui passthrough/opt-out tests | Oracle E2/E4
- AC-3: PASS | provider prompt, resume refresh (R4-R6), systemPrompt:false tests | Oracle E3/E4
- AC-4: PASS | bridge suite 1480 passed/5 skipped; root typecheck/check:ci/build exit 0 | Oracle E4/E5/E7
- AC-5: PASS | bridge-catalog tests: builtin bash admitted while guarded, live active/hidden filters | Oracle E2/E4
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:fd929799a64d32ce95f218d0eb3c323e3289a7b5df1b295963a3bc4a9ff984c9

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
