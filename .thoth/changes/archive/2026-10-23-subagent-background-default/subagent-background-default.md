# Change: subagent-background-default

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- `pi-packages/pi-subagents/src/config.ts:570-580` `resolveEffectiveSubagentMode` resolves an omitted launch mode as invocation `mode` → agent frontmatter `subagent_mode` → effective `subagents.json` `default_mode` → hardcoded `background`. Config parsing defaults `default_mode` to background (`config.ts:346-350,511`); global/project merge at `config.ts:484-487`.
- `subagent_run` tool (`src/tools/subagent-run.ts:129-137`) and manager (`src/manager.ts:1943-1953`) share that policy; tool description `subagent-run.ts:84` advertises agent/config inheritance.
- Continuation (`src/continuation-mode.ts:7-20`, used by `src/tools/subagent-continue.ts:70-76` and `src/manager.ts:1761-1772`) resolves explicit mode → previous `effective_mode` → previous persisted `mode` → config `default_mode` → background; description `subagent-continue.ts:36` advertises prior-mode preservation. `enable_continue` is an independent opt-in flag defaulting to `false` (`config.ts:561-564`) and is out of scope.
- Package tools panel parses definition mode at `src/tools-panel/frontmatter.ts:267-271`; docs at `README.md:210,324,347,411,588,628-632` and `skills/subagents-configuration/SKILL.md:144,279-297,313`.
- Operator setup: installed `~/.pi/agent/agents/thoth-{explorer,worker,designer,oracle}.md` declare `subagent_mode: "task"` (librarian `background`); global `subagents.json` has no mode field. This is why omitted launches report "effective mode: task".
- thoth-agents: `src/harness/adapters/pi.ts:90` supplies background mode, `src/harness/writers/pi-agent.ts:63` writes `subagent_mode`, generated `pi/agents/*.md` declare background; installer sync preserves existing mode overrides (`src/cli/pi-resources.ts:128-132`, invoked at `:204`, asserted by `src/cli/pi-resources.test.ts:159-179`); `src/cli/pi-tool-config.ts:287-291` validates definition mode; `src/cli/pi-model-config.ts:64-80` validates duplicate `subagent_mode` in owned definitions; `docs/installation.md:558` and `docs/agent/harness-packaging.md:154` document the field; packaging verifier `scripts/verify-pi-package.mjs:154,169` asserts generated definitions declare `subagent_mode: "background"`. Codex `default_mode_request_user_input` references are unrelated. Root instruction `src/harness/adapters/pi.ts:45` already says omit mode for background and use task only when asked to wait.
- Existing mode tests: package `test/config.test.ts:424,532,643`, `test/manager.test.ts:386,727`, `test/tools/subagent-run.test.ts:28,143,204`, `test/tools/subagent-continue.test.ts:854,950,1038`, `test/render/tools.test.ts:262,693`; repository `src/harness/adapters/pi.test.ts:92,245-247`, `src/harness/writers/pi-agent.test.ts:135`.
- Canonical spec `multi-harness-agent-pack` requirement **Native lifecycle translation** currently states omitted mode uses the configured agent/config mode or otherwise background.

## Intent

Pi subagents launched through `subagent_run` or continued through `subagent_continue` run in background whenever the invocation omits `mode`; blocking task mode happens only when that invocation explicitly passes `mode: "task"`. Agent definitions, `subagents.json` and previous attempts no longer select the execution mode, and the `subagent_mode` / `default_mode` configuration contracts are removed.

## Non-goals

- No change to `enable_continue` (stays opt-in, default `false`) or to continuation availability.
- No change to the task-mode-to-background handoff at timeout warnings, ask/notify tools, timeouts, model profiles or tool selection.
- No change to explicit `mode: "task"` / `mode: "background"` semantics or rendering of the effective mode.
- No rewrite of the operator's installed home files by this change; the next normal installer sync cleans them, and the runtime ignores the legacy field meanwhile.
- No package version bumps.

## Acceptance

