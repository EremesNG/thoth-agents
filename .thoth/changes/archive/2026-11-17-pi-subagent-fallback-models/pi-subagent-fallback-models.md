# Change: pi-subagent-fallback-models

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Explorer task `subtask_thoth-explorer_1794882581521_7b4acdc6` (read-only) established:

- Pi subagents resolve exactly one model: `pi-packages/pi-subagents/src/profile-resolver.ts:60-72` (profile → definition `model` → `config.default_model` → orchestrator model). Profiles store one `provider/id` per agent (`src/model-profiles/store.ts:15,52-76`, `src/types.ts:24,55-61`).
- No retry/fallback: `src/runner/sdk-runner.ts:800` `attempt(model)` is called once (`:930`), `fallback_used: false` is hardcoded (`:942`), the catch (`:944-957`) classifies and rethrows. `UPSTREAM-CHANGELOG.md:120` records that upstream removed automatic model fallback.
- Unused scaffolding: `src/error-metadata.ts:24` `ATTEMPTS_LIMIT = 2`, `:27-44` `RETRYABLE_DEFAULTS` (api/rate-limit/network retryable; auth, timeouts, cancelled, context_overflow not), `:36-52` roles `primary|fallback`, `:311-372` `classifyThrownError`, `:410-427` `classifyFallbackFailure` (no callers). `fallback_used` exists on task/result (`src/types.ts:526,562`) and history (`src/history.ts:213,319`, per-attempt table `:284-312`).
- Failure surfacing: `src/manager.ts:2455-2485`. `launchAttempt` already loops (`src/manager.ts:2082-2301`) re-invoking the runner for interaction retries.
- Resuming the persisted nested session with another model already works through `subagent_continue` (`src/tools/subagent-continue.ts:51`, `src/manager.ts:265-300,1775`, `src/runner/sdk-runner.ts:508-522`); its tool guidance says "Never auto-switch models" (`src/tools/subagent-continue.ts:41`).
- Pi core retries the same model only (settings `retry`, events `auto_retry_start/end`); the child error reaches the runner after those retries are exhausted.
- OpenCode already has role fallback chains through a host retry hook (`src/hooks/foreground-fallback/index.ts`); not shareable as code. Codex and Claude Code accept only one model per agent; out of scope.

## Intent

Let a Pi subagent declare an ordered list of fallback models. When the run with the current model fails with an eligible provider error, pi-subagents automatically continues the same nested child session with the next model in the chain until one succeeds or the chain is exhausted, and reports which models were tried and why each failed.

## Non-goals

- OpenCode (already supported), Codex and Claude Code (no host capability).
- Editing fallback chains in the `/subagents-model` TUI; chains are edited in profile JSON or agent definitions. A later change can add UI.
- Switching models on timeouts, stall, cancellation, context overflow or interaction/question failures.
- Changing Pi core same-model auto-retry behavior.
- Root orchestrator model fallback.

## Acceptance

- AC-1: A fallback chain resolves per subagent from the first non-empty fallback configuration, independently of which source selected the primary model: the effective profile entry `fallback_models`, otherwise the agent definition frontmatter `fallback_models`, otherwise `subagents.json` `default_fallback_models`; duplicates of the primary and of earlier entries are removed; a chain is empty when none is configured or when `subagent_continue` passes an explicit `model` override (`subagent_run` exposes no model parameter today and none is added).
- AC-2: When the child run fails with a classified retryable `provider_api_error`, `provider_rate_limit` or `provider_network_error`, or any `provider_auth_error`, and the chain has a remaining model, pi-subagents continues the same persisted nested session with the next model (same task ID, prior turns including tool activity preserved, the newly captured nested session path reopened with a continuation prompt instead of replaying the delegated task; when the failed attempt produced no session file the next model starts the original task), without root intervention; the task total deadline spans all attempts and an abort or expired deadline at the transition stops without starting the next model; a runner success settling at or after the absolute total deadline (`Date.now() >= timeout_deadline_at`) is reconciled as `total_timeout` for every attempt, including single-model runs, instead of relying only on the deadline timer firing first; any other failure class, cancellation, timeout or an exhausted chain fails the task exactly as today with the last attempt's exact error.
- AC-3: Each model attempt is observable: task/result report the model actually used and `fallback_used: true` when a fallback ran; history persists one attempt row per model with its classified failure; the parent completion message lists the failed models and reasons; the UI shows the current model during the run.
- AC-4: Without any configured chain, behavior, results, history and tests are unchanged, except the deliberate strict absolute-deadline reconciliation of AC-2.
- AC-5: README documents configuration, eligibility, precedence and override behavior; the `subagent_continue` "Never auto-switch models" guidance is clarified as root guidance that does not forbid configured fallback.

