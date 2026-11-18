# Change: subagents-model-fallback-ui

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

Paths below are relative to `pi-packages/pi-subagents/`.

- `/subagents-model` is registered in `src/extension/subagents-extension.ts:619-640`, which calls `runSubagentModelsCommand`. The overlay is `src/model-profiles/command.ts`: `createSubagentModelProfilesModal:200`, overview `:722-812`, provider/model/effort pickers `:369-519`, and keys Enter/`m`/`e`/`s` at `:793-809`. Supporting modules are `src/model-profiles/data.ts` (`AgentRow:20-28`, defaults `:106-119`), `editor.ts` (workspace) and `formatting.ts`. The shared shell is `pi-core/src/panel-list-editor.ts`, which consumes navigation and filter keys before `onAction`, and `openPicker` holds one picker, not a stack (`command.ts:133-141`).
- `SubagentModelProfile { model?; fallback_models?: ModelRef[]; effort? }` (`src/types.ts:34-40`). The store parses and serializes `fallback_models` (`src/model-profiles/store.ts:54-83,122-135`).
- Gap: the UI shows and edits only model and effort. `AgentRow`, `AgentEdit` (`editor.ts:39-43`), cloning (`:48-52`), the dirty signature (`:68-84`), editing (`:318-330`) and `valuesFor` (`:212-217`) all omit fallbacks. Reload clones persisted entries (`:157-158`) and save writes those clones (`:378-386`). `ModelProfileStore.save` (`store.ts:196-208`) merges previous agent fields back, deleting only `model`/`effort`. As a result, an in-place save of a retained agent keeps the old chain, while drafts and clones built from the workspace (new profile from default/another profile) lose `fallback_models`. Separately, parsing drops empty lists (`store.ts:62-83`), so a "clear" cannot persist through the current merge: the old chain is resurrected whenever the agent entry retains model or effort.
- Runtime chain resolution lives in `src/profile-resolver.ts:79-100`: it takes the first non-empty list from profile → agent definition → `subagents.json` default, then dedups and removes the primary. An empty array means inherit. The chain helper does not return provenance.
- Tests: `test/model-profiles/ui.test.ts` covers the overlay. Supporting tests are `test/model-profiles/{store,formatting,...}.test.ts` and `pi-core/test/panel-list-editor.test.ts`. There are no snapshot tests for this command.

## Intent

`/subagents-model` shows each subagent's effective fallback chain with its source and lets the user edit the selected profile's per-agent `fallback_models` list. Saving never loses fallback chains.

## Non-goals

- No way to explicitly disable inherited fallbacks. An empty profile list keeps meaning "inherit", consistent with runtime.
- No changes to runtime fallback execution (`src/manager.ts`, `src/model-fallback.ts`) or to the resolution order.
- No editing of agent frontmatter or `subagents.json` `default_fallback_models`.
- No fallback chains for the root orchestrator.
- No OpenCode `/subagents-model` port changes.

## Acceptance