- AC-1: `subagent_run` (tool and manager) with omitted `mode` always resolves to background, even when the agent definition contains a legacy `subagent_mode: "task"` or `subagents.json` contains a legacy `default_mode: "task"`; explicit `mode: "task"` blocks and explicit `mode: "background"` stays background.
- AC-2: `subagent_continue` (tool and manager) with omitted `mode` resolves to background even when the previous attempt ran in task mode or config contains legacy `default_mode`; explicit continuation `mode` is honored; `enable_continue` behavior is unchanged.
- AC-3: pi-subagents no longer exposes `subagent_mode` / `default_mode` contracts: removed from types, config and definition parsing, tools-panel frontmatter handling, tool descriptions, README and the `subagents-configuration` skill; legacy keys present in existing files are ignored without error.
- AC-4: thoth-agents no longer generates, preserves or validates `subagent_mode`: the Pi adapter/writer stop emitting it, installer sync drops existing mode overrides from managed definitions, `pi-tool-config` no longer validates it, committed `pi/agents/*.md` and routed docs no longer mention it.

## Clarifications

- Resolved (user, ask_user_question `mode_authority` = `remove`): remove the `subagent_mode` / `default_mode` contracts and make omitted continuation mode background, rather than ignoring the fields or keeping continuation inheritance.
- Resolved (user follow-up): `enable_continue` is independent; it stays opt-in with default `false`.

## Decisions

- Omitted mode resolves solely to `background`; only the explicit invocation `mode` parameter can select task.
- Legacy `subagent_mode` frontmatter and `default_mode` config keys are silently ignored (no error, no warning) so existing operator files keep loading; no backward-compatibility shim beyond ignoring them.
- Installer sync owns cleanup of managed thoth definitions; user-defined non-thoth agent files are not rewritten.
- Spec delta updates **Native lifecycle translation**; the timeout handoff requirement is unaffected.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Native lifecycle translation** — Pi root guidance MUST use one direct subagent_run with explicit canonical agent and bounded task per fresh assignment; omitted mode MUST run in background for both subagent_run and subagent_continue, task mode MUST occur only when the invocation explicitly passes `mode: "task"`, and agent definitions, subagent configuration and previous attempts MUST NOT select the execution mode. Native status/result/cancel or supported live messaging MUST be used only for a known task ID. Queued delivery, nonterminal state and cancellation requests MUST NOT prove termination or acceptance. New objectives, phases, mutable surfaces and independent judgments MUST receive fresh assignments. Thoth MUST NOT use subagent orchestration APIs or claim instruction-only policy is runtime enforcement. Terminal notifications drive collection without polling; children MUST remain scoped to the parent Pi lifetime. The adopted delegation runtime MUST support Pi `>=0.99.0` through the `1.0.2` development pin with its registry and model-only exposure semantics, restrict child registered tools to the selected permitted implementations, and distinguish queued, extension-handled, rejected, and model-consumed live input. Updating this runtime MUST preserve its responsibility for LLM subagent delegation; non-LLM background task execution remains external.
  - GIVEN an agent definition or configuration that previously requested task mode; WHEN root calls subagent_run or subagent_continue without mode; THEN the child runs in background, and only an explicit `mode: "task"` invocation blocks.

## Plan

Two independent, non-overlapping writer units, run in parallel, followed by root closeout checks and fresh Oracle final verification.

1. **pi-subagents package** (`pi-packages/pi-subagents/**`): make `resolveEffectiveSubagentMode` and `resolveContinuationMode` return the explicit invocation mode or `background`; delete `default_mode` from `SubagentsConfig` parsing/merging and `subagent_mode` from `SubagentDefinition` parsing and the tools-panel frontmatter; simplify the tool/manager call sites; rewrite tool descriptions, README and `skills/subagents-configuration/SKILL.md` to state background default + explicit task opt-in; test-first: update existing mode tests and add cases proving legacy `subagent_mode: "task"`, legacy `default_mode: "task"` and a previous task attempt no longer select task.
2. **thoth-agents Pi integration** (`src/harness/adapters/pi.ts`, `src/harness/writers/pi-agent.ts`, `src/cli/pi-resources.ts`, `src/cli/pi-tool-config.ts`, `src/cli/pi-model-config.ts`, their tests, committed `pi/agents/*.md`, `scripts/verify-pi-package.mjs`, `docs/installation.md`, `docs/agent/harness-packaging.md`): stop emitting and preserving `subagent_mode`, drop the field from managed definitions on sync, remove mode validation, make the packaging verifier stop requiring the field (it may assert its absence), regenerate committed definitions through the existing generation path, update tests test-first. Historical `pi-packages/pi-subagents/CHANGELOG.md` entries are not rewritten.

