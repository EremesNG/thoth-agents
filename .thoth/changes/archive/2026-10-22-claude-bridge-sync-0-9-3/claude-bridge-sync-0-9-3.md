# Change: claude-bridge-sync-0-9-3

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: high

## Exploration

- `pi-packages/pi-claude-bridge` is a vendored copy of elidickinson/pi-claude-bridge, last synced to upstream `9dafd03` (0.9.1) in local commit `9fdcfdb`. Upstream `main` is now `df964a9d776442844c951ebf40d3d9d67bee98e3` (0.9.3 plus unreleased commits): 55 commits since the base, with releases 0.9.2 (`b2e7255`) and 0.9.3 (`874fa7c`).
- Upstream fixes judged applicable by source inspection:
  - `4f076aa`: duplicate AGENTS.md instructions.
  - `76fc86c`: custom-section replay rank.
  - `1cb9caf` + `df907db`: synthetic failure notices.
  - `ddce5f8`: unfinished tool blocks dispatched.
  - `5b514c2` + `c2fbfc8` + `6e1e51e`: tool results lost after restart.
  - `38980d1` + `1ae18a2`: continuing-run abort binding.
  - `91b0953` + `9dec048`: Pi session cwd instead of process cwd.
  - `eaa02b9`: continuation prompt chosen after compaction.
  - `420c005` + `8637418`: leave compaction and branch summaries to Pi.
  - `ecf3c72` + `6115f57`: isolated effort and the `max` reasoning level.
  - `e870bc8`: lazy log paths.
  - `265e166`: Haiku 5.5 gets a 1M context window.
  - `df964a9`: disable Claude Code per-request session logging.
  - `1868010`: quota exhaustion reported as non-retryable.
  - `02dc306`, `7a02060`, `0a56fd6`, `5fb69c4`: smaller fixes.
  - SDK bump: `c8ec3ce`, `9a0efe7`.
- Upstream features that come with the sync:
  - Rate-limit headers through Pi `onResponse`: `2c81045`, `a3fd575`, `8e97aed`. `ProviderResponse` and `onResponse` exist in installed Pi 1.0.2 (`node_modules/@earendil-works/pi-ai/dist/types.d.ts:54,84,118`).
  - AskClaude deprecation warning (`f0b02cc`): first TUI use only, persisted in `claude-bridge.json`, execution not disabled.
  - Diagnostic probes under `diag/`.
- Apply surface: `git diff 9dafd03 df964a9 | git apply --check --directory=pi-packages/pi-claude-bridge` fails as a whole. Checked file by file, 40 of 53 files apply cleanly, including all new unit tests, `src/{config,log-paths,models,rate-limit,session-cwd}.ts`, `diag/**` and the deletion of `tests/unit-branch-summary.mjs`.
- Files that need a manual merge:
  - Docs and manifest: `AGENTS.md`, `README.md`, `CHANGELOG.md`, `package.json`, plus upstream `package-lock.json`, which is intentionally absent here (`b27ecd2`).
  - Source: `src/index.ts`, `src/mcp-server.ts`, `src/prompt-capture.ts`, `src/query-state.ts`, `src/transcript.ts`.
  - Tests: `tests/lib/setup.mjs`, `tests/unit-config.mjs`, `tests/unit-debug-path.mjs`.
  - No changed path is gitignored; root `.gitignore` already has `!pi-packages/**/lib/`.
