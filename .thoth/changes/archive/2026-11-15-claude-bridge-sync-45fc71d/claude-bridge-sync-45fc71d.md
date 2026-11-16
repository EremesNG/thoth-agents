# Change: claude-bridge-sync-45fc71d

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: high

## Exploration

- `pi-packages/pi-claude-bridge` is synced through upstream `elidickinson/pi-claude-bridge` `acbe45b` (archived `claude-bridge-sync-acbe45b`). Local work after that: `7fea3a7c` (forward extension `promptGuidelines`), `d1ac60e0` (tolerant partial tool arguments). Upstream main is `45fc71d` (0.12.0), 10 commits after `acbe45b`. Partial clone: `C:\Users\EremesNG\AppData\Local\Temp\tmp.9doZUUSs2g\upstream` (recreate with `git clone --filter=blob:none` in a fresh `mktemp -d`; never run its code). Apply checks below are independent `git apply --check --directory=pi-packages/pi-claude-bridge` per commit against the working tree.
- Selected units (local anchors approximate, relative to the package):
  1. `2cc6368` rejected served tool calls — exact-case served-name lookup (removes the lowercase `customToolNameToPi` served-name fallback only; Pi→SDK and wrapped-name aliases stay); marks actual MCP dispatch in a query-lifetime `dispatchedToolCalls` (`src/query-state.ts` ~57–75); records only dispatched results (`tapRecording` ~1127); detects Claude Code rejection of a served call before recording, commits the dirty recording, discards/stops the query and surfaces the error now or on the matching continuation (new helper before `consumeQuery` ~1488, provider entry ~1782); clears stale rejection at `agent_start` (~2503); prevents a second abort commit (~2217). Other anchors: `piToolNameFor` ~721, `resolveMcpTools` ~870–898, `buildMcpServers` ~911–933. Apply FAILS in `src/index.ts` and `src/query-state.ts`; all five test files apply cleanly: new `tests/unit-cc-rejected-tool-call.mjs`, changed `unit-agent-start-capture`, `unit-cross-session-turns`, `unit-live-recording`, `unit-unserved-tool-use`. The new rejected-call test launches the SDK/Claude Code against a localhost API stub with POSIX shell hooks and imports Pi's internal `toJsonEvent`; Windows execution unverified.
  2. `0cdc44c` dropped-turn warning — `sentTurns`, threshold 3, `noticeDroppedTurn`, reset/test export, provider call; compares prior trailing user-message digests with subsequent history; retries keep the streak, rewrites (`historyRewrittenBySession`) reset it; warns once at 3. Insertion after `turnStart` ~254, reset ~654, provider ~1782. Apply CLEAN (`src/index.ts`, `tests/unit-sync-shared-session.mjs`, three added tests).
  3. `f14f2ed` selected subset — SDK `@anthropic-ai/claude-agent-sdk` `0.3.308` → `0.3.321`; Fable 5.2 in `MEASURED_ONE_M` (`src/models.ts` ~82); `extraUsageByChoice` after `claudeCodeModelId` (~126); Extra Usage diagnostics in `src/index.ts` (import ~15, constant near the quota-error helper, `consumeQuery` error ~1541 and rate-limit ~1562 handling) and `warnedUnplannedOverage` in `src/query-state.ts` ~94: unexplained "out of extra usage" errors get a qualified suspicion; an unexpected `overageInUse` warns once; user-chosen paid 1M is exempt. `models.ts`, `query-state.ts`, `unit-error-result`, `unit-rate-limit` apply CLEAN; `index.ts` diagnostics and `unit-models` FAIL. Excluded parts of the same commit: removal of prompt-content refusal guards (local `assertSendablePrompt`, `src/prompt-capture.ts` ~406, stays) and their tests, Pi peer/dev floor raises.
  4. `7d1f485` Mythos — `FAMILY_ORDER` ~16, `GATED_MODELS`/`withGatedModels`, `buildModels` ~28, measured-1M set: clones missing Mythos 5.1/5.2 from the Fable sibling, catalog entries win, a missing sibling skips the clone, Mythos sorts last. FAILS against the untouched tree (context depends on unit 3).
