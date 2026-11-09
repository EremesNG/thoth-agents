# Change: theme-settings-panel

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

Paths are relative to the repository root; `T` = `pi-packages/pi-thoth-theme`, `S` = `pi-packages/pi-sidebar`, `C` = `pi-packages/pi-core`.

- Sidebar settings: `S/src/settings.ts:95` builds the panel with `createListEditor` and opens it via `openPanelOverlay` (`:176`); rows `:61-94` (checkbox rows with dirty markers, enums, numeric width); keys `:124-171` (Space toggle, ←/→ cycle enums, Enter/`s` save, Esc/q cancel); command `/sidebar settings` routed at `S/src/session.ts:409`, save-then-apply at `:457-473`; atomic config write `S/src/config.ts:77-90`. Generic pieces live in `C/src/panel-list-editor.ts` (overview/picker, filter, dirty/save/error state, navigation `:230-256`) and `C/src/panel-host.ts:42-96` (overlay ownership, sizing, mouse cleanup).
- `/subagents-tools` add-by-pattern (`pi-packages/pi-subagents/src/tools-panel/panel.ts`): picker key `a` opens a local pi-tui `Input` (`:140-142`, prompt `tool: `), Enter confirms trimmed text, Esc cancels, Ctrl+u clears, empty closes (`:257-296`); validation of the whole list shows errors in the input frame (`:280-291`; rules `frontmatter.ts:181-206`: nonempty, no whitespace/comma, duplicates rejected); `d`/Delete removes manual entries only (`:145-151`); Space toggles known exact rows (`:153-158`); manual rows show match counts (`:78-98`). Only `*` is a wildcard (`src/tool-patterns.ts:1-17`). This interaction is package-local, not a pi-core primitive.
- Theme config: `T/src/shared/config.ts:14-39` types, `:76-82` path, `:121-151` forgiving load; only persistence API is `saveAnimationLevel` (`:90-119`: rereads disk, preserves unknown fields, rejects malformed JSON, exclusive temp + rename). Loaded once into a shared object at `T/src/index.ts:18-20`.
- `/thoth-animation`: `T/src/animation.ts:49` (command), live apply `:24-46,75-88` (saves, mutates `config.animation`, updates the pi-core clock and native indicator); tests `T/src/index.test.ts:93,95,118-300`; README `T/README.md:140-141,205`; spec requirement "Animation intensity" names it.
- Live boundaries: animation is live. Icons are partly live: captured at factory creation in `T/src/tools/read.ts:61`, `bash.ts:107`, `generic.ts:96-99`, render kit `T/src/render-kit/index.ts:295-306`, codemode fallback kit `T/src/tools/codemode.ts:100`; status-line cache key omits icon mode (`T/src/status-line/index.ts:291-304`); welcome caches its render (`T/src/welcome/index.ts:40-45,58-59`, has invalidate). Density: most built-ins read `collapsedDensity(config, …)` per render (`T/src/tools/compact-tool.ts:29-35`) but bash/PowerShell (`bash.ts:108`), generic (`generic.ts:99`) and the kit (`render-kit/index.ts:298-323`) capture it. Module enablement (`tools.enabled`, `statusLine`, `inputBox`, `welcome`) and `respectPackages` (matcher built once at `T/src/tools/index.ts:49-52`) are init-only.
- Caches (from plan review round 1): theme component caches key only on width (`T/src/shared/cache.ts:3-24`); render-kit producer memos key on width and kit identity (`C/src/render-kit.ts:560-580`, used e.g. at `pi-packages/pi-todo/view/format.ts:425,498`); some density/glyph values are captured when a component is created (`T/src/tools/read.ts:69-84`, `T/src/tools/compact-tool.ts:39-96`); closing an overlay requests a render but does not invalidate mounted components (Pi `interactive-mode.js:2380-2411`). Per-render config reads alone therefore do not refresh mounted cards.
- Tests: sidebar `S/test/settings.test.ts`; theme `T/src/shared/config.test.ts`, `T/src/index.test.ts`, `T/test/config.test.ts`; core `C/test/panel-list-editor.test.ts`, `panel-host.test.ts`.