Interfaces: the package's own typed definitions and the repository's Pi writer are separate surfaces; if one unit needs a change in the other's surface it returns to root. Focused verification: package tests/typecheck for touched files, repository focused vitest for touched tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` (generated Pi assets), and the Pi packaging verification that runs `scripts/verify-pi-package.mjs` (its input changes). Risk: operator's Pi loads a built/installed copy, so behavior changes only after rebuild/reinstall; stale `subagent_mode` stays in installed home files until the next sync but is ignored.

## Tasks

- [x] AC-1: pi-subagents launch and continuation resolve omitted mode to background only, with config contracts removed
  - Outcome: package runtime, tools, manager, tools panel, README and skill implement explicit-only task mode; AC-2 and AC-3 are covered by the same unit
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts`, `src/continuation-mode.ts`, `src/tools/subagent-run.ts`, `src/tools/subagent-continue.ts`, `src/manager.ts`, `src/tools-panel/frontmatter.ts`, `README.md`, `skills/subagents-configuration/SKILL.md`, `test/config.test.ts`, `test/manager.test.ts`, `test/tools/subagent-run.test.ts`, `test/tools/subagent-continue.test.ts`, `test/render/tools.test.ts`; skills `tdd`, `simplify`
  - Inputs: Exploration and Decisions sections of this record
  - Dependencies: none
  - Output: package diff plus focused test/typecheck evidence
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/**` only
  - Interface boundaries: public `subagent_run` / `subagent_continue` schemas keep optional `mode` accepting `task|background`; rendering of effective mode unchanged; `enable_continue` unchanged
  - Focused check and PASS evidence: package vitest for touched test files and package typecheck pass, including new legacy-key and previous-task-attempt cases
  - Return milestone: all package edits done and focused checks green
  - Stop / reassessment: a required change outside `pi-packages/pi-subagents/**` or an unexpected consumer of `subagent_mode` / `default_mode`
