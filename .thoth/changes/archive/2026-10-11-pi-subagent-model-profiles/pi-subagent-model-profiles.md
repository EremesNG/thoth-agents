# Change: pi-subagent-model-profiles

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi-only. Today `model_profiles` in `subagents.json` (global `<agentDir>/subagents.json`, project `<cwd>/.pi/subagents.json`) is a per-agent override map, not a named collection (`pi-packages/pi-subagents/src/types.ts:13–28,75–77`; parse/merge/save `src/config.ts:239–253,477–528,602–676`).
- Resolution: profile → definition frontmatter → scalar defaults → parent; profiles chosen by definition scope (`src/profile-resolver.ts:52–102`). Consumers: `src/manager.ts:250–270,604–618,1388–1451,1570–1608,1754`, `src/runner/sdk-runner.ts:697–704`, `src/render/tools/subagent-list-agents.ts:20–25`, history fields `src/history.ts:114–115,347–348,791–792`.
- Config and definitions are reread on every run/continuation (`src/tools/subagent-run.ts:120`, `src/manager.ts:1286–1290,1367`); no file materialization is needed to switch.
- `/subagents-model` UI: `src/model-profiles/{command,data,editor,formatting}.ts`, `src/model-profiles-ui.ts`; list editor + provider/model/effort pickers, staged dirty edits, overlay / `ui.select` / non-TUI flows. Writes are non-atomic `writeFileSync`; malformed JSON reads as `{}`.
- `/subagents` panel uses pi-core `HistoryPanel` (`pi-packages/pi-core/src/history-panel.ts:289–340,475–494,606–714`): sidebar 25% (18–30 cols) at width ≥90, narrow stacked mode, ←/→ select sidebar item.
- Session identity and `session_start` restore of session entries: `src/extension/subagents-extension.ts:44–49,85,179–203`. No session-scoped profile state exists.
- No `.pi/thoth` path exists. Reference design: gentle-shell (`lib/agent-profiles.ts`, `lib/session-profile-binding.ts`): named snapshots, session binding vs persistent apply, repository pins, temp-file + rename writes.
- Docs touchpoints: `pi-packages/pi-subagents/README.md`, `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md`, `docs/installation.md:563`, `docs/agent/harness-packaging.md:81`.
- Tests: `test/model-profiles/ui.test.ts`, `test/config.test.ts:856`, `test/manager.test.ts`, `test/tools/subagent-list-agents.test.ts`, runner fixtures using profiles, `test/compatibility.test.ts:140`.

## Intent

Evolve `/subagents-model` into a named model-profile manager for Pi subagents: users create, clone, edit, rename, delete and switch profiles (model + effort per agent) at session, project, or global level, with an immutable built-in `default` profile.

## Non-goals

- Tools, permissions or any non-model setting in profiles (schema leaves room for them).
- Root/orchestrator model selection.
- OpenCode, Codex and Claude harnesses; the thoth-agents CLI model editor (`src/cli/pi-model-config.ts`).
- Import/export, backward compatibility or migration of `model_profiles` in `subagents.json`.
- A new slash command.

## Acceptance

