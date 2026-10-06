# Change: pi-nerd-icons

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- Theme config `icons: 'nerd' | 'ascii'` (default `nerd`) lives in `pi-packages/pi-thoth-theme/src/shared/config.ts`, loaded once in `src/index.ts`. Central map `src/shared/icons.ts` (`iconFor`) and file tables `src/tools/file-icons.ts` exist, but status line/borders/footer glyphs (`status-line/layout.ts`), render-kit statuses (`render-kit/index.ts` `○◇✓✗⊘!?`) and other surfaces are hardcoded Unicode, so Nerd glyphs never reach the editor borders or footer.
- Central map entry `context` U+F49D renders as a letter in Nerd Fonts v3 (user screenshot, CaskaydiaCove Nerd Font Mono). All other current tool icons render correctly. `pi-tui` `visibleWidth` measures Private Use Area codepoints as 1 cell, and the user's terminal renders all chosen glyphs at 1 cell (width probe aligned).
- `pi-core/src/render-kit.ts` `ThothRenderKit` v1 (global `Symbol.for('thoth-agents.pi-core.render-kit.v1')`, `getRenderKit` compatibility checks) exposes `statusGlyph`/`indicator` but no icon mode or semantic icon lookup; optional members (`resolveToolRenderers`, `toolFooter`) are the precedent for extending v1. All packages resolve `pi-core` from source (`./src/index.ts`).
- Hardcoded semantic glyphs outside the theme: `pi-core/src/work-panel-render.ts:126-137` native map (kit indicator used when present); `pi-subagents/src/render/tools/progress.ts:4-25` `statusGlyph` used as producer override even with a kit (`ui/work-panel-provider.ts:80-83`), `ui/theme.ts:11` agent icon U+F08C7, completion/status/result titles; `pi-claude-bridge/src/askclaude-render.ts:228,236-237` `◉✓✗` (native fallback only); `Antigravity tool renderer (path map in Verification) lines 514,535-536` `◉✓✗` inside kit card bodies and native fallback, `native-event-render.ts:23`; task-list package work-panel provider line 40, `view/format.ts:30-33,74-80`, command glyphs at lines 168-178 of its command module (path map in Verification); `pi-background-tasks` already resolves statuses through `kit.indicator`/`statusGlyph`.
- No package other than the theme reads `pi-thoth-theme.json`; the render kit is the only channel to propagate the icon mode.

## Intent

Make the theme's Nerd Font icon set the single source for semantic icons across every first-party Pi package while the theme is installed, and make ASCII mode apply to all semantic icons:

- Theme table (nerd / ascii): branch `pl-branch` U+E0A0 / `git`; cwd `fa-folder_open` U+F07C / `dir`; model `md-robot` U+F06A9 / `*`; effort `md-brain` U+F09D1 / `o`; context `fa-microchip` U+F2DB / `ctx`; cost `fa-dollar` U+F155 / `$`; tokens in/out `fa-arrow_up` U+F062 / `^`, `fa-arrow_down` U+F063 / `v`; cache `md-database` U+F01BC / `cache`; throughput `md-speedometer` U+F04C5 / `tok/s`; footer separator `·` / `|`.
- Statuses (nerd / ascii): waiting `fa-circle_o` U+F10C / `-`; queued `md-timer_sand` U+F051F / `~`; completed `fa-check` U+F00C / `+`; failed `fa-times` U+F00D / `x`; cancelled, stopping, interrupted, deleted and blocked `fa-ban` U+F05E / `/`; warning `fa-exclamation_triangle` U+F071 / `!`; unrecognized `fa-question` U+F128 / `?`. Running keeps the braille spinner; a static in-progress glyph keeps `◐` / `*`.
- Tool icons keep current Nerd glyphs except file `md-file` U+F0214; agent icon keeps U+F08C7 (ascii `@`).
- UI punctuation and motion (nerd keeps the current glyph / ascii): separator `·` / `|`; ellipsis `…` / `...`; navigation arrows `↑ ↓ ← →` / `^ v < >`; selection marker `›` / `>`; editor scroll `↑/↓ N more` / `^/v N more`; spinner braille frames / `| / - \`; working animation `△◭▲◮` and `▲ ready` / `.oO0` and `^ ready`.

## Non-goals

- No change to box frames (borders, corners, rules), the welcome logo/mark/bullets, the subagents history `●`/`○` radio pair, or the Antigravity quota bar.
- Model-facing text (tool results, background-task output, logs, notifications sent to the model) keeps its current punctuation; only rendered UI uses the table.
- Without the theme installed, packages keep their current native Unicode glyphs (no Nerd output without the theme).
- No new config keys, no render-kit v2, no package version bump.

## Acceptance

- AC-1: `pi-core` exports a semantic icon name union and a resolver; `ThothRenderKit` v1 gains an optional icon lookup member; the resolver returns the kit icon when a compatible kit provides it and the current native glyph otherwise; legacy v1 kits without the member stay compatible, and a malformed member is ignored by `getRenderKit` compatibility rules.
- AC-2: The theme kit implements icon lookup and `statusGlyph` from one central table honoring `config.icons` (Intent tables); the central map fixes context, model, branch and file entries; theme status line, editor borders, footer (separator `·`), render-kit statuses, generic tool and file icons consume the central table, separators, ellipsis, arrows, selection marker, editor scroll indicators, spinner and working animation also come from the table, and no other hardcoded semantic glyph remains in theme production source beyond Non-goals.
- AC-3: `pi-core` work panel (including selection marker, separators and navigation hints) and `pi-subagents` (status glyphs, spinner, producer overrides, agent icon, completion/status/result titles, history panel selection/scroll/navigation markers and rendered separators/ellipsis) resolve through the kit when registered and keep their current native glyphs without a kit.
- AC-4: `pi-claude-bridge`, `pi-antigravity-bridge` (including kit card bodies, native events and its picker/tasks/artifacts UI navigation hints and separators), the task-list package and `pi-background-tasks` (rendered UI only) resolve status glyphs, separators, ellipsis and navigation glyphs through the kit when registered and keep current native glyphs without a kit.
- AC-5: Theme borders and footer keep exact/within-width guarantees with Nerd and ASCII glyphs (tests over widths), and per-mode output tests cover every Intent table entry.
- AC-6: Typecheck and tests pass for every touched package and repo `pnpm run check:ci` exits 0; on this Windows host the `pi-antigravity-bridge` suite is judged by a serial run (`npx vitest run --no-file-parallelism`), which must pass every test, the only accepted failure being the `tests/acp-driver.test.ts` suite-level Windows EBUSY temp-directory teardown that also occurs on an untouched HEAD baseline.

## Clarifications

- User (2026-10-06): chose the Intent icon set via two terminal previews (CaskaydiaCove Nerd Font Mono, 1-cell width confirmed); git option 3, context `fa-microchip`, separator `·`, unrecognized `fa-question`, file `md-file`, everything else option 1 or unchanged.
- User (2026-10-06): separators, ellipsis, navigation/scroll arrows, spinner and ready animation join the scope; frames, welcome logo and quota bar stay out.
- User (2026-10-06): scope includes theme, render kit and adapting the other packages now.

## Decisions

- D1: Extend `ThothRenderKit` v1 with an optional member rather than a v2, following the `toolFooter` precedent; the native fallback table lives in `pi-core`.
- D2: Status glyph propagation uses the existing `statusGlyph` member; non-status semantic icons use the new icon member.
- D3 (bounded assumption): ASCII variants and the static-running/blocked mappings in Intent are root-chosen defaults consistent with existing ASCII tokens.
- D4: Producer overrides (subagents work-panel provider, task-list work panel) consult the kit first so the theme's glyphs win when installed.
- D6 (user 2026-10-06): separators, ellipsis, navigation/scroll arrows, spinner and `▲ ready` animation are in scope with ASCII variants; Nerd mode keeps their current glyphs; frames, logo and quota bar stay out.
- D7: `statusGlyph` stays a required v1 member; the new icon lookup is the only added optional member. Resolvers accept a caller-specific native fallback so surfaces whose current fallback differs (e.g. `●` vs `✓` for completed) keep it. Shared formatters that also produce model-facing text take an explicit UI-only opt-in; payload text is invariant across icon modes. Truncation measures the resolved ellipsis width. Mounted components re-resolve on kit registration, replacement and withdrawal.
- D8 (final verification round 1): `pi-subagents/src/thread-view.ts` labels a running partial-error fallback as failed in HEAD; this pre-existing behavior is outside this change (no-kit output stays identical to HEAD) and is recorded as a follow-up. The Antigravity environmental test exception in AC-6 was verified against an untouched HEAD baseline worktree.
- D9 (root decision during AC-3): the subagents history panel `●`/`○` radio pair (selected/unselected execution) is not a single cursor marker and stays unchanged in both modes; only single cursor markers map to `selection`.
- D10 (final verification rounds 2-3): the default parallel `pi-antigravity-bridge` suite is nondeterministic on this host (untouched HEAD baseline full runs failed 6, 4, 27 and 11 tests); a serial run of the current tree passed 788/788 tests with only the acp-driver EBUSY teardown, while a serial run of the untouched HEAD baseline failed that same teardown plus one timing test. AC-6 therefore uses the serial run.
- D5: Ownership — Worker owns `pi-core` contract, work panel and non-theme packages; Designer owns the theme icon table and theme surfaces. Units on different packages run in parallel after AC-1; one writer per package.

## Durable deltas

- `ADDED pi-ecosystem` **Render kit semantic icons** — `@thoth-agents/pi-core` MUST let a registered render kit optionally supply semantic icons (UI punctuation, navigation, motion frames and named icons) through an optional v1 lookup member that legacy v1 kits may omit, and first-party Pi packages MUST resolve those icons and their status glyphs for rendered UI through the registered kit when it provides them, keeping their current native glyphs when no compatible kit or member is available; model-facing text MUST NOT depend on the icon mode.
  - GIVEN the theme kit is registered with Nerd icons; WHEN a subagent, bridge, task-list or work-panel row renders a completed status; THEN it shows the theme completed icon, and without a registered kit it shows its current native glyph .
- `MODIFIED pi-ecosystem` **Standard tool status footer** — `@thoth-agents/pi-core` MUST define a render-kit contract that produces the tool card status footer from a status and the tool render context, with a plain-text fallback when no kit is registered; `@thoth-agents/pi-thoth-theme` MUST implement it so that every running first-party tool card (theme built-ins and kit producers) shows the theme working animation frame for the configured icon mode and elapsed time, and every finished tool card shows the theme completed or failed status icon for the configured icon mode, the elapsed time and the tool optional summary.
  - GIVEN a themed read, bash or subagent tool card with Nerd icons; WHEN it is running and then finishes; THEN its footer shows `<pyramid frame> · <elapsed>` while running and `<completed icon> · <elapsed>[ · summary]` or `<failed icon> · <elapsed>[ · summary]` after finishing, and in ASCII mode the ASCII frame, separator and status icons .
- `MODIFIED pi-ecosystem` **Render kit result borders** — Themed tool and notification cards that render through the Thoth render kit or the theme tool renderers and draw an error-colored border for failed results MUST draw the theme `success` color for affirmative terminal success, the theme `error` color wherever an error border is drawn today (including cancellation where it is red), except that the still-running shell/generic rule in the next sentence takes precedence over this error-color rule, and the theme `accent` color for every other non-error state, consistently across every part of the same card. A shell or generic tool card (bash, PowerShell, generic renderer) that is still running, even with partial output or a partial error flag, MUST show the running form of the standard tool status footer and the `accent` border until it finishes, and only completion changes its footer (to the terminal form of the standard tool status footer, whose summary carries the exit code for shells) and border; in the subagents thread viewer, tool items that are still running MUST be rendered as running, with or without a kit. Cards without a result-driven error border are unchanged.
  - GIVEN a themed bash card that has already produced output; WHEN it is still running and then completes; THEN it shows the standard running footer and the accent border while running, and after completion the standard terminal footer with the completed status icon and the success border for exit code 0 or the failed status icon and the error border for a failure .

## Plan

- Icon names also cover `separator`, `ellipsis`, `arrowUp/Down/Left/Right`, `selection`, `spinnerFrames` and `workingFrames`.
- `pi-core`: add `SemanticIconName`, optional `icon?(name)` on `ThothRenderKit`, compatibility check for the optional member, `resolveIcon(name)` and `resolveStatusGlyph(status)` helpers with the native fallback table; update `testing.ts` test kit; tests first.
- Theme: one table in `src/shared/icons.ts` keyed by semantic name and status with nerd/ascii variants; kit `icon` and `statusGlyph` read `config.icons`; `status-line/layout.ts` formatters, footer, `render-kit/index.ts` statuses, `tools/generic.ts`, `tools/file-icons.ts` consume it; per-mode and width tests.
- `pi-core` work panel + `pi-subagents`: replace local glyph choices with the resolvers (fallback = current glyphs); agent icon via `icon('agent')`.
- Bridges, task-list package, background tasks: replace `◉✓✗`/status maps with the resolvers, including Antigravity kit card bodies; update glyph tests to cover kit and no-kit paths.
- Risks: wide test-fixture churn (≈30 test files assert glyphs); Nerd glyph width depends on Mono fonts (documented); subagent producer overrides changing precedence.

## Tasks

- [x] AC-1: Render-kit semantic icon contract in pi-core
  - Outcome: optional icon member, name union, resolvers with native fallback and compatibility checks
  - Known entrypoints and skill paths: pi-packages/pi-core/src/render-kit.ts, src/index.ts, src/testing.ts, test/render-kit.test.ts; skill C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: Exploration, Decisions D1, D2
  - Dependencies: none
  - Output: exported contract and resolvers with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/render-kit.ts, src/index.ts, src/testing.ts and their tests
  - Interface boundaries: existing v1 members unchanged; legacy kits stay compatible
  - Focused check and PASS evidence: pi-core typecheck and vitest exit 0 with new contract tests
  - Return milestone: contract accepted by root
  - Stop / reassessment: optional member cannot be added without breaking v1 compatibility
- [x] AC-2: Theme central icon table and kit implementation
  - Outcome: theme kit icon and statusGlyph from one table per mode; central map corrected
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/shared/icons.ts, src/render-kit/index.ts, src/shared/config.ts, test/icons.test.ts, test/render-kit.test.ts
  - Inputs: AC-1 contract, Intent tables
  - Dependencies: AC-1 accepted
  - Output: table, kit members and per-mode tests
  - Owner: thoth-designer
  - Writes: pi-thoth-theme src/index.ts (animation/config threading), src/shared/icons.ts, src/render-kit/*, src/tools/* (file icons, generic, bash and edit collapse punctuation, any other tool renderer punctuation) and their tests
  - Interface boundaries: AC-1 contract unchanged
  - Focused check and PASS evidence: theme icon and render-kit tests pass
  - Return milestone: kit returns Intent glyphs in both modes
  - Stop / reassessment: contract insufficient
- [x] AC-2: Theme surfaces consume the central table
  - Outcome: status line, borders and footer use table icons and `·` separator
  - Known entrypoints and skill paths: pi-thoth-theme src/status-line/layout.ts, src/input-box/decorate.ts and tests
  - Inputs: table from previous row
  - Dependencies: previous AC-2 row accepted
  - Output: updated surfaces with tests
  - Owner: thoth-designer
  - Writes: pi-thoth-theme src/status-line/*, src/input-box/*, src/welcome/* (UI separators, ellipsis and truncation, including resources.ts session titles and render.ts truncation; logo/mark/bullets excluded) and their mode/width tests
  - Interface boundaries: snapshot provider unchanged
  - Focused check and PASS evidence: theme suite passes
  - Return milestone: surfaces render Intent icons
  - Stop / reassessment: none
- [x] AC-5: Width and per-mode coverage in the theme
  - Outcome: exact-width borders and within-width footer with Nerd and ASCII; every table entry asserted per mode
  - Known entrypoints and skill paths: pi-thoth-theme frame/decorate/layout/icons tests
  - Inputs: AC-2 outputs
  - Dependencies: AC-2 rows accepted
  - Output: tests
  - Owner: thoth-designer
  - Writes: theme test files
  - Interface boundaries: none
  - Focused check and PASS evidence: theme typecheck and tests exit 0
  - Return milestone: suite green
  - Stop / reassessment: none
- [x] AC-3: Work panel and subagents resolve icons through the kit
  - Outcome: status glyphs, producer overrides, agent icon and titles use resolvers; native glyphs without a kit
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-render.ts, pi-packages/pi-subagents/src/render/tools/progress.ts, src/ui/work-panel-provider.ts, src/ui/theme.ts, src/render/completion-message.ts, src/render/tools/subagent-*.ts
  - Inputs: AC-1 contract
  - Dependencies: AC-1 accepted
  - Output: updated sources and tests (kit and no-kit)
  - Owner: thoth-worker
  - Writes: pi-core src/work-panel-render.ts, src/work-panel-host.ts, src/work-panel-detail.ts and their tests; pi-packages/pi-subagents src (including ui/subagents-history-panel.ts, model-profiles/formatting.ts) and tests
  - Interface boundaries: work-panel host and provider interfaces unchanged
  - Focused check and PASS evidence: pi-core and pi-subagents typecheck and tests exit 0
  - Return milestone: both packages green
  - Stop / reassessment: producer override precedence conflicts with existing spec
- [x] AC-4: Bridges, task-list package and background tasks resolve status glyphs through the kit
  - Outcome: running/completed/failed and status maps use resolvers including Antigravity kit card bodies; native glyphs without a kit
  - Known entrypoints and skill paths: pi-packages/pi-claude-bridge/src/askclaude-render.ts, Antigravity tool renderer (path map in Verification), src/native-event-render.ts, task-list package view/format.ts and work-panel provider, pi-packages/pi-background-tasks/src/render/*
  - Inputs: AC-1 contract
  - Dependencies: AC-1 accepted
  - Output: updated sources and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-claude-bridge src and tests; pi-packages/pi-antigravity-bridge src, extensions (UI strings only) and tests; task-list package root sources (path map) including its work-panel provider, command module, view/ and tool/ files, and tests; pi-packages/pi-background-tasks src and tests
  - Interface boundaries: tool result contracts unchanged
  - Focused check and PASS evidence: each package typecheck and tests (Claude bridge test:unit) exit 0
  - Return milestone: all four packages green
  - Stop / reassessment: a package cannot reach the kit at render time
- [x] AC-6: Package and repo checks
  - Outcome: all touched packages and repo check pass
  - Known entrypoints and skill paths: each touched package.json, repo package.json
  - Inputs: AC-3, AC-4, AC-5 outputs
  - Dependencies: AC-3, AC-4, AC-5 accepted
  - Output: passing evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: typecheck and tests per package plus pnpm run check:ci exit 0
  - Return milestone: all green
  - Stop / reassessment: failures return to the owning unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1710beb2a32cc6626b2e4983f0f350a4537456c804002dd606d7ce268cb42572

- AC-1: PASS | Optional v1 icon contract and compatibility | pi-core typecheck exit 0; 331 tests passed incl. legacy/malformed kits and lifecycle re-resolution.
- AC-2: PASS | Central Nerd/ASCII table and theme integration | Theme typecheck exit 0; 1024 tests passed; Intent codepoints, cwd folder icon and warning prefixes verified.
- AC-3: PASS | Work-panel/subagent propagation and native fallback | pi-subagents 1248 passed (1 skipped); payload invariance and D9 radio-pair exemption verified.
- AC-4: PASS | Bridge, task-list and background-task UI icons | Claude unit 425, task-list 200, background 466 passed; Antigravity rendering paths pass.
- AC-5: PASS | Per-mode coverage and width guarantees | Theme icon-modes and width tests over Nerd and ASCII modes pass.
- AC-6: PASS | Package validation, serial Antigravity, root checks | Seven typechecks exit 0; Antigravity serial run 788 passed, 9 skipped, only the HEAD-reproduced acp-driver EBUSY teardown; root check:ci exit 0; git diff --check exit 0.
- Provenance: plan review OKAY on round 3 (fresh Oracle each round, rounds 1-2 REJECT resolved); implementation authorized by explicit user choice 2026-10-06; final verification PASS on round 4 (subtask_thoth-oracle_1791317302055_4f5bacc2) after rounds 1-3 FAIL resolved.
- Follow-up: pi-subagents thread-view running partial-error fallback labeled failed (pre-existing, D8).
- Path map: task-list package = pi-packages/pi-todo (todo-work-panel.ts, todo.ts, view/format.ts); Antigravity tool renderer = pi-packages/pi-antigravity-bridge/src/ask-tool.ts.
- Source: pi-packages/pi-antigravity-bridge/extensions/index.ts | sha256:89620b22e531a53f31ff376e25e761eeb39636a69e199b4b202e114e8310dc9c
- Source: pi-packages/pi-antigravity-bridge/src/artifacts-ui.ts | sha256:2ef5a01a56eb0d195c5a75793c31bf6202fd7efd3c3458cc2a22f6d2830bfc2d
- Source: pi-packages/pi-antigravity-bridge/src/ask-tool.ts | sha256:b1f06afedb358362cac06575df75ad715d2a30a523ba5956807ada4eb7faceb2
- Source: pi-packages/pi-antigravity-bridge/src/engine-picker.ts | sha256:d85f1c5d39ebf524f46f4a3216129817fbf0ac958e5e65dc977aae4e53b837c6
- Source: pi-packages/pi-antigravity-bridge/src/native-event-render.ts | sha256:d95e3700e036ce8cd8082649f953bb96166f60db399fc3be763ef6ce0694efb2
- Source: pi-packages/pi-antigravity-bridge/src/render-tool-card.ts | sha256:5ab468656c2f89ba989672d20f4d47bc8fd59321f6c71bcb224a4472e56ac25e
- Source: pi-packages/pi-antigravity-bridge/src/subagent-roster.ts | sha256:3e8607f73a6a637b125299d0978805c1fca2f04fa4787f7a3a9265c7c6ad2db3
- Source: pi-packages/pi-antigravity-bridge/src/tasks-ui.ts | sha256:dedfd8f455752c528a4b9f084b92b32ada54729b6a2a371c800e3b8d5622950a
- Source: pi-packages/pi-antigravity-bridge/tests/ask-tool-empty-output.test.ts | sha256:ede703d2865efe23acf21f66a957bcfcb677b4b1f86de1060b44e5c209d2d1da
- Source: pi-packages/pi-antigravity-bridge/tests/extension-lifecycle.test.ts | sha256:2b307fdff3030561c29eb63b5fd4d7e1eb344bd07a345193e64d635cb3ca7db3
- Source: pi-packages/pi-antigravity-bridge/tests/render-kit.test.ts | sha256:1592d0753786c138d1631582247551db2014331e54b5405e33904f0cb9ced572
- Source: pi-packages/pi-antigravity-bridge/tests/subagent-roster.test.ts | sha256:9d4cd2378dc5d92be72c84713816040e2ce9b78742d1e1f8f6da33f7dc3b8abd
- Source: pi-packages/pi-antigravity-bridge/tests/ui-icons.test.ts | sha256:ca68fda8da867c0cf25d66f83b6ba69f215ca38ffe3d646bfdefceff696f6185
- Source: pi-packages/pi-background-tasks/src/navigator-provider.test.ts | sha256:974319b4f295c4902dfb94af0b8051155af161227dc6cd8392b0c56bb455f78f
- Source: pi-packages/pi-background-tasks/src/navigator-provider.ts | sha256:a6ce83dee74baf0e8c763cb41090c85bd8905026a31eb0df5aa81efd4d0da15d
- Source: pi-packages/pi-background-tasks/src/render/messages.test.ts | sha256:7e438a180cdfa6cdd3d85a156b041818c13a2488ce332fc99a334a87948a1993
- Source: pi-packages/pi-background-tasks/src/render/messages.ts | sha256:1897e288c02a6e93b6b286b9507dc57e2300797c0dc6bdb518cc22108d3c8c9f
- Source: pi-packages/pi-background-tasks/src/render/native.test.ts | sha256:2d73318eaa9f1ad9ece7e78f093e0c1bb3953a7105134c3e4bb7dbeb1227bade
- Source: pi-packages/pi-background-tasks/src/render/native.ts | sha256:66b75708e2bf0e03311d32adc19541447dd2f04528b58b734984219319d86d71
- Source: pi-packages/pi-background-tasks/src/render/tools.test.ts | sha256:bdbc0a893ef91e67d3c4cd33757b74717618489dbbd5216ebdab1031de5aac9f
- Source: pi-packages/pi-background-tasks/src/render/tools.ts | sha256:1976afb30b7e464ad5758ae3c82e0cef6bf80d34f78597207739c847730b840a
- Source: pi-packages/pi-claude-bridge/src/askclaude-render.ts | sha256:12ef0813c32465a2089f9a3c9279b66c4081498cce614925e58a047bc07e511a
- Source: pi-packages/pi-claude-bridge/tests/unit-askclaude-render.mjs | sha256:1db5a8044ef5a36005347a72b40c0e4010693622519b9baf9ceaa61f2ead2e1e
- Source: pi-packages/pi-core/src/index.ts | sha256:85d6fa9f20fa1c949156238473539d82f1eaca8a4cf01f98fe9564d305a7cefe
- Source: pi-packages/pi-core/src/render-kit.ts | sha256:7eda459eb65b6fa244e914480c74f97014a1bad5982651849fce42fc97162c50
- Source: pi-packages/pi-core/src/testing.ts | sha256:950222e30731dd5ace06245e638da77ee3bbf21d784b3c79a6dc94da20181ebd
- Source: pi-packages/pi-core/src/work-panel-detail.ts | sha256:25877a4e2700f50c98378dbf03f151f9a6cd3597a8b8645b47cade4edda2625e
- Source: pi-packages/pi-core/src/work-panel-host.ts | sha256:38d36ae07f14df607da1f731fd9c5929fd74aed82884df43b64876fac47612ac
- Source: pi-packages/pi-core/src/work-panel-render.ts | sha256:614bca8af0b1e540b46d18bc40b09bc064c26b6f825eee87c4e9a6561b815021
- Source: pi-packages/pi-core/test/render-kit.test.ts | sha256:b5ba42192a80334bd70661f4afe83f0911bbe6ae99ac65497ca938adaf6d7631
- Source: pi-packages/pi-core/test/testing.test.ts | sha256:6e140e59039fe864aadc20fc4a9cae90ae0e76659af7b32a7708b2a206f35637
- Source: pi-packages/pi-core/test/work-panel.test.ts | sha256:7b348404eeaa40ffa1095d392c05d4600a6b411aba789f7db291ca6983e0102e
- Source: pi-packages/pi-core/test/work-panel-detail.test.ts | sha256:5b78ab40a084ffdbecfe7c9aa40b805a03e2c479243ff939961415f781e58290
- Source: pi-packages/pi-subagents/src/model-profiles/command.ts | sha256:b431934278742d844f544203ff5eb75bebd2f0fc935ed2489b52e4eb82684f7f
- Source: pi-packages/pi-subagents/src/model-profiles/formatting.ts | sha256:3ae839e41a144bf469920c2b52f0cd1c88fef434b7644c1aac5f0d75aada1341
- Source: pi-packages/pi-subagents/src/render/completion-message.ts | sha256:7ad6064713708735a95e2b7a9e9a423edc8e45cdf47c514cdd2dd673b318b52e
- Source: pi-packages/pi-subagents/src/render/icon-aware-component.ts | sha256:3b5bfeefac95a672aed37e5c5bbb50290c25f584d1c1ef9aa1106432b6ffb61a
- Source: pi-packages/pi-subagents/src/render/question-message.ts | sha256:217a20114c0ad582bff184808ba818a6652ba10f9789fdaf09e9f8e5e7e593b4
- Source: pi-packages/pi-subagents/src/render/tools/components.ts | sha256:54d1b6bc94958b0781b529cc1f56679b8f211493d6df3f5aa477c81631837be3
- Source: pi-packages/pi-subagents/src/render/tools/formatting.ts | sha256:6137de476e91f81a2ab86b31d0ecacd75d83ee3223621edab1bcc4ce249c1421
- Source: pi-packages/pi-subagents/src/render/tools/progress.ts | sha256:8b6b8071e6b81c811caeed4fb1dc600645be8886129a91322888e994b1f09db5
- Source: pi-packages/pi-subagents/src/render/tools/subagent-cancel.ts | sha256:30aab3bcebb97cf7c1bf2907c405142ea4d65ef91e2161ce5202d767028afdad
- Source: pi-packages/pi-subagents/src/render/tools/subagent-continue.ts | sha256:e98899e92ccf096b12dbf5cb128a0d164ecffc76c0e795d3388d3582284069d2
- Source: pi-packages/pi-subagents/src/render/tools/subagent-list-agents.ts | sha256:7e2824d18c7d2f25a401faa348bf5ead9407e167c4686e57bef5ddaa86159711
- Source: pi-packages/pi-subagents/src/render/tools/subagent-list-tasks.ts | sha256:0d02b1084fe7723e85abd753ecd839ec8027e31d15e23dd3b48a1ce99e632a82
- Source: pi-packages/pi-subagents/src/render/tools/subagent-reply.ts | sha256:a9c3c1dab474af4cff11516b577bb1d9121e71d16dd536f6b497d6735ee11b71
- Source: pi-packages/pi-subagents/src/render/tools/subagent-result.ts | sha256:951ebbf4b070f6188345c286b5893b4798e060a9eab69d5141728c08fdfcd6dc
- Source: pi-packages/pi-subagents/src/render/tools/subagent-run.ts | sha256:064a291962e1637305d495d1b42ccce60ddd4b154ef09f9fb44605991121b092
- Source: pi-packages/pi-subagents/src/render/tools/subagent-send-message.ts | sha256:e9f30e9685736f99b5b24c11206cce714f9d1cd2bf8e081b5d2442f1f3b7118f
- Source: pi-packages/pi-subagents/src/render/tools/subagent-status.ts | sha256:7291b43ad2cc7f333729a961cc20a3d818b17da9d17bc216de7f7dc06e21f46c
- Source: pi-packages/pi-subagents/src/thread-view.ts | sha256:4818b0bd659bb120bc4ce7e862c585a1bf76b6e7a78d1469ad91fdbb0a53f813
- Source: pi-packages/pi-subagents/src/ui/background-widget.ts | sha256:9069f0f88e9066e32fce65f7353a696731321822896f4667a7798337cc3007cf
- Source: pi-packages/pi-subagents/src/ui/subagents-history-panel.ts | sha256:f30b57217b1c020982a318d22d584cf91a303832443bb3b9d13bc824d2c1c274
- Source: pi-packages/pi-subagents/src/ui/theme.ts | sha256:10bce825e71ee6859779b3e9c21c5095471dacd1730a2bf6cdc11b7465106f40
- Source: pi-packages/pi-subagents/src/ui/work-panel-provider.ts | sha256:60c87dfa2de26865cbadc97e6b69c02fc6b4f42f6421a3276b9b3a43110fe176
- Source: pi-packages/pi-subagents/test/render/render-kit.test.ts | sha256:3f5305de20eb96de268bde2f88b88fa8b1db5bdb031c8b3366b224490e678da5
- Source: pi-packages/pi-subagents/test/render/semantic-icons.test.ts | sha256:81ae37f1b220e0c3f031a628d303c618bade4fc18df0d7ef7e03847c3aba864f
- Source: pi-packages/pi-subagents/test/render/tool-status-footer.test.ts | sha256:186a2734f7fc9165d8183e62520134a287c9779ab6d1a16b496380de65f7e593
- Source: pi-packages/pi-subagents/test/render/tool-status-footer-real-theme.test.ts | sha256:86c5cde3f0a4755998614518b10aefb4b97f9cbf0b03a16309f3de0a0c6c7682
- Source: pi-packages/pi-subagents/test/thread-view-real-sdk.test.ts | sha256:530b7d2dd4db574faebbbe5fd3f20010cba265ad463d69ab83088d0459dd65fb
- Source: pi-packages/pi-subagents/test/ui/semantic-icons.test.ts | sha256:e9dc9cbbb59877ab2560ac4efdcca967a0ee0f82e6879549ee08a0610a851fbd
- Source: pi-packages/pi-thoth-theme/src/index.ts | sha256:847277b6615c79435ee4585c612c3389dffbc02283d162ac2d869488b577fd00
- Source: pi-packages/pi-thoth-theme/src/input-box/decorate.test.ts | sha256:15199db02dea4963b5476dcd0435be552c22093808db8231af0ff81f08283e56
- Source: pi-packages/pi-thoth-theme/src/input-box/decorate.ts | sha256:9f0b0666d73c64c7eeb498e0f229ec2ac2d3b9f9d3d237498c5abf2c0147c730
- Source: pi-packages/pi-thoth-theme/src/input-box/frame.ts | sha256:5f5f29bee6a7495a9cda1fc037a8532c22823e973ad0d92662d7b1b5e829f457
- Source: pi-packages/pi-thoth-theme/src/input-box/gradient.ts | sha256:98663287b5ed543b8aa1c3cb2347030d22b0d6c2f050877d52ed812ea5fba3da
- Source: pi-packages/pi-thoth-theme/src/input-box/real-theme.test.ts | sha256:c44e0ec4a29a7aedc6285a2b90e59a1816402c0d5c57114d8a4fc54db416291c
- Source: pi-packages/pi-thoth-theme/src/input-box/state.ts | sha256:8a8ea6ea1d88fb5a563990500d8322efd3ff310e4f1a7e790827d68d4a2d75aa
- Source: pi-packages/pi-thoth-theme/src/render-kit/index.ts | sha256:33c777d42c341fbde5c75090bf1f8dea40558c3aa8e3824db9244d627fe529d8
- Source: pi-packages/pi-thoth-theme/src/render-kit/working.ts | sha256:7bcfa587965619836e56e6cf7be757e3e0d7b6c4f0ee0a9dcf8f5d316463504d
- Source: pi-packages/pi-thoth-theme/src/shared/icons.ts | sha256:db052a105b2dcb2bc8e75db579d903e207ae2bbf15b953da72b32039fdc07242
- Source: pi-packages/pi-thoth-theme/src/status-line/cost.ts | sha256:a0ded426e0597946975453997182d56b77643b0637acaaa9fda4a075d995d710
- Source: pi-packages/pi-thoth-theme/src/status-line/layout.test.ts | sha256:98bd88893cdab2001072a660c6e691465c111fcb3f9ad938b94c758d7d67fff1
- Source: pi-packages/pi-thoth-theme/src/status-line/layout.ts | sha256:06ddb7c92f1bc1c78ed58b22d468272597f3ecf137d207a23aaf13b768862fd9
- Source: pi-packages/pi-thoth-theme/src/status-line/status-line.test.ts | sha256:dd7be4a3769603a021b06758b20bfa451748d38cf64ed422318f0d821028fd19
- Source: pi-packages/pi-thoth-theme/src/tools/bash.ts | sha256:5e331571f5eea3a92080bf78e6fd0e1cec9f1aecd6902110fa297a403e12f252
- Source: pi-packages/pi-thoth-theme/src/tools/edit.ts | sha256:c68b2f3131fcfd46d9b436e4cdaca74bf70bbc81b284968f4815fe608e5f4186
- Source: pi-packages/pi-thoth-theme/src/tools/file-icons.ts | sha256:819b10ca1d440520727c8d0f3e5100b07c3313ec4d422ea1c7686e0075866eaa
- Source: pi-packages/pi-thoth-theme/src/tools/find.ts | sha256:94c7b5d8a70ceee1d5125f30a8dc7b4dc48ea04c77b975b4da95319a3e2b6f4d
- Source: pi-packages/pi-thoth-theme/src/tools/generic.test.ts | sha256:11ca9ee1e18edc97844e4820c96df72d272796a5cc92ffe03700eb231ff80752
- Source: pi-packages/pi-thoth-theme/src/tools/generic.ts | sha256:26f10a05901e6a045274b8e4d26843183352ee671f68296a2d08dd177cb35078
- Source: pi-packages/pi-thoth-theme/src/tools/grep.ts | sha256:cb52df6fdbefadbb9c1e1b7815af0c567e06274bf9a2227f4e265dd46f79058c
- Source: pi-packages/pi-thoth-theme/src/tools/lifecycle-real-sdk.test.ts | sha256:556b63a4930f70e69acaaf612d0896d33d5ae1b76475ba701a862efc51236d42
- Source: pi-packages/pi-thoth-theme/src/tools/ls.ts | sha256:01de91000ee3aab1a1e269c375e64919a16eb815ec92717c618e29d368c24494
- Source: pi-packages/pi-thoth-theme/src/tools/parse.test.ts | sha256:75302b04bca246f9d7a9956fd61cf8f01d4ab9350aaf06541c9789f618280bc8
- Source: pi-packages/pi-thoth-theme/src/tools/read.ts | sha256:3e32304d61c8181c5c2a8db929d8fe028fd6ac9de57b73bb4a54d8c2e13df47e
- Source: pi-packages/pi-thoth-theme/src/tools/render.test.ts | sha256:9e5344389003aec5e7a8133221614bbb75ba14a3bb02df60e0e42de35baecb5e
- Source: pi-packages/pi-thoth-theme/src/tools/success-borders.test.ts | sha256:b8c5ac8c45a50dad5c72213ac1c34c98471d9b69bfc7cdbcf0114aead8c47cc3
- Source: pi-packages/pi-thoth-theme/src/tools/ticker.test.ts | sha256:bbc9cc94678a1d52f130e42a75aeb1c14d414572bdbac557d2b0e1a926f96848
- Source: pi-packages/pi-thoth-theme/src/tools/tool-status-footer.test.ts | sha256:4803beee55d0b6dabb79c233b54a7041c776a81bfd8a03c323994bea764f25b8
- Source: pi-packages/pi-thoth-theme/src/tools/write.ts | sha256:259d1d2f09b0a165e9f38c116428649ca6a624ebdb4669dfed9666043605c6f1
- Source: pi-packages/pi-thoth-theme/src/welcome/index.ts | sha256:7d439599e9288d020150f47cc2068222bad61da4c9c922e627e0d2726a55c7ef
- Source: pi-packages/pi-thoth-theme/src/welcome/render.ts | sha256:2528f6162d05fbcb1ad866c3fa3204c199c85a68e1f91918152ef675fbab7467
- Source: pi-packages/pi-thoth-theme/src/welcome/resources.ts | sha256:ea1090c7e0ae7411bf744919be5b78a9d83fd02110fe2edbbb6fe99778dcc01d
- Source: pi-packages/pi-thoth-theme/test/icon-modes.test.ts | sha256:4d7437425d9680b01add9620dae4e5c734f75f73fd92b0ba75bdfd929e93669b
- Source: pi-packages/pi-thoth-theme/test/icons.test.ts | sha256:b0586b8d6ddf6252ea615e2e55d065d11c3a4182f7ba1ec4ce00519f11c1ab5e
- Source: pi-packages/pi-thoth-theme/test/render-kit.test.ts | sha256:0cf5f65f98f10b9f4cc91459ce775e53964922505c90f8fd29c752f500b3dc62
- Source: pi-packages/pi-thoth-theme/test/render-kit-lifecycle.test.ts | sha256:2557242659c1a9717eaa114c871a55d90f50c1087220bfdbbc5523e31847ed01
- Source: pi-packages/pi-thoth-theme/test/render-kit-real-sdk.test.ts | sha256:6edabb4f7e4ae0600c4637d2d8b6be0c38c4b28c85dcc40eece45c5f2cf3f629
- Source: pi-packages/pi-thoth-theme/test/render-kit-widget.test.ts | sha256:d3ba0a80e33ff5c65af6dade75d550a7e55233c15cc10dd1d74a33e93c8f3f12
- Source: pi-packages/pi-todo/todo.command.test.ts | sha256:857a97a6b8867097e4c0f0dd90a66ab606524bb6c920d024a1408a7a0223f671
- Source: pi-packages/pi-todo/todo.frame-regression.test.ts | sha256:b4cdcaba4a4c28229bc996cf0edf8fd8f6f680baca309084f6122c69192a7818
- Source: pi-packages/pi-todo/todo.render-kit.test.ts | sha256:f19093576d70c359b4ff7b0ed1bac5ee9d764c41bc0b01527f4f6d4460450fe9
- Source: pi-packages/pi-todo/todo.ts | sha256:0621bad3cec9079475d43806183294610a807f1a2309a95e24ef0aa272734b17
- Source: pi-packages/pi-todo/todo-work-panel.test.ts | sha256:09616594e01170c586679d4fe0a5f251fb81a70fc767d5da0173c4ddafaae6c8
- Source: pi-packages/pi-todo/todo-work-panel.ts | sha256:41eb589a22bb8536e97bea439d32841c70833c9fae8d085a71ddce029a1529f3
- Source: pi-packages/pi-todo/view/format.ts | sha256:4d65ee29c1d6c180d8b5b5a2e93b924ad145c950b35906a7034f47d32e74e25f
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:e9415a537d28c78e6cc9a0396a4258590d0c4bcb5a6f012bbf4545ee1f8d1aac

## Closeout

**Archive**: READY