- [x] AC-2: continuation default covered by the pi-subagents unit above
  - Outcome: `resolveContinuationMode` returns explicit mode or background; tests prove a previous task attempt continues in background without explicit mode
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/continuation-mode.ts`, `src/tools/subagent-continue.ts`, `src/manager.ts`, `test/manager.test.ts`, `test/tools/subagent-continue.test.ts`
  - Inputs: Decisions section
  - Dependencies: same unit as the AC-1 row (single writer)
  - Output: part of the pi-subagents diff
  - Owner: thoth-worker (same assignment as AC-1)
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: `enable_continue` gating unchanged
  - Focused check and PASS evidence: continuation tests pass with the new expectation
  - Return milestone: same as AC-1 row
  - Stop / reassessment: same as AC-1 row
- [x] AC-3: contract removal covered by the pi-subagents unit above
  - Outcome: no `subagent_mode` / `default_mode` in package types, parsing, panel, descriptions, README or skill; legacy keys ignored without error
  - Known entrypoints and skill paths: as in the AC-1 row
  - Inputs: Decisions section
  - Dependencies: same unit as the AC-1 row (single writer)
  - Output: part of the pi-subagents diff
  - Owner: thoth-worker (same assignment as AC-1)
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: unknown frontmatter/config keys tolerated
  - Focused check and PASS evidence: `rg "\b(subagent_mode|default_mode)\b" pi-packages/pi-subagents --glob '!CHANGELOG.md'` returns only tests asserting legacy keys are ignored
  - Return milestone: same as AC-1 row
  - Stop / reassessment: same as AC-1 row
- [x] AC-4: thoth-agents stops generating, preserving and validating `subagent_mode`
  - Outcome: Pi adapter/writer, installer sync, tool-config and model-config validation, packaging verifier, committed `pi/agents/*.md` and docs free of `subagent_mode`; sync drops existing overrides from managed definitions
  - Known entrypoints and skill paths: `src/harness/adapters/pi.ts`, `src/harness/writers/pi-agent.ts`, `src/cli/pi-resources.ts`, `src/cli/pi-tool-config.ts`, `src/cli/pi-model-config.ts`, `src/harness/adapters/pi.test.ts`, `src/harness/writers/pi-agent.test.ts`, `src/cli/pi-resources.test.ts`, `src/cli/pi-tool-config.test.ts`, `pi-model-config` tests, `scripts/verify-pi-package.mjs` and its tests, `pi/agents/*.md`, `docs/installation.md`, `docs/agent/harness-packaging.md`; skills `tdd`, `simplify`
  - Inputs: Exploration and Decisions sections of this record
  - Dependencies: none (parallel with the pi-subagents unit)
  - Output: repository diff plus focused test evidence
  - Owner: thoth-worker
  - Writes: listed `src/**` files and their tests, `scripts/verify-pi-package.mjs` and its tests, `pi/agents/*.md`, `docs/installation.md`, `docs/agent/harness-packaging.md`; never `pi-packages/**` or `.thoth/**`
  - Interface boundaries: other preserved definition overrides (model, effort, tools) keep current behavior
  - Focused check and PASS evidence: focused vitest for touched repository tests passes; Pi packaging verification passes; `rg "subagent_mode" src pi docs scripts` returns only tests or verifier code asserting the field is dropped/absent
  - Return milestone: repository edits done and focused tests green
  - Stop / reassessment: generation path unclear, or a needed change inside `pi-packages/**`

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: fresh Oracle subtask_thoth-oracle_1792814066275_7b41b123, thoth-gate-verdict valid OKAY, recordSha256 01a80573192270a755b395a22be46cc1643e6e7a0c05f745a68bbaa0344cfd18 (recordDigest match). A first review (subtask_thoth-oracle_1792813950930_8122c40b) returned REJECT for missing AC-4 surfaces, repaired before the second review. After OKAY, root applied only the reviewer's non-blocking word-boundary fix to the AC-3 search command.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 26a160fac7cb0a38a121a948eeb1a38596625497e1a8e946e801f60827475b83

Fresh Oracle subtask_thoth-oracle_1792814955685_13abb1f8; thoth-gate-verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match. Root closeout checks: `pnpm run check:ci` exit 0 (767 pre-existing warnings, no errors), `pnpm run typecheck` exit 0, `pnpm run build` exit 0 with no extra tracked drift, `pnpm run verify:pi-package` complete, `pnpm run test:pi-extensions` 13/13, `pnpm --dir pi-packages/pi-subagents test` 1807 passed / 1 skipped after the atelier-metadata test fix.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-4 are satisfied. No blocking correctness or scope findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/subagent-background-default/subagent-background-default.md",
      "claim": "Verify validation passes without errors or warnings. Independently calculated record-prefix and canonical-spec hashes match. The durable delta changes only the intended mode clause.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-review",
      "locator": "pi-packages/pi-subagents/src/{config.ts,continuation-mode.ts,manager.ts,tools,types.ts,tools-panel/frontmatter.ts}",
      "claim": "Launch and continuation resolve explicit invocation mode or background. Continuation overwrites both persisted mode fields. No config/frontmatter/prior-attempt task-mode selection remains; enable_continue remains opt-in and defaults false.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "tests",
      "locator": "pi-packages/pi-subagents: nine changed test files",
      "claim": "Independent focused run: 538 tests passed, including legacy-key ignoring, prior-task continuation, explicit blocking, rendering, and Atelier regressions.",
      "basis": "observed",
      "uncertainty": "The full package suite was not independently rerun."
    },
    {
      "id": "E4",
      "kind": "tests-and-integration-review",
      "locator": "src/harness/{adapters/pi,writers/pi-agent}; src/cli/pi-{resources,tool-config,model-config}; integration tests",
      "claim": "Generation and installer synchronization drop the mode contract while preserving other overrides. Independent run: seven files, 172 tests passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "static-checks",
      "locator": "package typecheck; root typecheck; pnpm run check:ci",
      "claim": "Both typechecks and root check:ci pass. Check:ci reports 767 warnings and nine informational diagnostics, without errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "artifact-verification",
      "locator": "pnpm run verify:pi-package; pi/.thoth-agents-assets.json",
      "claim": "Package verification completes with five skills, five specialists, one session_start and no orchestrator child. All five generated asset digests match.",
      "basis": "observed",
      "uncertainty": "Build was intentionally not rerun."
    },
    {
      "id": "E7",
      "kind": "scope-and-freshness",
      "locator": "git diff; git diff --check; final input fingerprint",
      "claim": "All 39 tracked changes are in scope; only the assigned record is untracked. No unrelated changes, secrets, version changes or historical CHANGELOG rewrites found. Reviewed inputs remained unchanged through validation.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Trace tool/manager launch resolution and run focused regression tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Omitted mode is background despite legacy definition/config values; explicit modes remain supported."
    },
    {
      "check": "AC-2",
      "method": "Trace continuation state replacement and test prior-task attempts and continuation gating.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Previous attempts cannot select task mode; explicit continuation mode and enable_continue behavior are preserved."
    },
    {
      "check": "AC-3",
      "method": "Review types, parsers, panel, descriptions and documentation; search legacy identifiers; test ignored values.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E7"],
      "reason": "Removed keys remain only in historical documentation or regression fixtures/assertions, not active package contracts."
    },
    {
      "check": "AC-4",
      "method": "Review generation, synchronization and validation paths; run integration tests and packed-artifact verification.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "Managed definitions no longer emit or preserve mode overrides, and mode-specific validation is removed."
    },
    {
      "check": "Governance, quality, scope and freshness",
      "method": "Validate record; compare baseline and delta; run type/lint checks; inspect diff and rehash frozen inputs.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5", "E7"],
      "reason": "Record binding and source baseline match; checks pass and implementation inputs remained stable."
    },
    {
      "check": "Build rerun",
      "method": "Not executed as instructed.",
      "outcome": "not-run",
      "evidenceIds": ["E6"],
      "reason": "Avoided rewriting dist; independently verified existing packed artifacts instead."
    }
  ],
  "risks": [
    {
      "description": "Installed runtimes require the normal rebuild/reinstall and reload before adopting this behavior; operator home files were intentionally not rewritten.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E1"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should record the validated PASS and matching digest, then complete closeout validation before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/subagent-background-default/subagent-background-default.md",
    "reviewedRecordSha256": "26a160fac7cb0a38a121a948eeb1a38596625497e1a8e946e801f60827475b83"
  }
}
```

- AC-1: PASS | package launch tests (config/manager/subagent-run) + Oracle trace | legacy `subagent_mode`/`default_mode` task values ignored; omitted launch background; explicit task/background honored (Oracle E2, E3)
- AC-2: PASS | continuation tests + atelier-metadata regression | previous task attempt continues in background without mode; explicit mode honored; `enable_continue` unchanged (Oracle E2, E3)
- AC-3: PASS | `rg "\b(subagent_mode|default_mode)\b" pi-packages/pi-subagents --glob '!CHANGELOG.md'` + package typecheck | only legacy-ignore test fixtures/assertions remain; full package suite 1807 passed (Oracle E3, E7)
- AC-4: PASS | focused repository vitest (159/172 passed), `integration:verify` 13, `verify:pi-package` complete | generation/sync/validation drop `subagent_mode`; other overrides preserved (Oracle E4, E6)
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:726a4fe5207569677473af7e816bda662645a225f890c91b4ed607b03a1f5a3e

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
