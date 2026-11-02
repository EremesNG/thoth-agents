# Change: pi-dev-pins-1-4-0

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- The user's installed Pi runtime is 1.4.0 (`pi-coding-agent`, `pi-ai`, `pi-tui` under the pnpm global store), while the repository develops and tests against exactly `1.0.2`.
- Exact `1.0.2` devDependency pins exist in root `package.json:103–105` and in all 11 Pi packages: pi-todo, pi-thoth-theme, pi-openai-fast (ai and coding-agent only), pi-sidebar, pi-questions-user, pi-subagents (also `pi-agent-core`), pi-core, pi-claude-bridge, pi-background-tasks, pi-askcodex, pi-antigravity-bridge. Peer ranges are uniformly `>=0.99.0` and stay unchanged.
- `pnpm-lock.yaml` importers (root 63–69 through todo 415–421), package records (713–745) and snapshots (3306–3474) carry `1.0.2`. `pnpm-workspace.yaml` has no Pi catalog, override or patch, and its release-age exclusion already covers `@earendil-works/*`. CI and `scripts/build-pi-extensions.mjs` pin no Pi version.
- Tests that assert the pin: `pi-packages/pi-core/test/package.test.ts:11–13`, `pi-packages/pi-subagents/test/package.test.ts:57–60`, `pi-packages/pi-thoth-theme/test/render-kit-real-sdk.test.ts:174`.
- Canonical specs that name the development pin: `.thoth/specs/multi-harness-agent-pack/spec.md:290` ("Native lifecycle translation") and `:516` ("Uniform Pi SDK compatibility floor"). `.thoth/specs/cli-installation/spec.md:487` only names `1.0.2` as an example of an accepted runtime, which remains true.
- Docs naming the pin: `docs/agent/harness-packaging.md:104,444`, `docs/agent/testing.md:107,375`, `docs/agent/cli-installation.md:145,151,185`, and READMEs of pi-core, pi-subagents, pi-thoth-theme, pi-claude-bridge, pi-sidebar, pi-questions-user and pi-todo.
- Pi changes between 1.0.3 and 1.4.0 (pi-coding-agent CHANGELOG; installed pi-ai and pi-tui ship no CHANGELOG) with possible local impact:
  - 1.2: `BeforeAgentStartEvent` becomes a `messageType` union, and custom events carry no `prompt`. Direct use: `pi-packages/pi-core/src/work-panel-lifecycle.ts:120–122` and root `src/pi.ts:138–142`.
  - 1.2: busy/queue semantics change (`sendMessage` queues, `sendUserMessage` requires `deliverAs`); startup themes are schema-validated and the schema URL moved (`pi-packages/pi-thoth-theme/themes/thoth.json:2`).
  - 1.3: overlay `done()` closes its own overlay, which interacts with the `pi-core/src/owned-overlay.ts:261–269` workaround; cross-model thinking is dropped instead of being converted to text.
  - 1.4: attribution headers are hidden from before_provider_headers handlers (forwarded by `pi-subagents/src/runner/sdk-runner.ts:190`).
  - Additive: render/event `durationMs`, `outputPad`, settled `aborted`.
