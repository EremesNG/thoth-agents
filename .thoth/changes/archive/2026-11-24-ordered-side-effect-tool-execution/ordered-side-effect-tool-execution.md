# Change: ordered-side-effect-tool-execution

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi 1.6.0 Agent defaults `toolExecution: "parallel"`; the agent loop runs one assistant-message batch concurrently unless any call targets a tool whose definition has `executionMode: "sequential"`, which makes the whole batch run awaited in emitted order (`@earendil-works/pi-agent-core` `agent-loop.js:372-450`, `pi-coding-agent` `core/extensions/types.d.ts:532`). There is no settings-level or ExtensionAPI agent-wide mode. `pi-core` adaptive/direct registration spreads the full definition, so `executionMode` passes through (`pi-packages/pi-core/src/adaptive-tool-exposure.ts:94-104`).
- Built-ins `bash`, `powershell`, `edit`, `write`, `read`, `grep`, `find`, `ls` leave `executionMode` unset. `edit`/`write` already serialize mutations per absolute path through the SDK file-mutation queue (`core/tools/edit.js:93`, `write.js:33`). SDK tool factories resolve `ctx.cwd` at execution (`bash.js:197-198`, `edit.js:92`, `write.js:31`).
- Same-name registration shadows a built-in; across extensions the first extension in runner order wins (`core/extensions/runner.js:415-435`); there is no universal package order (`core/package-manager.js:402,748-762,1114,2292`).
- `pi-packages/pi-contained-shell/src/index.ts:26-40,63-77` registers `bash`/`powershell` only on `win32`, with job-contained operations built from `getShellConfig`/`getPowerShellConfig` without settings arguments or command prefix. Pi's built-in bash uses effective `shellPath` and `shellCommandPrefix` (`core/agent-session.js:3068-3081`); `pi.getSettings()` exposes session settings (`core/extensions/types.d.ts:1331`). Registering a direct extension tool can activate a name the built-in default set leaves inactive unless `defaultActive: false` (`agent-session.js:2980-3067`).
- `pi-antigravity-bridge` registers approval shadows for `bash`, `write`, `edit` and the approval-only `agy_native_approval` once its approval gate starts with gate mode not `off` (`extensions/index.ts:823,958-971,1201,1238-1347`; `src/approval-gate.ts:89,197-211,230-293`). Unmarked calls delegate to SDK factory twins; marked calls return a synthetic approval result without local execution. When active it competes with contained-shell for `bash` (pre-existing; out of scope).
- Side-effecting first-party tools (none set `executionMode` today): pi-subagents `subagent_run`, `subagent_continue`, `subagent_reply`, `subagent_send_message`, `subagent_cancel`, `subagent_extend`, `subagent_result` (stages a terminal acknowledgment that can suppress a completion notification, `src/extension/subagents-extension.ts:198-202,315-319`), child-only `ask_orchestrator`, `notify_orchestrator` (`src/tools/registry.ts:24-35`, `src/runner/orchestrator-tool.ts:16,36`); pi-background-tasks `bg_task_spawn`, `bg_task_watch` (launches a persistent watch), `bg_task_stop`, `bg_task_clear` (`src/tools.ts:120-347`; `bg_tasks` is a namespace, not a tool); `todo` (`pi-todo/todo.ts:84`); `ask_user_question` (`pi-questions-user/src/index.ts:23-30,84`); `AskCodex` (`pi-askcodex/src/ask-tool.ts:88`); `AskAntigravity`, `antigravity` (`pi-antigravity-bridge/src/ask-tool.ts:453`, `extensions/index.ts:881`). Read-only first-party tools stay parallel: `subagent_list_agents`, `subagent_list_tasks`, `subagent_status`, `bg_task_list`, `bg_task_status`, `bg_task_log`, `agy_web_search`, `agy_read_url`. pi-junie-bridge, pi-sidebar, pi-openai-fast, pi-thoth-theme and pi-claude-bridge register no production model tools.
- pi-subagents lean children retain load-time tools from enabled resolved extensions; full mode reloads enabled extensions (`pi-subagents/src/runner/lean-resources.ts:176-188`, `sdk-runner.ts:287-352,527-638`), so definition metadata reaches children. `pi-subagents/test/runner/background-tasks-real-sdk.test.ts:161-203,296-315` streams several tool calls in one assistant response through a real session.
- pi-claude-bridge turns streamed and fallback `tool_use` blocks into Pi tool calls and lets Pi execute the batch (`pi-claude-bridge/src/index.ts:959-975,1257-1364,1506-1533`); no scheduling change needed.
- Reference behavior: Claude Code runs mutating tools exclusively in emitted order and read-only tools concurrently; Codex runs non-parallel-safe handlers exclusively (`openai/codex@38e42cd codex-rs/core/src/tools/parallel.rs`).
- Prompt surface: root and specialist prompts for OpenCode, Codex, Claude Code and Pi render from `src/agents/prompt-sections.ts` with dialects in `src/agents/prompt-dialects.ts`; no current text states that same-message tool calls may run concurrently.