## Intent

Add a `/thoth-theme` settings panel, modeled on the sidebar settings panel, that edits the pi-thoth-theme settings icons, animation, tool density and module enablement and persists them to `pi-thoth-theme.json`. Animation, icons and tool density apply immediately, including already-mounted tool cards; module toggles are saved and take effect after `/reload`, which the panel marks and announces. `tools.respectPackages` stays JSON-only. `/thoth-animation` is removed.

## Non-goals

- No hot mounting/unmounting of the status line, input box, welcome header or tool renderers.
- No `tools.respectPackages` editing in the panel (JSON only); the panel preserves it untouched when saving.
- No change to pi-subagents or the package-ownership matcher.
- No new config keys; no package version bumps; CHANGELOG history untouched.

## Acceptance

- AC-1: A general atomic config save in the theme persists any combination of settings, preserving unknown fields and rejecting malformed files, with the same guarantees as today's animation save; `saveAnimationLevel` behavior is subsumed without regressions.
- AC-2: After a saved change, icon mode and tool density take effect on the next render everywhere they are used without `/reload`, including tool cards already mounted at the same width: all theme tool renderers, render-kit cards from kit producers (pi-todo, pi-subagents), codemode, status line, input box and welcome; animation keeps its current live behavior.
- AC-3: `/thoth-theme` opens an overlay panel built on pi-core `createListEditor` + `openPanelOverlay` with rows for icons (`nerd|unicode|ascii`), animation (`full|reduced|minimal|off`), tool density (`frame|compact|line`) as ←/→ enums, and module toggles (status line, input box, tools, welcome) as Space checkboxes marked as requiring `/reload`; dirty markers, Enter/`s` save, Esc/q cancel, errors shown; requires TUI mode like `/sidebar settings`.
- AC-4: Saving persists first, then applies live settings immediately and, if any reload-only setting changed, notifies the user to run `/reload`; a failed save leaves the in-memory config unchanged and shows the error.
- AC-5: `/thoth-animation` no longer exists (command, tests, README); README documents `/thoth-theme`, its keys, live vs reload settings; the canonical spec reflects the deltas below.

## Clarifications

- User chose: animation, icons and density live; modules and respectPackages after `/reload`.
- User first chose respectPackages in the panel; after plan review showed its pattern grammar was unsettled, the user dropped it: respectPackages stays JSON-only for now.
- User chose: `/thoth-animation` disappears once the panel exists.

## Decisions

- Reuse pi-core `createListEditor`/`openPanelOverlay` and mirror the sidebar's draft/apply structure.
- Live icons/density mechanism: a theme-owned settings revision counter, incremented by `applyLiveSettings`, is part of every theme component cache key (`T/src/shared/cache.ts` and any width-only caches); density and glyphs are resolved inside render, not at component creation; `applyLiveSettings` republishes the render kit as a new kit object (withdraw own registration, register a fresh kit built from the live config) so producer memos keyed on kit identity miss, invalidates welcome/status-line/input-box caches, and requests a render.
- The panel reuses only pi-core primitives (no pi-subagents code).
- Reload-only settings are marked in their row label and listed in the post-save notification.
- Ownership: config persistence and live-read plumbing are nonvisual (worker); the panel UI and docs are visual/UX (designer).

## Durable deltas

- `ADDED pi-ecosystem` **Thoth theme settings panel** — `@thoth-agents/pi-thoth-theme` MUST provide a `/thoth-theme` settings panel built on the pi-core list editor and panel overlay that edits icons, animation, tool density and module enablement, persists them atomically to `pi-thoth-theme.json` preserving unknown fields and other settings, applies animation, icons and tool density immediately including to already-mounted tool cards and render-kit producer cards, and marks module enablement as taking effect after `/reload`, notifying the user when such a setting changed.
  - GIVEN the panel open with icons `nerd` and density `frame` and a bash card already shown; WHEN the user sets icons to `unicode`, density to `line`, disables the welcome header and saves; THEN the file holds the three changes, the shown bash card re-renders as a unicode one-row card without `/reload`, and the user is told that the welcome change applies after `/reload` .
