# Change: ci-parallel-pipeline

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Measured (CI 42544313156, Release 42526543602): Linux `test (22.19)` 14m56s = setup ~1m, check:ci + typecheck, root vitest 4m14s, then 11 pi-packages + opencode-multi-codex as sequential steps 9m48s (antigravity 1m51s, subagents 1m37s, claude 1m29s, askcodex 1m19s, background 54s, theme 42s). Windows `pi-packages-windows` 16m08s, package commands ~14m (background 2m48s, subagents 2m38s, claude 2m15s, antigravity 1m27s, theme 55s, core 49s, askcodex 48s; typechecks ~1m59s). Release 16m24s, of which 15m07s waits for same-SHA push CI; own work ~1m.
- Install 12-23s with setup-node pnpm cache; no concurrency, no permissions, Linux has no timeout (`.github/workflows/ci.yml:3-8,140-144`).
- Package tests/typechecks read source; no package needs root build or pi-core dist (pi-core exports `src`); pi-todo packed test builds itself. Graph: nine packages -> pi-core; pi-core, pi-openai-fast, opencode-multi-codex standalone.
- Root `pnpm test` (vitest 4.1.6, `--shard` supported) needs no build; 140 unit files + 14 eval files (eval project forks, maxWorkers 1). Needs `EremesNG/thoth-plugins` checkout via `THOTH_PLUGINS_ROOT` (`ci.yml:56-65`).
- Release gate selects `ci.yml` runs by filename at the push SHA and requires workflow conclusion `success`; job names are only diagnostics (`release.yml:60-138`). Splitting jobs inside `ci.yml` is safe; moving checks to another workflow would escape the gate.
- Repo is public (free standard runners; ~20 concurrent jobs per account), master unprotected, no rulesets: no required-check names to preserve.
- Content assertions: `src/plugin-node-runtime.test.ts:183-200` requires literal `node-version: [22.19]`; `src/harness/check-pi-version-bumps.test.ts:105-115` asserts PR version-bump step; `src/harness/release-workflow.test.ts` parses release step names/order and gate behavior. Docs: `AGENTS.md:101`, `docs/agent/testing.md:264-306,418,442,478-479`.
- Windows coverage is genuinely OS-specific (PowerShell, job containment, drive paths, app-server processes); bundle verification loads runtime and native helpers, so it stays on both OSes.
- Duplication found: package `tsc --noEmit` typechecks run on both OSes (~2m on Windows); everything else that repeats per OS is real OS coverage.

## Intent

Minimize CI wall-clock time (and therefore Release time, which waits on CI) by turning the serial per-package pipeline into parallel, balanced jobs, removing OS-duplicated static checks, and applying GitHub Actions best practices, without losing any existing check coverage.

## Non-goals

- No path filtering / skipping CI for docs or Markdown (Markdown files are proven test inputs; skipping push CI would break the release gate).
- No changes to test code semantics, vitest isolation configs, `--retry=2` on Windows, or package source.
- No version bumps, no new workflow files that escape the `ci.yml` release gate, no third-party actions beyond those already used.

## Acceptance

- AC-1: `ci.yml` runs every check it runs today (biome, root typecheck, root tests incl. evals with thoth-plugins, PR version-bump check, bundle build+verify on Linux and Windows, every package's tests on Linux and Windows, every package's typecheck at least once, opencode-multi-codex build) split into parallel jobs: root tests sharded, packages distributed into balanced lanes (target longest lane <= ~4m incl. setup, total jobs <= 20), package typechecks only on Linux, `fail-fast: false`.
- AC-2: `ci.yml` applies best practices: `permissions: contents: read`, `concurrency` whose group is shared (workflow + PR ref) with `cancel-in-progress: true` only for `pull_request`, and unique per run (`github.run_id`) for every non-PR event so push/dispatch runs can never be cancelled or replaced as pending; `timeout-minutes` on every job; one final aggregate job (`ci-ok`, `if: always()`) that fails unless every needed job succeeded. A workflow-content test asserts the concurrency group/cancel expressions.
- AC-3: Release does its install/build/artifact verification before waiting on CI; every publish, tag, release or git-write step (including the `always()`-based reconciliation) requires `steps.wait-ci.outcome == 'success'` in addition to its existing guards, preserving partial-publish recovery after a successful gate; gate selection semantics unchanged. Regression tests prove failed/skipped gate => no tag/release/publish step can run, and successful gate + partial publish failure still reconciles.
- AC-4: Workflow-content tests and agent docs (`AGENTS.md`, `docs/agent/testing.md`) match the new structure; local closeout (`pnpm run check:ci`, `pnpm run typecheck`, focused tests for touched test files) passes.
- AC-5: A real GitHub run of the new `ci.yml` on branch `ci-time` (workflow_dispatch) succeeds with all jobs green and wall time materially below the 16m baseline (reported per job).