- Local behavior added after `9fdcfdb` that must survive:
  - Object-only root-union schema normalization that wraps unions under `input` (`770c340`, `1ac2d60`, `f9a1959`; `src/tool-schema.ts:23–54`).
  - Prompt sections, MCP-name disclosure and selected tool guidelines (`ac1c2e7`, `0d70ca2`). Extension prompt forwarding was added in `4b31e2c` and reverted in `d0294d6`, so the current HEAD is the baseline.
  - Canonical section order on resume (`d81972e`).
  - Appended-instruction refresh with changed-block or chunked delivery (`f88e9bd`, `863028e`).
  - Cache-preserving checkpoint resume (`fbe9c2e`).
  - Provider-limit reporting and `/claude quota` (`5c24983`).
  - Catalog pricing (`77180f6`).
  - Dynamic viewer-tool publication (`acba2fa`).
  - AskClaude render kit (`2b1afa7`…`82809a2`).
  - Workspace, pnpm, scoped identity and Pi 1.0.2 pins (`b27ecd2`…`c7ad412`).
  - Inherited instance-scoped lifecycle (`src/index.ts:2751–2762`) and hermetic Windows test setup.
- Compaction and branch-summary takeover lives in `src/index.ts:2765–2797` and `:2827–2850`. A repository search found no production thoth component that depends on it; other packages only observe lifecycle events in tests.
- AskClaude registers only when enabled (`src/index.ts:2904–2917`, default false per `README.md:161`).
- Dependencies:
  - Workspace Pi dev deps are pinned to `1.0.2` everywhere (`62dd691`; `docs/agent/testing.md`).
  - The bridge is the only consumer of `@anthropic-ai/claude-agent-sdk` (`^0.3.284`, lock resolves `0.3.286`, `pnpm-lock.yaml:206–208`). Upstream moves to `^0.3.308` and Pi dev deps to `^1.2.0`.
- Baseline: `pnpm --filter @thoth-agents/pi-claude-bridge run test:unit` passes 480/480. Only unit tests are safe; the package's `test`/`test:usage` suites call the live service.
- Upstream partial clone used for evidence: `/tmp/tmp.ZSiRmrD36l` (Windows `C:\Users\EremesNG\AppData\Local\Temp\tmp.ZSiRmrD36l`).

## Intent

Re-sync the vendored Claude bridge from upstream `9dafd03` to `df964a9` with the established vendoring procedure, adopting every upstream fix and the features that come with it, while preserving all local behavior and the local schema-normalization design.

## Non-goals

- Adopting upstream root-schema flattening (`9bc7985`, `e4ab6c0`) or its flattening-specific MCP tests.
- Raising workspace Pi dev dependencies to `^1.2.0`. Pi stays pinned at `1.0.2` across the workspace.
- Bumping the package version or publishing.
- Running the live `test` or `test:usage` suites.
- Extending local schema normalization to cover root `allOf` (recorded as a follow-up).

## Acceptance

- AC-1: Every upstream change in `9dafd03..df964a9` is present in `pi-packages/pi-claude-bridge`, adapted to local structure, as decided in this record:
  - All upstream fixes and features, including upstream-added source files, `diag/**` and unit tests (adapted where local semantics differ), and the deletion of `tests/unit-branch-summary.mjs`.
  - The `session_before_compact` and `session_before_tree` takeover hooks are removed. Summary requests the bridge serves run on its isolated path in the owning Pi session's cwd (`420c005`, `8637418`, `9dec048`).
  - Bridge queries and isolated calls use the Pi session cwd instead of `process.cwd()` (`91b0953`, `src/session-cwd.ts`).
  - The AskClaude deprecation warning (`f0b02cc`) is included. AskClaude stays opt-in and executable.
  - Upstream root-schema flattening (`9bc7985`, `e4ab6c0`) and its flattening-only test assertions are not adopted. Local object-only root-union normalization under `input` is unchanged.
  - `README.md` records the new upstream sync base `df964a9`, and `CHANGELOG.md` records the sync.