- AC-1: Profiles persist in `<agentDir>/thoth/profiles.json` (global, `agentDir` honoring `PI_CODING_AGENT_DIR`) and `<cwd>/.pi/thoth/profiles.json` (project) with a versioned schema `{ version: 1, active?: string, profiles: { [name]: { agents: { [agent]: { model?, effort? } } } } }` where `active` is the global active profile or the project pin; writes are atomic (temp file + rename), preserve unrelated fields, and a malformed file is reported and never silently overwritten.
- AC-2: Effective profile selection is session selection → project pin → global active → `default`; a project profile shadows a same-named global one inside that project; `default` is a reserved virtual profile with no overrides (agents resolve to definition/shipped values); a selected profile entry outranks definition frontmatter; agents absent from the profile fall back to definition/defaults; a reference to a missing profile falls back to the next level with a visible warning; `model_profiles` in `subagents.json` is no longer read or written.
- AC-3: Session-only selection is stored as a Pi session entry, restored on `session_start` (reload/resume), never written to config files, and is used by new runs and continuations in that session.
- AC-4: `/subagents-model` shows a lateral profile list (layout consistent with `/subagents`: sidebar ≥90 cols, stacked when narrow) with scope tags `(global)/(local)`, shadowing and active markers (session/project/global), and an agent detail list with effective model/effort. Keys: ←/→ browse profiles (no activation), ↑/↓ agents, Enter edit agent model/effort, `n` new from default, `c` clone selected, `s` save, `r` rename, `d` delete, `u` use for session, `g` set global active, `p` pin to project.
- AC-5: Profile lifecycle: `default` is read-only (editing offers creating a new profile from it; cannot be renamed/deleted; name reserved); new and cloned profiles are in-memory drafts until `s`; saving an unedited new profile persists a full copy of the default effective model/effort for every listed agent; saved profiles are self-contained (explicit values per listed agent); new profiles choose global or project scope; deleting a profile referenced by the global active or project pin confirms and clears that pointer; closing with unsaved drafts/edits asks for confirmation; non-overlay fallbacks (`ui.select`, non-TUI) support listing and activation only.
- AC-6: README, `subagents-configuration` skill, `docs/installation.md` and `docs/agent/harness-packaging.md` describe profiles, storage paths, precedence and keys; no stale `model_profiles` guidance remains.
- AC-7: Focused pi-subagents tests for storage, resolution, session restore and panel behavior pass, plus `pnpm run check:ci` and `pnpm run typecheck`.

## Clarifications

- Scope is Pi only (user).
- Evolve `/subagents-model`, inspired by the `/subagents` sidebar panel; ←/→ iterate profiles (user).
- New profiles are self-contained drafts; unedited save stores a full copy of default (user).
- Session selection and project pin included; project storage `.pi/thoth/profiles.json`, which also hosts project-only profiles (user).
- Global storage `~/.pi/agent/thoth/profiles.json` (user, recommended option).
- Same-name project profile shadows the global one; most specific wins (user).
- Session selection survives resume via a session entry (user, recommended option).
- Key map as proposed in AC-4 (user, recommended option).

## Decisions

- `default` is computed, never stored; its effective values are the definition frontmatter / shipped defaults through the existing resolver chain minus the profile layer.
- Profile values are agent-keyed by normalized agent name, independent of definition scope (replaces scope-routed `model_profiles`).
- Global `active` and project `active` (pin) store only names; resolution happens at run time, so switching never rewrites agent definitions.
- Effective profile is captured at task start for history/continuation, as today.
- Fallback non-overlay flows only list/activate profiles (bounded assumption; editing requires the overlay).
- The panel MUST keep the shared pi-core list-editor shell (`pi-packages/pi-core/src/panel-list-editor.ts`) required by canonical specs, composed with a profile sidebar; the overview intercepts `g` before the shell's Home handling. Shared pi-core changes require reassessment.
- Designer writes exclude the accepted core store/resolution modules and their tests; API gaps return to the core owner.
- Implementation additions accepted by root: global active must reference a global profile (project pin may reference either scope); extra keys `m` (model only) and `e` (effort only); `u`/`g`/`p` toggle (pressing on the current selection clears it; `ui.select` fallback only sets); rename carries project pin, session and global pointers to the new name and delete clears them; picker reset means the default's effective value; unsaved drafts cannot be activated; session selection clearing persists a tombstone session entry (`thoth-subagent-model-profile`).
- Package checks run in `pi-packages/pi-subagents` (its own Vitest and tsconfig) in addition to root `check:ci` and `typecheck`.

## Durable deltas