## Intent

In Pi (root and pi-subagents children, any provider including pi-claude-bridge), any assistant-message batch containing a Thoth side-effecting tool or a Thoth-registered shell tool (contained-shell on Windows) executes in emitted order, while batches of only read-only tools keep parallel execution. Add prompt guidance for root and every specialist in all four harnesses that same-message tool calls may run concurrently and dependent calls belong in a later message.

## Non-goals

- Registering new `edit`/`write` overrides or any new same-name shadow; contained-shell stays Windows-only (non-Windows registration is deferred to a separate change because it would widen the Antigravity approval collision and PowerShell cannot run there); on non-Windows, built-in `bash` stays unmarked and is covered by prompt guidance only.
- Changing Antigravity approval semantics, the approval result contract, or resolving the pre-existing contained-shell vs Antigravity `bash` precedence.
- Changing Pi SDK scheduling or forcing agent-wide sequential mode.
- Setting execution modes for tools we do not own (built-in `edit`/`write`/`read`…, `codemode`, `tool_search`, `mcp__*`, thoth-mem, pi-web-access); prompt guidance only.
- Changing pi-claude-bridge.

## Acceptance

- AC-1: Every listed side-effecting first-party tool definition (pi-subagents, pi-background-tasks, pi-todo, pi-questions-user, pi-askcodex, pi-antigravity-bridge including its `bash`/`write`/`edit` approval shadows and `agy_native_approval`) declares `executionMode: "sequential"`; listed read-only tools leave it unset; per-package tests assert the exact sets; approval-only dispatch, allow/deny behavior and zero local execution for approval calls are unchanged (existing approval tests pass).
- AC-2: On Windows, `pi-contained-shell` `bash` and `powershell` definitions declare `executionMode: "sequential"`; registration platform, job containment, fallback warning, operations and activation are otherwise unchanged; on non-Windows it still registers nothing; tests assert both branches.
- AC-3: A real-SDK Pi test drives one assistant message with a sequential tool plus slow and fast calls and observes emitted-order, non-overlapping execution, and drives an all-read-only message and observes overlap; the test fails if `executionMode` is removed.
- AC-4: A real-SDK pi-subagents lean child session granted a side-effecting first-party tool resolves its definition with `executionMode: "sequential"`.
- AC-5: Root and every specialist prompt for OpenCode, Codex, Claude Code and Pi contain the same-message tool-call guidance; rendering tests and regenerated `plugin/` assets pass `integration:verify`.

## Clarifications

- Resolved: Pi decides scheduling per batch from tool definitions; models cannot select execution mode per call.
- Resolved (user, 2026-11-24): after plan-review REJECT, the user chose the reduced scope: no `edit`/`write` overrides; mark existing definitions.
- Resolved (user, 2026-11-24): after the second plan-review REJECT, contained-shell stays Windows-only and only gains the sequential mark; all-platform shell registration is deferred.

## Decisions

- Semantics follow Claude Code as closely as Pi allows: any sequential tool serializes its whole batch in emitted order; all-read-only batches stay parallel. The common "edit then run command" case is ordered because the shell tool is sequential; same-file writes are already queued by the SDK.
- Every competing `bash` definition owned by Thoth (contained-shell on Windows and Antigravity approval shadow) is marked sequential, so ordering holds regardless of which extension wins; dispatch and approval behavior are unchanged.
- `subagent_result` and `bg_task_watch` count as side-effecting.
- Concurrent `subagent_run` launches in one message become sequential launches; acceptable because each returns immediately in background mode.
- No SDK factory import is added to the root `src/` bundle; contained-shell keeps its existing externalized peer dependency.
- The durable promise is bounded to Thoth-owned definitions and to supported Pi SDK versions that honor `executionMode`; if the SDK floor (>=1.5.0) lacks `executionMode`, the worker returns for reassessment.
- Guidance text (shared section, root and specialists, all dialects): "Same-message tool calls may run concurrently; emit a call that depends on another call's result or side effect only after that result arrives, in a later message."