- AC-2: All local behavior listed in Exploration still works, and the existing `.thoth/specs/pi-ecosystem/spec.md` requirements for the Claude bridge still hold. Those are: appended instructions kept current, prompt sections projected once, MCP tool names disclosed, every rate-limit event reported to the pi-core registry, and resume across Pi processes. Existing unit tests pass unchanged, except where upstream intentionally changed the asserted behavior; each such test change is listed with its reason.
- AC-3: `@anthropic-ai/claude-agent-sdk` is declared `^0.3.308` and `pnpm-lock.yaml` is updated through `pnpm install`. Pi dev dependencies stay `1.0.2`, and the package version is unchanged. The pre-merge bridge passes its unit tests and typecheck on the new SDK.
- AC-4: Package `test:unit`, `typecheck` and `build` pass. Root `pnpm run check:ci`, `pnpm run typecheck` and `pnpm run test:pi-extensions` (after build) pass.

## Clarifications

- Compaction and branch summaries: the user chose to adopt upstream, so Pi and extensions own them and the bridge drops its takeover.
- AskClaude deprecation: the user chose to include upstream's warning.
- No other material question remains. Schema design, Pi pins and the SDK bump follow repository evidence and conventions.

## Decisions

- Use the established vendoring procedure: upstream `git diff 9dafd03 df964a9` applied with `git apply --directory=pi-packages/pi-claude-bridge`, then a manual merge of the files that do not apply.
- Keep local schema normalization and drop upstream flattening. Local wrapping preserves union semantics, while upstream flattening is lossy for non-object branches. The root `allOf` gap is a follow-up.
- Keep Pi dev dependencies at the workspace pin `1.0.2`, because the rate-limit API exists there. Adapt any upstream test expectation that assumes Pi 1.2, such as the Haiku catalog in `ddae67a`, to 1.0.2 behavior, or note it as host-version-dependent.
- Bump the Claude Agent SDK to `^0.3.308`. The bridge is its only consumer, and upstream contract tests target it.
- Include upstream rate-limit header reporting alongside the local pi-core provider-limit channel. The two coexist; the pi-core registry requirement stays mandatory.
- Do not auto-increment the package version.
- The upstream `package-lock.json` is not reintroduced, because the workspace uses the single root `pnpm-lock.yaml`.

## Durable deltas

- `ADDED pi-ecosystem` **Claude bridge leaves session summaries to Pi** — `@thoth-agents/pi-claude-bridge` MUST NOT take over Pi's session compaction or branch-summary hooks, leaving summary generation and its failure handling to Pi and other extensions, and any summary model call it serves MUST run on its isolated path in the owning Pi session's working directory.
  - GIVEN a Pi session on a Claude bridge model; WHEN Pi compacts the session or summarizes a branch during tree navigation; THEN the bridge neither preempts nor cancels the hook, and a summary request routed to it runs isolated in that session's cwd.
- `ADDED pi-ecosystem` **Claude bridge uses the Pi session working directory** — `@thoth-agents/pi-claude-bridge` MUST run each Claude Code query and isolated call in the working directory of the Pi session that issued it, not the host process's working directory.
  - GIVEN a host running Pi sessions in different directories in one process; WHEN each session sends a turn through the bridge; THEN each Claude Code query runs in its own session's directory.

## Plan

- Upstream source: a fresh partial clone of `https://github.com/elidickinson/pi-claude-bridge` (or the existing `/tmp/tmp.ZSiRmrD36l`). Never modify `C:\DEV\Proyectos\Webstorm\pi-claude-bridge`.
- Merge procedure:
  1. Apply all cleanly applying files from `git diff 9dafd03 df964a9`.
  2. Hand-merge the 13 failing files, applying upstream's semantic intent on top of local code.
  3. In `src/mcp-server.ts`, keep local `normalizeToolSchema` publication and skip upstream flattening.
  4. In `src/index.ts`, integrate the upstream fix chains, remove the takeover hooks (`:2765–2797`, `:2827–2850`) while keeping the post-compaction/tree history-rebuild invalidation (`:2800–2815`), and keep the instance lifecycle, checkpoint, appended instructions, provider limits, tool publication and the AskClaude render kit.
  5. In `src/prompt-capture.ts` and `src/transcript.ts`, keep the local section projection and canonical order, and add only upstream's replay-rank fix where it is not already covered.
  6. In the tests, keep local hermetic Windows isolation and `path.join` expectations and adopt upstream's lazy-path isolation.