- `ADDED pi-ecosystem` **Named Pi subagent model profiles** — Pi `/subagents-model` MUST manage named model profiles (model and effort per subagent) stored in `<agentDir>/thoth/profiles.json` and `<project>/.pi/thoth/profiles.json`, with a read-only virtual `default`, draft-until-save creation from default or another profile, project-over-global name shadowing, and effective selection session → project pin → global active → `default` applied at run time without rewriting agent definitions; `model_profiles` in `subagents.json` MUST NOT be used.
  - GIVEN a global active profile `openai` and a project pin `claude`; WHEN a subagent runs in that project without a session selection; THEN it uses the `claude` profile's model and effort, and selecting `openai` for the session makes later runs in that session, including after resume, use `openai` without changing any config file.

## Plan

Package: `pi-packages/pi-subagents`.

1. **Core (storage + resolution + session)** — new module (e.g. `src/model-profiles/store.ts`) for paths, schema parse/validate, atomic write, CRUD (create/clone/rename/delete/save) with reserved `default`; resolution of the effective named profile (session → pin → global → default, shadowing, missing-reference warning). Replace `model_profiles` parsing/save helpers in `src/config.ts`, `src/types.ts`, and scope routing in `src/profile-resolver.ts`; update `manager.ts`, `sdk-runner.ts`, `subagent-list-agents.ts` callers to receive the resolved named profile. Session selection: append/restore a custom session entry in `src/extension/subagents-extension.ts` and expose the current session selection to the manager. Tests: new store/resolution tests, adapt `config.test.ts`, `manager.test.ts`, `subagent-list-agents.test.ts`, runner fixtures.
2. **Panel** — rework `src/model-profiles/{command,data,editor,formatting}.ts` and `src/model-profiles-ui.ts`: sidebar profile list + agent detail, key map, drafts, default read-only, save scope choice, rename/delete confirmations, activation actions, dirty-close confirmation, reduced `ui.select`/non-TUI flows. Reuse provider/model/effort pickers. Tests: rewrite `test/model-profiles/ui.test.ts` (render widths, keys, draft/save, default protection, activation).
3. **Docs** — README, skill, `docs/installation.md`, `docs/agent/harness-packaging.md`.

Dependencies: 2 and 3 consume the accepted store/resolution API from 1. Risks: replacing scope-routed resolution touches run/continuation paths; panel complexity; concurrent writers to `profiles.json` (atomic rename limits corruption, last writer wins).

## Tasks

- [x] AC-1: Profile store module with paths, schema validation, atomic writes and CRUD
  - Outcome: tested store API for global/project `profiles.json`
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts`, `src/types.ts`, `src/model-profiles/data.ts`; skills `tdd`, `vitest`
  - Inputs: Acceptance AC-1, AC-5 storage rules, Decisions
  - Dependencies: none
  - Output: `src/model-profiles/store.ts` (or equivalent) + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/model-profiles/store.ts`, `src/types.ts`, `src/config.ts`, related tests
  - Interface boundaries: `agentDir` resolution, `ctx.agentDir`
  - Focused check and PASS evidence: vitest store tests pass (atomic write, malformed file preserved, reserved `default`, shadowing data)
  - Return milestone: store API and tests green
  - Stop / reassessment: need to change non-profile `subagents.json` semantics
- [x] AC-2: Run-time resolution of the effective named profile replacing `model_profiles`
  - Outcome: runs/continuations/list-agents use session → pin → global → default resolution
  - Known entrypoints and skill paths: `src/profile-resolver.ts`, `src/manager.ts`, `src/runner/sdk-runner.ts`, `src/render/tools/subagent-list-agents.ts`, `src/tools/subagent-run.ts`
  - Inputs: accepted store API (AC-1 unit)
  - Dependencies: AC-1 store unit
  - Output: updated resolver and callers + tests
  - Owner: thoth-worker (same session as AC-1 unit acceptable as one writer of core files)
  - Writes: listed source files and their tests, runner fixtures
  - Interface boundaries: task metadata/history fields for model source
  - Focused check and PASS evidence: `pnpm vitest run` on config, manager, list-agents, profile-resolver and runner profile tests passes
  - Return milestone: resolution tests green
  - Stop / reassessment: history schema change needed beyond source labels
