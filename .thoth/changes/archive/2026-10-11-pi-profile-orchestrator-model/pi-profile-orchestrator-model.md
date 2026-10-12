# Change: pi-profile-orchestrator-model

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Named profiles exist (archived change `pi-subagent-model-profiles`): store `pi-packages/pi-subagents/src/model-profiles/store.ts` (schema `{version:1, active?, profiles:{name:{agents:{...}}}}`), session selection `src/model-profiles/session.ts` (session entry `thoth-subagent-model-profile`), resolution `src/profile-resolver.ts`, panel `src/model-profiles/{command,editor,data,formatting}.ts`, extension wiring `src/extension/subagents-extension.ts`.
- Pi extension API exposes `pi.setModel(model)` (session-only, returns false without auth), `pi.getThinkingLevel()`, `pi.setThinkingLevel(level)` and `ctx.modelRegistry` (`node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:225,1261–1268`). Extensions cannot persist `settings.json` defaults; interactive `/model` may persist them (`modes/interactive/interactive-mode.js:4233–4236,4392–4395`).
- `session_start` reasons: `startup | reload | new | resume | fork` (`types.d.ts:553–559`). `startup` also covers continuing an existing session, so "new" must be detected by an empty session.
- Model changes are recorded as session entries, so resume already restores the last session model natively.
- Reference: gentle-shell stores a reserved `orchestrator` entry and writes Pi `settings.json` on persistent apply; this change deliberately does not write `settings.json`.

## Intent

Let a named Pi model profile optionally define the root orchestrator model and effort, applied live when the profile is activated and at the start of new sessions, without writing Pi `settings.json`.

## Non-goals

- Writing Pi `settings.json` or changing native `/model` behavior.
- Tools/permissions in profiles; other harnesses; the thoth-agents CLI.
- Applying the orchestrator on resume, reload or fork.

## Acceptance