- `MODIFIED pi-ecosystem` **Animation intensity** — `@thoth-agents/pi-thoth-theme` MUST offer an `animation` setting in `pi-thoth-theme.json` with the levels `full`, `reduced`, `minimal` and `off`, defaulting to `full` when missing or malformed, changeable at runtime through the `/thoth-theme` settings panel and persisted. Levels MUST select which effects animate, never their speed: `full` animates continuous effects (input-border breathing and label shimmer), secondary running indicators (sidebar and work-panel rows, tool card footers, foreground subagent progress, AskCodex and AskAntigravity cards) and the primary working indicator (the input-box working glyph and the native Pi working indicator); `reduced` animates the secondary and primary indicators; `minimal` animates only the primary working indicator; `off` animates nothing. `@thoth-agents/pi-core` MUST drive first-party periodic animation through one shared clock ticking every 100 ms while an enabled effect is subscribed and not at all otherwise, and every enabled glyph or effect MUST advance by exactly one frame or step per fixed number of ticks derived from its intended cadence rather than from wall-clock time or per emission, so it keeps the same speed and frame order at every level that enables it; the theme-configured native Pi working indicator is the exception and MUST use Pi's loader at 200 ms at `full`, `reduced` and `minimal`. A disabled effect MUST be static without a clock subscription: disabled running indicators and tool footers show the mode-aware static running glyph, disabled continuous effects render in their active working colours rather than a dimmed phase, at `off` the native working indicator shows a single frame and the input-box working glyph and label use the active working colour, and elapsed times keep updating at least every second without animating.
  - GIVEN Nerd icons and a running subagent; WHEN the user sets the animation to `reduced` in the `/thoth-theme` panel and saves, then `minimal` and later `off`; THEN at `reduced` the braille indicator steps through all ten frames in order at its `full` per-frame cadence while the input border stops breathing and shimmering in its active colours, at `minimal` the subagent row shows a static `◐` with advancing elapsed time while the input-box working glyph keeps animating, and after `off` no animation timer remains and the input-box working glyph and label show in the active working colour .

## Plan

Test-first (`tdd`), `simplify` after each unit.

1. Config + live plumbing (worker): generalize persistence to `saveThemeConfig(patch)` (same atomic guarantees, unknown fields preserved) and keep animation's live setter; implement the live mechanism in Decisions (settings revision in every cache key, render-time density/glyph resolution at every capture point listed in Exploration, kit republication, surface cache invalidation, render request) behind `applyLiveSettings`. Tests mount components and producer cards (pi-todo/pi-subagents through the real theme kit), render at a width, mutate config + `applyLiveSettings`, re-render at the same width and assert the new icons/density.
2. Panel + command removal + docs (designer, after unit 1): new `T/src/settings/` panel and `/thoth-theme` command; save → persist → apply live → reload notice; delete `/thoth-animation` and its tests (replace with panel tests covering animation selection/apply/errors); README.