- [x] AC-3: Session-scoped selection persisted as a session entry and restored
  - Outcome: session selection survives reload/resume and feeds resolution
  - Known entrypoints and skill paths: `src/extension/subagents-extension.ts:44–49,179–203`, `src/manager.ts`
  - Inputs: AC-2 resolution API
  - Dependencies: AC-2 unit
  - Output: session entry write/restore + tests
  - Owner: thoth-worker
  - Writes: extension and manager files, tests
  - Interface boundaries: Pi session entry API
  - Focused check and PASS evidence: test restoring selection on `session_start` and using it in a run
  - Return milestone: session tests green
  - Stop / reassessment: Pi API lacks custom session entries
- [x] AC-4: `/subagents-model` sidebar panel with profile browsing and activation keys
  - Outcome: overlay with profile sidebar, agent detail, ←/→, ↑/↓, Enter, `u`/`g`/`p`
  - Known entrypoints and skill paths: `src/model-profiles/{command,data,editor,formatting}.ts`, `src/model-profiles-ui.ts`, `pi-packages/pi-core/src/history-panel.ts` (layout reference)
  - Inputs: accepted core API (AC-1..AC-3 units)
  - Dependencies: AC-1, AC-2, AC-3 units
  - Output: reworked panel + render/key tests
  - Owner: thoth-designer
  - Writes: `src/model-profiles/*`, `src/model-profiles-ui.ts`, `test/model-profiles/*`
  - Interface boundaries: store/resolution API; shared pickers; `test/compatibility.test.ts` command publication
  - Focused check and PASS evidence: `test/model-profiles` render tests at wide and narrow widths pass
  - Return milestone: panel tests green
  - Stop / reassessment: store API gap
- [x] AC-5: Profile lifecycle in the panel (drafts, default read-only, save, clone, rename, delete, dirty close, fallbacks)
  - Outcome: lifecycle rules of AC-5 enforced in UI
  - Known entrypoints and skill paths: same as AC-4 unit
  - Inputs: AC-4 unit output
  - Dependencies: AC-4 unit
  - Output: lifecycle behavior + tests
  - Owner: thoth-designer (same writer as AC-4 unit)
  - Writes: `src/model-profiles/*`, `test/model-profiles/*`
  - Interface boundaries: store CRUD API
  - Focused check and PASS evidence: tests for unedited-save full copy, default protection, delete clearing pointers, dirty-close confirm pass
  - Return milestone: lifecycle tests green
  - Stop / reassessment: conflicting rule discovered