## Clarifications

- Trigger set (user, 2026-11-16): provider errors (API, rate limit, network) plus authentication errors; not timeouts, cancellation or context overflow.
- Continuation (user, 2026-11-16): continue the same nested child session with the next model, preserving work.
- User noted the design is inspired by the upstream fallback that was removed.
- Deadline race (user, 2026-11-17, after Oracle round 4): enforce the total deadline strictly for all attempts — check the absolute deadline synchronously before accepting any runner success, also for single-model runs.

## Decisions

- Scope limited to Pi pi-subagents.
- Chain is opt-in by configuration; no global enable flag (an empty chain is disabled).
- An explicit `subagent_continue` `model` override disables fallback for that call, mirroring OpenCode operator-override behavior. `subagent_run` has no model parameter (`src/tools/subagent-run.ts:90-103`) and this change does not add one.
- The loop lives in the manager `launchAttempt` loop so attempts reuse task, abort, deadline and history bookkeeping; the total timeout spans all attempts.
- Fallback happens only after Pi same-model auto-retry has surfaced the error to the runner.
- The manager loop is bounded by chain length (primary + fallbacks); the legacy `ATTEMPTS_LIMIT` and `classifyFallbackFailure` exports in `src/error-metadata.ts` stay untouched because the loop does not use them.
- Implementation-review decisions (root, after worker report): the chain comes from the first non-empty fallback configuration rather than the primary's source; provider failures classified non-retryable are excluded except authentication errors; an attempt that failed before a session file existed restarts the original task on the next model.
- Thoth-generated agent definitions do not set fallbacks by default.

## Durable deltas

- `ADDED pi-ecosystem` **Pi subagent model fallback chains** — pi-subagents MUST resolve an optional ordered per-subagent fallback model chain from the first non-empty fallback configuration (profile entry, then agent definition, then `subagents.json` default), MUST disable it for an explicit `subagent_continue` model override, and on a classified retryable provider API, rate-limit or network failure, or an authentication failure, MUST continue the same nested child session with the next chain model under the same task until success or exhaustion, reporting each attempted model and failure; timeouts, cancellation, context overflow and other failures MUST NOT switch models, and an empty chain MUST preserve single-model behavior.
  - GIVEN a worker whose profile selects `openai/gpt-x` with `fallback_models: ["anthropic/claude-sonnet-5-5"]`; WHEN the first attempt fails with a provider rate-limit error; THEN the same task continues its nested session on `anthropic/claude-sonnet-5-5`, completes, reports `fallback_used: true` and records both attempts in history, while a timeout on the first model would fail the task without switching.

## Plan

Technical approach (pi-packages/pi-subagents only):

1. Chain resolution: extend profile entry type and store parsing (`src/types.ts`, `src/model-profiles/store.ts`) with optional `fallback_models: string[]`; parse definition frontmatter `fallback_models`; add `default_fallback_models` to `subagents.json` config schema; extend `src/profile-resolver.ts` to return `{ model, fallbackModels, source }` with dedupe and `subagent_continue` explicit-override suppression. Unit tests in `test/profile-resolver.test.ts`, `test/model-profiles/*`, `test/config.test.ts`.
2. Fallback loop: in `src/manager.ts` `launchAttempt`, on runner failure classify via existing `src/error-metadata.ts`; if eligible (provider api/rate/network/auth) and chain remains and neither abort nor the total deadline has fired, set the next model and reinvoke the runner reopening the newly captured persisted nested session path (`task.nested_session_path` after the failed attempt, same reopen path as `subagent_continue`) with a short continuation prompt rather than the original delegated task, bump attempt, record attempt history; set `fallback_used`, actual model; aggregate attempt failures into the completion message. Replace `ATTEMPTS_LIMIT` with chain length; wire or remove dead `classifyFallbackFailure`. Respect abort and total deadline across attempts. Runner (`src/runner/sdk-runner.ts`) stops hardcoding `fallback_used`. Tests: fake-runner manager tests for switch, non-eligible, exhaustion, `subagent_continue` override, abort at transition and deterministic total-deadline expiry spanning attempts; plus a runner/SDK-backed regression (pattern of `test/runner/tool-selectors-real-sdk.test.ts` / `test/thread-view-real-sdk.test.ts`, faux provider) where the first model performs a tool call then fails with a provider error, asserting the second attempt reopens the same session file, runs on the changed model and sees the prior tool activity in context.
3. Docs: `pi-subagents/README.md` section; clarify `src/tools/subagent-continue.ts:41` guidance; changelog entry if the package keeps one.

