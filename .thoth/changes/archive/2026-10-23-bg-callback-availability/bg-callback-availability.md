# Change: bg-callback-availability

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: high

## Exploration

- `pi-packages/pi-background-tasks` is a fork of 1aboveio/pi-better-harness `packages/pi-better-background-tasks` at `86876e8` (the `upstream` object in its package.json).
  - Removed locally: SSH/tmux, sandbox and goal integration.
  - Added locally: session-reload ownership, verified termination and Windows Job Objects (`cda1fef`, `91773a4`, `e55ef5e`), plus structured display details and rendering.
  - The shared navigator is replaced by `@thoth-agents/pi-core`.
- Upstream fix `a8153fe` (#410), in `src/shared-callback-batcher.ts`, `src/tools.ts`, `src/e2e.test.ts` and `docs/usage.md`:
  - **Availability gate**: adds `isAvailable`, `setAvailability` and `setHost`. Ordinary flushes wait for `ctx.isIdle()`. Context is refreshed on `session_start`, `agent_start` and `agent_settled`. An availability exception defers delivery, and a lightweight retry timer recovers idle transitions that emit no lifecycle event, such as manual compaction.
  - **Aggregation**: the existing `background-completion-batch` aggregation is kept (100 ms window, 2 KiB budget, represented-only receipts, overflow). Batches are sent with `sendMessage(..., { deliverAs: "followUp", triggerTurn: true })`; urgent notifications stay immediate.
  - **Duplicate guard**: an `awaitingRun` flag blocks another ordinary handoff while Pi still reports idle during deferred settlement. Observing busy clears it. A failed send resets it and restores the events.
  - **Queue identity**: the global registry `Symbol.for("@1aboveio/pi-better-harness/callback-batcher")` changes its `byHost` key from the API object to `host.events ?? host`. It adds `bySession: WeakMap` keyed by the `ctx.sessionManager` object. `setHost` refreshes the sender without discarding receipts. Cancellation disables availability and clears pending entries.
- Later upstream commits `03e446a` (#431), `013dec9` (#432) and `5b5408b` (#442) are not ancestors of `a8153fe` and are not prerequisites.
- `git apply --check` fails in all four files because of local divergence: display details, removed integrations, lifecycle placement, tests and docs.
- Local seams:
  - API-host queue key: `src/shared-callback-batcher.ts:739–753`.
  - Global storage: `:125–129,756–761`.
  - Ordinary handoff: `:638–647` (keeps local `details`). Urgent handoff: `:685–721`.
  - Lifecycle and cancellation: `src/tools.ts:17,138–153`. It replays on start and cancels on switch and on every shutdown.
  - Enqueue and durable receipts: `src/runtime.ts:960–1018`. Ownership recheck: `:1021–1038`.
  - Reload lifecycle: `src/index.ts:28–55`. Owned work is resumed before replay, suspended on shutdown, and terminated only on non-reload shutdown.
- Queued events capture the registering runtime's `getActiveSession` (`runtime.ts:999–1003`), and shutdown clears it (`tools.ts:151–153`). An event preserved across reload would therefore suppress itself (`runtime.ts:1027`). Unreceipted terminal tasks are replayed from durable metadata on `session_start` (`tools.ts:140–143`).
- No other repository package consumes the batcher or its global Symbol. Production consumers are `runtime.ts` and `failures.ts:175`.
- Installed Pi 1.0.2:
  - `ctx.isIdle()` (`dist/core/extensions/types.d.ts:235–236`), implemented as `!this._isAgentRunActive && !this.isCompacting` (`dist/core/agent-session.js:1038–1039`).
  - `agent_settled` (`types.d.ts:767–770,1172–1174`).
  - `sendMessage` with `triggerTurn` and `deliverAs` (`:1220–1224`).
  - A stale reloaded context can throw from `isIdle` (`dist/core/extensions/runner.js:654–657`).
- Baseline: package `test --maxWorkers=2` reports 48 files, 580 passed and 4 skipped (about 179 s). The default worker count timed out at 120 s.
- Upstream partial clone: `C:\Users\EremesNG\AppData\Local\Temp\tmp.rgDzHLLoHn\upstream`.

## Intent

Port upstream `a8153fe` so that ordinary background completion callbacks wait for an idle agent and arrive as one aggregated follow-up without duplicate handoffs. Keep local reload ownership, verified termination and display details.

## Non-goals

- Later upstream completion steering, session-configurable delivery and settings (`03e446a`, `013dec9`, `5b5408b`).
- Upstream's external `packages/callback-batcher` package and its real-Pi runtime script `scripts/callback-availability-runtime.test.mjs`. Their relevant cases are covered by package-local tests instead.
- Changing the global registry Symbol, persisting the in-memory queue, or guaranteeing exactly-once model execution beyond the existing handoff receipts.
- Bumping the package version or publishing.

## Acceptance

- AC-1: Ordinary completion callbacks are held while Pi is busy. Busy means `ctx.isIdle()` returns false or throws, or no live context is available. Held callbacks are delivered once Pi is idle: after `agent_settled`, after a context refresh on `session_start` or `agent_start`, or through a retry timer for idle transitions without a lifecycle event. Callbacks held for a session are delivered as one `background-completion-batch` follow-up that triggers a turn, within the existing window, payload budget, overflow and receipt rules, and with local display details kept. Urgent notifications keep immediate delivery.
- AC-2: After an ordinary handoff, no further ordinary handoff happens until Pi has been observed busy or the send failed. A failed send resets the guard and restores the events for retry. Existing `handedOff` receipt semantics are unchanged.
- AC-3: Queue identity follows the host event bus (`host.events ?? host`) and the session manager. API wrappers of one Pi session share one queue, and distinct sessions and Pi instances stay isolated. `setHost` refreshes the sender and context on reload. Across a reload, the old instance sends nothing and cancels its pending entries. The new instance delivers each unreceipted terminal task exactly once through durable replay, and no stale ownership closure suppresses or duplicates a callback.
- AC-4: Local verified termination, Windows Job containment, reload ownership, cross-session suppression, durable receipts and structured display rendering are unchanged. Existing tests pass unchanged except where an adopted fix intentionally changes asserted behavior; each such change is listed with its reason. `docs/usage.md` documents the availability gating.
- AC-5: Package `typecheck` and `test --maxWorkers=2` pass. Root `pnpm run build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- No material human-owned question remains. The reload queue ownership, the registry Symbol and the test coverage are settled in Decisions from repository evidence.

## Decisions

- **Reload**: keep local reload ownership instead of preserving old pending events. The old instance cancels its pending entries, and the new instance replays unreceipted terminal tasks from durable metadata. This avoids stale `getActiveSession` closures and relies on the existing tested replay path. In-memory handoff receipts may persist in a shared batcher, to prevent resends after a receipt-write failure.
- **Registry Symbol**: keep the global registry Symbol unchanged. No repository package shares it, and co-loading upstream pi-better-harness packages with this fork would already conflict on tool names. Mixed-version sharing is an accepted, out-of-scope risk.
- **Tests**: port upstream's availability-gated e2e case. Add package-local regressions for the upstream callback-batcher cases that apply:
  - busy hold and settled flush;
  - the debounce race;
  - manual-compaction timer recovery;
  - the deferred-run duplicate guard;
  - failed-send restore;
  - wrapper sharing by event bus;
  - session isolation;
  - reload exactly-once.
- Adapt the fix to local code; do not apply upstream refactors to make the patch fit.

## Durable deltas

- `ADDED pi-ecosystem` **Background completion callbacks wait for an idle agent** — `@thoth-agents/pi-background-tasks` MUST hold ordinary background completion callbacks while the Pi agent is busy and deliver a session's held callbacks as one aggregated follow-up that triggers a turn after the agent becomes idle. It MUST NOT hand off another ordinary callback batch until the previous handoff has started a run or failed, and MUST keep urgent notifications immediate.
  - GIVEN two background tasks of one session that complete while the agent is running a turn; WHEN the agent settles; THEN one follow-up message reports both completions and triggers one turn, and no second ordinary handoff happens before that turn starts.

## Plan

- **AC-1–AC-3 (one worker unit, test-first)**:
  - First, write the regressions in Decisions plus the ported e2e case and confirm they fail.
  - Then implement in `src/shared-callback-batcher.ts`: the availability gate and retry timer, the `awaitingRun` guard, event-bus and session-manager keyed sharing, and `setHost`.
  - Wire it in `src/tools.ts`, covering context refresh and settled flush. Keep cancellation, reload ownership and replay in `src/tools.ts`, `src/index.ts` and `src/runtime.ts` as decided.
  - Update `docs/usage.md`.
- **AC-4**: root reviews regressions.
- **AC-5**: root runs the closeout checks.
- **Mutable surface**: `pi-packages/pi-background-tasks/**` only, with no dependency or lockfile changes. It is disjoint from change `todo-codemode-replay`, so the two may run in parallel; spec archive sync is serialized.
- **Interfaces to preserve**: the Pi 1.0.2 extension API; the pi-core work-panel and render-kit contracts; the `.thoth/specs/pi-ecosystem` background requirements; the tool-definition size budget (tool schemas are unchanged).
- **Risks**:
  - Lost callbacks when a held queue is cancelled before durable replay.
  - Duplicate handoffs across reload or deferred settlement.
  - Timer leaks after shutdown.
  - Slow or flaky timing tests on Windows.
- **Mitigation**: fake timers where possible, test-first regressions and a fresh independent Oracle verification.

## Tasks

- [x] AC-1: Ordinary callbacks held while busy and aggregated after idle, ported with tests and docs
  - Outcome: `a8153fe` is ported and adapted. AC-1, AC-2 and AC-3 are met, and `docs/usage.md` is updated.
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/src/{shared-callback-batcher.ts,tools.ts,runtime.ts,index.ts,failures.ts}`, tests `src/{e2e,runtime,reload-handoff,failures.integration}.test.ts`, `docs/usage.md`; upstream clone commit `a8153fe`, including `packages/callback-batcher/{index,integration}.test.ts` for case reference. Skills: `tdd`, then `simplify`.
  - Inputs: accepted Exploration and Decisions.
  - Dependencies: none
  - Output: source, tests and docs diff; the list of adapted upstream cases; red → green evidence.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-background-tasks/**`
  - Interface boundaries: Pi `isIdle`, `agent_settled`, `sendMessage`; durable receipts; reload ownership.
  - Focused check and PASS evidence: new regressions fail before and pass after; package `typecheck` exits 0; `test --maxWorkers=2` passes with no unexplained changes to existing tests.
  - Return milestone: on completion.
  - Stop / reassessment: a lifecycle event or API missing in Pi 1.0.2, or a conflict with reload ownership that would require preserving old events.
- [x] AC-2: Duplicate-handoff guard verified
  - Outcome: root confirms the guard regressions cover deferred settlement and failed-send restore.
  - Known entrypoints and skill paths: tests named in the AC-1 unit output.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: AC-1 unit accepted by root.
  - Output: acceptance note.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: named regressions pass in the package run.
  - Return milestone: after reviewing the AC-1 unit.
  - Stop / reassessment: a missing clause returns to the worker.
- [x] AC-3: Queue identity and reload exactly-once verified
  - Outcome: root confirms wrapper sharing, session isolation and reload exactly-once regressions.
  - Known entrypoints and skill paths: tests named in the AC-1 unit output, `src/reload-handoff.test.ts`.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: AC-1 unit accepted by root.
  - Output: acceptance note.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: named regressions pass in the package run.
  - Return milestone: after reviewing the AC-1 unit.
  - Stop / reassessment: a missing clause returns to the worker.
- [x] AC-4: Preserved local behavior and changed-test review
  - Outcome: root confirms that local termination, containment, reload ownership, suppression, receipts and rendering are unchanged, and that every changed existing test is justified.
  - Known entrypoints and skill paths: diff of `pi-packages/pi-background-tasks`.
  - Inputs: accepted AC-1 unit output.
  - Dependencies: AC-1 unit accepted by root.
  - Output: regression note.
  - Owner: root
  - Writes: none
  - Interface boundaries: `.thoth/specs/pi-ecosystem/spec.md` background requirements.
  - Focused check and PASS evidence: diff review finds no unjustified behavior change.
  - Return milestone: after the AC-1 unit.
  - Stop / reassessment: an unjustified change returns to the worker.
- [x] AC-5: Package and root closeout checks pass
  - Outcome: package and root gates are green.
  - Known entrypoints and skill paths: package and root `package.json` scripts.
  - Inputs: accepted AC-4.
  - Dependencies: AC-4 accepted by root.
  - Output: check results.
  - Owner: root
  - Writes: none (generated build output only)
  - Interface boundaries: none
  - Focused check and PASS evidence: package `typecheck` and `test --maxWorkers=2`, root `pnpm run build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` exit 0.
  - Return milestone: after the checks run.
  - Stop / reassessment: failures caused by unrelated workspace changes are reported.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user selected Oracle plan review and authorized implementation once the review returned OKAY. The fresh Oracle returned a validated OKAY with no blocking risks.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 79d71821f7ee200541a72790b64df970b474dddc9c938fc0acc2590b826b15bc

The first fresh Oracle final-verification round passed. The two changed e2e tests (session_start fired first) were judged a correct harness ordering, consistent with native Pi startup.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "AC-1–AC-5 and the declared availability delta are satisfied. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "integrity",
      "locator": ".thoth/changes/bg-callback-availability/bg-callback-availability.md; .thoth/specs/pi-ecosystem/spec.md",
      "claim": "Record-prefix SHA-256 is 79d71821f7ee200541a72790b64df970b474dddc9c938fc0acc2590b826b15bc; spec SHA-256 is 708dbb375c818847f0d182f1e555a4b4815e174d77f1b9bd90321d86bb030972. Both and all six scoped files remained unchanged through final checks.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E2",
      "kind": "implementation-review",
      "locator": "pi-packages/pi-background-tasks/src/shared-callback-batcher.ts:578–818; src/tools.ts:135–158",
      "claim": "Missing, false and throwing availability defer ordinary sends. Lifecycle refreshes and one unref'ed retry timer drain pending work. Cancellation clears pending entries and timers. Aggregation preserves budgets, represented-only receipts, overflow and display details; urgent delivery bypasses availability.",
      "basis": "observed",
      "uncertainty": "None identified in the production lifecycle."
    },
    {
      "id": "E3",
      "kind": "implementation-review",
      "locator": "pi-packages/pi-background-tasks/src/shared-callback-batcher.ts:578–585,666–705,781–818",
      "claim": "awaitingRun is set before handoff, cleared on observed busy, and reset on failed sends with events restored. Shared flush serialization prevents duplicate concurrent handoffs. Queue lookup uses host.events ?? host and session-manager identity; setHost refreshes the sender.",
      "basis": "observed",
      "uncertainty": "The documented unobserved-busy latch remains intentional."
    },
    {
      "id": "E4",
      "kind": "independent-checks",
      "locator": "pi-packages/pi-background-tasks",
      "claim": "Package typecheck passed. Six focused Vitest files passed: 87 tests covering availability, debounce, retry, guard, overflow, urgent delivery, identity, reload ownership, receipts, rendering and tool budgets. Scoped git diff --check passed.",
      "basis": "observed",
      "uncertainty": "The full package suite was not independently repeated."
    },
    {
      "id": "E5",
      "kind": "lifecycle-review",
      "locator": "Installed Pi dist/core/agent-session.js:1352,2562–2584,2899–2931; dist/modes/print-mode.js:53,103–108; pi-packages/pi-background-tasks/src/e2e.test.ts",
      "claim": "Native startup binds extensions and emits session_start before prompts/tool execution; reload shuts down the old runner before fresh session_start. The two added session_start calls correct harness ordering rather than hide a regression. New fake-timer cases independently verify pre-context callbacks remain held and drain after context refresh.",
      "basis": "observed",
      "uncertainty": "Native lifecycle source was inspected; no live model run was performed."
    },
    {
      "id": "E6",
      "kind": "reload-verification",
      "locator": "pi-packages/pi-background-tasks/src/reload-callback.test.ts; src/shared-callback-batcher.test.ts; src/index.ts:28–55; src/runtime.ts:960–1038",
      "claim": "Fake-timer regressions verify old pending work is cancelled without later sends, fresh durable replay delivers once across shared or wrapped buses, and retained handoff receipts prevent resends after a receipt-write failure. Identity tests verify instance/session isolation.",
      "basis": "observed",
      "uncertainty": "None identified."
    },
    {
      "id": "E7",
      "kind": "scope-and-preservation",
      "locator": "git diff -- pi-packages/pi-background-tasks; untracked scoped tests; docs/usage.md:50–79",
      "claim": "The port matches the relevant a8153fe behavior with local ownership adaptation. index.ts, runtime.ts, rendering, tool schemas, containment, manifests and lockfile are unchanged. Documentation accurately explains gating, retry, reload, receipts and the latched boundary. Concurrent pi-todo edits were excluded.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E8",
      "kind": "provided-check-results",
      "locator": "Root evidence supplied with assignment for this exact tree",
      "claim": "Root reports package tests: 50 files, 598 passed, 4 skipped; root build, test:pi-extensions (13/13), check:ci and typecheck all passed.",
      "basis": "inferred",
      "uncertainty": "These broader checks were root-executed, not independently rerun."
    },
    {
      "id": "E9",
      "kind": "governance-validation",
      "locator": "Installed thoth-sdd/scripts/validate.mjs --through verify",
      "claim": "The verify gate passed. The ADDED requirement does not overlap existing canonical background/UI requirements, whose implementation surfaces remain unchanged.",
      "basis": "observed",
      "uncertainty": "None."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Source review, fake-timer availability/e2e tests and rendering-budget regressions.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E5"],
      "reason": "Busy, throwing and missing contexts defer; lifecycle and retry recovery aggregate correctly while urgent notifications remain immediate."
    },
    {
      "check": "AC-2",
      "method": "Guard ordering review and deferred-run/failed-send regressions.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "No second ordinary handoff occurs before observed busy or send failure; failed sends restore events and permit retry."
    },
    {
      "check": "AC-3",
      "method": "Identity review and fake-timer wrapper, isolation and reload regressions.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E6"],
      "reason": "Sender refresh, local cancellation, fresh replay and retained receipts preserve exactly-once handoff within the stated contract."
    },
    {
      "check": "AC-4",
      "method": "Complete scoped diff review, native lifecycle inspection and focused preservation tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E7", "E8"],
      "reason": "Protected local surfaces are unchanged; existing-test adaptations are justified and documentation is accurate."
    },
    {
      "check": "AC-5",
      "method": "Independent package typecheck and focused tests; reuse supplied exact-tree full-package/root results.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E8"],
      "reason": "All required checks are reported green; independently repeated focused checks also passed."
    },
    {
      "check": "Record, baseline, Decisions and durable delta",
      "method": "Initial/final byte hashes, verify validator and semantic comparison.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E6", "E7", "E9"],
      "reason": "Review inputs remained stable and implementation satisfies the accepted ownership, batching and availability contracts."
    }
  ],
  "risks": [
    {
      "description": "Accepted boundary: if Pi accepts a handoff but never exposes busy, subsequent ordinary callbacks remain latched. This is documented and tested; no timeout risks duplicating a deferred run.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E4", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, record PASS, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/bg-callback-availability/bg-callback-availability.md",
    "reviewedRecordSha256": "79d71821f7ee200541a72790b64df970b474dddc9c938fc0acc2590b826b15bc"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | shared-callback-batcher.test.ts availability, debounce, compaction-retry, overflow and urgent cases; ported #409 e2e case | 15 failed → green; busy and missing contexts, and contexts whose idle check throws, defer; one aggregated followUp after idle
- AC-2: PASS | deferred-run guard and failed-send restore regressions | one handoff until busy is observed; latched boundary documented in docs/usage.md and tested; no timeout
- AC-3: PASS | wrapper-sharing, session-isolation and reload-callback.test.ts regressions (fake timers) | old instance cancelled with no late sends; durable replay delivers once; retained receipts block resend
- AC-4: PASS | diff review; Oracle native lifecycle review | index.ts, runtime.ts, rendering, schemas and containment unchanged; 2 e2e tests fire session_start first (justified)
- AC-5: PASS | package typecheck and test; root build, test:pi-extensions, check:ci, typecheck | exit 0; 50 files 598 passed 4 skipped; exit 0; 13/13; exit 0; exit 0
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:708dbb375c818847f0d182f1e555a4b4815e174d77f1b9bd90321d86bb030972

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