- Ordering: 3 before 4 (context); 1 and 2 independent of 3/4; nothing depends on excluded `45fc71d` or on guard removal.
- SDK `0.3.321`: published 2026-11-09 19:03 UTC (older than the 72 h `minimumReleaseAge`; also covered by the existing `@anthropic-ai/claude-agent-sdk*` exclusion); no runtime dependencies or lifecycle scripts in it or its eight platform packages; Node floor `>=18.14.0` (bridge requires `>=22.19.0`); declaration diff shows no changed signatures for `query`, `Options`, `HookCallback`, `SDKUserMessage`, spawn or effort/thinking types; adds `session_writes_lost` system messages and optional usage fields, which the bridge ignores.
- Pi catalog: workspace dev pin `pi-ai@1.5.0` lacks Fable 5.2; the operator's installed Pi `1.5.2` catalog has `claude-fable-5-2` (and 5.1). Upstream `buildModels` takes Fable 5.2 from the host catalog.
- Local divergences to preserve: prompt capture/projection and append epochs, `promptGuidelines` forwarding, `assertSendablePrompt`, `normalizeToolSchema` `input` wrapping and `mapToolArgs`, tolerant partial argument parsing, `wrappedToolNames` replay, immediate pi-core provider-limit delivery before recording, fork inheritance on epochs.

## Intent

Port upstream `2cc6368`, `0cdc44c`, the selected parts of `f14f2ed` (SDK 0.3.321, Fable 5.2 measured 1M, Extra Usage diagnostics) and `7d1f485` into `pi-packages/pi-claude-bridge`, keeping every local divergence, and advance the recorded sync base to `45fc71d` with the excluded commits documented.

## Non-goals

- `45fc71d` whole-prompt forwarding/configurable preset; prompt-guard removal from `f14f2ed`; Pi peer/dev floor raises; upstream docs, TODO and release commits (`15cef44`, `334c2b6`, `e526535`, `7f6cab1`, `d8a03f0`).
- Synthesizing catalog entries the host Pi does not provide.
- Version bumps, publishing, live suites (`test`, `tests/int-*`, `*.sh`).

## Acceptance