Risks: reopening a session after a mid-turn provider failure may leave a dangling partial assistant turn — verified by reusing the same reopen path as `subagent_continue`; double usage accounting across attempts; history schema change for per-attempt model (prefer reuse of existing per-attempt table columns).

Verification seams: `pnpm --filter` package tests for pi-subagents (focused files), package typecheck, `pnpm run check:ci`, `pnpm run typecheck`.

## Tasks

- [x] AC-1: Resolve per-subagent fallback chains with precedence, dedupe and override suppression
  - Outcome: resolver returns primary model plus fallback chain from profile, definition or config default
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/profile-resolver.ts, src/model-profiles/store.ts, src/types.ts, definition frontmatter parsing, config schema, src/manager.ts continue override (~265-300) and startOne resolution (~1924-1943); tdd skill
  - Inputs: this record; explorer findings
  - Dependencies: none
  - Output: code plus unit tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/{profile-resolver.ts,types.ts,model-profiles/**,config parsing/definition parsing files}, matching tests
  - Interface boundaries: profiles.json and subagents.json remain backward compatible; /subagents-model UI untouched
  - Focused check and PASS evidence: focused vitest files for resolver, profile store and config pass; package typecheck passes
  - Return milestone: resolver API and tests green
  - Stop / reassessment: UI or store format change that breaks existing profiles
- [x] AC-2: Continue the nested session with the next chain model on eligible provider failures
  - Outcome: manager fallback loop with eligibility, session reopen, abort/deadline handling
  - Known entrypoints and skill paths: src/manager.ts (launchAttempt ~2082-2301, failure ~2455-2485, continue override ~265-300), src/runner/sdk-runner.ts (800-957, 508-522), src/error-metadata.ts; tdd skill
  - Inputs: accepted AC-1 resolver output
  - Dependencies: AC-1 resolver task
  - Output: code plus fake-runner manager tests covering switch, non-eligible, exhaustion, subagent_continue override, abort at transition and total deadline spanning attempts, and an SDK-backed persisted-session regression (tool activity then provider failure; changed model, same session file, preserved context)
  - Owner: thoth-worker
  - Writes: src/manager.ts, src/runner/sdk-runner.ts, src/error-metadata.ts, matching tests
  - Interface boundaries: task status/result contract, subagent_continue path
  - Focused check and PASS evidence: focused manager, error-metadata and SDK-backed runner regression tests pass
  - Return milestone: loop implemented and green
  - Stop / reassessment: reopen path cannot resume after mid-turn provider failure
- [x] AC-3: Report attempted models in task, result, history, completion message and UI
  - Outcome: observable per-attempt models and failures
  - Known entrypoints and skill paths: src/types.ts, src/history.ts (213, 284-312, 319), completion message and UI render in src/manager.ts / src/render
  - Inputs: AC-2 loop
  - Dependencies: AC-2 loop task
  - Output: code plus history and notification tests
  - Owner: thoth-worker
  - Writes: src/history.ts, src/manager.ts, src/render/** as needed, matching tests
  - Interface boundaries: history DB compatibility, published task summary channel fields
  - Focused check and PASS evidence: history and manager notification tests pass
  - Return milestone: attempts visible and green
  - Stop / reassessment: history schema migration needed
- [x] AC-4: Prove unchanged behavior without a configured chain
  - Outcome: existing pi-subagents test suite passes unchanged
  - Known entrypoints and skill paths: pi-packages/pi-subagents/test
  - Inputs: AC-1..AC-3 code
  - Dependencies: AC-1, AC-2, AC-3 tasks
  - Output: full package test run evidence
  - Owner: thoth-worker
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: full pi-subagents package tests and typecheck pass
  - Return milestone: suite green
  - Stop / reassessment: existing test needs changes beyond the new contract
- [x] AC-5: Document fallback chains and clarify continue guidance
  - Outcome: README section and clarified tool guidance
  - Known entrypoints and skill paths: pi-packages/pi-subagents/README.md, src/tools/subagent-continue.ts:41
  - Inputs: final configuration shape from AC-1
  - Dependencies: AC-1 resolver task
  - Output: docs and guidance text
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/README.md, src/tools/subagent-continue.ts
  - Interface boundaries: tool description tests if any
  - Focused check and PASS evidence: README accurate to code; tool tests pass
  - Return milestone: docs updated
  - Stop / reassessment: none
- [x] AC-2: Final-verification repair — recheck abort and total deadline immediately before invoking the next model, after transition bookkeeping
  - Outcome: cancellation or deadline expiry during fallback persistence/notification callbacks never starts the next runner and never ends as completed
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/manager.ts:2339-2433,2150; tdd skill
  - Inputs: Oracle FAIL subtask_thoth-oracle_1794884432535_ca488251 counterexample
  - Dependencies: none
  - Output: fix plus post-bookkeeping transition regressions (cancel and deadline in the fallback update callback)
  - Owner: thoth-worker
  - Writes: src/manager.ts, test/manager-model-fallback.test.ts
  - Interface boundaries: existing stop/error semantics
  - Focused check and PASS evidence: new regressions pass; focused files pass
  - Return milestone: fix green
  - Stop / reassessment: guard requires changing timeout disposition semantics
- [x] AC-3: Final-verification repair — completion message always shows the terminal model failure reason
  - Outcome: exhausted chain lists every failed model including the last, independent of partial-output rendering
  - Known entrypoints and skill paths: src/model-fallback.ts:75-88, src/render/completion-message.ts:123-133
  - Inputs: Oracle FAIL counterexample (answered interaction with partial output then exhaustion)
  - Dependencies: none
  - Output: fix plus interaction-then-exhaustion regression
  - Owner: thoth-worker
  - Writes: src/model-fallback.ts, src/render/completion-message.ts, matching tests
  - Interface boundaries: completion message format for non-fallback tasks unchanged
  - Focused check and PASS evidence: regression passes; completion-message tests pass
  - Return milestone: fix green
  - Stop / reassessment: none
- [x] AC-3: Final-verification repair 2 — a stopped transition never reports the undispatched fallback model
  - Outcome: when cancellation or deadline stops dispatch at transition, task/result model, fallback_used, attempt number, history rows and completion message reflect only models that actually ran
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/manager.ts:2395-2438, src/model-fallback.ts:83-93
  - Inputs: Oracle FAIL subtask_thoth-oracle_1794884987522_18b94d7d probe
  - Dependencies: none
  - Output: fix plus extended transition regressions asserting task, history and completion reporting
  - Owner: thoth-worker
  - Writes: src/manager.ts, src/model-fallback.ts, test/manager-model-fallback.test.ts
  - Interface boundaries: cancelled/total_timeout terminal disposition unchanged
  - Focused check and PASS evidence: extended regressions pass; focused files pass
  - Return milestone: fix green
  - Stop / reassessment: none
- [x] AC-3: Final-verification repair 3 — no next-model state or persistence before the last dispatch guard
  - Outcome: deadline expiry or cancellation during any transition persistence (failed-attempt row or next-attempt row) never reports the undispatched model in task, history or completion
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/manager.ts:2397-2456; tdd skill
  - Inputs: Oracle FAIL subtask_thoth-oracle_1794886337618_b651a5f6 probe (Date.now advanced during history writes)
  - Dependencies: none
  - Output: structural fix plus regressions injecting expiry/cancel during each history write
  - Owner: thoth-worker
  - Writes: src/manager.ts, test/manager-model-fallback.test.ts
  - Interface boundaries: cancelled/total_timeout disposition unchanged
  - Focused check and PASS evidence: new regressions pass; focused and full package suites pass
  - Return milestone: fix green
  - Stop / reassessment: fix requires changing history schema
- [x] AC-2: Final-verification repair 4 — strict absolute total deadline before accepting any runner success
  - Outcome: a runner success settling at or after `timeout_deadline_at` (single-model or fallback attempt, including expiry during next-attempt persistence/update) ends as `total_timeout` via the existing stop path, never `completed`
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/manager.ts:2349-2385,2503-2519, armDeadline ~1414-1422; tdd skill
  - Inputs: Oracle FAIL subtask_thoth-oracle_1794887081508_f9140844 counterexample; user decision strict for all attempts
  - Dependencies: none
  - Output: synchronous expiry reconciliation plus regressions (single-model and fallback, expiry during next-attempt write/update then microtask or deferred resolution)
  - Owner: thoth-worker
  - Writes: src/manager.ts, test/manager-model-fallback.test.ts, a single-model deadline test file as appropriate
  - Interface boundaries: total_timeout partial-context/continuation semantics unchanged
  - Focused check and PASS evidence: new regressions pass; full package suite passes
  - Return milestone: fix green
  - Stop / reassessment: existing tests encode success-after-deadline as completed beyond trivial updates

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
**Reviewed record SHA-256**: 3c7a1e06e641736d8d0fb4eb9b8aa2e0a9c28312b64ba3bd7b6191a2c7e7a905

Final verification round 5 by Oracle task subtask_thoth-oracle_1794888101667_323a8633 (delivered thoth-gate-verdict valid, recordDigest match). Rounds 1-4 FAILed; findings repaired by the recorded repair task rows.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-5 satisfied. All prior counterexamples passed re-probing, including strict absolute deadlines for single-model and fallback runs.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/pi-subagent-fallback-models/pi-subagent-fallback-models.md",
      "claim": "Exact-byte prefix SHA-256 and implementation fingerprints unchanged across verification. Bundled --through verify passed; canonical source digest matches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "pi-packages/pi-subagents/src/profile-resolver.ts:79-100; src/manager.ts:303-313,2184-2525; src/model-fallback.ts:27-99",
      "claim": "Reviewed precedence/deduplication, override suppression, eligibility, persisted-session continuation, dispatch guards, synchronous deadline reconciliation and terminal reporting against the actual diff.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "focused-tests",
      "locator": "pi-packages/pi-subagents/test/{manager-model-fallback,timeout-attention,render/completion-message,runner/fallback-real-sdk,profile-resolver,model-profiles/store,config,history,error-metadata-compatibility}.test.ts",
      "claim": "All nine requested focused files passed: 265 tests. Includes happy paths, preserved SDK tool context, exhaustion, terminal reason after interaction, and prior transition/deadline regressions.",
      "basis": "observed",
      "uncertainty": "SDK regression uses a faux provider; live providers were not exercised."
    },
    {
      "id": "E4",
      "kind": "full-suite",
      "locator": "pnpm --filter @thoth-agents/pi-subagents test",
      "claim": "122/122 files passed; 2751 tests passed, one skipped. history-compaction passed; its source and test are unchanged from HEAD.",
      "basis": "observed",
      "uncertainty": "Earlier reported timing failures were not reproduced; their pre-existing causality was not independently established."
    },
    {
      "id": "E5",
      "kind": "independent-probes",
      "locator": "Read-only inline node --import tsx probes",
      "claim": "84/84 passed: 48 transition cases across both transitions, pending/next updates and failed/next history writes, cancellation/exact/late deadlines and microtask/deferred settlement; 18 single-model deadline boundary cases; 18 interaction-retry stop cases. Asserted actual dispatched models, attempt counts, history, terminal categories and completion reporting.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "static-checks",
      "locator": "pnpm --filter @thoth-agents/pi-subagents run typecheck; pnpm run check:ci; pnpm run typecheck",
      "claim": "All exited 0. check:ci reported nonfatal warnings/information and applied no fixes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "documentation-review",
      "locator": "pi-packages/pi-subagents/README.md:582-615; src/tools/subagent-continue.ts:41",
      "claim": "Documentation matches configuration, eligibility, precedence, deduplication and explicit-override behavior; root-only auto-switch guidance is clarified.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Resolver/config/store diff and focused tests, including continue override.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "First non-empty chain resolves independently of primary selection, deduplicates and disables on explicit override."
    },
    {
      "check": "AC-2",
      "method": "Manager/SDK review, regressions and independent boundary probes.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Eligible failures continue preserved sessions; cancellation/deadline guards prevent undispatched transitions; success at or after deadline becomes total_timeout."
    },
    {
      "check": "AC-3",
      "method": "Task/result/history/update/completion assertions.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Only executed models are reported; failures and terminal reasons remain observable, including after interaction."
    },
    {
      "check": "AC-4",
      "method": "Full package suite, no-chain deadline probes and typechecks.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5", "E6"],
      "reason": "Existing suite passes with the explicitly accepted strict-deadline exception."
    },
    {
      "check": "AC-5",
      "method": "Documentation compared with implementation.",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "Required configuration and operator guidance are accurate."
    },
    {
      "check": "Record validity and freshness",
      "method": "Bundled verify validator, baseline digest and before/after fingerprints.",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Review remains bound to unchanged inputs."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "root → record verification and closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagent-fallback-models/pi-subagent-fallback-models.md",
    "reviewedRecordSha256": "3c7a1e06e641736d8d0fb4eb9b8aa2e0a9c28312b64ba3bd7b6191a2c7e7a905"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | resolver/config/store tests and diff review | Oracle E2, E3
- AC-2: PASS | manager tests, SDK-backed fallback regression, 84 boundary probes | Oracle E2, E3, E5
- AC-3: PASS | task/history/completion assertions and probes | Oracle E2, E3, E5
- AC-4: PASS | full pi-subagents suite 122/122 files, typechecks | Oracle E3-E6
- AC-5: PASS | README and subagent_continue guidance review | Oracle E7
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:263f3b1152b19b99947fafcefd84aebd364ff23ccce928c04362ce5a23bd01a1

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