- AC-1: Profile schema accepts optional `orchestrator: { model?, effort? }` per profile in both stores, validated like agent entries; saved, cloned, renamed and unedited-save copies keep it; `default` has no orchestrator; existing files without the field remain valid.
- AC-2: Activating a profile with `u`, `g` or `p` whose effective result defines an orchestrator immediately switches the current session model and effort through the Pi extension API; a profile without orchestrator leaves the session model untouched; a missing or unauthenticated model warns and keeps the current model; effort unsupported by the model is clamped with a notice.
- AC-3: On `session_start` with reason `new`, or `startup` with an empty session, the effective profile (project pin → global active) applies its orchestrator; `resume`, `reload`, `fork` and `startup` of a non-empty session never change the model; `settings.json` is never written.
- AC-4: The panel shows the orchestrator as the first detail row of each profile (editable with Enter/`m`/`e`, read-only in `default`, shown as "session model" when unset), a drift indicator when the effective profile's orchestrator differs from the current session model/effort, and key `o` copying the current session model/effort into the selected profile's orchestrator as an unsaved draft edit.
- AC-5: README and `subagents-configuration` skill document the orchestrator field, when it applies, relation to `/model` and `settings.json`, and key `o`.
- AC-6: Focused pi-subagents tests (store, activation, session start, panel), package typecheck, root `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- Never write `settings.json`; profile is the source of truth for new sessions; `/model` is a temporary session override (user).
- Apply on new sessions only, not on resume (user); fork inherits the original session model (user).
- Activation `u`/`g`/`p` applies live (user).
- Profile without orchestrator, including `default`, leaves the model untouched (user).
- Unavailable/unauthenticated model: warn and keep the current model (user).
- Capture key `o` (user).

## Decisions

- Orchestrator lives beside `agents` (`profiles[name].orchestrator`), not as a reserved agent name, so it cannot collide with a subagent called `orchestrator`.
- New-session detection: reason `new`, or `startup` when the whole session history (`sessionManager.getEntries()`, not only the active branch) contains no message entries; native initialization entries (model/thinking-level changes, session info) do not count as history. A session whose active branch is empty but whose history has messages is treated as existing.
- The panel receives live accessors for the current session model and thinking level (not a spread snapshot of `ctx`), so drift and repeated `o` captures reflect the current state after activation.
- The applier awaits `setModel`, treats both `false` and rejection as unavailable without applying effort, then applies effort and compares the requested level with the native readback to report clamping.
- At session start there is no session selection yet, so only project pin and global active are consulted; a restored session selection never triggers a model change on resume.
- `o` capture is a draft edit and requires `s` to persist, consistent with existing lifecycle; on `default` it offers creating a new profile.
- Implementation additions accepted by root: the orchestrator row uses a NUL-prefixed internal id so it cannot collide with a subagent named `orchestrator`; picker reset on the orchestrator row means unset (session model); drift compares the live session with the effective profile's saved orchestrator (unsaved edits ignored, since activation applies the saved version); `o` is listed in the header hint row; clearing the orchestrator is persisted by saving `orchestrator: undefined` explicitly because `store.save` shallow-merges profile fields to preserve unrelated keys; the command context exposes live `getSessionModel()`, `getSessionThinkingLevel()` and `applyEffectiveProfileOrchestrator()`.
- Model lookup uses `ctx.modelRegistry`; activation results (applied, skipped, unavailable, clamped) are reported in the panel status line and as notifications at session start.

## Durable deltas

- `MODIFIED pi-ecosystem` **Named Pi subagent model profiles** — Pi `/subagents-model` MUST manage named model profiles (model and effort per subagent, plus an optional root orchestrator model and effort) stored in `<agentDir>/thoth/profiles.json` and `<project>/.pi/thoth/profiles.json`, with a read-only virtual `default`, draft-until-save creation from default or another profile, project-over-global name shadowing, and effective selection session → project pin → global active → `default` applied at run time without rewriting agent definitions; `model_profiles` in `subagents.json` MUST NOT be used. A profile orchestrator MUST be applied to the current session on activation and at the start of new sessions only, MUST NOT change the model on resume, reload or fork, MUST leave the model untouched when undefined or unavailable (with a warning when unavailable), and Pi `settings.json` MUST NOT be written.
  - GIVEN a global active profile `openai` and a project pin `claude` defining orchestrator `anthropic/claude-opus-5-5`; WHEN a subagent runs in that project without a session selection; THEN it uses the `claude` profile's model and effort, a new session in that project starts with `anthropic/claude-opus-5-5`, resuming an older session keeps its own model, and selecting `openai` for the session makes later runs in that session, including after resume, use `openai` without changing any config file.

## Plan

Package `pi-packages/pi-subagents`.

1. **Core** — extend store types/parse/serialize with `orchestrator`; add an orchestrator applier module (e.g. `src/model-profiles/orchestrator.ts`) that resolves the model via `modelRegistry`, calls `setModel`/`setThinkingLevel`, clamps effort and returns a typed outcome; wire `session_start` in `src/extension/subagents-extension.ts` for new-session application; expose an activation hook the panel calls after `u`/`g`/`p`. Tests: store round-trip, applier outcomes (applied/no-orchestrator/unavailable/clamped), session_start per reason incl. non-empty startup.
2. **Panel** — orchestrator first row, editing via existing pickers, `default` read-only, drift indicator, `o` capture draft, activation calls the applier and shows outcome. Tests: render wide/narrow, `o`, drift, activation outcomes.
3. **Docs** — README and skill.

Dependencies: 2 and 3 after 1 is accepted. Risks: `startup` continuation detection; model registry lookup by `provider/id`; tests mocking Pi model APIs.

## Tasks

- [x] AC-1: Store schema supports optional orchestrator
  - Outcome: orchestrator persisted, validated and preserved through CRUD
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/model-profiles/store.ts`, `test/model-profiles/store.test.ts`; skills `tdd`, `vitest`
  - Inputs: Acceptance AC-1, Decisions
  - Dependencies: none
  - Output: updated store and tests
  - Owner: thoth-worker
  - Writes: `src/model-profiles/store.ts`, `src/types.ts` if needed, store tests
  - Interface boundaries: panel and resolver consumers of `NamedModelProfile`
  - Focused check and PASS evidence: store tests pass including orchestrator round-trip and clone/rename
  - Return milestone: store tests green
  - Stop / reassessment: schema change breaks subagent resolution