Focused checks from `T`: `pnpm exec vitest run src test`; `pnpm -C pi-packages/pi-core test test/panel-list-editor.test.ts test/panel-host.test.ts`; downstream render-kit consumers unchanged: `pnpm --dir pi-packages/pi-todo test`, `pnpm --dir pi-packages/pi-subagents test -- test/render`. Closeout at root: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`.

Risks: stale caches after a live change (covered by same-width mounted re-render tests); kit republication racing other kit consumers (withdraw only own registration, as today); save/apply ordering (persist first, apply only on success); removing a documented command (spec MODIFIED, README).

## Tasks

- [x] AC-1: General atomic theme config save, subsuming the animation save (worker unit 1).
  - Outcome: `saveThemeConfig(patch)` with existing atomic/unknown-field/malformed guarantees; animation save uses it
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/shared/config.ts:76-151`, `src/shared/config.test.ts`; skills `tdd`, `simplify`
  - Inputs: this record
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/shared/config.ts`, `src/shared/config.test.ts`, `test/config.test.ts`
  - Interface boundaries: config file shape unchanged
  - Focused check and PASS evidence: theme config tests pass, existing animation persistence tests unchanged and green
  - Return milestone: with the AC-2 unit
  - Stop / reassessment: file shape must change
- [x] AC-2: Icons and tool density apply to mounted cards after `applyLiveSettings` (worker unit 1).
  - Outcome: settings revision in all theme cache keys; render-time density/glyph resolution; kit republication; surface invalidation; `applyLiveSettings` API
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/shared/cache.ts`, `src/tools/*.ts` (incl. `read.ts:61,69-84`, `bash.ts:107-108`, `generic.ts:96-99`, `codemode.ts:100`, `compact-tool.ts:29-96`), `src/render-kit/index.ts:295-323`, `src/index.ts:18-69` (kit publication), `src/status-line/index.ts:276-304`, `src/input-box/decorate.ts:204-253`, `src/welcome/index.ts:40-64`, `src/animation.ts:24-46`, `pi-packages/pi-core/src/render-kit.ts:560-580` (read-only); skills `tdd`, `simplify`
  - Inputs: this record
  - Dependencies: none
  - Output: code + same-width mounted re-render tests for built-ins and producer cards
  - Owner: thoth-worker
  - Writes: pi-thoth-theme `src/shared/**`, `src/tools/**`, `src/render-kit/**`, `src/index.ts`, `src/status-line/**`, `src/input-box/**`, `src/welcome/**`, `src/animation.ts` and their tests
  - Interface boundaries: render-kit v1 contract unchanged; pi-core unchanged; frame output unchanged for unchanged settings
  - Focused check and PASS evidence: theme `pnpm exec vitest run src test` green including new mounted re-render tests; `pnpm --dir pi-packages/pi-todo test` and `pnpm --dir pi-packages/pi-subagents test` green
  - Return milestone: tests green and `applyLiveSettings` API reported
  - Stop / reassessment: a surface cannot update without reinstallation
