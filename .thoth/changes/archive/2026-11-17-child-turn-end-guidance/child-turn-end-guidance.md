# Change: child-turn-end-guidance

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

Diagnosis (explorer `subtask_thoth-explorer_1794887188901_d2b3e74f`) of worker `subtask_thoth-worker_1794883496607_70b16400` on `antigravity/gemini-4-hydrogen`: twice the child ended its turn saying it was waiting for background checks. It had used agy-native `manage_task` background agents; nothing wakes a subagent child after its turn ends.

Design exploration (explorer `subtask_thoth-explorer_1794888910220_522e4319`):

- Child prompt rules are product-owned in `src/agents/prompt-sections.ts`: `createSubagentRulesSection` (`:88-97`) is added only for children (`childSections` `:301`, `:364`) and rendered by `renderSubagentRules` (`:432-465`) for every harness; Pi agent files `pi/agents/thoth-*.md` are generated from it (`src/harness/adapters/pi.ts`, `src/harness/writers/pi-agent.ts`). Children get only "no status/log polling merely to wait" and "Reconcile owned background commands before returning"; the root is told a native notification wakes it (`src/harness/adapters/pi.ts:46`). Tests: `src/agents/prompt-rendering.test.ts:1085-1105`, `src/harness/adapters/pi.test.ts:118`, `src/harness/writers/pi-agent.test.ts:103-117`, `src/harness/provider-boundary.test.ts:40-44`.
- The antigravity bridge sends `TOOL_PRIORITY_NOTE` (`pi-packages/pi-antigravity-bridge/src/provider.ts:170-171`, clause "prefer exec_command's session-output pattern or background agents so you keep working while it runs") to every session on both carriers: ACP inline `buildFullPrompt` (`:183`), stream-json staged body (`:1696-1698`) and inline retry `buildPortablePrompt` (`:196-199`, `:1726`). Neither carrier wakes a finished turn: stream-json RPC never reports agy background tasks (`src/tasks.ts:1-10`); ACP drops updates without an active turn (`src/acp/driver.ts:451-453`).
- Session mode is available to the bridge: pi-subagents children are SDK sessions without a `mode` (`pi-subagents/src/runner/sdk-runner.ts:520-537`), so `ctx.mode === "print"`; the interactive root is `"tui"`. The bridge extension factory is per-session (`extensions/index.ts:151`); `session_start` (`:633`) and `before_agent_start` (`:537`) receive `ctx`. Same headless notion already used by spec `pi-ecosystem` (Junie, ~line 765).
- `manage_task` is enabled only through carrier frontmatter (`src/sysprompt-agent.ts:54-60`); whether agy enforces that allowlist is unverified. Bridge prompt tests: `tests/provider-sysprompt.test.ts:16-50`, `tests/provider-carrier-retry.test.ts:109`.

## Intent

Stop subagent children from ending their turn while waiting for background work: tell every child, on every harness, that nothing wakes it after its turn ends, and stop the antigravity bridge from nudging non-interactive sessions toward background agents on both carriers.

## Non-goals

- Removing or disabling agy `manage_task` (unverified allowlist enforcement).
- Adding a wake-up path for agy background tasks.
- Changing root/orchestrator prompts or pi-subagents runtime prompt injection.
- The pi-subagents false `tool_failure` after compaction (separate small change).

## Acceptance

- AC-1: Every generated child (specialist) prompt on every harness includes one subagent rule stating that nothing wakes the child after its turn ends, so it must run checks in the foreground and finish before ending its turn; root prompts are unchanged; generated Pi agent files reflect it.
- AC-2: In the antigravity bridge, sessions whose Pi extension mode is not `tui` receive a tool-priority note without the background-agent preference on both the ACP and stream-json carriers (initial and retry paths), while `tui` sessions keep the current note byte-identical.
- AC-3: Existing prompt-rendering, adapter/writer, provider-boundary and bridge tests pass with updated expectations; new tests cover AC-1 per dialect and AC-2 for tui vs non-tui on each carrier path.

## Clarifications

- Design (user, 2026-11-17): child subagent rule plus removing the background-agent preference for non-TUI bridge sessions; `manage_task` stays.
- The bridge change applies to both carriers (ACP and stream-json); neither wakes a finished turn.

## Decisions

- Non-TUI detection uses Pi extension `ctx.mode !== "tui"` captured per session in the bridge extension; an unknown mode is treated as non-TUI.
- The child rule lives only in `renderSubagentRules` (single product owner); no runtime duplication in pi-subagents.
- Wording (English, prompt dialect neutral): "Nothing wakes you after your turn ends: run checks in the foreground and finish all work before ending your turn."

## Durable deltas

- `ADDED multi-harness-agent-pack` **Children finish before ending their turn** — Every generated specialist (child) prompt on every harness MUST state that nothing wakes the child after its turn ends and that it must run checks in the foreground and finish all work before ending its turn; orchestrator prompts MUST NOT carry this rule.
  - GIVEN generated Pi, OpenCode, Codex and Claude Code specialist prompts; WHEN they are rendered; THEN each contains the turn-end rule exactly once and no orchestrator prompt contains it.