- [x] AC-2: Orchestrator applier for live activation
  - Outcome: typed apply function with applied/untouched/unavailable/clamped outcomes
  - Known entrypoints and skill paths: new `src/model-profiles/orchestrator.ts`, Pi `types.d.ts:225,1261–1268`
  - Inputs: AC-1 store unit
  - Dependencies: AC-1 store unit
  - Output: applier module and tests
  - Owner: thoth-worker (same core writer)
  - Writes: `src/model-profiles/orchestrator.ts`, its tests
  - Interface boundaries: Pi extension API, panel activation
  - Focused check and PASS evidence: applier tests for each outcome pass, including `setModel` returning false, rejecting, and clamped effort readback
  - Return milestone: applier tests green
  - Stop / reassessment: Pi API cannot resolve models by provider/id
- [x] AC-3: New-session application on session_start
  - Outcome: profile orchestrator applied only for new sessions
  - Known entrypoints and skill paths: `src/extension/subagents-extension.ts`, `test/model-profiles/extension-session.test.ts`
  - Inputs: AC-2 applier
  - Dependencies: AC-2 unit
  - Output: wiring and tests for every reason incl. non-empty startup and a session whose active branch is empty but whose history has messages
  - Owner: thoth-worker (same core writer)
  - Writes: extension file and its tests
  - Interface boundaries: session selection restore
  - Focused check and PASS evidence: per-reason tests pass, including the SessionManager regression (empty active branch with historical messages does not apply); no settings writes
  - Return milestone: session tests green
  - Stop / reassessment: no reliable empty-session signal
- [x] AC-4: Panel orchestrator row, drift, `o` capture and live activation
  - Outcome: AC-4 behavior in the overlay
  - Known entrypoints and skill paths: `src/model-profiles/{command,editor,data,formatting}.ts`, `test/model-profiles/ui.test.ts`
  - Inputs: accepted core API (AC-1..AC-3 units)
  - Dependencies: AC-1, AC-2, AC-3 units
  - Output: panel changes and tests
  - Owner: thoth-designer
  - Writes: listed panel files and `test/model-profiles/ui.test.ts`; excludes store/orchestrator/extension modules
  - Interface boundaries: shared pi-core list-editor shell (must remain)
  - Focused check and PASS evidence: ui tests for row, drift, `o`, activation outcomes pass at wide and narrow widths
  - Return milestone: panel tests green
  - Stop / reassessment: core API gap