- [x] AC-3: `/thoth-theme` panel with enum and module rows (designer unit 2).
  - Outcome: panel per AC-3
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/settings.ts`, `pi-packages/pi-core/src/panel-list-editor.ts`, `panel-host.ts`, accepted unit-1 API; skills `tdd`, `simplify`
  - Inputs: accepted AC-1/AC-2 unit
  - Dependencies: AC-1/AC-2 unit accepted
  - Output: code + panel tests
  - Owner: thoth-designer
  - Writes: new `pi-packages/pi-thoth-theme/src/settings/**` and tests, `src/index.ts` command registration
  - Interface boundaries: pi-core panel primitives (read-only)
  - Focused check and PASS evidence: panel tests (render, navigation, enum cycling, toggles, dirty, save, cancel, errors) green
  - Return milestone: with the AC-4 and AC-5 work
  - Stop / reassessment: pi-core primitives need changes
- [x] AC-4: Save persists, applies live settings and announces reload-only changes (designer unit 2).
  - Outcome: per AC-4; respectPackages and unknown fields preserved
  - Known entrypoints and skill paths: accepted `saveThemeConfig`/`applyLiveSettings`, `pi-packages/pi-sidebar/src/session.ts:457-473` (reference)
  - Inputs: accepted AC-1/AC-2 unit
  - Dependencies: AC-1/AC-2 unit accepted
  - Output: code + tests (success applies live, reload notice only when needed, failure keeps memory unchanged)
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/settings/**`, `src/index.ts`
  - Interface boundaries: theme config API
  - Focused check and PASS evidence: settings tests green
  - Return milestone: with the AC-3 work
  - Stop / reassessment: none
- [x] AC-5: Remove `/thoth-animation`; README documents `/thoth-theme` (designer unit 2).
  - Outcome: command and its tests removed (coverage moved to panel tests), README updated
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/animation.ts:49-88`, `src/index.test.ts:93-300`, `README.md:140-141,205`
  - Inputs: accepted AC-1/AC-2 unit
  - Dependencies: AC-1/AC-2 unit accepted
  - Output: code/docs edits
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/animation.ts`, `src/index.test.ts`, `README.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: theme tests green; no `/thoth-animation` reference outside CHANGELOG and archived records
  - Return milestone: with the AC-3 work
  - Stop / reassessment: none

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1: REJECT (record sha256 489203ad5343b2c5995dcd519473049a21b76448b39ecea6f09151b16e90c405) — no live-cache invalidation mechanism for mounted cards/producer memos; respectPackages pattern grammar unsettled. Repaired: explicit revision + kit republication mechanism; respectPackages dropped from the panel by user decision.
Plan review round 2: OKAY (record sha256 9c03a4c1a19f858d3a52db600816f34be75d724370797234a342833cb5f6e638, task subtask_thoth-oracle_1794183377436_f50e0fe7).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

Final verification round 1: PASS (task subtask_thoth-oracle_1794185564945_d486c5bd; delivered thoth-gate-verdict valid:true, kind final-verification, mode record, recordDigest match). Non-blocking: panel tests written after code (no red phase); independent probes judged coverage adequate.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: bd4078235ebee172f66235e03c7eaeecceff4081ce1cd3f36ea9aca553299673

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1–AC-5 and the recorded live-update decisions are satisfied. No blocking implementation findings.",
  "evidence": [
    {
      "id": "record",
      "kind": "validation",
      "locator": ".thoth/changes/theme-settings-panel/theme-settings-panel.md",
      "claim": "Independent --through verify validation passes. Record-prefix digest remained unchanged; implementation files predate all verification runs.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "persistence",
      "kind": "source-and-probe",
      "locator": "pi-packages/pi-thoth-theme/src/shared/config.ts; src/shared/config.test.ts",
      "claim": "Atomic exclusive-temp/rename persistence preserves unknown and nested fields, including respectPackages. Existing animation persistence coverage remains. Independent probes rejected malformed JSON and six invalid root/file cases without replacement.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "live",
      "kind": "independent-probe",
      "locator": "Inline tsx assertions against theme tool renderers, live-settings.ts and shared/cache.ts",
      "claim": "Forty mounted built-in combinations covered ten renderers, initial frame/line density, expanded/collapsed presentation, same-width updates and roundtrips. Revision-aware caches and presentation rebuilding resolve current glyphs and density.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "integration",
      "kind": "independent-probe",
      "locator": "Theme extension entrypoint, actual settings command, pi-todo/view/format.ts and pi-subagents/src/render/tools/components.ts",
      "claim": "Actual panel saves republish a new kit and refresh already-mounted bash, todo and subagents cards at unchanged width. Foreign kit registrations survive subsequent old-theme saves and shutdown. Saved module changes remain unmounted.",
      "basis": "observed",
      "uncertainty": "An initial probe incorrectly required two compact todo rows despite its empty continuation body; source inspection and corrected producer assertions confirmed expected behavior."
    },
    {
      "id": "surfaces",
      "kind": "source-and-tests",
      "locator": "Theme input-box/decorate.ts, status-line/index.ts, welcome/index.ts, animation.ts and associated tests",
      "claim": "Editor, status-line and welcome caches refresh after revision changes. Native animation remains live while module enablement retains its initialization-time behavior.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "panel",
      "kind": "source-and-probe",
      "locator": "pi-packages/pi-thoth-theme/src/settings/",
      "claim": "Uses createListEditor/openPanelOverlay; enum cycling, checkbox toggles, reload labels, dirty state, save/cancel keys, errors and TUI guarding are covered. Independent unmocked panel-shell probes verified persistence before application, unchanged entire config/animation on save failure, and reload notices only for module changes.",
      "basis": "observed",
      "uncertainty": "Panel tests were written after implementation, not test-first."
    },
    {
      "id": "diff",
      "kind": "diff-review",
      "locator": "pi-packages/pi-thoth-theme working-tree diff and untracked implementation files",
      "claim": "Changes stay within scope. Shared config, decorator, status-line and lifecycle tests are additive apart from justified generalized error wording. Removed index tests concern the retired command and are replaced by panel coverage. test/config.test.ts is unchanged. No pi-core/pi-subagents implementation, version, matcher or CHANGELOG changes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "docs",
      "kind": "source-and-baseline-review",
      "locator": "Theme README.md; src/index.test.ts:128; .thoth/specs/pi-ecosystem/spec.md",
      "claim": "Runtime and README no longer expose thoth-animation; its sole theme-source occurrence is a negative registration assertion. README documents panel keys and live/reload behavior. Canonical baseline SHA-256 matches 1898788bd1d840184e7cc4c752b2e09ec59adf6e13de0c238e55f28a8772e67e. Declared ADDED panel and MODIFIED animation deltas are consistent with that baseline.",
      "basis": "observed",
      "uncertainty": "Canonical spec retains the old command until the required post-PASS archive applies the declared deltas."
    },
    {
      "id": "suites",
      "kind": "test-execution",
      "locator": "Requested sequential Vitest commands",
      "claim": "Theme: 48 files/1724 tests passed. pi-todo: 33/561 passed. pi-subagents: 110/2486 passed, one skipped. pi-core: 56/1247 passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "checks",
      "kind": "check-execution",
      "locator": "Root typecheck/check:ci; theme typecheck; git diff --check",
      "claim": "All passed. Requested commands ran sequentially. check:ci exited successfully with warnings in unchanged files. Final status/stat match the initial implementation scope.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Review atomic persistence and retained tests; independently exercise invalid-file handling and field preservation.",
      "outcome": "pass",
      "evidenceIds": ["persistence", "panel", "suites"],
      "reason": "General saves preserve unrelated settings and reject malformed files without replacing them."
    },
    {
      "check": "AC-2",
      "method": "Same-width mounted renderer/producer probes, extension-integrated saves and surface-cache tests.",
      "outcome": "pass",
      "evidenceIds": ["live", "integration", "surfaces", "suites"],
      "reason": "Live icon/density changes invalidate presentation and producer memos without reload; animation behavior is retained."
    },
    {
      "check": "AC-3",
      "method": "Inspect shared-panel integration and execute panel/command coverage.",
      "outcome": "pass",
      "evidenceIds": ["panel", "suites"],
      "reason": "Required rows, interactions, error presentation and TUI restriction are implemented."
    },
    {
      "check": "AC-4",
      "method": "Independent real panel-shell save, failure, no-op, live-only and module-change probes.",
      "outcome": "pass",
      "evidenceIds": ["panel", "persistence", "integration"],
      "reason": "Persistence precedes application; failed saves preserve memory; only module changes trigger reload notices."
    },
    {
      "check": "AC-5 and durable deltas",
      "method": "Review command registration, test replacements, README, repository references and canonical baseline.",
      "outcome": "pass",
      "evidenceIds": ["docs", "diff", "record"],
      "reason": "Retired functionality is removed and documented replacement is complete. Canonical spec application belongs to post-PASS archive under the installed workflow."
    },
    {
      "check": "Required sequential validation and freshness",
      "method": "Execute all six requested commands; additionally run theme typecheck, diff whitespace check and record validation.",
      "outcome": "pass",
      "evidenceIds": ["suites", "checks", "record"],
      "reason": "All required checks pass against unchanged implementation inputs."
    }
  ],
  "risks": [
    {
      "description": "Panel implementation lacks red-phase provenance. Current behavioral coverage and independent positive/negative probes are adequate for acceptance.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["panel", "integration", "suites"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should record this PASS and digest, complete closeout, then archive and apply the declared canonical spec deltas.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/theme-settings-panel/theme-settings-panel.md",
    "reviewedRecordSha256": "bd4078235ebee172f66235e03c7eaeecceff4081ce1cd3f36ea9aca553299673"
  }
}
```

- AC-1: PASS | theme config tests + independent invalid-file probes | atomic save preserves unknown/nested fields incl. respectPackages
- AC-2: PASS | same-width mounted re-render probes (10 built-ins, todo, subagents) + theme 1724 tests | live icons/density without reload
- AC-3: PASS | src/settings panel/command tests | rows, keys, reload labels, TUI guard
- AC-4: PASS | unmocked panel-shell probes | persist before apply; failure keeps config; reload notice only for modules
- AC-5: PASS | README + registration test + grep | /thoth-animation removed; /thoth-theme documented
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:1898788bd1d840184e7cc4c752b2e09ec59adf6e13de0c238e55f28a8772e67e

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