- `ADDED pi-ecosystem` **Antigravity bridge omits background-agent preference in non-interactive sessions** — `@thoth-agents/pi-antigravity-bridge` MUST omit the background-agent preference from its tool-priority note for sessions whose Pi extension mode is not `tui`, on the ACP and stream-json carriers including retry projections, and MUST keep the note unchanged for `tui` sessions.
  - GIVEN a subagent child session (`print` mode) and an interactive `tui` session on an antigravity model; WHEN each sends its first prompt on either carrier; THEN the child's note lacks the background-agent preference while the tui note is unchanged.

## Plan

Two independent units with disjoint writes:

1. Product prompt: add the bullet in `renderSubagentRules` (`src/agents/prompt-sections.ts:432-465`), regenerate/verify generated artifacts if any are committed (`pi/agents/thoth-*.md`, Codex/Claude payloads) using the repository's existing generation path, and update `src/agents/prompt-rendering.test.ts` and adapter/writer tests. Checks: focused vitest for those files, `pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build` if generated artifacts change.
2. Bridge: capture `ctx.mode` per session in `extensions/index.ts` (`session_start` and/or `before_agent_start`), thread an `interactive` flag to `buildFullPrompt`/`buildPortablePrompt` and the staged stream-json body so non-TUI sessions use a note variant without the background-agent clause; tests in `tests/provider-sysprompt.test.ts`, `tests/provider-carrier-retry.test.ts` plus a mode-capture test. Checks: bridge package tests and typecheck, `pnpm run check:ci`, `pnpm run typecheck`.

Risks: carrier cache is content-addressed by body (`src/sysprompt-agent.ts:90-110`) — a mode-specific note changes the staged body, which is acceptable (distinct content, distinct cache key) but must be checked; whether `session_start` fires before the first provider turn in child sessions — prefer capturing in `before_agent_start` or on first use.

## Tasks