- [x] AC-5: Documentation
  - Outcome: docs describe orchestrator field and rules
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md`, `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md`
  - Inputs: accepted core API and key map
  - Dependencies: AC-3 unit
  - Output: docs diff
  - Owner: thoth-worker
  - Writes: those two docs
  - Interface boundaries: none
  - Focused check and PASS evidence: docs mention orchestrator, `o`, no settings.json writes
  - Return milestone: docs ready
  - Stop / reassessment: none
- [x] AC-6: Local closeout gate
  - Outcome: checks pass
  - Known entrypoints and skill paths: `docs/agent/testing.md`
  - Inputs: all units
  - Dependencies: all units
  - Output: check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: package vitest + tsc in `pi-packages/pi-subagents`, root `check:ci` and `typecheck` exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failures reported

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 fresh Oracle REJECT (branch-only startup detection); repaired Decisions and AC-2/AC-3 rows; round 2 fresh Oracle OKAY. Cautions carried to dispatch: docs must not claim native /model never persists defaults; panel tests cover activation then repeated `o` capture via live accessors.
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 86c94d701ae8d843d174ec6e8d7a8ed3cfd2640d9c9e69957d245827c194d618

Round 1 fresh Oracle FAIL (stale effort picker values after model selection); fixed with live getters and six regression tests; round 2 fresh Oracle PASS below.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The stale-picker blocker is repaired; AC-1–AC-6 and the accepted decisions are satisfied by the reviewed diff and fresh checks.",
  "evidence": [
    {
      "id": "record",
      "kind": "integrity",
      "locator": ".thoth/changes/pi-profile-orchestrator-model/pi-profile-orchestrator-model.md",
      "claim": "Independently recomputed the exact byte-prefix SHA-256 before ## Authorization; it matches the assignment. The verify-phase validator passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac1",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/{store,editor}.ts; test/model-profiles/store.test.ts",
      "claim": "Optional orchestrator overrides share agent validation, round-trip through both stores, survive save/clone/rename, and remain absent in virtual default and default-derived copies. Explicit undefined persists clearing.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac2",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/orchestrator.ts; src/extension/subagents-extension.ts; test/model-profiles/{orchestrator,extension-session,ui}.test.ts",
      "claim": "u/g/p apply the resulting effective saved profile. Model resolution uses modelRegistry; setModel is awaited; missing, false and rejected switches warn without applying effort. Native effort readback reports clamping. Undefined orchestrator leaves the session untouched.",
      "basis": "observed",
      "uncertainty": "Model-switch outcomes use mocked extension APIs, corroborated by installed SDK implementation."
    },
    {
      "id": "ac3",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/extension/subagents-extension.ts:191–241; test/model-profiles/extension-session.test.ts",
      "claim": "New sessions use project pin/global/default. Startup detection examines full history, ignores initialization entries, and preserves existing sessions even with an empty active branch. Resume/reload/fork do not apply. Tests preserve settings.json bytes; SDK bindings do not enable default persistence.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac4",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/{command,editor,formatting}.ts; test/model-profiles/ui.test.ts",
      "claim": "The orchestrator is the first row with a distinct internal ID; default is read-only; unset fields show session inheritance. Drift uses the saved effective orchestrator and live session accessors. Repeated o captures are unsaved until s. Wide/narrow rendering and activation outcomes are covered.",
      "basis": "observed",
      "uncertainty": "No manual native-terminal interaction was performed."
    },
    {
      "id": "picker-fix",
      "kind": "regression-verification",
      "locator": "pi-packages/pi-subagents/src/model-profiles/command.ts:324–390; test/model-profiles/ui.test.ts:523–642",
      "claim": "Both EditTarget.values implementations are getters evaluated when the effort picker opens. Six metadata-backed regressions verify reasoning/non-reasoning model selection and model-reset fallback for orchestrator and subagent rows.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac5",
      "kind": "documentation-review",
      "locator": "pi-packages/pi-subagents/README.md; skills/subagents-configuration/SKILL.md",
      "claim": "Both documents explain the schema, effective activation, full-history new-session rule, excluded lifecycle reasons, unavailable/clamped outcomes, o/save behavior, and no settings.json writes while preserving native /model persistence caveats.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac6",
      "kind": "fresh-execution",
      "locator": "pi-packages/pi-subagents: pnpm exec vitest run; pnpm exec tsc --noEmit -p .; repository: pnpm run check:ci; pnpm run typecheck",
      "claim": "All four requested commands completed successfully. Vitest: 81 files passed, 1533 tests passed, one skipped. Biome checked 828 files without errors or fixes, reporting 683 warnings and five informational diagnostics.",
      "basis": "observed",
      "uncertainty": "One Windows-inapplicable POSIX cancellation test is skipped."
    },
    {
      "id": "contracts",
      "kind": "canonical-contract-review",
      "locator": ".thoth/specs/pi-ecosystem/spec.md; .thoth/specs/multi-harness-agent-pack/spec.md:437; record Durable deltas",
      "claim": "The pi-ecosystem baseline digest matches c9bc1939fbc1078959b4e71bf3d416cf3bc44d4dbb7d24af4cb4f6429708aba8. The MODIFIED requirement retains profile precedence, shadowing and runtime routing while adding orchestrator behavior. The shared native list-editor contract remains intact; tools configuration is untouched.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "freshness",
      "kind": "diff-and-integrity",
      "locator": "git working tree, tracked diff and untracked files",
      "claim": "Reviewed all ten modified files, both untracked implementation/test files and the record. No staged changes or whitespace errors. The 15-input content fingerprint was identical before and after fresh validation.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record identity and canonical baselines",
      "method": "Independent byte hashing, canonical-spec review and installed verify validator",
      "outcome": "pass",
      "evidenceIds": ["record", "contracts"],
      "reason": "Expected record hash and reviewed baseline match; structural verify gate passes."
    },
    {
      "check": "AC-1",
      "method": "Store/editor diff review and fresh full package tests",
      "outcome": "pass",
      "evidenceIds": ["ac1", "ac6"],
      "reason": "Persistence, compatibility, copying, default behavior and clearing satisfy the contract."
    },
    {
      "check": "AC-2",
      "method": "Applier/activation review, SDK inspection and fresh tests",
      "outcome": "pass",
      "evidenceIds": ["ac2", "ac6"],
      "reason": "Effective activation, failure handling and clamping are implemented and tested."
    },
    {
      "check": "AC-3",
      "method": "Lifecycle review and real SessionManager regression tests",
      "outcome": "pass",
      "evidenceIds": ["ac3", "ac6"],
      "reason": "Full-history detection preserves existing sessions; configured defaults are not written."
    },
    {
      "check": "AC-4 and prior blocker",
      "method": "Panel/editor diff review and metadata-backed picker tests",
      "outcome": "pass",
      "evidenceIds": ["ac4", "picker-fix", "ac6"],
      "reason": "Live values repair combined editing; row, draft, drift and read-only behavior satisfy acceptance."
    },
    {
      "check": "AC-5",
      "method": "Review both documentation diffs against implementation",
      "outcome": "pass",
      "evidenceIds": ["ac5"],
      "reason": "Required behavior and native persistence distinctions are documented accurately."
    },
    {
      "check": "AC-6",
      "method": "Fresh execution of all four assigned commands",
      "outcome": "pass",
      "evidenceIds": ["ac6"],
      "reason": "Package tests/typecheck and root CI check/typecheck pass."
    },
    {
      "check": "Review freshness and scope",
      "method": "Complete diff/untracked review and before/after content fingerprints",
      "outcome": "pass",
      "evidenceIds": ["freshness"],
      "reason": "Reviewed inputs remained unchanged during validation."
    }
  ],
  "risks": [
    {
      "description": "Automated panel tests and inspected SDK bindings do not constitute a manual native-terminal or authenticated-provider smoke test.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["ac2", "ac4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate the unchanged envelope, record acceptance evidence and complete the closeout gate before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-profile-orchestrator-model/pi-profile-orchestrator-model.md",
    "reviewedRecordSha256": "86c94d701ae8d843d174ec6e8d7a8ed3cfd2640d9c9e69957d245827c194d618"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | store tests: orchestrator round-trip, clone/rename/copy, clear | Oracle round 2 PASS
- AC-2: PASS | orchestrator.test.ts: applied/clamped/untouched/unavailable incl. setModel false and rejection | Oracle round 2 PASS
- AC-3: PASS | extension-session.test.ts per reason incl. empty-branch-with-history regression | Oracle round 2 PASS
- AC-4: PASS | ui.test.ts orchestrator row, drift, o capture, activation outcomes | Oracle round 2 PASS
- AC-5: PASS | README and skill diff | Oracle round 2 PASS
- AC-6: PASS | package vitest 81 files/1533 passed/1 skipped; package tsc 0; root check:ci 0; root typecheck 0 | Oracle round 2 PASS
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:c9bc1939fbc1078959b4e71bf3d416cf3bc44d4dbb7d24af4cb4f6429708aba8

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