- AC-1: Loading a profile whose entries carry `fallback_models` and saving it through the `/subagents-model` workspace persists those `fallback_models` unchanged, whether the save is in place (with or without unrelated model/effort edits) or a new draft/clone created from that profile. A test proves the draft/clone path no longer drops them. `ModelProfileStore.save` treats `fallback_models` as an editable field: the saved entry's value (including absence) replaces the previous one instead of being merged back. A test proves clear → save → reload on an agent that keeps an effort override yields no profile `fallback_models`.
- AC-2: The overview shows, per agent row, the effective fallback chain (profile entry, else agent definition, else `subagents.json` default; deduped and excluding the primary, matching `profile-resolver` semantics) with a source marker (`profile`/`agent`/`default`), or nothing when no chain applies. The selected-row footer lists the full ordered chain. Wide and narrow layouts stay within width.
- AC-3: Pressing `f` (case-insensitive, consistent with existing key handling) on an agent row opens a fallback-list editor for that agent in the current profile draft. `a` appends a model chosen through the existing provider/model picker (returning to the fallback editor, not the overview), `d` deletes the selected entry, `[`/`]` move it up/down, `c` clears the profile list (inherit), and Esc/q returns to the overview. The read-only virtual `default` profile follows the same restrictions the UI already applies to model/effort edits.
- AC-4: Fallback edits mark the workspace dirty, are included in the dirty signature and reset/revert behavior, and are persisted on `s` as `fallback_models` strings. A cleared list is omitted from the entry, so inheritance applies. The overview reflects the new effective chain immediately.
- AC-5: The key legend/help shows `f` for fallbacks. Existing `/subagents-model` behavior and tests keep passing. Focused pi-subagents model-profiles tests, the package typecheck, `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- Scope chosen by the user: display + edit + fix the save data loss.
- UX accepted by the user: overview chain with source marker and full chain in the footer; `f` opens the list editor with `a`/`d`/`[`/`]`/`c`; an empty list means inherit, with no disable option; save always preserves fallbacks.

## Decisions

- Effective-chain display reuses `profile-resolver` semantics. If provenance is needed, add a small exported helper next to the existing chain helper rather than duplicating precedence logic in the UI.
- The fallback editor is a distinct overlay mode inside `command.ts`. Adding a fallback reuses the existing provider/model picker through a callback target, so the picker result appends to the fallback list instead of replacing the primary model, and closing the picker returns to the fallback editor.
- Duplicates of the primary model or of existing entries are not added: append is a no-op or the picker hides them. This mirrors runtime dedup.
- Ownership per the constitution: worker owns the data/workspace/store layer and its tests; designer owns the overlay UI (overview rendering, fallback editor interaction, legend) and `ui.test.ts`, consuming the worker's accepted workspace API.
- The fallback editor uses an unfiltered list so `a`/`d`/`[`/`]`/`c` reach `onAction`. The provider/model picker handlers reopen the fallback editor on selection or Escape through explicit return callbacks, with no picker stack and no pi-core change.
- Keys are chosen so they do not collide with `panel-list-editor` navigation/filter consumption. If `[`/`]` are consumed by the shell's filter, the implementer may substitute `K`/`J` (shift) and must report the substitution.

## Durable deltas

- `ADDED pi-ecosystem` **Pi /subagents-model fallback chain editing** — Pi `/subagents-model` MUST show each subagent's effective fallback chain with its source (profile, agent, default), MUST let the user append, delete, reorder and clear the selected profile's per-agent `fallback_models` (a cleared list means inherit), and MUST preserve existing `fallback_models` when saving a profile.
  - GIVEN a profile whose worker entry has `fallback_models: ["anthropic/claude-sonnet-5-5"]`; WHEN the user changes only the worker effort in `/subagents-model` and saves; THEN the saved worker entry still lists `anthropic/claude-sonnet-5-5`, and the overview shows that chain marked as coming from the profile .

## Plan

1. Worker, test-first. Data/workspace/store (`src/model-profiles/data.ts`, `editor.ts`, `store.ts`, plus `src/profile-resolver.ts` if a provenance helper is needed):
   - Carry `fallback_models` through `AgentEdit`, cloning, the dirty signature, `valuesFor`, reset and save.
   - In `ModelProfileStore.save`, treat `fallback_models` as an editable field like `model`/`effort`, so the saved entry's value or absence replaces the previous one.
   - Expose the effective chain plus source per `AgentRow`.
   - Add edit operations (append/remove/move/clear) to the workspace API.
   - Tests in `test/model-profiles/` store/workspace files (not `ui.test.ts`): draft/clone preservation, in-place preservation, clear → save → reload with retained effort, dirty/reset, effective chain and source.
2. Designer, after the worker's handoff is accepted. UI (`src/model-profiles/command.ts`, `formatting.ts`, `test/model-profiles/ui.test.ts`):
   - Render the chain and source in overview rows (truncated to width) and the full chain in the selected footer.
   - Add the fallback-editor mode (an unfiltered list) with `f`/`a`/`d`/`[`/`]`/`c`/Esc. The picker handlers reopen the fallback editor via explicit callbacks.
   - Update the legend and the README `/subagents-model` section.
   - UI tests for wide/narrow layouts, key flows, and edit → save → persisted contents.

Focused verification: `pnpm vitest run pi-packages/pi-subagents/test/model-profiles` (or the package's equivalent test command), the pi-subagents typecheck, `pnpm run check:ci`, `pnpm run typecheck`.

## Tasks

- [x] AC-1: Fallback chains survive workspace/store load, edit, save, clone and clear; workspace exposes fallback edit ops and effective chain with source
  - Outcome: data/workspace/store layer carries, edits and persists `fallback_models` (clear → omitted, not resurrected) and provides effective chain + source per agent row
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/model-profiles/{data,editor,store}.ts (store save merge :196-208, parse :62-83), src/profile-resolver.ts:79-100, src/types.ts:34-40; installed `tdd` skill
  - Inputs: Exploration anchors; accepted UX in Clarifications; Decisions
  - Dependencies: none
  - Output: code + failing-then-passing tests: draft/clone preservation, in-place preservation, clear→save→reload with retained effort, edit ops, dirty/reset, effective chain/source; documented workspace API for the designer
  - Owner: worker
  - Writes: pi-packages/pi-subagents/src/model-profiles/{data,editor,store}.ts, src/profile-resolver.ts (exported helper only), test/model-profiles/ store/workspace test files (not ui.test.ts)
  - Interface boundaries: profiles.json string format unchanged; runtime resolution order unchanged; command.ts untouched except compile-required signature adaptations (report them)
  - Focused check and PASS evidence: model-profiles tests pass; new regression tests fail on pre-change code
  - Return milestone: data layer and tests green, API summary returned
  - Stop / reassessment: provenance requires changing resolver behavior, or store format must change
- [x] AC-2: Overview renders effective chain and source in rows and footer, in wide and narrow layouts
  - Outcome: visible chain in overview
  - Known entrypoints and skill paths: src/model-profiles/command.ts (:632-662, :722-812), formatting.ts
  - Inputs: accepted AC-1 workspace API
  - Dependencies: AC-1 data/workspace unit accepted
  - Output: rendering code + ui tests
  - Owner: designer
  - Writes: src/model-profiles/{command,formatting}.ts, test/model-profiles/ui.test.ts
  - Interface boundaries: pi-core panel-list-editor unchanged
  - Focused check and PASS evidence: ui.test.ts wide/narrow cases pass; lines never exceed width
  - Return milestone: together with AC-3/AC-4/AC-5 in one designer pass
  - Stop / reassessment: required changes in pi-core shell or in the AC-1 API
- [x] AC-3: `f` fallback editor with append-via-picker, delete, reorder, clear, Esc
  - Outcome: interactive list editing in an unfiltered list; picker handlers return to the fallback editor via explicit callbacks
  - Known entrypoints and skill paths: src/model-profiles/command.ts (pickers :369-519, keys :793-809, openPicker :133-141); pi-packages/pi-core/src/panel-list-editor.ts:133-147,217-256 (read)
  - Inputs: accepted AC-1 workspace API; accepted key map
  - Dependencies: AC-1 data/workspace unit accepted
  - Output: editor mode + ui tests of key flows
  - Owner: designer
  - Writes: src/model-profiles/command.ts, test/model-profiles/ui.test.ts
  - Interface boundaries: existing m/e/s/g behavior unchanged
  - Focused check and PASS evidence: ui tests for each key flow pass
  - Return milestone: same designer pass
  - Stop / reassessment: key collisions needing a key set beyond the K/J substitution
- [x] AC-4: Fallback edits through the UI are dirty-tracked, reset/revertible, saved, and reflected immediately
  - Outcome: end-to-end edit→save via UI
  - Known entrypoints and skill paths: src/model-profiles/command.ts
  - Inputs: accepted AC-1 API
  - Dependencies: AC-1 data/workspace unit accepted
  - Output: ui test editing + clearing + saving + reloading asserting persisted contents
  - Owner: designer
  - Writes: src/model-profiles/command.ts, test/model-profiles/ui.test.ts
  - Interface boundaries: profiles.json format
  - Focused check and PASS evidence: ui test asserts persisted file contents
  - Return milestone: same designer pass
  - Stop / reassessment: none expected
- [x] AC-5: Legend shows `f`, README updated, full local closeout checks pass
  - Outcome: docs/legend and green gates
  - Known entrypoints and skill paths: src/model-profiles/command.ts legend, pi-packages/pi-subagents/README.md
  - Inputs: AC-2..AC-4
  - Dependencies: AC-1 accepted; same designer pass as AC-2..AC-4
  - Output: legend/README edits; command outputs
  - Owner: designer
  - Writes: src/model-profiles/command.ts, pi-packages/pi-subagents/README.md
  - Interface boundaries: none
  - Focused check and PASS evidence: model-profiles tests, pi-subagents typecheck, `pnpm run check:ci`, `pnpm run typecheck` all exit 0
  - Return milestone: final designer report
  - Stop / reassessment: unrelated environment failures reported, not fixed
- [x] AC-2: Repair after final-verification FAIL: every agent row shows source marker plus a width-bounded chain preview at mid/narrow widths, and the selected footer wraps so the full chain stays readable
  - Outcome: no loss of chain/source information at any width
  - Known entrypoints and skill paths: src/model-profiles/command.ts:789-801, :954-961; pi-core/src/panel-primitives.ts:50-55 (read)
  - Inputs: Oracle FAIL risks (row at 100 cols shows only `+N`; footer truncated to one row)
  - Dependencies: AC-2..AC-5 designer pass
  - Output: rendering fix + ui tests asserting unselected-row source/preview at mid and narrow widths and the last chain model readable in the footer
  - Owner: designer
  - Writes: src/model-profiles/{command,formatting}.ts, test/model-profiles/ui.test.ts
  - Interface boundaries: pi-core unchanged
  - Focused check and PASS evidence: model-profiles tests, typechecks, check:ci exit 0
  - Return milestone: repair report
  - Stop / reassessment: needs pi-core changes
- [x] AC-2: Second repair after final-verification FAIL: 60-column breakpoint keeps model characters in the row preview; oversized model IDs wrap by visible cells in the footer; footer lines beyond the available height are not silently lost (overflow indicator and full chain reachable via the `f` editor); README updated
  - Outcome: no chain/source information silently lost at any width or height
  - Known entrypoints and skill paths: src/model-profiles/command.ts:762-825,906,979-986; pi-core/src/panel-list-editor.ts:363-367 (read); README.md:866
  - Inputs: second Oracle FAIL risks
  - Dependencies: first AC-2 repair
  - Output: rendering fix + tests at the 60-column breakpoint, long single ID at 50 columns, and bounded height
  - Owner: designer
  - Writes: src/model-profiles/command.ts, test/model-profiles/ui.test.ts, README.md
  - Interface boundaries: pi-core unchanged
  - Focused check and PASS evidence: model-profiles tests, typechecks, check:ci exit 0
  - Return milestone: repair report
  - Stop / reassessment: needs pi-core changes
- [x] AC-2: Third repair after final-verification FAIL: `f` editor rows middle-truncate model IDs so distinguishing suffixes stay visible; Enter/`v` on a row opens a read-only detail view with the full wrapped ID; `f` on the virtual default profile opens a read-only chain viewer
  - Outcome: every model of the selected agent's chain is distinguishable and fully readable at constrained sizes (e.g. 50×14), on every profile including default
  - Known entrypoints and skill paths: src/model-profiles/command.ts:555-618,668-695; pi-core/src/panel-list-editor.ts:328-367 (read)
  - Inputs: third Oracle FAIL risk (user chose one more repair round)
  - Dependencies: second AC-2 repair
  - Output: rendering/interaction fix + tests: 50×14 with 12 common-prefix IDs, every suffix reachable; detail view; read-only default viewer
  - Owner: designer
  - Writes: src/model-profiles/command.ts, test/model-profiles/ui.test.ts, README.md
  - Interface boundaries: pi-core unchanged
  - Focused check and PASS evidence: model-profiles tests, typechecks, check:ci exit 0
  - Return milestone: repair report
  - Stop / reassessment: needs pi-core changes
- [x] AC-2: Fourth repair after final-verification FAIL: the `f` editor and detail view keep the raw explicit list editable but mark entries equal to the primary model (or duplicates) as skipped, and number the remaining entries by effective ordinal/count matching runtime resolution
  - Outcome: the advertised detail path shows the same sequence the runtime will try
  - Known entrypoints and skill paths: src/model-profiles/command.ts:584-676; src/profile-resolver.ts:79-115 (read)
  - Inputs: fourth Oracle FAIL risk
  - Dependencies: third AC-2 repair
  - Output: fix + tests: 50×14 fixture with primary inside the explicit chain, plus primary changed after fallbacks were saved
  - Owner: designer
  - Writes: src/model-profiles/command.ts, test/model-profiles/ui.test.ts, README.md if wording changes
  - Interface boundaries: pi-core and runtime resolver unchanged
  - Focused check and PASS evidence: model-profiles tests, typechecks, check:ci exit 0
  - Return milestone: repair report
  - Stop / reassessment: needs resolver or store change

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

User authorized implementation in the dedicated Orca worktree `C:/Users/EremesNG/orca/workspaces/thoth-agents/subagents-model-fallback-ui` (branch `subagents-model-fallback-ui`) so it stays separate from another agent's work in the main checkout.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: be2b0ec846627cdbbda6f458f1184b3af34508bb7bb47ccbfc694aad21794d7f

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1–AC-5 and the durable delta are satisfied. The latest repair correctly distinguishes skipped entries and effective ordinals without changing runtime fallback behavior.",
  "evidence": [
    {
      "id": "E1",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/editor.ts:62-107,235-251,352-449,497-518; store.ts:196-209; test/model-profiles/workspace.test.ts",
      "claim": "Fallback lists survive load, unrelated edits, clone and save; clearing removes the override; order and edits participate in dirty tracking and reversion.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/model-profiles/command.ts:543-775,884-1055,1140-1240; test/model-profiles/ui.test.ts:1197-1716",
      "claim": "Rows show effective-chain source and previews. Wrapped footers and scrollable list/detail views make the full ordered effective chain readable. Primary/duplicate entries are explicitly skipped; remaining ordinals match resolution. Editing, picker return, default protection, persistence and f/F handling are covered.",
      "basis": "observed",
      "uncertainty": "Verified through headless rendering/input tests, including widths 40–220 and 50×14; no live terminal session."
    },
    {
      "id": "E3",
      "kind": "runtime-equivalence",
      "locator": "pi-packages/pi-subagents/src/profile-resolver.ts:79-138; base 2b346b6a; foreground in-memory comparison",
      "claim": "21,956 byte-for-byte JSON comparisons of complete effective/default profiles matched the base implementation, covering precedence, empty/all-filtered lists, primary removal and duplicates. manager.ts and model-fallback.ts are unchanged.",
      "basis": "observed",
      "uncertainty": "Finite generated cases plus source inspection; comparison isolated resolver imports with an empty-store stub."
    },
    {
      "id": "E4",
      "kind": "execution",
      "locator": "Foreground checks in C:/Users/EremesNG/orca/workspaces/thoth-agents/subagents-model-fallback-ui",
      "claim": "165 model-profile/resolver tests and 136 manager/fallback tests passed. Package/root typechecks, check:ci, verify validator and diff whitespace checks passed. Reviewed file hashes remained unchanged.",
      "basis": "observed",
      "uncertainty": "Biome exited successfully with 850 warnings and 29 informational diagnostics."
    },
    {
      "id": "E5",
      "kind": "governance",
      "locator": ".thoth/changes/subagents-model-fallback-ui/subagents-model-fallback-ui.md; .thoth/specs/pi-ecosystem/spec.md",
      "claim": "Reviewed the complete diff and untracked workspace test against acceptance and durable delta. Canonical source digest matches; the added UI capability complements the existing runtime fallback requirement.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1–AC-5",
      "method": "Full diff inspection and pnpm --filter @thoth-agents/pi-subagents test test/model-profiles test/profile-resolver.test.ts",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E4"],
      "reason": "165 tests passed, including the untracked workspace regressions."
    },
    {
      "check": "Runtime fallback preservation",
      "method": "Base/current equivalence comparison; package tests for manager-model-fallback, manager, manager-persistence and runner/fallback-real-sdk",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "All comparisons matched; 136 tests passed."
    },
    {
      "check": "Static gates",
      "method": "pnpm --filter @thoth-agents/pi-subagents run typecheck; pnpm run typecheck; pnpm run check:ci",
      "outcome": "pass",
      "evidenceIds": ["E4"],
      "reason": "All exited 0."
    },
    {
      "check": "Durable delta, record and freshness",
      "method": "node skills/thoth-sdd/scripts/validate.mjs --change .thoth/changes/subagents-model-fallback-ui --through verify --json; source review; SHA-256 checks; git diff --check",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Validator valid with no errors; reviewed inputs unchanged."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "root: record the verified result and perform closeout/archive gates",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/subagents-model-fallback-ui/subagents-model-fallback-ui.md",
    "reviewedRecordSha256": "be2b0ec846627cdbbda6f458f1184b3af34508bb7bb47ccbfc694aad21794d7f"
  }
}
```

Fifth fresh Oracle after four AC-2 FAIL rounds; envelope validated via compact fallback (recordDigest match).

- AC-1: PASS | workspace/store tests (clone, in-place, clear-save-reload) | 165 model-profiles/resolver tests pass (E1)
- AC-2: PASS | width sweep 40-220, 50x14 editor/detail, skipped/ordinal tests | ui tests pass; resolver equivalence 21,956 comparisons (E2,E3)
- AC-3: PASS | ui key-flow tests | f/a/d/[/]/c/Esc/Enter/v covered (E2)
- AC-4: PASS | dirty/revert/save/reload tests | persisted profiles.json asserted (E1,E2)
- AC-5: PASS | legend/README and gates | package/root typecheck, check:ci exit 0, 136 manager/fallback tests (E4)
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:652707b3a879a65e0481c7450392a1f33d6d1f2b5e10f3a1b7be07b55a15da47

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
