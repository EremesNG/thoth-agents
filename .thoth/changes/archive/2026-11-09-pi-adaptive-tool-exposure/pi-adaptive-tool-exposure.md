# Change: pi-adaptive-tool-exposure

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Change `pi-deferred-tool-exposure` (archived 2026-11-08) made `bg_task_list`, `bg_task_log`, `bg_task_stop`, `bg_task_clear` (`pi-packages/pi-background-tasks/src/tools.ts`), `AskCodex` (`pi-packages/pi-askcodex/src/ask-tool.ts`), `AskAntigravity`, `agy_web_search`, `agy_read_url` (`pi-packages/pi-antigravity-bridge/src/ask-tool.ts`, `src/web-tools.ts`, `src/tool-namespace.ts`) register unconditionally with `exposure: "deferred"`.
- Pi 1.5 (`docs/extensions.md` "Tool Exposure"): deferred tools are reachable only through `codemode` scripts or `tool_search` activation. Explorer finding: without either active, a deferred tool has no model-facing route and Pi warns only for MCP tools (`dist/extensions/mcp/index.js:427`). The installer preserves explicit `-codemode`/`-tool_search`, so neither is guaranteed (`src/cli/pi-install.ts:887-905`); child SDK sessions may also lack both.
- Reference implementation in thoth-mem (Orca worktree `pi-deferred-exposure`, commit 1582134): `src/integration/pi/tool-surface.ts:53-67` (`parsePiExposure`, `resolvePiExposure`) and `src/integration/pi/index.ts:126-176`. Tools register `direct` at load (action APIs unbound); on `session_start` it reads `pi.getActiveTools()`; when `codemode` or `tool_search` is active (and env `THOTH_MEM_PI_EXPOSURE` is not `direct`) it re-registers the rare tools as `deferred` and removes them from the active set via `pi.setActiveTools`; otherwise they stay `direct` and active. Unbound runtimes keep direct. Invalid env values warn once and use `auto`.
- All three packages depend on `@thoth-agents/pi-core` (`workspace:^`), which already hosts shared registration helpers (`pi-packages/pi-core/src/tool-registry.ts`).
- In-flight, disjoint: a worker is adding `createToolSearchExtension()`/codemode factories to child sessions in `pi-packages/pi-subagents/src/runner/sdk-runner.ts` (small change, separate owner).

## Intent

Occasional first-party Pi tools are deferred only when the session can actually reach deferred tools (`codemode` or `tool_search` active); otherwise they register and stay `direct` as before, mirroring thoth-mem.

## Non-goals

- No change to which tools are occasional, to always-direct tools, or to descriptions/namespaces.
- No change to pi-subagents (separate in-flight change), thoth-mem, installer or allowlists.
- No package version bumps.

## Acceptance

- AC-1: `@thoth-agents/pi-core` exports one adaptive-exposure helper that, given a Pi API and tool definitions, registers them `direct` at load and on `session_start` reconciles: `deferred` and removed from the active set when `codemode` or `tool_search` is active and the env override `THOTH_AGENTS_PI_EXPOSURE` is not `direct`; otherwise `direct` and active. Missing or throwing `getActiveTools`/`setActiveTools` keeps `direct`; an invalid env value warns once per session and uses `auto`. Unit tests cover all branches.
- AC-2: pi-background-tasks registers `bg_task_list`, `bg_task_log`, `bg_task_stop`, `bg_task_clear` through the helper; spawn/watch/status stay direct; tests cover both active-tool outcomes.
- AC-3: pi-askcodex (`AskCodex`) and pi-antigravity-bridge (`AskAntigravity`, `agy_web_search`, `agy_read_url`, still behind their config gates) register through the helper; tests cover both outcomes.

## Clarifications

- Resolved (user): when neither codemode nor tool_search is available, tools must enter as before (direct); replicate thoth-mem's approach.

## Decisions

- Shared helper in pi-core instead of three copies; env override named `THOTH_AGENTS_PI_EXPOSURE` (`auto` default, `direct` forces direct), parallel to `THOTH_MEM_PI_EXPOSURE`.
- Reconcile on `session_start` only, as thoth-mem does.

## Durable deltas

- `MODIFIED pi-ecosystem` **Codemode delegation boundary** — Thoth delegation controls, the child `ask_orchestrator` and `notify_orchestrator` tools and `ask_user_question` are `model-only` direct calls that codemode scripts cannot invoke, and root guidance directs batching only of script-callable work. Occasional first-party tools (`bg_task_list`, `bg_task_log`, `bg_task_stop`, `bg_task_clear`, `AskCodex`, `AskAntigravity`, `agy_web_search`, `agy_read_url`) MUST register in a package namespace with `deferred` exposure when the session has `codemode` or `tool_search` active and the `THOTH_AGENTS_PI_EXPOSURE` override is not `direct`, and MUST otherwise register as active `direct` tools; the installer MUST enable `tool_search` next to `codemode` unless the operator explicitly disabled it.
  - GIVEN a Pi session where neither `codemode` nor `tool_search` is active; WHEN the session starts; THEN the occasional tools are declared directly to the model, and with either one active they are deferred.