- [x] AC-6: Documentation updated
  - Outcome: docs describe profiles, paths, precedence, keys; no stale `model_profiles`
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md`, `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md`, `docs/installation.md`, `docs/agent/harness-packaging.md`
  - Inputs: accepted core API and key map
  - Dependencies: AC-2 unit
  - Output: updated docs
  - Owner: thoth-worker
  - Writes: listed docs only
  - Interface boundaries: none
  - Focused check and PASS evidence: `rg model_profiles` shows only historical CHANGELOG mentions
  - Return milestone: docs diff ready
  - Stop / reassessment: none
- [x] AC-7: Local closeout gate
  - Outcome: focused tests, `pnpm run check:ci`, `pnpm run typecheck` pass
  - Known entrypoints and skill paths: `docs/agent/testing.md`
  - Inputs: all units
  - Dependencies: all units
  - Output: check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: commands exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failures reported

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
**Reviewed record SHA-256**: 91832d11c89cb300a23e7bc878a2985580b45cc68323b6ec25fa4e14404897ac

Round 1 fresh Oracle returned FAIL (dangling global-active resolved through a project-only profile); fixed in store.ts/editor.ts with regression tests; round 2 fresh Oracle PASS below.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The prior global-reference blocker is fixed; AC-1 through AC-7, accepted implementation additions and canonical shell requirements are satisfied.",
  "evidence": [
    {
      "id": "baseline",
      "kind": "integrity",
      "locator": ".thoth/changes/pi-subagent-model-profiles/pi-subagent-model-profiles.md",
      "claim": "Independently recomputed prefix SHA-256 matches 91832d11c89cb300a23e7bc878a2985580b45cc68323b6ec25fa4e14404897ac. The verify validator returned valid:true.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "specs",
      "kind": "contract-review",
      "locator": ".thoth/specs/pi-ecosystem/spec.md; .thoth/specs/multi-harness-agent-pack/spec.md:437",
      "claim": "Pi-ecosystem digest matches recorded 9cbd2db71a87baccc92160b56f435251fa6c94e68db63b6a62d170a8ff593211. The ADDED named-profile delta does not duplicate existing requirements; the required shared list-editor shell remains composed with the sidebar.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac1",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/store.ts; test/model-profiles/store.test.ts",
      "claim": "AC-1: versioned independent storage honors agentDir/environment paths, preserves unrelated fields, uses same-directory temp/rename writes, cleans failed-write temps and refuses malformed-file overwrites.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac2",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/profile-resolver.ts; src/manager.ts; src/runner/sdk-runner.ts; test/profile-resolver.test.ts",
      "claim": "AC-2: selection precedence, local shadowing, virtual default, field-level fallback, warning propagation and task-start capture are implemented. Legacy model_profiles parsing/writing is removed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "regression",
      "kind": "source-and-regression-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/store.ts:237-267; src/model-profiles/editor.ts:197-216; test/model-profiles/{store,ui}.test.ts",
      "claim": "A dangling global-active name cannot resolve through a project-only profile: store warns and falls back, and panel effective() agrees. Valid global profiles still permit local shadowing; session selections and project pins can still reference project-only profiles. These regression tests passed freshly.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac3",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/session.ts; src/extension/subagents-extension.ts; test/model-profiles/{session,extension-session,manager-session}.test.ts",
      "claim": "AC-3: custom session entries restore selection on session_start; clearing persists a tombstone. New runs and continuations consume current selection without configuration writes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac4",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/{command,formatting}.ts; test/model-profiles/ui.test.ts",
      "claim": "AC-4: shared-shell panel supplies sidebar at width 90, narrow stacking, scope/shadow/active markers, effective agent values and required browsing/edit/activation keys. Bare g is intercepted before shell Home handling.",
      "basis": "observed",
      "uncertainty": "Verified through render/input tests, not a live Pi terminal."
    },
    {
      "id": "ac5",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/{editor,command}.ts; test/model-profiles/ui.test.ts",
      "claim": "AC-5: default protection, draft-until-save creation/cloning, self-contained saves, scope choice, pointer-following rename, confirmed deletion, dirty-close confirmation and bounded fallbacks are implemented. Accepted toggle, reset, m/e and draft-activation rules are retained.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac6",
      "kind": "documentation-diff",
      "locator": "pi-packages/pi-subagents/README.md; pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md; docs/installation.md; docs/agent/harness-packaging.md",
      "claim": "AC-6: all four documents describe named profiles, paths, precedence and keys. Remaining model_profiles mentions mark obsolete behavior, test its removal or preserve historical changelog entries; no active legacy guidance remains.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac7",
      "kind": "fresh-execution",
      "locator": "pi-packages/pi-subagents and repository-root validation commands",
      "claim": "AC-7: full package Vitest passed 80 files, 1486 tests, with 1 skipped. Package tsc --noEmit -p ., root check:ci and root typecheck succeeded. Biome reported 677 warnings and 5 informational diagnostics, without errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "freshness",
      "kind": "diff-and-integrity",
      "locator": "git diff; git ls-files --others --exclude-standard; git diff --check",
      "claim": "Reviewed 34 modified tracked files and 9 untracked files. Changed-input aggregate SHA-256 stayed e1222644e68b83f5a36e7cab27733f4ab16ca936f20b81ad986884781dffc022 across verification; diff-check exited 0. No workspace edits were made.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record integrity and canonical contracts",
      "method": "Independent byte-prefix/spec hashing, installed verify validator and semantic baseline review",
      "outcome": "pass",
      "evidenceIds": ["baseline", "specs", "freshness"],
      "reason": "Expected hashes match; declared delta and shared-shell contract are coherent."
    },
    {
      "check": "AC-1",
      "method": "Storage source review and freshly executed store tests",
      "outcome": "pass",
      "evidenceIds": ["ac1", "ac7"],
      "reason": "Persistence and malformed-file protections satisfy the contract."
    },
    {
      "check": "AC-2 and prior blocker",
      "method": "Resolution/caller review and fresh regression, resolver, manager, list-agents and runner tests",
      "outcome": "pass",
      "evidenceIds": ["ac2", "regression", "ac7"],
      "reason": "Invalid global references fall back with warning; legitimate shadowing and more-specific selection remain intact."
    },
    {
      "check": "AC-3",
      "method": "Session-entry, extension restore and run/continuation tests",
      "outcome": "pass",
      "evidenceIds": ["ac3", "ac7"],
      "reason": "Selection and clearing survive restore without config writes."
    },
    {
      "check": "AC-4",
      "method": "Shared-shell composition review and wide/narrow rendering/key tests",
      "outcome": "pass",
      "evidenceIds": ["ac4", "specs", "ac7"],
      "reason": "Required layout, markers and interactions are covered."
    },
    {
      "check": "AC-5 and accepted additions",
      "method": "Workspace/command review and lifecycle/fallback tests",
      "outcome": "pass",
      "evidenceIds": ["ac5", "ac7"],
      "reason": "Draft, save, protection, confirmation and pointer semantics satisfy the accepted decisions."
    },
    {
      "check": "AC-6",
      "method": "All four documentation diffs and scoped legacy-guidance scan",
      "outcome": "pass",
      "evidenceIds": ["ac6"],
      "reason": "Current guidance matches implementation."
    },
    {
      "check": "AC-7: full package tests",
      "method": "pi-packages/pi-subagents: pnpm exec vitest run",
      "outcome": "pass",
      "evidenceIds": ["ac7", "freshness"],
      "reason": "80 files passed; 1486 tests passed, 1 skipped."
    },
    {
      "check": "AC-7: package typecheck",
      "method": "pi-packages/pi-subagents: pnpm exec tsc --noEmit -p .",
      "outcome": "pass",
      "evidenceIds": ["ac7", "freshness"],
      "reason": "Completed without diagnostics."
    },
    {
      "check": "AC-7: root checks",
      "method": "pnpm run check:ci; pnpm run typecheck",
      "outcome": "pass",
      "evidenceIds": ["ac7", "freshness"],
      "reason": "Both succeeded; lint warnings are non-fatal."
    }
  ],
  "risks": [
    {
      "description": "Live Pi terminal interaction was not exercised; overlay confidence rests on source review and automated rendering/input tests.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["ac4", "ac5", "ac7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record fresh PASS evidence including the updated test count, then run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagent-model-profiles/pi-subagent-model-profiles.md",
    "reviewedRecordSha256": "91832d11c89cb300a23e7bc878a2985580b45cc68323b6ec25fa4e14404897ac"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | store tests (atomic rename, malformed preservation, unknown fields, reserved default) | Oracle ac1; package vitest exit 0
- AC-2: PASS | profile-resolver, manager, list-agents, runner suites + dangling-global regression | Oracle ac2, regression
- AC-3: PASS | session, extension-session, manager-session tests | Oracle ac3
- AC-4: PASS | test/model-profiles/ui.test.ts wide/narrow render and keys | Oracle ac4
- AC-5: PASS | test/model-profiles/ui.test.ts lifecycle tests | Oracle ac5
- AC-6: PASS | docs diff + model_profiles scan | Oracle ac6
- AC-7: PASS | package vitest 80 files/1486 passed/1 skipped; package tsc 0; root check:ci 0; root typecheck 0 | Oracle ac7
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:9cbd2db71a87baccc92160b56f435251fa6c94e68db63b6a62d170a8ff593211

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
