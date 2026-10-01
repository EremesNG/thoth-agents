# Change: star-delegation-exclusions

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: low

## Exploration

- Standalone `tools: "*"` in pi-subagents excludes `subagent_` prefixes, the
  user-question and progress-list tools in every mode
  (`pi-packages/pi-subagents/src/tool-patterns.ts:29-37`) and, only for standalone
  `*`, exact `AskClaude`/`AskAntigravity` (`:40-45`); explicit lists and other globs
  can still select them (`:48-56`).
- A live thoth-explorer child launched with `*` received `bg_delegate`,
  `bg_run_pi_attested`, `bg_result`, `fusion_reason`, `fusion_investigate`,
  `fusion_research` and `fusion_validate`. All come from npm package
  `pi-background-tasks` 2.6.9: `bg_delegate` launches a conversation-seeded child Pi
  agent (`dist/src/delegate-extension.js:258`); `bg_run_pi_attested` launches
  `pi --mode json` (`dist/src/extension.js:805-806`); the four Fusion tools run
  multi-model candidate/evaluator/merger pipelines (`dist/src/fusion-extension.js:922,938,955,973`);
  `bg_result` only retrieves delegate/Fusion results (`delegate-extension.js:489-492`).
  `bg_run`, `bg_status`, `bg_logs`, `bg_kill` manage ordinary background shell tasks.
  `antigravity` (this repo's antigravity bridge) only replays agy output.
- The thoth-agents `/subagents-tools` panel keeps its own copy of the `*` exclusions
  for the dynamic preview (`src/pi/tools-panel.ts:83-87,190-195`).
- Spec `multi-harness-agent-pack` "Configure adopted Pi subagents natively"
  (`.thoth/specs/multi-harness-agent-pack/spec.md:471-479`) enumerates the `*`
  delegation exclusions as `AskClaude`, `AskAntigravity`.
- Docs listing the exclusions: `pi-packages/pi-subagents/README.md:151,155`,
  `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md:181,185`,
  `docs/installation.md:391-393,408`, `docs/agent/harness-packaging.md:53-54`.
- A name list is not a sandbox: shell tools and MCP gateways can still start agents
  indirectly.

## Intent

Standalone `*` no longer gives children the direct delegation tools from
`pi-background-tasks`, and the panel preview shows the same exclusions as runtime.

## Non-goals

- A configurable exclusion key in `subagents.json` (user: fixed list for now).
- Applying the exclusions to explicit lists or glob patterns.
- Excluding generic background shell tools (`bg_run`, `bg_status`, `bg_logs`,
  `bg_kill`), MCP gateways, `parallel` or the antigravity replay tool.
- Adding a runtime dependency from the root package on pi-subagents.

## Acceptance

- AC-1: Standalone `*` additionally excludes `bg_delegate`, `bg_run_pi_attested`,
  `bg_result`, `fusion_reason`, `fusion_investigate`, `fusion_research` and
  `fusion_validate`; explicit lists and globs can still select them; `bg_run`,
  `bg_status`, `bg_logs`, `bg_kill` stay selectable under `*`.
- AC-2: The `/subagents-tools` dynamic preview applies the same exclusion set, and
  a root test compares the panel's set with pi-subagents' exported set so they
  cannot drift (test-only import; no runtime dependency).
- AC-3: Docs list the extended exclusions and state that the list is not a
  sandbox (shell and MCP tools can still launch agents).
- AC-4: pi-subagents typecheck/tests, the focused root tests, root `check:ci` and
  `typecheck` pass.

## Clarifications

- Fixed list, no new `subagents.json` key (user, 2026-10-01).
- Exclusions apply only to standalone `*` (user, 2026-10-01).

## Decisions

- `bg_result` is excluded with the delegation tools because it only serves
  delegate/Fusion results; generic shell task tools stay.
- pi-subagents exports the exclusion set as a named constant; the panel keeps its
  local copy, guarded by a parity test that imports the package source in tests only.
- Implementation checkpoint (root, 2026-10-01): commits `801b1fc` (pi-subagents
  exported `STANDALONE_STAR_TOOL_EXCLUSIONS`, tests, package docs), `ce5f889` (panel
  preview set, test-only parity import, root docs), `1c4951b` (Biome format of the
  new selector tests). Frozen checks with all concurrent pi-subagents work committed:
  frozen install 0; pi-subagents typecheck 0 / 488 passed; antigravity 0 / 542
  passed, 9 skipped; claude-bridge 0 / unit 290; root check:ci, typecheck, build 0;
  root `pnpm test` without Orca CODEX_HOME 1158 passed / 4 missing-sibling failures;
  operator claude-bridge.json hash unchanged.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same UI design with safe tool persistence; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST offer one dynamic selection persisted as standalone `*`, meaning the eligible tools currently active in the root session excluding subagent and delegation tools (`AskClaude`, `AskAntigravity`, `bg_delegate`, `bg_run_pi_attested`, `bg_result` and the `fusion_reason`, `fusion_investigate`, `fusion_research`, `fusion_validate` tools); inactive registered tools MUST NOT be inherited and `@active` MUST be rejected rather than persisted or treated as a tool name. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve `*` and child launch MUST resolve its current inventory; for `*`, tools without a child implementation MUST be dropped and reported as a durable warning, while explicit lists and glob patterns MUST fail with a truthful missing-implementation diagnostic.
  - GIVEN explicit or dynamic operator selections and root tools that are inactive, delegation tools or lack a child implementation; WHEN the panel saves, synchronization runs and a child launches; THEN operator intent persists, `*` yields the child-loadable active eligible tools without delegation tools and with dropped names reported, explicit lists fail on missing implementations, and nothing is silently widened or omitted .

## Plan

1. Worker A (sole writer of `pi-packages/pi-subagents/src/tool-patterns.ts`, its
   selector tests, README and configuration skill): extend and export the set,
   tests, docs. Does not touch the three test files owned by the concurrent
   flaky-test fix.
2. Worker B (sole writer of `src/pi/tools-panel.ts`, `src/pi/tools-panel.test.ts`,
   `docs/installation.md`, `docs/agent/harness-packaging.md`): panel set, parity
   test, root docs; after worker A exports the constant.
3. Root: checks, fresh Oracle verification, archive (applies the delta), commit.

## Tasks

- [x] AC-1: extend standalone `*` exclusions
  - Outcome: delegation tools never inherited through `*`
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/tool-patterns.ts:29-56`, tdd skill
  - Inputs: Exploration list
  - Dependencies: none
  - Output: exported constant + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/tool-patterns.ts` and its selector tests (not diagnostics/subagents/ui panel tests)
  - Interface boundaries: explicit lists and globs unchanged
  - Focused check and PASS evidence: tests for each excluded name under `*`, explicit selection, shell task tools kept
  - Return milestone: tests green
  - Stop / reassessment: none expected
- [x] AC-2: panel parity
  - Outcome: preview matches runtime
  - Known entrypoints and skill paths: `src/pi/tools-panel.ts:83-87,190-195`
  - Inputs: AC-1 exported constant
  - Dependencies: AC-1
  - Output: panel change + parity test
  - Owner: worker B
  - Writes: `src/pi/tools-panel.ts`, `src/pi/tools-panel.test.ts`
  - Interface boundaries: panel persistence unchanged
  - Focused check and PASS evidence: parity test and preview test green
  - Return milestone: tests green
  - Stop / reassessment: test cannot import the package source
- [x] AC-3: documentation
  - Outcome: docs match
  - Known entrypoints and skill paths: files in Exploration
  - Inputs: AC-1
  - Dependencies: AC-1
  - Output: updated docs
  - Owner: worker A (package docs), worker B (root docs)
  - Writes: those docs
  - Interface boundaries: none
  - Focused check and PASS evidence: docs list the set and the not-a-sandbox note
  - Return milestone: docs updated
  - Stop / reassessment: none expected
- [x] AC-4: checks
  - Outcome: green checks
  - Known entrypoints and skill paths: package filters, root scripts
  - Inputs: AC-1..AC-3
  - Dependencies: AC-1..AC-3
  - Output: evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: typecheck/tests/check:ci exit 0
  - Return milestone: evidence captured
  - Stop / reassessment: new failure

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Fresh Oracle
subtask_thoth-oracle_1790825322836_53f5f7e2 returned [OKAY]. Notes: test globs and
mixed selections too; keep the parity import test-only.

## Verification

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:c6e8e2208e5b1621c7963eaa77a2a58ef77efc74b5e7fae0c5a6c01d3fd056a3

## Closeout

**Archive**: PENDING