## Durable deltas

- `ADDED pi-ecosystem` **Ordered execution for side-effecting Pi tools** — Thoth-owned Pi tool definitions with side effects (subagent lifecycle, messaging and result acknowledgment, background task spawn/watch/stop/clear, todo, user questions, external-agent asks, Antigravity approval shadows and approval tool, child orchestrator channel) and the Windows contained-shell `bash` and `powershell` tools MUST declare `executionMode: "sequential"` so any assistant-message batch containing one executes in emitted order, while read-only Thoth tools MUST remain eligible for parallel execution, in root and pi-subagents child sessions under every provider on SDK versions that honor execution modes.
  - GIVEN a Windows Pi session with Thoth contained-shell and any provider; WHEN one assistant message calls `edit` and then `bash`; THEN `bash` starts only after `edit` completes; and WHEN one message calls only read-only tools; THEN they may execute concurrently.
- `ADDED multi-harness-agent-pack` **Same-message tool call dependencies** — Default root and specialist instructions for every supported harness MUST state that tool calls emitted in one assistant message may run concurrently and that a call depending on another call's result or side effect must be emitted only after that result arrives.
  - GIVEN the rendered root or any specialist prompt for OpenCode, Codex, Claude Code or Pi; WHEN it is inspected; THEN it contains the same-message tool-call dependency guidance.

## Plan

1. AC-1: add `executionMode: "sequential"` to the listed definitions; per-package exact-set tests; run existing Antigravity approval tests unchanged.
2. AC-2: add `executionMode: "sequential"` to the two win32 contained-shell definitions; no other behavior change; tests for the win32 branch (mode present) and non-Windows branch (no registration).
3. AC-3: real-SDK batch test modeled on `pi-subagents/test/runner/background-tasks-real-sdk.test.ts`, using a faux provider streaming one multi-call assistant message; assert ordering/overlap via timestamps.
4. AC-4: real-SDK lean child test asserting resolved definitions carry `executionMode: "sequential"`.
5. AC-5: guidance line in the shared prompt section; update `src/agents/prompt-rendering.test.ts`; regenerate `plugin/` via `pnpm run integration:sync`.
6. Closeout: focused package tests, `pnpm run integration:verify`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`; fresh Oracle final verification; archive syncs the two deltas.

## Tasks

- [x] AC-1: Side-effecting first-party tools declare sequential execution
  - Outcome: listed side-effecting definitions carry `executionMode: "sequential"`; read-only ones unchanged; approval behavior unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/tools/registry.ts`, `pi-packages/pi-subagents/src/tools/subagent-result.ts`, `pi-packages/pi-subagents/src/runner/orchestrator-tool.ts`, `pi-packages/pi-background-tasks/src/tools.ts`, `pi-packages/pi-todo/todo.ts`, `pi-packages/pi-questions-user/src/index.ts`, `pi-packages/pi-askcodex/src/ask-tool.ts`, `pi-packages/pi-antigravity-bridge/src/ask-tool.ts`, `pi-packages/pi-antigravity-bridge/extensions/index.ts`, `pi-packages/pi-antigravity-bridge/src/approval-gate.ts`; skills `tdd`, `simplify`
  - Inputs: Exploration inventory; Decisions
  - Dependencies: none
  - Output: code plus per-package tests asserting exact sequential and parallel sets
  - Owner: thoth-worker
  - Writes: listed source files and their package tests
  - Interface boundaries: tool names, parameters, results and approval contract unchanged
  - Focused check and PASS evidence: each package's test command passes, including existing approval-gate tests
  - Return milestone: all packages updated with passing tests
  - Stop / reassessment: a registrar drops `executionMode`, SDK floor lacks it, or a tool's side-effect class is unclear