- Requirements: Node floor `>=22.19.0` is unchanged. pi-ai 1.4.0 depends on `typebox` 1.3.27. Local packages use typebox `1.1.38` (pi-subagents) or `^1.3.x`; incompatibility is not established.
- Verification surface: every package has `typecheck` (`tsc --noEmit`). Ten packages run `vitest run`; pi-claude-bridge must run only `test:unit`. CI `.github/workflows/ci.yml:80–132` runs them all. Root `typecheck`, `check:ci`, `test` (src/** and evals/**), `build`, and the Pi extension bundle tests (`scripts/pi-extension-bundles.test.mjs`, which read package `dist/index.ts`). Tests need `CODEX_HOME`, `PI_SUBAGENT_CHILD`, `PI_CODING_AGENT_DIR` and `PI_PACKAGE_DIR` unset.

## Intent

Develop, typecheck and test the root package and every Pi package against Pi SDK 1.4.0, the runtime actually in use, through one shared exact development pin. Fix whatever 1.4.0 breaks while keeping the published `>=0.99.0` peer floor working through runtime detection and degradation.

## Non-goals

- No peer range, `engines.node` or package version changes.
- No pi-claude-bridge upstream sync, SDK pin or progress-update work; those are later separate changes.
- No new behavior beyond what 1.4.0 compatibility requires; no refactors.
- No typebox unification unless typecheck or tests require it.
- Historical or source-attribution references (`LICENSE`, `src/cli/pi-git-source.ts`, `src/cli/pi-install.ts`, `docs/installation.md`, `evals/pi/harness.ts`), CLI fixtures that model an installed Pi `1.0.2`, and the `cli-installation` runtime example stay unchanged.
- Code comments that accurately describe older Pi behavior stay unchanged.

## Acceptance

- AC-1: Every Pi devDependency (`pi-ai`, `pi-coding-agent`, `pi-tui`, and `pi-agent-core` in pi-subagents) in the root and all 11 Pi packages is exactly `1.4.0`. `pnpm-lock.yaml` resolves those development dependencies only to `1.4.0`, `pnpm install --frozen-lockfile` succeeds, and every Pi peer range is still `>=0.99.0`.
- AC-2: Root `pnpm run typecheck` and every Pi package `typecheck` pass against 1.4.0. Every compatibility fix keeps `>=0.99.0` runtime support (detect and degrade, no hard failure on older events or APIs).
- AC-3: Every Pi package offline test suite (`vitest run`; pi-claude-bridge `test:unit` only) and root `pnpm test` pass. Version assertions expect `1.4.0`, and behavioral fixes are covered test-first.
- AC-4: `pnpm run check:ci`, `pnpm run build` and the Pi extension bundle tests pass.
- AC-5: Docs and READMEs that state the shared development pin say `1.4.0`, and the two declared spec deltas are recorded for archive.

## Clarifications

- Resolved with the user (2026-11-02): bump Pi to 1.4.0 for all packages, as its own change before the pi-claude-bridge upstream sync.
- No further material question remains. Breakages are bounded technical unknowns, resolved by typecheck and tests; any fix that would change user-visible behavior beyond compatibility returns to root.

## Decisions

- D1: Keep exact development pins (`1.4.0`), matching the existing exact-pin practice and the single-shared-version requirement. Peers stay minimum-only (`>=0.99.0`).
- D2: Handle the Pi 1.2 `BeforeAgentStartEvent` union by narrowing on the event shape (`prompt` present / non-custom message type), so runtimes older than 1.2 keep working.
- D3: Leave the `pi-core` owned-overlay workaround in place unless tests show it misbehaves on 1.4.0. It still serves runtimes older than 1.3.
- D4: If the theme schema URL in `thoth.json` fails 1.4.0 validation in tests, update it to the 1.4.0 location; otherwise leave it.
- D5: The `cli-installation` example "0.99.0 or 1.0.2" stays, because it lists accepted runtime versions, not the development pin.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Native lifecycle translation** — Pi root guidance MUST use one direct subagent_run with explicit canonical agent and bounded task per fresh assignment; omitted mode MUST run in background for both subagent_run and subagent_continue, task mode MUST occur only when the invocation explicitly passes `mode: "task"`, and agent definitions, subagent configuration and previous attempts MUST NOT select the execution mode. Native status/result/cancel or supported live messaging MUST be used only for a known task ID. Queued delivery, nonterminal state and cancellation requests MUST NOT prove termination or acceptance. New objectives, phases, mutable surfaces and independent judgments MUST receive fresh assignments. Thoth MUST NOT use subagent orchestration APIs or claim instruction-only policy is runtime enforcement. Terminal notifications drive collection without polling; children MUST remain scoped to the parent Pi lifetime. The adopted delegation runtime MUST support Pi `>=0.99.0` through the `1.4.0` development pin with its registry and model-only exposure semantics, restrict child registered tools to the selected permitted implementations, and distinguish queued, extension-handled, rejected, and model-consumed live input. Updating this runtime MUST preserve its responsibility for LLM subagent delegation; non-LLM background task execution remains external.
  - GIVEN an agent definition or configuration that previously requested task mode; WHEN root calls subagent_run or subagent_continue without mode; THEN the child runs in background, and only an explicit `mode: "task"` invocation blocks.
- `MODIFIED multi-harness-agent-pack` **Uniform Pi SDK compatibility floor** — The root thoth-agents package and every Pi package under pi-packages MUST declare each Pi SDK peer dependency (`@earendil-works/*`) with the same minimum `>=0.99.0`, MUST develop and test against one shared Pi SDK development version (currently `1.4.0`), and MUST declare an `engines.node` floor of Node 22.19 (`>=22.19` or `>=22.19.0`); features that need a newer Pi API MUST detect it at runtime and degrade without failing on the minimum.
  - GIVEN the repository manifests and root lockfile; WHEN Pi SDK dependencies are inspected; THEN every Pi peer range is `>=0.99.0`, every Pi development dependency resolves to the single shared version, and every manifest requires Node 22.19 or newer.

## Plan

**Approach.** Raise every Pi development pin to exactly `1.4.0` in the root and the 11 Pi packages. Regenerate `pnpm-lock.yaml` with `pnpm install`, then confirm it with `--frozen-lockfile`. Run every typecheck and offline suite, and fix breakages test-first where behavior is involved. Then update the docs and READMEs that state the pin. Spec text changes only through the declared deltas at archive.

**Mutable surfaces.**
- Unit A (dependency and compatibility): root `package.json`, `pi-packages/*/package.json`, `pnpm-lock.yaml`, the three version-assertion tests, and only the `src`/`test` files that 1.4.0 actually breaks. Expected hotspots: `pi-packages/pi-core/src/work-panel-lifecycle.ts`, root `src/pi.ts`, `pi-packages/pi-core/src/owned-overlay.ts`, `pi-packages/pi-thoth-theme/themes/thoth.json`, and `pi-packages/pi-subagents/src/runner/sdk-runner.ts`.
- Unit B (documentation): `docs/agent/harness-packaging.md`, `docs/agent/testing.md`, `docs/agent/cli-installation.md`, and READMEs of pi-core, pi-subagents, pi-thoth-theme, pi-claude-bridge, pi-sidebar, pi-questions-user and pi-todo, limited to dev-pin statements. B does not touch any file that A owns.

**Interfaces.** The Pi extension APIs consumed by the packages (`BeforeAgentStartEvent`, overlays, `sendMessage`/`sendUserMessage`, provider-header events, theme schema). Published peer ranges stay unchanged.

**Risks.**
- The pi-core prompt union fails typecheck: expected; fix it by narrowing (D2).
- Overlay or busy-semantics test regressions: fix them in the affected package only, or return to root if the fix changes user-visible behavior.
- Mixed typebox versions: act only on concrete failures.
- Windows timing flakiness: report it with evidence; it is not a change failure.

**Verification seams.** Run with `CODEX_HOME`, `PI_SUBAGENT_CHILD`, `PI_CODING_AGENT_DIR` and `PI_PACKAGE_DIR` unset:
- `pnpm install --frozen-lockfile`
- `pnpm -r --filter "./pi-packages/*" run typecheck`
- `pnpm --filter <pkg> test` for the 10 vitest packages
- `pnpm --filter @thoth-agents/pi-claude-bridge run test:unit` (never `test` or `test:usage`)
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run check:ci`
- `pnpm run build`, then the Pi extension bundle tests

Also run a lockfile check that no `@earendil-works/pi-*@1.0.2` development resolution remains.

## Tasks

- [x] AC-1: Pi development pins and lockfile at exactly 1.4.0, with version assertions updated
  - Outcome: root and all 11 package manifests pin Pi dev deps to `1.4.0`; the lockfile is regenerated; the three version-assertion tests expect `1.4.0`; peers are unchanged
  - Known entrypoints and skill paths: `package.json`, `pi-packages/*/package.json`, `pnpm-lock.yaml`, `pi-packages/pi-core/test/package.test.ts`, `pi-packages/pi-subagents/test/package.test.ts`, `pi-packages/pi-thoth-theme/test/render-kit-real-sdk.test.ts`
  - Inputs: Exploration pin inventory in this record
  - Dependencies: none
  - Output: manifest, lockfile and assertion diff; frozen install success
  - Owner: thoth-worker (unit A, worker A1)
  - Writes: the manifests, `pnpm-lock.yaml`, the three tests
  - Interface boundaries: peer ranges and engines unchanged
  - Focused check and PASS evidence: `pnpm install --frozen-lockfile` exits 0; `grep` finds no Pi `1.0.2` dev resolution in `pnpm-lock.yaml`; the three tests pass
  - Return milestone: after a frozen install succeeds and the first full typecheck results are known
  - Stop / reassessment: a registry or resolution failure, or a peer conflict that would require changing peer ranges
- [x] AC-2: Typecheck passes against Pi 1.4.0 with compatibility fixes that keep `>=0.99.0` working
  - Outcome: root and every package typecheck green; fixes such as the `BeforeAgentStartEvent` narrowing (D2) are minimal and runtime-degrading
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-lifecycle.ts`, `src/pi.ts`, other files named by `tsc` errors; skill `tdd` for behavior fixes
  - Inputs: accepted AC-1 output
  - Dependencies: AC-1 pins row
  - Output: compatibility fixes with tests
  - Owner: thoth-worker. Unit A was refined after the AC-1 inventory into disjoint writers: A2 (pi-core and root), A3 (pi-thoth-theme), A4 (test fixtures of pi-subagents, pi-sidebar, pi-todo, pi-antigravity-bridge, pi-claude-bridge)
  - Writes: only the `src`/`test` files that typecheck or tests implicate
  - Interface boundaries: Pi extension APIs; public package exports unchanged
  - Focused check and PASS evidence: `pnpm run typecheck` and `pnpm -r --filter "./pi-packages/*" run typecheck` exit 0
  - Return milestone: when typecheck is green, or on the first fix that would change user-visible behavior
  - Stop / reassessment: a fix that needs new behavior, a new dependency or a peer-range change
- [x] AC-3: Offline test suites pass on Pi 1.4.0
  - Outcome: all 10 vitest package suites, pi-claude-bridge `test:unit` and root `pnpm test` pass; regressions are fixed test-first
  - Known entrypoints and skill paths: package `test` scripts; `.github/workflows/ci.yml:80–132`; skill `tdd`
  - Inputs: accepted AC-2 output
  - Dependencies: AC-2 typecheck row
  - Output: green suites, plus fixes such as overlay, theme schema (D4) or busy-semantics adjustments if needed
  - Owner: thoth-worker, same disjoint writers A2/A3/A4 as AC-2
  - Writes: implicated `src`/`test` files and `pi-packages/pi-thoth-theme/themes/thoth.json` only if D4 applies
  - Interface boundaries: user-visible behavior unchanged except for compatibility
  - Focused check and PASS evidence: each suite command exits 0 with environment variables unset; failing Windows-timing flakes are reported with output
  - Return milestone: all suites green, or a regression whose fix changes behavior
  - Stop / reassessment: a behavior change, or a failure rooted outside 1.4.0 compatibility
- [x] AC-4: Repository gates and bundles pass
  - Outcome: `pnpm run check:ci`, `pnpm run build` and the Pi extension bundle tests pass on the final tree
  - Known entrypoints and skill paths: root `package.json` scripts; `scripts/pi-extension-bundles.test.mjs`
  - Inputs: accepted AC-3 output
  - Dependencies: AC-3 suites row
  - Output: gate results
  - Owner: thoth-worker (worker A5, consolidated sequential run on the frozen tree)
  - Writes: none beyond formatting fixes in files it already owns
  - Interface boundaries: none
  - Focused check and PASS evidence: the three commands exit 0
  - Return milestone: gates green
  - Stop / reassessment: a build failure outside unit A's surfaces
- [x] AC-5: Documentation states the 1.4.0 development pin
  - Outcome: dev-pin statements in `docs/agent/*` and package READMEs say `1.4.0`; historical, attribution and runtime-example references are untouched
  - Known entrypoints and skill paths: `docs/agent/harness-packaging.md:104,444`, `docs/agent/testing.md:107,375`, `docs/agent/cli-installation.md:145,151,185`, READMEs listed in Plan unit B
  - Inputs: Exploration doc inventory
  - Dependencies: none (disjoint from unit A)
  - Output: documentation diff
  - Owner: thoth-worker (unit B)
  - Writes: only the listed docs and READMEs
  - Interface boundaries: no manifest, lockfile, source or test files
  - Focused check and PASS evidence: `grep -rn "1\.0\.2"` over the listed files shows only historical, attribution or runtime-example uses; `pnpm run check:ci` is clean for touched files
  - Return milestone: docs diff ready
  - Stop / reassessment: an ambiguous reference whose meaning (dev pin vs runtime example) cannot be decided from context

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: fresh Oracle subtask_thoth-oracle_1793586228564_5750a3f3, delivered verdict valid:true, kind plan-review, verdict OKAY, recordSha256 93a6b1acf0c2d82a78a26bb260ac48d6ded85f3cdb2b758b42c4eaeb1a6df8c2 (recordDigest match).
Nonblocking cautions carried into implementation: keep legacy prompt-only lifecycle fixtures and add 1.4.0 user/custom event variants; report Windows timing failures as unresolved evidence, never as passing checks.
Implementation authorized explicitly by the user on 2026-11-02.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 17335dd825a33a8ba0523cbbbcec57a7b0ff25af1582ab5650ddbdf23aa63c31

Fresh Oracle subtask_thoth-oracle_1793589067703_25a19f26; delivered verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The actual diff satisfies AC-1–AC-5; no blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "dependency-audit",
      "locator": "package.json; pi-packages/*/package.json; pnpm-lock.yaml",
      "claim": "JSON comparison against HEAD confirms 36 exact 1.4.0 dev pins across 12 manifests, 23 unchanged >=0.99.0 peers, and no other manifest changes. Installed versions match; no Pi 1.0.2 lockfile resolutions remain.",
      "basis": "observed",
      "uncertainty": "Frozen install success is recorded evidence, not independently repeated."
    },
    {
      "id": "E2",
      "kind": "compatibility-review",
      "locator": "pi-packages/pi-core/src/work-panel-lifecycle.ts; pi-packages/pi-thoth-theme/src/input-box/frame.ts",
      "claim": "Prompt-presence narrowing preserves legacy prompt-only events and safely ignores custom events. Placeholder handling preserves both legacy inverse-video and 1.4.0 deferred cursor cells. Neither source change adds a newer runtime API dependency.",
      "basis": "observed",
      "uncertainty": "No separate 0.99.0 installation was executed; compatibility judgment uses source inspection and retained legacy-shape tests."
    },
    {
      "id": "E3",
      "kind": "test-diff-review",
      "locator": "All changed tests and snapshot; installed Pi 1.4.0 SDK",
      "claim": "Test adaptations are legitimate: exact cursor checks remain alongside layout/composition assertions; catalog pricing tests retain explicit model mappings and full usage equality; Haiku checks newest-model resolution in both orders. The overlay expectation matches the SDK's owned-handle closure. Schema relocation and added fixture members match installed SDK declarations. No assertion weakening conceals a regression.",
      "basis": "observed",
      "uncertainty": "Test-first chronology is recorded, not independently reconstructible from the uncommitted diff."
    },
    {
      "id": "E4",
      "kind": "independent-execution",
      "locator": "Root and Pi package typechecks; focused offline tests",
      "claim": "Root and all 11 package typechecks passed. Full pi-core and theme suites passed: 1145 and 1447 tests. Focused root, antigravity, subagents, and Claude model tests passed: 30, 59, 92, and 28 tests respectively. Required environment variables were unset; commands ran sequentially.",
      "basis": "observed",
      "uncertainty": "Other full suites were not repeated."
    },
    {
      "id": "E5",
      "kind": "gate-evidence",
      "locator": "package.json scripts; record Verification section",
      "claim": "Independent check:ci exited successfully with warnings/infos only; all 13 extension bundle tests passed. Recorded frozen-install, full offline-suite, root-test, and build results are plausible and consistent with the inspected scripts, installed SDK, and independent checks.",
      "basis": "observed",
      "uncertainty": "Frozen install, build, and remaining full-suite executions rely on the supplied record's evidence."
    },
    {
      "id": "E6",
      "kind": "documentation-and-spec-audit",
      "locator": "Scoped Markdown diff; .thoth/specs/multi-harness-agent-pack/spec.md",
      "claim": "Documentation changes are limited to development/test SDK statements. The two remaining scoped 1.0.2 references remain valid historical/runtime observations. Both durable requirements and scenarios match canonical text except 1.0.2→1.4.0; canonical SHA-256 matches the Source entry.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "scope-and-freshness",
      "locator": "git diff versus HEAD 01332f59; assigned change record",
      "claim": "Reviewed all 51 tracked changes plus the sole untracked record. No unrelated, secret, or tracked dist changes were found; the snapshot change is intentional test data. diff --check and the SDD verify validator passed. Diff and record-prefix hashes remained unchanged through final checks.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "memory-recall",
      "locator": "thoth-mem project git:3726a62c-51e1-43ba-a466-57d41c5b7048",
      "claim": "Project-only recall returned 17f17e51-36c4-508c-aba9-9bc2264b2545, 11837fef-e903-44b3-ac16-3b9a7f87af36, 97825ea0-1674-4d06-bd0e-1ddf293ca4df, and 6a30d91b-bd3d-49c1-a683-dfc39f2df716. No memory writes or session attribution occurred.",
      "basis": "observed",
      "uncertainty": "Compact recall was truncated and supplied no pin-specific verification evidence."
    }
  ],
  "verification": [
    {
      "check": "AC-1: dependency pins and lockfile",
      "method": "Manifest comparison, installed-version inspection, lockfile review, recorded frozen-install evidence",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5"],
      "reason": "Exact development version and unchanged compatibility floor confirmed."
    },
    {
      "check": "AC-2/AC-3: compatibility and tests",
      "method": "Review every test/source change against installed SDK behavior; independently run typechecks and selected suites",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E5"],
      "reason": "Minimal backward-compatible source fixes; legitimate test adaptations; independent checks passed."
    },
    {
      "check": "AC-4: repository gates and bundles",
      "method": "Independent check:ci and bundle tests; assess recorded build evidence",
      "outcome": "pass",
      "evidenceIds": ["E5"],
      "reason": "Checks passed and recorded build evidence is consistent with functioning bundles."
    },
    {
      "check": "AC-5, durable deltas, scope, and record binding",
      "method": "Inspect complete diff; compare canonical requirements/scenarios; validate source digest, record, and frozen hashes",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7"],
      "reason": "Documentation and deltas are precise; scope is clean and reviewed inputs remained unchanged."
    }
  ],
  "risks": [
    {
      "description": "The reported antigravity sessions.test.ts:118 timing flake remains unresolved under load; the recorded consolidated sequential run passed and this diff does not alter that test.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E5", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root may validate this envelope, record the PASS and digest, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-dev-pins-1-4-0/pi-dev-pins-1-4-0.md",
    "reviewedRecordSha256": "17335dd825a33a8ba0523cbbbcec57a7b0ff25af1582ab5650ddbdf23aa63c31"
  }
}
```

- AC-1: PASS | `pnpm install --frozen-lockfile`; lockfile grep; three version tests | 36 Pi dev pins across 12 manifests are exactly 1.4.0, with all other manifest fields unchanged (JSON compare vs HEAD); zero Pi 1.0.2 entries remain in pnpm-lock.yaml; frozen install exit 0, with no peer warnings; pi-core package.test 1 passed, pi-subagents package.test 7 passed, theme render-kit-real-sdk 7 passed
- AC-2: PASS | `pnpm run typecheck`; `pnpm -r --filter "./pi-packages/*" run typecheck` | both exit 0. The fix is narrowing on `prompt` presence in pi-core work-panel-lifecycle.ts, which keeps legacy prompt-only events and ignores custom ones; 3 pi-core and 2 root tests cover 1.4.0 user/custom events; fixtures gain `setProgramStatus`, `durationMs`/`outputPad` and `getPromptGuidelines`
- AC-3: PASS | 10 vitest package suites, pi-claude-bridge `test:unit`, root `pnpm test` (sequential, env unset) | all exit 0: todo 318, theme 1447, openai-fast 49, sidebar 533, questions-user 285, subagents 2021 (1 skipped), core 1145, background-tasks 756 (4 skipped), askcodex 315 (4 skipped), antigravity 1153 (12 skipped), claude-bridge 577, root 2420 (3 skipped). Real 1.4.0 regression fixed test-first: the theme empty-editor placeholder now accepts both cursor encodings (frame.ts). Intermittent under parallel load and unresolved: antigravity tests/sessions.test.ts:118 (isolated 8/8; consolidated run passed)
- AC-4: PASS | `pnpm run check:ci`; `pnpm run build`; `pnpm run test:pi-extensions` | exit 0 (955 files, warnings/infos only); exit 0; 13 passed after build; no tracked build artifacts
- AC-5: PASS | grep `1.0.2` over scoped docs | 17 substitutions in 10 Markdown files; remaining hits are a runtime example (pi-todo README:66) and a Pi 1.0.2 behavior observation (docs/agent/cli-installation.md:145)
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:a9d813cd7dac650005c5b90661e23c9558dbd5663def226bc596271bbc97b90a

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Remaining risk: pi-antigravity-bridge tests/sessions.test.ts:118 timing flake under parallel load stays unresolved; it is unrelated to this diff.