## Plan

1. U1 (thoth-worker) `pi-packages/pi-core/**`: helper + unit tests + export.
2. U2 (thoth-worker, after U1 accepted) `pi-packages/pi-background-tasks/**`, `pi-packages/pi-askcodex/**`, `pi-packages/pi-antigravity-bridge/**`: adopt the helper, update registration/publication/budget tests.
3. Join (root, after U1-U2 and the in-flight pi-subagents change are terminal): `pnpm run build`, `pnpm run typecheck`, `pnpm run check:ci`; confirm no generated drift beyond expected.

No worker runs generators or builds. Verification: package tests (with `--maxWorkers=1` to separate Windows timing flakes) and typechecks for the four packages.

## Tasks

- [x] AC-1: Adaptive exposure helper in pi-core
  - Outcome: exported helper with unit tests for every branch
  - Known entrypoints and skill paths: pi-packages/pi-core/src/tool-registry.ts, pi-packages/pi-core/src/index.ts; reference C:/Users/EremesNG/orca/workspaces/thoth-mem/pi-deferred-exposure/src/integration/pi/tool-surface.ts:53-67 and src/integration/pi/index.ts:126-176; skill tdd
  - Inputs: Exploration, Decisions
  - Dependencies: none
  - Output: pi-core code and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/**
  - Interface boundaries: existing pi-core exports unchanged
  - Focused check and PASS evidence: pi-core tests and typecheck pass
  - Return milestone: helper API and tests green
  - Stop / reassessment: Pi API lacks re-registration or setActiveTools semantics required
- [x] AC-2: Background tasks adopt the helper
  - Outcome: four occasional bg tools adaptive; tests for both outcomes
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/tools.ts, src/tool-publication.test.ts, src/tools.test.ts; skill tdd
  - Inputs: accepted AC-1 helper
  - Dependencies: AC-1
  - Output: package code and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-background-tasks/**
  - Interface boundaries: names, params, results, namespaces unchanged
  - Focused check and PASS evidence: package tests (maxWorkers=1) and typecheck pass
  - Return milestone: tests green
  - Stop / reassessment: callback/session wiring conflicts with session_start reconciliation
- [x] AC-3: AskCodex and Antigravity adopt the helper
  - Outcome: four tools adaptive behind existing config gates; tests for both outcomes
  - Known entrypoints and skill paths: pi-packages/pi-askcodex/src/ask-tool.ts, tests/ask-tool.test.ts; pi-packages/pi-antigravity-bridge/src/ask-tool.ts, src/web-tools.ts, src/tool-publication.ts, extensions/index.ts, tests/*.test.ts; skill tdd
  - Inputs: accepted AC-1 helper
  - Dependencies: AC-1
  - Output: package code and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-askcodex/**, pi-packages/pi-antigravity-bridge/**
  - Interface boundaries: config gates, display-only registration and shadow tools unchanged
  - Focused check and PASS evidence: both package tests (maxWorkers=1) and typechecks pass
  - Return milestone: tests green
  - Stop / reassessment: deferred/direct toggling breaks an existing runtime path

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Plan review (fresh Oracle, task subtask_thoth-oracle_1794203439795_2cba09de): OKAY, recordSha256 06614bca8b773875bcffce1bc7f3aafb56628ba49d25a005a35b851584513871, recordDigest match. Note: the reference also reconciles on before_agent_start and does not catch setter failures; this plan keeps session_start-only timing and requires guarded getters/setters.
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: c9481573c824a53af58062b664e6b66bdf1f4870ac35fe13219fdf897e27f30d

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1–AC-3 and the durable delta are satisfied. The prior allowlist regression is repaired.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record",
      "locator": ".thoth/changes/pi-adaptive-tool-exposure/pi-adaptive-tool-exposure.md",
      "claim": "Record-prefix SHA-256 is c9481573c824a53af58062b664e6b66bdf1f4870ac35fe13219fdf897e27f30d. The through-verify validator passes; the canonical spec matches its recorded digest.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff",
      "locator": "git status; git diff; git diff --check; untracked implementation/tests",
      "claim": "Reviewed the complete working-tree change, including all three named untracked code/test files. All 19 changed/untracked inputs remained byte-identical through final checks. Commit 43710185 was excluded.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "behavior",
      "locator": "pi-core/src/adaptive-tool-exposure.ts; installed SDK dist/core/agent-session.js:2888-2979",
      "claim": "In-memory execution of installed AgentSession registry/loadout methods reproduced the old leak: an explicit allowlist reactivated bg_task_log/stop/clear. The repaired helper removes all four after batch registration. Verified codemode, tool_search, both together, allowlisted/unrestricted sessions, direct override, and absent discovery.",
      "basis": "observed",
      "uncertainty": "Prototype harness used real SDK registry/loadout methods; prompt rebuilding and extension enumeration were stubbed. No full session boot or filesystem writes."
    },
    {
      "id": "E4",
      "kind": "behavior",
      "locator": "In-memory SDK late-registration checks; adaptive-tool-exposure.ts:95-104",
      "claim": "A fresh late registration in an allowlisted discovery-enabled session is deferred, inactive, and callable. Already-active same-name definitions, or unresolved restored-pending names when no startup batch was removed, can remain declared after late registration.",
      "basis": "observed",
      "uncertainty": "The accepted contract explicitly limits active-set reconciliation to session_start; current consumers register their tools before that event."
    },
    {
      "id": "E5",
      "kind": "implementation",
      "locator": "pi-background-tasks/src/tools.ts; pi-askcodex/src/index.ts; pi-antigravity-bridge/extensions/index.ts; publication tests",
      "claim": "All eight occasional tools use the shared helper. Always-direct tools, namespaces, configuration gates, and interactive publication/withdrawal behavior are preserved.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "pnpm --dir pi-packages/<package> test --maxWorkers=1",
      "claim": "Tests passed: pi-core 1270; pi-background-tasks 809; pi-askcodex 319; pi-antigravity-bridge 1249. Background exceeded the initial 240-second bound, then passed an isolated bounded rerun in 259 seconds; its abandoned process tree was terminated and no owned test processes remain.",
      "basis": "observed",
      "uncertainty": "Existing skips: background 4, AskCodex 4, Antigravity 12."
    },
    {
      "id": "E7",
      "kind": "execution",
      "locator": "Four package typechecks; pnpm run typecheck; pnpm run check:ci",
      "claim": "All requested typechecks and check:ci exited successfully. Biome reported warnings/informational diagnostics without errors or fixes. No build or integration:sync was run.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Helper review, package tests, and independent installed-SDK reproduction",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E6"],
      "reason": "Startup reconciliation, fallbacks, override handling, and the repaired allowlist ordering satisfy acceptance."
    },
    {
      "check": "AC-2",
      "method": "Background registration/publication review and complete package tests",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "Four occasional tools adapt; spawn/watch/status remain direct."
    },
    {
      "check": "AC-3",
      "method": "AskCodex/Antigravity wiring, gates, publication review, and complete package tests",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "Both exposure outcomes are covered without changing configuration gates."
    },
    {
      "check": "Durable delta and record binding",
      "method": "Canonical baseline comparison, byte-prefix hashing, and through-verify validation",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5"],
      "reason": "The implementation realizes the declared adaptive-exposure change; retained requirements are unchanged."
    },
    {
      "check": "Requested static checks",
      "method": "Four package typechecks, root typecheck, and check:ci",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "All commands completed successfully without write flags."
    },
    {
      "check": "Scope, freshness, and workspace preservation",
      "method": "Full diff review, diff whitespace check, and frozen-input hash comparison",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6"],
      "reason": "Inputs remained unchanged; no workspace edits or surviving owned commands."
    }
  ],
  "risks": [
    {
      "description": "Late re-registration does not purge already-active or restored-pending declarations. This is outside the accepted session_start-only reconciliation guarantee; fresh late registrations behave correctly.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root may record this PASS and proceed through closeout and archive gates.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-adaptive-tool-exposure/pi-adaptive-tool-exposure.md",
    "reviewedRecordSha256": "c9481573c824a53af58062b664e6b66bdf1f4870ac35fe13219fdf897e27f30d"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

Accepted units: U1 pi-core helper (1265 tests, 18 adaptive); U2 adoption (background 809, AskCodex 319, Antigravity 1249 passed with maxWorkers=1; typechecks pass). Join (root): `pnpm run build` exit 0, `pnpm run typecheck` and `pnpm run check:ci` pass, no generated drift. Separate small change committed earlier: 43710185 (pi-subagents child built-in factories).

Final verification 1 (fresh Oracle, task subtask_thoth-oracle_1794204759742_6b213fb9): FAIL, recordSha256 c9481573c824a53af58062b664e6b66bdf1f4870ac35fe13219fdf897e27f30d. AC-1: the helper removed tools from the active set before sequential re-registration; with an explicit allowlist the SDK refresh reactivated bg_task_log/stop/clear. AC-2/AC-3 routing PASS. Repair routed to the U1 owner.
Repair accepted: whole deferred batch registers before reconciling a fresh active set; failure recovery restores direct; SDK-faithful allowlist regression (pi-core 1270 passed; consumers unchanged and passing with maxWorkers=1). Join rerun: build exit 0, typecheck and check:ci pass.

Final verification 2 (fresh Oracle, task subtask_thoth-oracle_1794206268342_bd172344): PASS, thoth-gate-verdict valid, recordDigest match. Non-blocking risk: late re-registration does not purge already-active declarations (outside the session_start-only contract).

- AC-1: PASS | pi-core adaptive tests + Oracle installed-SDK reproduction | 1270 passed; allowlisted and unrestricted sessions defer and deactivate all occasional tools
- AC-2: PASS | pi-background-tasks tests (maxWorkers=1) | 809 passed; list/log/stop/clear adaptive, spawn/watch/status direct
- AC-3: PASS | askcodex and antigravity tests (maxWorkers=1) | 319 and 1249 passed; config gates preserved
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:977733f0375ac74258c57fb328613b1263227ff552e72c21217b7bb54ad269ab

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