## Clarifications

- Optimization goal: user asked to optimize as much as possible with best practices and remove duplicated work (2026-11-08).
- Required status checks: none exist (master unprotected, 0 rulesets), so job renames are free.
- Minutes cost: public repo, standard runners free; parallelism bounded by ~20 concurrent jobs.

## Decisions

- D1: Keep everything in `ci.yml` so the release gate (workflow-run conclusion) still covers all checks.
- D2: Package typechecks run only on Linux (case-sensitive FS is the stricter resolver); Windows keeps tests, bundle build/verify, and opencode-multi-codex test.
- D3: Lanes are balanced by measured durations rather than one job per package, to stay within ~20 concurrent jobs and avoid paying setup 24+ times; heavy packages get their own lane, light ones are grouped. Grouped lanes run each package command with `if: !cancelled()`/continue semantics so one failure does not hide the rest.
- D4: Root tests sharded with `vitest run --shard=i/N` (N chosen so each shard <= ~2m); one shard-carrying job keeps the literal `node-version: [22.19]` matrix the runtime test asserts, or the test is updated to the new canonical node pin location.
- D5: Concurrency: `group: ci-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. A shared group for pushes would let GitHub replace a pending push run even with cancel-in-progress false (plan review E3), and Release needs a successful run for each tagged SHA.
- D8: Moving install/build before the CI wait makes `steps.install.outcome == 'success'` true even when the gate fails, so all write steps (publish, reconciliation tags/releases) add an explicit `steps.wait-ci.outcome == 'success'` guard (plan review E4). The wait step gets `id: wait-ci`.
- D6: No path filters (non-goal rationale above).
- D7: Keep full `pnpm install --frozen-lockfile` per job (cached store; 12-23s) for correctness over filtered installs.

## Durable deltas

- None.

## Plan

1. Unit A (worker): rewrite `.github/workflows/ci.yml` per AC-1/AC-2 with jobs: `static` (Linux: check:ci, root typecheck, all package typechecks, PR version-bump check), `root-tests` (Linux matrix shard 1..N with thoth-plugins checkout), `bundles` (matrix ubuntu/windows: build:pi-extensions + test:pi-extensions), `packages-linux` and `packages-windows` (matrix of balanced lanes; Windows keeps `--retry=2`), opencode-multi-codex test+build inside a lane, final `ci-ok`. Reusable setup via a local composite action `.github/actions/setup` (checkout stays in job; pnpm 11.2.2, node 22.19 with pnpm cache, bun 1.3.14, frozen install) to remove duplication. Update `src/plugin-node-runtime.test.ts` / `src/harness/check-pi-version-bumps.test.ts` only as needed to assert the new structure, plus `AGENTS.md` and `docs/agent/testing.md`.
2. Unit B (worker): reorder `.github/workflows/release.yml` so checkout/setup/install/build/bundle+runtime verification run before the CI wait step (`id: wait-ci`), with the wait step before the first publish/tag/write step, and add `steps.wait-ci.outcome == 'success'` to every write step's `if:` including the `always()` reconciliation (D8); update `src/harness/release-workflow.test.ts` with regression cases for failed/skipped gate (no writes) and successful gate + partial publish failure (reconciliation still runs), and `publish-marketplace.test.ts` if affected.
Root-test sharding must cover both vitest projects (unit + eval) without weakening eval `fileParallelism:false`/`maxWorkers:1`; Windows keeps `--retry=2`, Claude keeps `test:unit`, and opencode-multi-codex build stays on both OSes.
3. Unit C (root, after authorization to push): push `ci-time`, run `gh workflow run ci.yml --ref ci-time`, collect per-job durations.
4. Final verification by fresh Oracle.

Verification seams: actionlint if available (else YAML parse), focused vitest for touched workflow tests, `pnpm run check:ci`, `pnpm run typecheck`, real GitHub run.

## Tasks

- [x] AC-1: Parallel CI job graph in ci.yml with balanced lanes, sharded root tests, Linux-only typechecks, composite setup action
  - Outcome: new `ci.yml` + `.github/actions/setup/action.yml` covering every existing check in parallel jobs
  - Known entrypoints and skill paths: `.github/workflows/ci.yml`, `package.json`, `vitest.config.ts`, `pi-packages/*/package.json`, `opencode-packages/opencode-multi-codex/package.json`
  - Inputs: Exploration timings and step list in this record
  - Dependencies: none
  - Output: rewritten workflow and composite action; mapping table old-step -> new-job in return
  - Owner: worker
  - Writes: `.github/workflows/ci.yml`, `.github/actions/setup/action.yml`
  - Interface boundaries: release gate reads `ci.yml` runs by filename and workflow conclusion; must not move checks out of `ci.yml`
  - Focused check and PASS evidence: actionlint (or YAML parse) clean; old-step -> new-job coverage table shows no dropped command
  - Return milestone: workflow files written and coverage table produced
  - Stop / reassessment: any check that cannot run without a prior build or shared state between jobs
- [x] AC-2: Best-practice controls in ci.yml (permissions, PR-only concurrency cancel, timeouts, ci-ok aggregate)
  - Outcome: controls present in the same `ci.yml` rewrite
  - Known entrypoints and skill paths: `.github/workflows/ci.yml`
  - Inputs: Decisions D1, D5
  - Dependencies: none (same writer and unit as AC-1)
  - Output: workflow controls
  - Owner: worker
  - Writes: `.github/workflows/ci.yml`
  - Interface boundaries: release gate requires push runs not to be cancelled
  - Focused check and PASS evidence: actionlint clean; workflow-content test asserts concurrency group is per-PR for pull_request and `github.run_id` otherwise, and `cancel-in-progress` true only for pull_request
  - Return milestone: same as AC-1
  - Stop / reassessment: none expected
- [x] AC-4: Workflow-content tests and agent docs aligned with new ci.yml
  - Outcome: tests asserting CI content pass; docs describe the new job graph
  - Known entrypoints and skill paths: `src/plugin-node-runtime.test.ts`, `src/harness/check-pi-version-bumps.test.ts`, `AGENTS.md`, `docs/agent/testing.md`
  - Inputs: new ci.yml
  - Dependencies: AC-1 unit (same worker)
  - Output: updated tests/docs
  - Owner: worker
  - Writes: listed files
  - Interface boundaries: test intent (node pin, PR version-bump warning) preserved
  - Focused check and PASS evidence: `pnpm exec vitest run src/plugin-node-runtime.test.ts src/harness/check-pi-version-bumps.test.ts` passes; `pnpm run check:ci` and `pnpm run typecheck` pass
  - Return milestone: checks green
  - Stop / reassessment: an assertion whose intent cannot be preserved
- [x] AC-3: Release builds and verifies before waiting for CI; gate stays before publish
  - Outcome: reordered `release.yml` with unchanged gate semantics
  - Known entrypoints and skill paths: `.github/workflows/release.yml`, `src/harness/release-workflow.test.ts`, `src/harness/publish-marketplace.test.ts`
  - Inputs: Exploration release gate evidence
  - Dependencies: none
  - Output: reordered workflow and updated tests
  - Owner: worker
  - Writes: `.github/workflows/release.yml`, `src/harness/release-workflow.test.ts`, `src/harness/publish-marketplace.test.ts` (only if needed)
  - Interface boundaries: no publish, tag, release or git write step before the gate; every write step (incl. `always()` reconciliation) guarded by `steps.wait-ci.outcome == 'success'`; partial-publish recovery preserved; permissions unchanged
  - Focused check and PASS evidence: `pnpm exec vitest run src/harness/release-workflow.test.ts src/harness/publish-marketplace.test.ts` passes, including new regression cases (failed/skipped gate => no write step eligible; successful gate + partial publish failure => reconciliation eligible); actionlint clean
  - Return milestone: checks green
  - Stop / reassessment: a pre-gate step that writes or publishes
- [x] AC-5: Real CI run on ci-time succeeds faster than baseline
  - Outcome: green workflow_dispatch run with per-job durations
  - Known entrypoints and skill paths: `gh workflow run ci.yml --ref ci-time`, `gh run view --json jobs`
  - Inputs: accepted AC-1..AC-4 outputs committed on ci-time
  - Dependencies: AC-1, AC-2, AC-3, AC-4 units
  - Output: run id, conclusion, per-job durations, total wall time
  - Owner: root
  - Writes: none (git commit/push of accepted changes after user authorization)
  - Interface boundaries: push is outward-facing; requires user authorization
  - Focused check and PASS evidence: run conclusion success, wall time materially below 16m
  - Return milestone: run completed
  - Stop / reassessment: failing job -> owning worker repairs

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED
User said "continua" after plan-review OKAY (2026-11-08); push/workflow_dispatch for AC-5 still requires separate confirmation.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 4e0e8759ff93cfce31457a7007263cf9de9269e18ef8f76fb986c0c6d31bcdc4

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: HEAD f2ff16ffbc1d1de6f86a312ec44210f4a3bd439f satisfies AC-1 through AC-5 and D1-D8. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "baseline-comparison",
      "locator": "master:.github/workflows/ci.yml versus HEAD",
      "claim": "All 59 baseline pnpm commands accounted for: 47 preserved/mapped and 12 authorized duplicate Windows typechecks consolidated onto Linux. Both OSes retain every package test, Windows retries, Claude test:unit, OpenCode build, and bundle build/verification. PR version checking and workflow triggers are preserved.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "workflow-controls",
      "locator": ".github/workflows/ci.yml; .github/actions/setup/action.yml",
      "claim": "Verified exact D5 concurrency expressions, contents:read, timeouts, fail-fast:false, 19 job instances, complete ci-ok dependencies and always(). Executing the actual aggregate command returned 0 for success and 1 for failure, skipped, cancelled, timed_out, neutral and empty results. Checkout precedes composite setup; its install uses explicit bash and frozen dependencies.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "shard-verification",
      "locator": "Vitest 4.1.6 createVitest/globTestSpecifications/BaseSequencer; vitest.config.ts",
      "claim": "Actual sequencer produced disjoint exhaustive shards of 52/52/51 files: unit 47/47/47 and evals 5/5/4, totaling 155. Eval forks, fileParallelism:false and maxWorkers:1 remain unchanged. Each workflow shard checks out thoth-plugins and supplies THOTH_PLUGINS_ROOT.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "release-safety",
      "locator": ".github/workflows/release.yml; src/harness/release-workflow.test.ts",
      "claim": "Build/runtime/bundle/packed-entry verification precedes wait-ci. All five publish/tag/release/git-write steps explicitly require gate success, including always() reconciliation. The complete Wait for CI step and workflow permissions exactly equal master. Regression tests cover failed/skipped/cancelled gates and successful-gate partial-publish recovery.",
      "basis": "observed",
      "uncertainty": "No live publishing was performed."
    },
    {
      "id": "E5",
      "kind": "local-validation",
      "locator": "Assigned five-file focused Vitest run; pnpm run check:ci; pnpm run typecheck",
      "claim": "Five test files passed: 66 tests passed, three existing built-artifact-only tests skipped. check:ci and typecheck exited successfully. Biome reported warnings but no errors. Changed docs accurately describe the implemented graph.",
      "basis": "observed",
      "uncertainty": "Built-root artifact tests were not exercised locally."
    },
    {
      "id": "E6",
      "kind": "github-execution",
      "locator": "https://github.com/EremesNG/thoth-agents/actions/runs/42549665594",
      "claim": "workflow_dispatch on ci-time matches reviewed HEAD; all 19 jobs succeeded in 260 seconds versus the stated 16-minute baseline. Job seconds: static 129; root shards 98/152/52; bundles Linux/Windows 40/78; Linux background/subagents/claude/antigravity/codex-theme/utilities 66/92/94/129/125/73; Windows same lane order 197/227/162/140/151/141; ci-ok 24. Each package test and both OpenCode builds executed successfully.",
      "basis": "observed",
      "uncertainty": "Single-run performance evidence; runner timing varies."
    },
    {
      "id": "E7",
      "kind": "freshness-and-governance",
      "locator": ".thoth/changes/ci-parallel-pipeline/ci-parallel-pipeline.md; git working tree",
      "claim": "Installed verify validator passed without errors or warnings. All eight recorded implementation source hashes match. Implementation files match HEAD, diff whitespace checks pass, and record-prefix digest remained unchanged throughout review.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1; D1-D4, D6-D7",
      "method": "Baseline command mapping, workflow inspection, actual shard sequencing and GitHub job/step evidence",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E6"],
      "reason": "Coverage preserved within the authorized typecheck consolidation; balanced parallel graph meets job-count and lane-duration targets."
    },
    {
      "check": "AC-2; D5",
      "method": "Expression/control inspection and aggregate command execution with injected dependency results",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Concurrency, permissions, timeouts and fail-closed aggregation satisfy the contract."
    },
    {
      "check": "AC-3; D8",
      "method": "Exact master comparison, write-step inventory and failure-path regression tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Reordering preserves gate selection and permissions without exposing writes before gate success or disabling partial-publish reconciliation."
    },
    {
      "check": "AC-4",
      "method": "Focused tests, static checks, typecheck and documentation/diff inspection",
      "outcome": "pass",
      "evidenceIds": ["E5", "E7"],
      "reason": "Required local checks pass and tests/docs reflect the implementation."
    },
    {
      "check": "AC-5",
      "method": "Read GitHub run metadata, every job conclusion and executed check steps",
      "outcome": "pass",
      "evidenceIds": ["E6"],
      "reason": "Matching-HEAD dispatch succeeded with all 19 jobs green in 4m20s, materially below baseline."
    }
  ],
  "risks": [
    {
      "description": "Release safety is supported by source comparison and offline regressions, not a live tag/publish run.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4", "E5"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this result, record the unchanged envelope and digest, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/ci-parallel-pipeline/ci-parallel-pipeline.md",
    "reviewedRecordSha256": "4e0e8759ff93cfce31457a7007263cf9de9269e18ef8f76fb986c0c6d31bcdc4"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | coverage table (59 old pnpm commands mapped), vitest shard sequencer 52/52/51 disjoint = 155 files | run 42549665594: 19 jobs green
- AC-2: PASS | src/harness/ci-workflow.test.ts asserts concurrency/cancel/package coverage | focused vitest 5 files 66 passed
- AC-3: PASS | release-workflow.test.ts regressions (5 red first, then green) | vitest 37 passed
- AC-4: PASS | pnpm run check:ci (0 errors), pnpm run typecheck | AGENTS.md, docs/agent/testing.md updated
- AC-5: PASS | gh run 42549665594 (workflow_dispatch, ci-time, commit pushed) | success, wall 4m20s vs 16m baseline; longest job packages-windows (subagents) 3m47s

- Source: .github/workflows/ci.yml | sha256:9a1718d3b147d5b6be8f825bc2c7f11d072347890a324feee36ae4f7128a0bc6
- Source: .github/actions/setup/action.yml | sha256:c2ca0f126a0686dbf38865b6f5929f988dff0adc980954141cb267e0796b9864
- Source: .github/workflows/release.yml | sha256:07f7cf745098015a50f9b98f31728ba3533fc2ee21fc3b22deba8a17c482d4cb
- Source: src/harness/ci-workflow.test.ts | sha256:4580be7f8f95b8a6d3f54bcfb7ad27a7e153736dd9b1342103b830b9c24af303
- Source: src/harness/release-workflow.test.ts | sha256:e1c3e53f8482a13588bd316a717e24f62923719bad5d990dcf6e67116ddae88c
- Source: src/plugin-node-runtime.test.ts | sha256:f7e9a1b3c8dcf44b623d78c91e4ba71beb582658177456a3657dc748b95f8009
- Source: AGENTS.md | sha256:f3c09b7111fdb4e542fa8b4d45d00b6f2e1e7c39296e6dca4b823897b4caed82
- Source: docs/agent/testing.md | sha256:aaccdf62f97960f547061bc6b1fbdbbc8eb35b970b3ee65a9cd1076b96a20de1

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