- Interfaces to preserve:
  - pi-core provider-limit registry and work-panel contracts (`@thoth-agents/pi-core`).
  - Pi provider registration and `onResponse`.
  - The Claude Code SDK contract at `^0.3.308`.
- Mutable surfaces:
  - `pi-packages/pi-claude-bridge/**`: one writer.
  - Root `pnpm-lock.yaml`: shared with change `antigravity-upstream-fixes`. Lockfile edits are serialized; this change's dependency unit runs first.
- Verification seams:
  - `pnpm --filter @thoth-agents/pi-claude-bridge run test:unit` (baseline 480 pass), `run typecheck`, `run build`.
  - Root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run test:pi-extensions`.
  - Never run the live suites.
- Risks:
  - `src/index.ts` merge complexity.
  - Duplicate prompt-section insertion.
  - Upstream debug-path tests with POSIX literals.
  - Behavior differences hidden by textual application.
  - SDK minor bump effects on contract tests.
- Mitigations: test-first adaptation of each upstream unit test, and fresh independent Oracle verification of the diff.

## Tasks

- [x] AC-1: Upstream 9dafd03..df964a9 source, diag and test changes integrated into pi-packages/pi-claude-bridge with local behavior preserved
  - Outcome: the package contains every upstream change except schema flattening; the takeover hooks are removed, session cwd and the AskClaude warning are adopted, and all local behaviors are retained.
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/{index,mcp-server,prompt-capture,query-state,transcript,tool-schema,session-cwd,rate-limit,log-paths,models,config}.ts`, `tests/**`, `diag/**`, `README.md`, `AGENTS.md`, `CHANGELOG.md`, `package.json` (non-dependency fields). Upstream clone `/tmp/tmp.ZSiRmrD36l`. Skills: installed `tdd`, then `simplify`.
  - Inputs: the accepted Exploration and Decisions in this record, and the accepted AC-3 SDK bump.
  - Dependencies: AC-3 accepted by root.
  - Output: merged package source and tests, plus a report of every manually merged file, every adapted or dropped upstream test, and every changed existing test with its reason.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/**`, except dependency ranges in `package.json`.
  - Interface boundaries: pi-core provider-limit and work-panel APIs; Pi extension and provider APIs at 1.0.2; `.thoth/specs/pi-ecosystem` Claude bridge requirements.
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-claude-bridge run test:unit` passes all tests, including adopted upstream tests; `run typecheck` exits 0.
  - Return milestone: after the clean-apply step with its file list, then at completion.
  - Stop / reassessment: an upstream fix that cannot coexist with a local behavior or spec requirement, or a needed Pi API missing in 1.0.2.
- [x] AC-2: Regression review confirms local behavior and Claude bridge spec requirements survive the merge
  - Outcome: root accepts or rejects the AC-1 diff's preservation of local behavior.
  - Known entrypoints and skill paths: the AC-1 diff of `pi-packages/pi-claude-bridge/**`; `.thoth/specs/pi-ecosystem/spec.md` Claude bridge requirements; the worker report's list of changed existing tests.
  - Inputs: the accepted AC-1 output.
  - Dependencies: AC-1 accepted by root.
  - Output: acceptance decision with test evidence, or a list of regressions returned to a worker.
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-claude-bridge run test:unit` passes, and every changed existing test traces to an intentional upstream behavior change.
  - Return milestone: after the AC-1 result is received.
  - Stop / reassessment: an unexplained change to an existing test, or a removed local behavior.
- [x] AC-3: Claude Agent SDK raised to ^0.3.308 with the root lockfile updated
  - Outcome: the SDK range and `pnpm-lock.yaml` are updated, Pi pins are unchanged, and the current (pre-merge) bridge still passes on the new SDK.
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/package.json`, root `pnpm-lock.yaml`.
  - Inputs: the accepted Exploration and Decisions in this record.
  - Dependencies: none.
  - Output: dependency diff and install log summary.
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/package.json` dependency fields, `pnpm-lock.yaml`.
  - Interface boundaries: workspace single-lockfile convention; other packages' dependency resolution unchanged.
  - Focused check and PASS evidence: `pnpm install` succeeds; `pnpm --filter @thoth-agents/pi-claude-bridge run test:unit` passes 480/480 and `run typecheck` exits 0.
  - Return milestone: after install and package checks.
  - Stop / reassessment: an SDK `^0.3.308` resolution or contract break in the current code. Report it instead of fixing source, because source adaptation belongs to AC-1.
- [x] AC-4: Root closeout checks pass for the synchronized package
  - Outcome: root-level gates are green on the combined result.
  - Known entrypoints and skill paths: root `package.json` scripts.
  - Inputs: accepted AC-1, AC-2 and AC-3 units.
  - Dependencies: AC-2 accepted by root.
  - Output: check results.
  - Owner: root
  - Writes: none (build output under `pi-packages/pi-claude-bridge/dist` is generated)
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-claude-bridge run build`, `pnpm run test:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` exit 0.
  - Return milestone: after the checks run.
  - Stop / reassessment: failures caused by unrelated workspace changes are reported, not fixed here.

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
**Reviewed record SHA-256**: aadf6dda90248d7ecb37cc52a6120d1d8e1d8ec57310c55df5a56decdf719fa2

Round 1 (fresh Oracle) returned FAIL: `/claude quota` used `process.cwd()`. The convergence fix routes it through `sessionCwdFor(sessionId)` with a red → green test. Round 2 (fresh Oracle) returned PASS.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The quota cwd defect is fixed. Fresh review found no blocking violations of AC-1 through AC-4, the Decisions, durable deltas, or relevant canonical requirements.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/claude-bridge-sync-0-9-3/claude-bridge-sync-0-9-3.md; .thoth/specs/pi-ecosystem/spec.md",
      "claim": "Independently hashed exact record-prefix bytes. Canonical spec digest matches the recorded baseline; the installed verify validator passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "git status; git diff; pi-packages/pi-claude-bridge/**; upstream /tmp/tmp.ZSiRmrD36l, 9dafd03..df964a9",
      "claim": "Reviewed tracked changes and untracked package files against all upstream changed paths. Source, diagnostics and tests are integrated with the declared schema, workspace and host-version adaptations. README records df964a9.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "behavior-review",
      "locator": "pi-packages/pi-claude-bridge/src/index.ts:597-660,2084,2181-2323,2497,2566,2711-2718,2849-2855; src/session-cwd.ts",
      "claim": "Quota now uses sessionCwdFor(sessionId). Provider queries, hookless retries, AskClaude and isolated summaries retain session-aware cwd routing. Summary hooks observe ownership without taking over generation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "contract-review",
      "locator": "pi-packages/pi-claude-bridge/src/{prompt-capture,index,query-state,provider-limits,quota,append-instructions,session-checkpoint}.ts; tests/unit-{rate-limit,provider-limits,summary-cwd,prompt-sections,session-checkpoint}.mjs",
      "claim": "Prompt projection, MCP-name disclosure, append refresh and guarded checkpoint resume remain intact. Every consumed rate-limit event reaches pi-core before content/abort guards; only the separate header channel coalesces held events.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "dependency-review",
      "locator": "pi-packages/pi-claude-bridge/package.json; pnpm-lock.yaml; installed SDK package.json",
      "claim": "SDK declaration is ^0.3.308 and resolves to 0.3.309. Pi development pins remain 1.0.2 and package version remains 0.2.5. Lockfile changes are limited to the SDK family.",
      "basis": "observed",
      "uncertainty": "Historical pre-merge 480-test and typecheck results are recorded but were not reconstructed."
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "Independent package test:unit, package typecheck, and git diff --check executions",
      "claim": "Unit suite passes 537/537 with zero skips or cancellations and the four specified environment variables unset. Package typecheck and whitespace checks pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "reused-execution",
      "locator": "Delegating root's post-fix check results",
      "claim": "Root reports successful package build, workspace check:ci and typecheck, and 13/13 extension-bundle tests after the fix.",
      "basis": "inferred",
      "uncertainty": "Reused fresh root evidence; these unchanged-input checks were not independently rerun."
    }
  ],
  "verification": [
    {
      "check": "AC-1: upstream synchronization and intentional exclusions",
      "method": "Compared actual tracked and untracked files with the upstream range and reviewed adaptations.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E6"],
      "reason": "Upstream behavior is integrated without adopting excluded schema flattening or changing summary ownership."
    },
    {
      "check": "AC-2: local behavior and canonical Claude bridge requirements",
      "method": "Reviewed preservation seams, changed test expectations and complete offline regression results.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E6"],
      "reason": "No lost local behavior or unjustified regression-test weakening found."
    },
    {
      "check": "AC-3: SDK and workspace dependency constraints",
      "method": "Inspected manifest, lockfile, installed version and recorded pre-merge evidence.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "Required SDK range is installed; Pi pins and package version are unchanged."
    },
    {
      "check": "AC-4: required checks",
      "method": "Independently reran package units and typecheck; reused root's post-fix build and workspace checks.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7"],
      "reason": "All required checks have passing evidence."
    },
    {
      "check": "Round-2 cwd remediation and both durable deltas",
      "method": "Audited query call sites and ownership routing; executed quota, session-cwd, native-summary and coexistence regressions within the unit suite.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6"],
      "reason": "Quota uses the issuing session cwd; native summaries remain isolated and session-attributed without hook takeover."
    },
    {
      "check": "Record binding and baseline freshness",
      "method": "Computed SHA-256 directly from bytes before the Authorization heading, verified the canonical baseline, and repeated final input checks.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "Record digest remains aadf6dda90248d7ecb37cc52a6120d1d8e1d8ec57310c55df5a56decdf719fa2; source baseline is current."
    },
    {
      "check": "Live Claude service contracts",
      "method": "Not executed.",
      "outcome": "not-run",
      "evidenceIds": ["E2", "E5"],
      "reason": "Explicitly excluded; neither test nor test:usage was run."
    }
  ],
  "risks": [
    {
      "description": "Live SDK/service behavior at resolved SDK 0.3.309 remains unverified locally; offline tests do not establish live cache-hit behavior.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E5", "E6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record the PASS and acceptance evidence, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/claude-bridge-sync-0-9-3/claude-bridge-sync-0-9-3.md",
    "reviewedRecordSha256": "aadf6dda90248d7ecb37cc52a6120d1d8e1d8ec57310c55df5a56decdf719fa2"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | upstream inventory comparison 9dafd03..df964a9 by fresh Oracle; package test:unit | all upstream changes integrated except excluded flattening; takeover removed; session cwd (including /claude quota) and AskClaude warning present; 537/537 unit tests
- AC-2: PASS | root regression review and Oracle contract review; package test:unit | local behaviors and Claude bridge spec requirements intact; every changed existing test traced to an upstream behavior change; 537/537
- AC-3: PASS | pnpm install; manifest and lockfile inspection; pre-merge test:unit | SDK ^0.3.308 resolved 0.3.309; Pi pins 1.0.2; version 0.2.5; lockfile limited to the SDK family; 480/480 pre-merge
- AC-4: PASS | package test:unit, typecheck, build; root build, test:pi-extensions, check:ci, typecheck | 537/537; exit 0; exit 0; 13/13; exit 0; exit 0
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:3f1abf9c3b5a3a1429ccd7d3b7fb1ac98ade5be727b2c26f66d360b482fb3868

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