- [x] AC-1: Add the child turn-end rule to renderSubagentRules for all harnesses
  - Outcome: every specialist prompt contains the rule once; orchestrator prompts unchanged; generated artifacts in sync
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts:88-97,301,364,432-465; src/agents/prompt-rendering.test.ts:1085-1105; src/harness/adapters/pi.ts; src/harness/writers/pi-agent.ts; pi/agents/; tdd skill
  - Inputs: this record
  - Dependencies: none
  - Output: code, regenerated artifacts if committed, tests
  - Owner: thoth-worker
  - Writes: src/agents/**, src/harness/** tests as needed, generated prompt artifacts (pi/agents/*.md, plugin payloads) only via the repo generation path
  - Interface boundaries: orchestrator prompt sections, dialect renderers
  - Focused check and PASS evidence: focused prompt/adapter/writer/provider-boundary tests pass; typecheck; check:ci; build if artifacts change
  - Return milestone: rule rendered and tests green
  - Stop / reassessment: generated artifacts require a generator not in the repo
- [x] AC-2: Omit background-agent preference in non-TUI antigravity sessions on both carriers
  - Outcome: non-tui note variant on ACP and stream-json (initial and retry); tui unchanged
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/provider.ts:170-199,1691-1726; extensions/index.ts:151,537,633; src/sysprompt-agent.ts:90-110; tests/provider-sysprompt.test.ts; tests/provider-carrier-retry.test.ts; tdd skill
  - Inputs: this record
  - Dependencies: none
  - Output: code plus tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/{src,extensions,tests}
  - Interface boundaries: carrier staging cache, ACP home agent.md
  - Focused check and PASS evidence: bridge tests and typecheck pass; tui note byte-identical assertion
  - Return milestone: note variant wired and green
  - Stop / reassessment: mode not observable before the first provider turn
- [x] AC-3: Run repository closeout checks for both units
  - Outcome: all affected suites and repo checks green
  - Known entrypoints and skill paths: package scripts
  - Inputs: AC-1 and AC-2 outputs
  - Dependencies: AC-1 task, AC-2 task
  - Output: check evidence
  - Owner: thoth-worker
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, focused root tests, bridge package tests
  - Return milestone: all green
  - Stop / reassessment: unrelated failures reported with evidence

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
**Reviewed record SHA-256**: 9cd53331aa514f6789e0df83f3fff2173f23383bba9373e7b79860dd22de4e0a

Oracle task subtask_thoth-oracle_1794891009288_2b5a8fc5 (delivered thoth-gate-verdict valid, recordDigest match). Root ran `pnpm run build` after all writers finished: exit 0, no tracked drift.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-3 satisfied. Bridge failures are unrelated timing flakes, not regressions in the mode-specific guidance.",
  "evidence": [
    {
      "id": "E1",
      "kind": "diff-and-test",
      "locator": "src/agents/prompt-sections.ts:443; src/agents/prompt-rendering.test.ts:1083; generated specialist artifacts",
      "claim": "Rule matches Decisions exactly, appears once per specialist across four dialects, and is absent from roots. All 15 changed generated prompts differ from HEAD only by this rule. Focused tests: 242 passed; integration:verify: 13 passed.",
      "basis": "observed",
      "uncertainty": "Generated-file comparisons normalize CRLF."
    },
    {
      "id": "E2",
      "kind": "diff-and-test",
      "locator": "pi-packages/pi-antigravity-bridge/{extensions/index.ts,src/provider.ts,tests}",
      "claim": "Session-local mode reaches ACP inline, stream-json staging, fallback and retry paths; non-tui/unknown omit the preference. Focused bridge tests: 53 passed. Tui note is byte-identical to HEAD (1435 UTF-8 bytes); mode-specific carriers have distinct reusable cache entries.",
      "basis": "observed",
      "uncertainty": "Carrier behavior verified with test drivers, not live agy."
    },
    {
      "id": "E3",
      "kind": "execution",
      "locator": "pnpm --dir pi-packages/pi-antigravity-bridge test (two full runs)",
      "claim": "Run 1: three stream-json dispatch-timeout failures at pausedPid, 1374 passed, 5 skipped. Run 2: all 98 files passed, 1377 passed, 5 skipped.",
      "basis": "observed",
      "uncertainty": "Full-suite execution remains timing-sensitive."
    },
    {
      "id": "E4",
      "kind": "diagnosis",
      "locator": "tests/driver.test.ts:324; tests/provider-dispatch-timeout.test.ts:82,111; src/provider.ts:1551-1611,1698",
      "claim": "Checkpoint tests invoke unchanged drivers directly. Dispatch tests disable system-prompt delivery; stranded redelivery executes before the changed mode/note branch. Drivers, timing tests, fixtures and pi-core match HEAD. All 40 tests across driver, provider-dispatch and provider-dispatch-timeout passed in three consecutive single-worker runs.",
      "basis": "inferred",
      "uncertainty": "Pre-existing flakiness is established by unchanged execution paths and repeated results; a separate HEAD suite was not run."
    },
    {
      "id": "E5",
      "kind": "execution",
      "locator": "root typecheck/check:ci; bridge typecheck; scoped git diff --check",
      "claim": "Both typechecks, check:ci and scoped whitespace checks exited 0. check:ci reported warnings only.",
      "basis": "observed",
      "uncertainty": "Lint warnings remain outside this change."
    },
    {
      "id": "E6",
      "kind": "record-binding",
      "locator": ".thoth/changes/child-turn-end-guidance/child-turn-end-guidance.md",
      "claim": "Bundled --through verify passes. Exact-byte prefix SHA-256 was independently calculated and reconfirmed unchanged at completion. pi-subagents and .junie were excluded.",
      "basis": "observed",
      "uncertainty": "Closeout remains root-owned."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect scoped diff, compare exact wording/generated artifacts, run prompt and generator tests.",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "All child dialects covered; root prompts unchanged."
    },
    {
      "check": "AC-2",
      "method": "Trace session mode and carrier paths; run focused tests and HEAD byte comparison.",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Non-tui behavior, tui preservation and cache isolation verified."
    },
    {
      "check": "AC-3",
      "method": "Run affected tests, integration verification, bridge suite twice and both typechecks.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E4", "E5"],
      "reason": "Affected expectations and second complete bridge run pass; initial failures are unrelated timing flakes."
    },
    {
      "check": "Bridge full-suite run 1",
      "method": "Unmodified package test command.",
      "outcome": "fail",
      "evidenceIds": ["E3", "E4"],
      "reason": "Three pausedPid fixture failures; independently adjudicated non-regressions."
    },
    {
      "check": "Root full suite and build",
      "method": "Reuse supplied worker/root evidence.",
      "outcome": "not-run",
      "evidenceIds": [],
      "reason": "Not independently rerun; focused root checks and requested bridge checks were rerun."
    }
  ],
  "risks": [
    {
      "description": "Existing bridge timing fixtures remain load-sensitive; successful reruns do not establish deterministic full-suite reliability.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "root → closeout",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/child-turn-end-guidance/child-turn-end-guidance.md",
    "reviewedRecordSha256": "9cd53331aa514f6789e0df83f3fff2173f23383bba9373e7b79860dd22de4e0a"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | prompt-rendering/generator tests, integration:verify, generated diff review | Oracle E1
- AC-2: PASS | focused bridge tests, tui byte-identity vs HEAD, cache isolation | Oracle E2
- AC-3: PASS | bridge suite (flakes adjudicated unrelated), typechecks, check:ci, build | Oracle E3-E5
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:56cccd8437c05e0d8cc57f5c2fa6c2d52ec94288559760bb329942ab936ae565
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:90ce2b3c39927a0a33b190fe4947deb1dc8a3aa33c92bfce8386d5820aae4175

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