- AC-1: When Claude Code rejects a served tool call, the bridge records only dispatched results, commits the recording, stops the query and surfaces an error on the current or matching continuation turn instead of hanging; served names resolve exactly (no lowercase served-name fallback) while Pi→SDK and wrapped aliases still resolve; a stale rejection clears at `agent_start`; abort never double-commits (unit tests, including the adopted upstream suites).
- AC-2: After three consecutive turns whose extension-injected trailing user message was dropped, the bridge warns once; retries keep the streak and history rewrites reset it (upstream tests).
- AC-3: The bridge pins SDK exactly `0.3.321`; `pnpm-lock.yaml` is consistent and `pnpm install --frozen-lockfile` succeeds.
- AC-4: An unexplained "out of extra usage" error carries the qualified diagnostic and an unexpected `overageInUse` warns once per query, except when the user chose a paid 1M model; Fable 5.2 is in the measured-1M set (tests).
- AC-5: Mythos 5.1/5.2 are cloned from their Fable sibling only when the host catalog has the sibling and lacks the Mythos entry, sort last and are measured 1M; catalog-dependent assertions use synthetic catalogs so they pass on the Pi 1.5.0 dev pin (tests).
- AC-6: Local divergences listed in Exploration keep their tests passing unchanged or with listed, justified changes; `assertSendablePrompt` still guards prompts.
- AC-7: `README.md` records sync base `45fc71d` and the excluded commits with reasons; `CHANGELOG.md` records the port; `UPSTREAM-CHANGELOG.md` updated if it tracks upstream entries.
- AC-8: Package `test:unit`, `typecheck`, `build`; root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run test:pi-extensions` (after build) pass.

## Clarifications

- 2026-11-15: the user selected `2cc6368`, `0cdc44c`, the SDK/Fable 5.2/Extra Usage parts of `f14f2ed` and `7d1f485`; `45fc71d` and guard removal are not adopted.
- Fable 5.2 availability: resolved by evidence — upstream reads it from the host Pi catalog, and the operator runs Pi 1.5.2 whose catalog has it; keeping the peer floor `>=1.5.0` means older hosts simply do not list Fable 5.2/Mythos 5.2. No user question needed.

## Decisions

- D1: Catalog-dependent model availability (upstream behavior); no local fallback entries; peer/dev Pi pins unchanged. Real-catalog Mythos 5.2 assertions become synthetic-catalog tests.
- D2: Exact-case served-name lookup replaces only the lowercase served-name fallback; Pi→SDK aliases, wrapped-tool names, `mapToolArgs` and tolerant partial parsing stay.
- D3: Rejection handling keeps immediate provider-limit delivery before recording and the dirty-recording/epoch semantics; committing on rejection uses the existing recording commit path.
- D4: The adopted real-SDK rejected-call test runs if it works on Windows; if its POSIX shell hooks or Pi-internal import cannot run here, it is kept with a platform/skip guard stating the reason and the behavior is additionally covered by mocked unit tests.
- D5: Vendoring: `git apply` clean hunks, hand-merge the rest; adopt upstream tests for retained behavior; list each adapted/dropped upstream test and each changed local test with its reason.

## Durable deltas

- `ADDED pi-ecosystem` **Claude bridge surfaces rejected tool calls** — `@thoth-agents/pi-claude-bridge` MUST resolve Claude Code tool calls to served Pi tools by exact name, MUST record a tool result only for calls it actually dispatched, and when Claude Code rejects a served tool call MUST commit its recording, stop that query and surface an error on the current or matching continuation turn instead of waiting.
  - GIVEN a Claude-backed Pi turn where Claude Code rejects a served tool call; WHEN the bridge processes the rejection; THEN no result is recorded for the undispatched call, the query stops and the turn ends with a visible error rather than hanging.

## Plan

One writer (thoth-worker) owns `pi-packages/pi-claude-bridge/**`, `pnpm-lock.yaml` (bridge SDK entry only). Order: SDK bump with current suite green (U1) → unit 3 diagnostics/models → unit 4 Mythos → unit 1 rejected calls → unit 2 dropped-turn warning → docs; test-first per unit (skill `tdd`), then `simplify`. Milestones: (1) SDK bump green; (2) all units compiling; (3) final report (hand-merged files, adapted/dropped upstream tests, changed local tests, check outputs). Root reviews test adaptations, runs consolidated gates, then a fresh Oracle verifies.

**Verification seams.** With `CODEX_HOME`, `PI_SUBAGENT_CHILD`, `PI_CODING_AGENT_DIR`, `PI_PACKAGE_DIR` unset: package `test:unit`, `typecheck`, `build`; focused suites via `pnpm --filter @thoth-agents/pi-claude-bridge exec node --import tsx --import ./tests/lib/setup.mjs --test <files>`; root `check:ci`, `typecheck`, `test:pi-extensions` after build. No live suites.

**Risks.** Rejection handling across teardown, recording commits and abort; exact-case lookup breaking calls that relied on the lowercase served fallback; SDK runtime changes not covered statically; Windows execution of the real-SDK test. Mitigations: D2–D4, milestone returns, root review of test changes, fresh Oracle.

## Tasks

- [x] AC-3: SDK 0.3.321 pinned with the current bridge green
  - Outcome: manifest pins `0.3.321`, lockfile updated, frozen install succeeds, current `test:unit` and `typecheck` pass
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/package.json`, `pnpm-lock.yaml`
  - Inputs: Exploration SDK facts
  - Dependencies: none
  - Output: manifest/lockfile diff and check results
  - Owner: thoth-worker
  - Writes: bridge `package.json` SDK field, `pnpm-lock.yaml`
  - Interface boundaries: other packages' resolutions unchanged
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile` 0; package `test:unit`, `typecheck` 0
  - Return milestone: milestone 1
  - Stop / reassessment: an SDK 0.3.321 regression in current code; report, do not work around
- [x] AC-4: Extra Usage diagnostics and Fable 5.2 measured 1M
  - Outcome: per AC-4
  - Known entrypoints and skill paths: `src/models.ts`, `src/index.ts`, `src/query-state.ts`, `tests/unit-{error-result,rate-limit,models}.mjs`; skill `tdd`
  - Inputs: Exploration unit 3
  - Dependencies: AC-3 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/{src,tests}/**`
  - Interface boundaries: provider-limit delivery, quota
  - Focused check and PASS evidence: listed suites pass
  - Return milestone: milestone 2
  - Stop / reassessment: diagnostics require guard removal or prompt changes
- [x] AC-5: Mythos entries cloned from Fable siblings
  - Outcome: per AC-5 and D1
  - Known entrypoints and skill paths: `src/models.ts`, `tests/unit-models.mjs`; skill `tdd`
  - Inputs: Exploration unit 4
  - Dependencies: AC-4 row
  - Output: implementation and synthetic-catalog tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/{src,tests}/**`
  - Interface boundaries: Pi model registration
  - Focused check and PASS evidence: `unit-models` passes on the 1.5.0 dev pin
  - Return milestone: milestone 2
  - Stop / reassessment: model registration needs a Pi API absent in 1.5.0
- [x] AC-1: Rejected served tool calls surface errors without hanging
  - Outcome: per AC-1, D2–D4 and the durable delta
  - Known entrypoints and skill paths: `src/index.ts`, `src/query-state.ts`, upstream tests listed in Exploration unit 1; skill `tdd`
  - Inputs: Exploration unit 1
  - Dependencies: AC-3 row
  - Output: implementation, adopted/adapted tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/{src,tests}/**`
  - Interface boundaries: recording commits, epochs, abort, wrapped replay, provider limits
  - Focused check and PASS evidence: rejected-call, agent-start, cross-session, live-recording and unserved-tool suites pass (or the real-SDK test is guarded per D4 with mocked coverage passing)
  - Return milestone: milestone 2
  - Stop / reassessment: rejection handling conflicts with epoch or dirty-recording semantics
- [x] AC-2: Dropped-turn warning after three consecutive drops
  - Outcome: per AC-2
  - Known entrypoints and skill paths: `src/index.ts`, `tests/unit-sync-shared-session.mjs`; skill `tdd`
  - Inputs: Exploration unit 2
  - Dependencies: AC-3 row
  - Output: implementation and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/{src,tests}/**`
  - Interface boundaries: rewrite tracking, append epochs
  - Focused check and PASS evidence: three upstream tests pass
  - Return milestone: milestone 2
  - Stop / reassessment: none expected
- [x] AC-7: Docs record the port and the new sync base
  - Outcome: per AC-7
  - Known entrypoints and skill paths: package `README.md`, `CHANGELOG.md`, `UPSTREAM-CHANGELOG.md`
  - Inputs: completed units
  - Dependencies: AC-1, AC-2, AC-4, AC-5 rows
  - Output: docs diff
  - Owner: thoth-worker
  - Writes: those files only
  - Interface boundaries: none
  - Focused check and PASS evidence: README names `45fc71d` and the exclusions; `git diff --check` clean
  - Return milestone: milestone 3 report
  - Stop / reassessment: none
- [x] AC-6: Local divergences preserved
  - Outcome: root reviews the report's test adaptations and divergence suites
  - Known entrypoints and skill paths: worker report and diff
  - Inputs: accepted milestone 3
  - Dependencies: all rows above
  - Output: acceptance or regressions returned to the worker
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: every changed assertion traces to an adopted upstream behavior, Windows, or a recorded decision
  - Return milestone: before gates
  - Stop / reassessment: unexplained assertion change or dropped local coverage
- [x] AC-8: Consolidated gates pass
  - Outcome: package and root gates green
  - Known entrypoints and skill paths: root and package scripts
  - Inputs: accepted AC-6
  - Dependencies: AC-6 row
  - Output: command results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: all commands exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failure, reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Implementation authorized explicitly by the user on 2026-11-15 after plan-review OKAY.
Plan review subtask_thoth-oracle_1794768614865_87b04c8d OKAY, valid gate verdict, recordSha256 658ce378663e7b2bbc1071a6991d60b83cca032b337f0dba50d0454181984d5b (digest match).
Nonblocking cautions: (1) the no-synthesis non-goal applies to Fable catalog seeding, not to the selected Mythos clones; (2) D4 skip handling must not fail at the static Pi-internal import before a skip applies, and skipped real-SDK cases still need mocked behavioral coverage.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 11b56dc34d2b4ee1e5b11260d955c9d0cd333ee4c33fec975a1579401036d009

Fresh Oracle subtask_thoth-oracle_1794770517250_17a8fb33; delivered gate verdict valid, kind final-verification, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: <REDACTED> implementation satisfies AC-1–AC-8, D1–D5, the durable delta and Authorization cautions.",
  "evidence": [
    {
      "id": "record",
      "kind": "validation",
      "locator": ".thoth/changes/claude-bridge-sync-45fc71d/claude-bridge-sync-45fc71d.md",
      "claim": "verify gate passes; canonical baseline matches. Record-prefix digest and implementation hashes remained unchanged during checks.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "rejection",
      "kind": "source-review",
      "locator": "pi-packages/pi-claude-bridge/src/index.ts:765,941,963,1186,1534-1607,1919-1931,2336,2619",
      "claim": "Exact served-name lookup preserves Pi-to-SDK and wrapped aliases. Rejections bypass result recording, commit dirty progress, discard/stop the query and fail the current or matching continuation. Agent-start clears stale rejection; discarded queries cannot recommit on abort. Immediate provider-limit reporting remains before recording.",
      "basis": "observed",
      "uncertainty": "Real Claude Code behavior on Windows was not exercised."
    },
    {
      "id": "models-warnings",
      "kind": "source-review",
      "locator": "pi-packages/pi-claude-bridge/src/models.ts:18-175; src/index.ts:269-299,1637-1671",
      "claim": "Dropped-turn threshold, retry preservation and rewrite reset match acceptance. Extra Usage diagnostics remain qualified and exempt paid-1M choices. Mythos cloning, catalog precedence, missing-sibling behavior and measured-1M policy match upstream; sibling pricing preserves local cost reporting.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "adaptations",
      "kind": "diff-review",
      "locator": "pi-packages/pi-claude-bridge/tests/",
      "claim": "Upstream comparisons confirm retained tests and justified adaptations: guarded dynamic Pi-internal import, five additional mocked rejection cases, synthetic Mythos catalog and sibling-price assertions, dispatched-result fixtures, and rewrite-reset coverage. Additional changes in unit-agent-start-capture-gaps, unit-append-instructions, unit-ignore-legacy-checkpoints, unit-mcp-tool-note and unit-resume-prompt-capture only supply session-manager fixtures. Guard-removal and live-test changes were not adopted.",
      "basis": "observed",
      "uncertainty": "Vendoring command history was supplied, not independently reconstructed."
    },
    {
      "id": "dependency-docs",
      "kind": "diff-review",
      "locator": "pi-packages/pi-claude-bridge/{package.json,README.md,CHANGELOG.md,UPSTREAM-CHANGELOG.md}; pnpm-lock.yaml",
      "claim": "Manifest, installed SDK and lockfile agree on 0.3.321; lock changes are confined to bridge SDK resolutions/platform packages. Pi floors and package version are unchanged. Documentation records 45fc71d, selected units and exclusions with reasons.",
      "basis": "observed",
      "uncertainty": "Frozen installation was reported successful; not rerun in read-only review."
    },
    {
      "id": "checks",
      "kind": "execution",
      "locator": "Native focused bridge test run, package typecheck and scoped git diff --check",
      "claim": "With the four specified environment variables unset, 30 focused unit files passed 329/329 tests; the real-SDK suite explicitly skipped on Windows. Package typecheck and scoped whitespace check exited 0. Coverage includes prompt guards/guidelines, projection, append epochs, schema wrapping, partial arguments, provider limits and fork inheritance.",
      "basis": "observed",
      "uncertainty": "No live suites were run."
    },
    {
      "id": "broader-checks",
      "kind": "supplied-execution",
      "locator": "Delegated task: worker and root gate results",
      "claim": "Worker reports frozen install, 738/738 unit tests, typecheck and build successful; root reports check:ci, typecheck, build and test:pi-extensions exit 0.",
      "basis": "inferred",
      "uncertainty": "Broader gates were not rerun; independent focused tests and package typecheck corroborate them."
    }
  ],
  "verification": [
    {
      "check": "Record gate and durable baseline",
      "method": "Bundled validator --through verify; byte-prefix SHA-256; canonical requirement review",
      "outcome": "pass",
      "evidenceIds": ["record"],
      "reason": "Valid record, matching baseline and distinct added rejection requirement."
    },
    {
      "check": "AC-1; D2–D4; durable delta; skip-import caution",
      "method": "Review lifecycle ordering and upstream port; run rejection, recording, abort and tool-name suites",
      "outcome": "pass",
      "evidenceIds": ["rejection", "adaptations", "checks"],
      "reason": "Current/continuation errors, single commit, stale clearing and authoritative-result recovery pass; guarded import cannot fail before the Windows skip."
    },
    {
      "check": "AC-2, AC-4, AC-5; D1; catalog-synthesis caution",
      "method": "Review upstream-selected behavior and run dropped-turn, diagnostics and model suites",
      "outcome": "pass",
      "evidenceIds": ["models-warnings", "checks"],
      "reason": "Warning policies and catalog-dependent Mythos behavior pass without Fable synthesis or raised Pi floors."
    },
    {
      "check": "AC-3",
      "method": "Inspect manifest, SDK installation and complete lockfile diff; reuse supplied frozen-install result",
      "outcome": "pass",
      "evidenceIds": ["dependency-docs", "broader-checks"],
      "reason": "Exact SDK pin and consistent scoped resolutions; frozen install reported exit 0."
    },
    {
      "check": "AC-6, AC-7; D5",
      "method": "Audit all scoped tracked/untracked changes and test adaptations against upstream; run divergence suites",
      "outcome": "pass",
      "evidenceIds": ["adaptations", "dependency-docs", "checks"],
      "reason": "Local behavior and assertions remain preserved except justified adaptations; sync documentation is complete."
    },
    {
      "check": "AC-8",
      "method": "Independent focused units/package typecheck plus supplied broader package/root gates",
      "outcome": "pass",
      "evidenceIds": ["checks", "broader-checks"],
      "reason": "Executed checks pass; remaining required gates are reported successful."
    }
  ],
  "risks": [
    {
      "description": "Real-SDK rejection cases remain unexecuted on Windows. This is the explicitly permitted D4 limitation; the retained guarded suite and five passing mocked cases provide non-live coverage.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["adaptations", "checks"]
    }
  ],
  "openQuestions": [],
  "nextAction": "root: validate delivered gate, record acceptance evidence, then closeout/archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-bridge-sync-45fc71d/claude-bridge-sync-45fc71d.md",
    "reviewedRecordSha256": "11b56dc34d2b4ee1e5b11260d955c9d0cd333ee4c33fec975a1579401036d009"
  }
}
```

- AC-1: PASS | `unit-cc-rejected-tool-call` (Windows-guarded) plus five mocked provider rejection cases, `unit-unserved-tool-use`, `unit-live-recording`, `unit-cross-session-turns` | Oracle rejection/checks
- AC-2: PASS | `unit-sync-shared-session` three upstream drop/retry/preserve tests plus rewrite-reset regression | Oracle models-warnings
- AC-3: PASS | SDK exactly 0.3.321; `pnpm install --frozen-lockfile` exit 0 | Oracle dependency-docs
- AC-4: PASS | `unit-error-result`, `unit-rate-limit`, `unit-models` Fable 5.2/paid-1M | Oracle models-warnings
- AC-5: PASS | `unit-models` synthetic-catalog Mythos clone/precedence/missing-sibling tests | Oracle models-warnings
- AC-6: PASS | root review of the worker test inventory; divergence suites 329/329 (Oracle) | Oracle adaptations/checks
- AC-7: PASS | README names 45fc71d and exclusions; CHANGELOG and UPSTREAM-CHANGELOG updated | Oracle dependency-docs
- AC-8: PASS | package test:unit 738/738, typecheck, build; root check:ci, typecheck, build, test:pi-extensions exit 0 | Oracle checks/broader-checks
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:a3b6f651916aa1b084a23db0988d347f351eb24e90d302f00848d2f6a7b7f1bb

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