- [x] AC-2: Windows contained-shell tools declare sequential execution
  - Outcome: win32 `bash`/`powershell` definitions carry `executionMode: "sequential"`; nothing else changes
  - Known entrypoints and skill paths: `pi-packages/pi-contained-shell/src/index.ts`, its tests; skills `tdd`, `simplify`
  - Inputs: Exploration; Decisions
  - Dependencies: none
  - Output: code plus tests for win32 (mode present) and non-Windows (no registration)
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-contained-shell/src/index.ts`, `pi-packages/pi-contained-shell/test*/**`
  - Interface boundaries: containment, fallback warning, operations, platform gate and activation unchanged
  - Focused check and PASS evidence: contained-shell tests pass
  - Return milestone: tests green
  - Stop / reassessment: any change beyond adding the mode appears necessary
- [x] AC-3: Real-SDK ordered-batch proof
  - Outcome: test proving emitted-order non-overlap with a sequential tool and overlap for read-only batches
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/test/runner/background-tasks-real-sdk.test.ts`; skill `tdd`
  - Inputs: AC-1 and AC-2 definitions
  - Dependencies: AC-1, AC-2
  - Output: new real-SDK test
  - Owner: thoth-worker
  - Writes: one new test file in the most appropriate package
  - Interface boundaries: none
  - Focused check and PASS evidence: test passes and fails with `executionMode` removed
  - Return milestone: test green
  - Stop / reassessment: harness cannot stream a multi-call assistant message
- [x] AC-4: Lean child propagation proof
  - Outcome: lean child resolves the sequential definition for a side-effecting first-party tool
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/sdk-runner.ts`, `pi-packages/pi-subagents/src/runner/lean-resources.ts`, `pi-packages/pi-subagents/test/runner/`; skill `tdd`
  - Inputs: AC-1, AC-2
  - Dependencies: AC-1, AC-2
  - Output: test (runner fix only if propagation fails)
  - Owner: thoth-worker
  - Writes: pi-subagents runner tests; runner source only if required
  - Interface boundaries: lean resource filtering
  - Focused check and PASS evidence: test passes
  - Return milestone: test green
  - Stop / reassessment: lean mode excludes the owning extensions by design
- [x] AC-5: Same-message tool-call guidance in all harness prompts
  - Outcome: guidance in root and all specialist prompts for four harnesses; regenerated plugin assets
  - Known entrypoints and skill paths: `src/agents/prompt-sections.ts`, `src/agents/prompt-dialects.ts`, `src/agents/prompt-rendering.test.ts`, `plugin/**` via `pnpm run integration:sync`; skill `tdd`
  - Inputs: Decisions guidance text
  - Dependencies: none
  - Output: prompt change, tests, regenerated assets
  - Owner: thoth-worker
  - Writes: those files and generated `plugin/**`
  - Interface boundaries: prompt digests in tests; generated asset manifests
  - Focused check and PASS evidence: `pnpm exec vitest run src/agents/prompt-rendering.test.ts`, `pnpm run integration:verify`
  - Return milestone: tests and verify green
  - Stop / reassessment: guidance conflicts with an existing harness-specific rule

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 plan review: REJECT (approval-shadow collision, built-in parity, inventory); repaired with user-selected reduced scope.
Round 2 plan review: REJECT (non-Windows contained-shell widens approval collision; PowerShell unsupported off Windows); repaired by keeping contained-shell Windows-only per user.
Round 3 plan review: OKAY (fresh Oracle subtask_thoth-oracle_1795560438798_9a256b1c; delivered gate verdict valid).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1605dfe54e8c80235ced027496b86905be6558c70530365547ac23faabf4bdeb

Fresh Oracle subtask_thoth-oracle_1795561643605_5d6cb0bb; delivered thoth-gate-verdict valid:true, kind final-verification, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "AC-1 through AC-5 are satisfied. Antigravity approval dispatch is unchanged apart from scheduling. No unrelated edits found beyond the declared out-of-scope language change.",
  "evidence": [
    {
      "id": "E1",
      "kind": "diff-and-tests",
      "locator": "pi-packages/* tool publication tests; pi-antigravity-bridge/src/approval-gate.ts:230–294",
      "claim": "Exact mode sets match the record. Approval registration, ticket validation, allow/deny, and local-execution branches are unchanged. Focused registration and approval tests passed 115/115, including native approval end-to-end tests.",
      "basis": "observed",
      "uncertainty": "The pre-existing Antigravity versus contained-shell bash precedence is unchanged and out of scope."
    },
    {
      "id": "E2",
      "kind": "diff-and-tests",
      "locator": "pi-packages/pi-contained-shell/src/index.ts:63–83; tests/extension.test.ts",
      "claim": "Only Windows bash and powershell gain the sequential marker; containment, warnings, activation, and the platform guard are unchanged. Branch and extension tests passed 7/7.",
      "basis": "observed",
      "uncertainty": "Non-Windows branches were exercised by platform stubs."
    },
    {
      "id": "E3",
      "kind": "real-SDK-tests",
      "locator": "pi-packages/pi-subagents/test/runner/ordered-tools-real-sdk.test.ts:95–250",
      "claim": "All 4 cases passed: the marked batch runs in emitted order without overlap, removing the mark restores overlap, read-only calls overlap, and the real lean child retains the mark. Published Pi 1.5.0 source also preserves and honors executionMode.",
      "basis": "observed",
      "uncertainty": "Runtime tests used pinned Pi 1.6.0 and a fixture provider; Pi 1.5.0 was inspected, not executed."
    },
    {
      "id": "E4",
      "kind": "diff-and-tests",
      "locator": "src/agents/prompt-sections.ts:150–152,269,370; prompt-rendering.test.ts; codex.test.ts; plugin/; pi/agents/",
      "claim": "The same guidance renders for root and all five specialists across all four harnesses. Prompt and Codex adapter tests passed 200/200; integration:verify passed 13/13.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "record-and-scope",
      "locator": ".thoth/changes/ordered-side-effect-tool-execution/ordered-side-effect-tool-execution.md; git status and diff",
      "claim": "The SDD verify gate accepted both source digests. The earlier language removal was excluded as instructed. No other unrelated edits were identified; git diff --check passed.",
      "basis": "observed",
      "uncertainty": "Full package suites, build, typecheck, and check:ci were reported by root or workers and not independently rerun."
    }
  ],
  "verification": [
    {"check":"AC-1","method":"Inspect definition and dispatch diffs; rerun registration and approval tests","outcome":"pass","evidenceIds":["E1"],"reason":"Exact sets and unchanged approval behavior verified."},
    {"check":"AC-2","method":"Inspect contained-shell diff and rerun extension tests","outcome":"pass","evidenceIds":["E2"],"reason":"Windows-only metadata change verified."},
    {"check":"AC-3","method":"Run real-SDK batch tests with marked, stripped, and read-only cases","outcome":"pass","evidenceIds":["E3"],"reason":"The stripped control demonstrates that the marker determines ordering."},
    {"check":"AC-4","method":"Inspect active definition in a real lean child session","outcome":"pass","evidenceIds":["E3"],"reason":"The authorized tool resolves as sequential."},
    {"check":"AC-5","method":"Run prompt rendering, Codex adapter, and integration verification","outcome":"pass","evidenceIds":["E4"],"reason":"Role and harness coverage and generated assets verified."},
    {"check":"Record and scope","method":"Run the SDD verify gate, hash the record prefix, and inspect the worktree diff","outcome":"pass","evidenceIds":["E5"],"reason":"Record is bound to the reviewed prefix and the diff matches scope."}
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "root: SDD closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/ordered-side-effect-tool-execution/ordered-side-effect-tool-execution.md",
    "reviewedRecordSha256": "1605dfe54e8c80235ced027496b86905be6558c70530365547ac23faabf4bdeb"
  }
}
```

- AC-1: PASS | package exact-set tool publication tests + approval-gate tests | Oracle E1 115/115; worker full suites (subagents 2,820, background-tasks 814, todo 564, questions-user 317, askcodex 319, antigravity 2,046)
- AC-2: PASS | pi-contained-shell extension tests | Oracle E2 7/7; package 24/24
- AC-3: PASS | pi-subagents/test/runner/ordered-tools-real-sdk.test.ts | Oracle E3 4/4 incl. stripped-mark control
- AC-4: PASS | same real-SDK test, lean child case | Oracle E3
- AC-5: PASS | prompt-rendering + codex adapter tests, integration:verify | Oracle E4 200/200, 13/13; root check:ci 0, typecheck 0, build 0
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:b844d4b2e6e0036a8dcd61cc8196b0558d5e8528212999a05ec87b4054a2ee6a
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:078d432e41b6a30df7a547cf70d65fb1f07a314d115f8f626ecfded033acacff

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
