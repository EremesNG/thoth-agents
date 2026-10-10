# Change: pi-sidebar

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: high

## Exploration

- Reference design: pi-atelier 0.15.0 (commit a40b032). Fullscreen: reads private `layoutRoot`, wraps it in an `HStack` (main min 64; sidebar 28..72, default 44), installs it with `setLayoutRoot`, restores the original only while it still owns the root; hides below 92 columns in manual mode, auto collapses below 80 + width and reopens 8 columns later. Inline: patches the concrete `TuiMainScreen` render through Pi's forwarding proxy to `width - sidebar` and draws the sidebar as a top-right, `nonCapturing`, zero-margin, full-height overlay. Read-only sidebar (no focus or row actions); `/atelier sidebar` toggle/auto/manual/on/off, Ctrl+Shift+R resize, divider drag; panel order/visibility persisted in user config, mode/width/visibility per session.
- Pi 1.0.2 probes (scratch `%TEMP%/thoth-sidebar-probe-vwk5Gzhf`, `thoth-sidebar-probe-m8K97B`): fullscreen HStack works (transcript width 88 at 120 columns with sidebar 32; PgUp/PgDn 271/246/271; sidebar mouse routed; owner-guarded restore and foreign-root preservation pass); inline seams exist (`tui-main-screen.js:100`, `tui.js:129`, proxy `tui-renderer.js:37-65`), main width reduced, sidebar stays in the visible viewport during growth, differential rendering preserved, modals composite over it and restore editor focus, resize clears scrollback (`tui-main-screen.js:244,298-309`). Real-terminal scrollback freezing of sidebar cells is unverified.
- Work-panel host (`pi-packages/pi-core/src/work-panel-host.ts:118-158,316-332,476-524`) has no host-wide visibility switch; `showSection` is provider-local; hiding rendering alone would leave rows selectable and ← focus active. The editor-slot and work-panel keys are intentionally unversioned ownership slots (`editor-slot.ts:47-66`, `work-panel-state.ts:33`). Pi 1.0.2 `hasOverlay()` counts non-capturing overlays, and `editor-slot.ts:168-174` plus the pi-subagents widget navigation guard reject root-editor input whenever any overlay is visible, so a regular-mode sidebar overlay would block ← navigation and other root-editor controls (pi-subagents key handlers rely on `isWorkPanelRootEditorInputActive`).
- Session data: `ctx.model`, `ctx.thinkingLevel`/`getThinkingLevel`, `ctx.getContextUsage`, cwd (`pi-coding-agent/dist/core/extensions/types.d.ts:221-248,1263`); branch data reaches extensions only through `setFooter` (`types.d.ts:111`); `FooterDataProvider` is not exported (deep import fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`) and the theme keeps its provider private; no git working-tree status helper exists.
- Theme cost (`pi-thoth-theme/src/status-line/cost.ts:14-47`, `layout.ts:227-233`, `index.ts:46-48,94-103,130-149`): sums session-entry usage costs, adds the latest cumulative subagent cost from `thoth:subagents:usage`, `(sub)` by `subscriptionProviders`; not a public export. Theme owns the footer, registers no editor factory, renders at the supplied width.
- Work-panel discovery API (`listWorkPanelSources`, `getWorkPanelSourceRows`, `subscribeWorkPanelRegistry`) provides data-only v2 rows for subagents, background-tasks and task-list sources.
- Packaging: explicit extension lists in `scripts/build-pi-extensions.mjs:8-23` and `scripts/pi-extension-bundles.test.mjs:21-32`; CI explicit per-package steps (`.github/workflows/ci.yml:78-122,162-215`); release discovers package directories (`scripts/release-pi.mjs:14-27`); conventions per `pi-packages/pi-thoth-theme/package.json` and `tsconfig.json`; installer inventory `src/cli/pi-install.ts:58-110` with `preserveUserCopy`; docs state eight managed packages (`docs/agent/cli-installation.md:32-33,80`).

## Intent

Ship `@thoth-agents/pi-sidebar`, a read-only right sidebar modeled on pi-atelier for Pi fullscreen and regular modes, with Session, Workspace, Todos, Subagents and Background panels that can be shown, hidden and reordered; while a panel for a work-panel source is visible, that section leaves the work panel above the editor.

## Non-goals

- Cost panel, dedicated cost view, subagents channel history extension and session rate-limit warning (follow-up change `pi-sidebar-costs`).
- Keyboard focus, row navigation or actions inside the sidebar.
- Custom footer or editor installation; theme layout changes beyond reading a shared cost helper.
- Package version bumps; release.

## Acceptance

- AC-1: a new workspace package `@thoth-agents/pi-sidebar` builds as a bundled Pi extension, is typechecked and tested in CI (Linux and Windows steps), is included in the extension bundle list and bundle tests, and is discovered by release tooling.
- AC-2: in fullscreen the sidebar renders as a right column through an owner-guarded layout-root adapter (private `layoutRoot` read only when it has the expected shape; otherwise the sidebar disables itself with one diagnostic and Pi keeps working), the transcript wraps at the remaining width, PgUp/PgDn and wheel over the transcript still scroll it, the original root is restored on dispose only while the sidebar still owns it.
- AC-3: in regular mode the sidebar reserves right columns by patching the main-screen render width through the renderer proxy and draws a top-right non-capturing full-height overlay; the editor keeps focus, centered overlays and the question dock keep working, and the original render is restored on dispose; unsupported renderers fall back to no sidebar with one diagnostic.
- AC-4: controls follow pi-atelier: `/sidebar` toggles, `/sidebar auto|manual|on|off`; default width 44 within 28..72 with main column at least 64; manual hides below 92 columns, auto collapses below 80 + width and reopens 8 columns later; `/sidebar resize` enters resize mode (←/→ 1, Shift 4, Enter confirm, Esc revert) with the current width shown in its status text, no keyboard shortcut is registered, and divider drag works in fullscreen; panel order and visibility persisted in `~/.pi/agent/thoth-sidebar.json`; mode, width and visibility per session; a command lists, shows/hides and reorders panels.
- AC-5: panels: Session (model, thinking level, context usage, session cost plus subagent cost with `(sub)`, using a shared pi-core cost helper also used by the theme status line with identical output, including current-provider `(sub)` classification and cumulative replacement of subagent snapshots), Workspace (cwd, branch and git working-tree status read by the sidebar's own git reader on session start, turn end and after write/bash tools with debounce, no periodic timer, working with or without the theme), and Todos, Subagents, Background rendered generically from the work-panel discovery API with bounded rows; work-source panels show running items plus at most the 5 most recent finished items of the session (newest first by end time; sources whose rows carry no end time, such as the task list, keep provider order), and render each row exactly as the work panel does (status glyphs for every status, task-list in-progress glyph and dim strikethrough for completed items).
- AC-6: pi-core exports a process-wide UI-preferences registry through which the sidebar declares which work-panel sources it absorbs; the work-panel host neither renders nor selects nor focuses absorbed sections, and everything returns when the sidebar hides, is disposed or the panel is hidden. pi-core also lets an owner mark an overlay as decorative, and the editor-slot input guards and `isWorkPanelRootEditorInputActive` ignore decorative overlays while still yielding to every other overlay, so ← navigation of retained sections, question focus and foreign-overlay focus keep working with the regular-mode sidebar visible.
- AC-7: the installer manages `@thoth-agents/pi-sidebar` with a version floor and user-copy preservation like the theme.
- AC-8: docs, specs and the local closeout gate (touched package tests and typechecks, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`) pass, followed by a live user check in both Pi modes.

## Clarifications

- Reference (user, 2026-10-09): pi-atelier behavior in fullscreen and regular mode, including private layout-root access with guards.
- Interaction (user, 2026-10-09): read-only like pi-atelier.
- Panels (user, 2026-10-09): Session, Workspace, Todos, Subagents, Background, Cost; showable/hideable and reorderable; Todos, Subagents and Background absorb the work-panel sections. Cost is deferred to `pi-sidebar-costs` by the agreed two-change split.
- Absorption (user, 2026-10-09): only sections whose sidebar panel is visible leave the work panel.
- Cost helper (user, 2026-10-09): move session cost and subscription classification into pi-core, used by theme and sidebar.
- Workspace git (user, 2026-10-09): event-driven with debounce.
- Installer (user, 2026-10-09): managed like the theme.
- Controls (user, 2026-10-09): pi-atelier style.
- Resize shortcut (user, 2026-10-09, live check): Ctrl+Shift+R did not reach Pi in the Orca terminal; remove the shortcut entirely and resize through `/sidebar resize` instead.
- Finished items in work-source panels (user, 2026-10-09, live check): show running items plus a bounded set of recent finished items (5), instead of every row or the work panel's linger rules.

## Decisions

- D-1: Layout adapters live in pi-sidebar: `fullscreen-adapter` (HStack + `setLayoutRoot`, owner token, guarded private read) and `inline-adapter` (proxy render patch + overlay); both feature-detect and fall back without throwing.
- D-2: Panel model: built-in panel ids `session`, `workspace` and one panel per discovered work-panel source id; panels render pure data with the render kit; bounded rows per panel with priority-based height reduction like pi-atelier.
- D-7: Decorative overlays are identified by component, not handle (Pi 1.0.2 overlay entries expose component identity only, `tui.js:365-465`). pi-core exposes `registerDecorativeOverlay(tui, component)` (returns a disposer) backed by a cross-bundle shared WeakSet under a versioned `Symbol.for` key, and `hasBlockingOverlay(tui)`, which inspects the TUI's private overlay stack only when it has the expected shape and counts visible entries whose component is not registered as decorative; when the stack shape is unsupported it falls back to `hasOverlay()`, and the sidebar then disables its regular-mode overlay with one diagnostic instead of blocking input. Editor-slot input guards and `isWorkPanelRootEditorInputActive` switch to `hasBlockingOverlay`; first-owner compatibility of the editor slot is unchanged.
- D-8: Workspace branch comes from the sidebar's own git reader (HEAD, with worktree support) instead of footer data, so it works with or without the theme.
- D-3: UI-preferences registry key `Symbol.for('thoth.pi-core.ui-preferences.v1')`, owner-tokened entries `{ absorbedWorkPanelSources: string[] }`; the host merges all owners; listeners trigger host refresh; absorbed sources are excluded from section collection, selection and the ← focus predicate.
- D-4: Cost helper `computeSessionCost(entries, { subscriptionProviders, providerOf })` plus the cumulative subagent cost combination move to pi-core root exports; the theme imports them with unchanged output (golden tests).
- D-5: Config file `~/.pi/agent/thoth-sidebar.json` holds `panels: [{ id, visible }]` and `startup: 'auto' | 'manual' | 'off'`; unrecognized ids preserved.
- D-6: Installer floor `>=0.3.0` for `@thoth-agents/pi-sidebar` with `preserveUserCopy`.

## Durable deltas

- `ADDED pi-ecosystem` **Thoth Pi sidebar** — `@thoth-agents/pi-sidebar` MUST render a read-only right sidebar in Pi fullscreen and regular modes through guarded, owner-checked layout adapters that fall back to no sidebar with a diagnostic, MUST offer Session, Workspace and work-panel source panels that can be shown, hidden and reordered with persisted order and visibility, MUST follow the pi-atelier width and auto-hide rules, offer resizing through `/sidebar resize` and fullscreen divider drag without a keyboard shortcut, and MUST declare the work-panel sources it displays through a pi-core UI-preferences registry so the work panel neither renders nor selects nor focuses them while their sidebar panels are visible.
  - GIVEN a 160-column fullscreen session with a running subagent and two todos; WHEN the sidebar is visible with Subagents and Todos panels; THEN the transcript wraps at the remaining width, the sidebar shows both panels, the work panel above the editor no longer shows those sections or accepts ← focus for them, and hiding the sidebar restores them.
- `ADDED cli-installation` **Install the first-party Pi sidebar extension** — Complete Pi installation and applied Update MUST install and individually verify `@thoth-agents/pi-sidebar` at its configured minimum version as an additional selected Pi package, preserving and verifying an existing copy at or above the minimum from any source, blocking with manual upgrade guidance below it and failing closed on ambiguous identity; dry-run MUST remain mutation-free.
  - GIVEN a Pi profile without the sidebar; WHEN Install runs; THEN `@thoth-agents/pi-sidebar` is installed and verified, and a dry-run performs no mutation.

## Plan

Units:

1. pi-core: UI-preferences registry and host absorption (D-3); cost helper extraction with theme migration (D-4). One core writer; theme migration by the same writer or a theme worker after core.
2. Package scaffold (AC-1): package, build/bundle lists, CI steps, tests skeleton.
3. Layout adapters (AC-2, AC-3) with real-SDK probes as tests. After 2.
4. Panels and controls (AC-4, AC-5): panel framework, Session, Workspace, work-panel source panels, commands, resize, config, absorption declarations. After 1 and 3.
5. Installer (AC-7). Independent.
6. Docs + gate + live check (AC-8).

Risks: private Pi internals (guards + diagnostics + version tests); inline scrollback artifacts in real terminals (live check); focus conflicts (sidebar never captures); work-panel absorption regressions (host tests); theme cost parity (golden tests).

## Tasks

- [x] AC-6: pi-core UI-preferences registry and work-panel absorption
  - Outcome: registry API and host honoring absorbed sources
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{work-panel-host.ts,work-panel-render.ts,work-panel.ts,editor-slot.ts,index.ts}, pi-core/test/work-panel*.test.ts; skills tdd, simplify
  - Inputs: Exploration; Decisions D-3, D-7
  - Dependencies: none
  - Output: registry, host changes, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/{ui-preferences.ts (new),work-panel-host.ts,work-panel-render.ts,editor-slot.ts,index.ts}, pi-packages/pi-core/test/{ui-preferences*.test.ts (new),work-panel*.test.ts,editor-slot*.test.ts}, pi-packages/pi-core/README.md (the pi-subagents key handlers already use `isWorkPanelRootEditorInputActive`, so no pi-subagents edit is expected)
  - Interface boundaries: work-panel discovery API unchanged
  - Focused check and PASS evidence: pi-core and pi-subagents vitest and typecheck pass; absorbed sections hidden, unselectable, unfocusable and restored on release; with a decorative non-capturing overlay visible, retained-section ← navigation, question dock focus and foreign capturing, non-capturing and hidden overlays all behave as without it; decorative registration from a second pi-core copy is honored; classification works before the first render; unsupported stack shape falls back to `hasOverlay()`; disposer cleanup; editor-slot first-owner tests unchanged
  - Return milestone: registry with passing tests
  - Stop / reassessment: absorption requires provider changes
- [x] AC-5: pi-core session cost helper with theme parity
  - Outcome: shared helper; theme output unchanged
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/status-line/{cost.ts,layout.ts,index.ts}, pi-packages/pi-core/src/index.ts; skills tdd, simplify
  - Inputs: Decision D-4
  - Dependencies: AC-6 core unit (same core writer, sequential)
  - Output: helper, theme migration, golden tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/session-cost.ts (new), pi-packages/pi-core/src/index.ts, pi-packages/pi-core/test/session-cost.test.ts (new), pi-packages/pi-thoth-theme/src/status-line/** and tests
  - Interface boundaries: theme config and footer output unchanged
  - Focused check and PASS evidence: theme golden status-line output identical; pi-core and theme suites pass
  - Return milestone: helper with passing tests
  - Stop / reassessment: theme output changes
- [x] AC-1: pi-sidebar package scaffold in build, CI and release
  - Outcome: buildable, tested, bundled package
  - Known entrypoints and skill paths: scripts/build-pi-extensions.mjs, scripts/pi-extension-bundles.test.mjs, .github/workflows/ci.yml, scripts/release-pi.mjs, pi-packages/pi-thoth-theme/{package.json,tsconfig.json}
  - Inputs: Exploration packaging facts
  - Dependencies: none
  - Output: package skeleton and pipeline entries
  - Owner: thoth-worker
  - Writes: pi-packages/pi-sidebar/** (new: package.json, tsconfig.json, src/index.ts, test/, README.md, LICENSE), scripts/build-pi-extensions.mjs, scripts/pi-extension-bundles.test.mjs, .github/workflows/ci.yml, pnpm-lock.yaml (new importer), package.json (root scripts only if per-package)
  - Interface boundaries: other packages untouched
  - Focused check and PASS evidence: package typecheck/test pass; `pnpm install --frozen-lockfile` succeeds; build and test:pi-extensions pass with the new bundle
  - Return milestone: scaffold accepted
  - Stop / reassessment: release tooling needs changes beyond discovery
- [x] AC-2: fullscreen layout adapter
  - Outcome: owner-guarded HStack adapter with fallback
  - Known entrypoints and skill paths: node_modules/@earendil-works/pi-tui/dist/{tui.d.ts,tui-alt-screen.js,layout.js}, probe scratch dirs; skills tdd
  - Inputs: Exploration probes; Decision D-1
  - Dependencies: AC-1 scaffold accepted
  - Output: adapter and tests on the real TUI
  - Owner: thoth-worker
  - Writes: pi-packages/pi-sidebar/src/layout/**, pi-packages/pi-sidebar/test/layout/**
  - Interface boundaries: Pi root ownership, overlays, transcript scrolling
  - Focused check and PASS evidence: real TUI tests for width split, PgUp/PgDn, wheel routing, restore and foreign-root preservation, guard fallback
  - Return milestone: adapter with passing tests
  - Stop / reassessment: private field shape differs on 1.0.2
- [x] AC-3: regular-mode layout adapter
  - Outcome: render-width patch plus overlay with fallback
  - Known entrypoints and skill paths: node_modules/@earendil-works/pi-tui/dist/{tui-main-screen.js,tui.js}, node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/tui-renderer.js; skills tdd
  - Inputs: Exploration probes; Decision D-1
  - Dependencies: AC-2 unit (same writer, same files)
  - Output: adapter and tests
  - Owner: thoth-worker
  - Writes: same as AC-2 unit
  - Interface boundaries: editor focus, overlays, question dock
  - Focused check and PASS evidence: real TUI tests for width, viewport composition, differential render, focus, restore, fallback
  - Return milestone: adapter with passing tests
  - Stop / reassessment: proxy no longer forwards render assignment
- [x] AC-4: sidebar controls, resize and persisted preferences
  - Outcome: commands, width rules, resize mode, config file
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/**, pi-core ./panel primitives; skills tdd, simplify
  - Inputs: accepted adapters; Decision D-5
  - Dependencies: AC-2 and AC-3 units accepted
  - Output: controls and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-sidebar/src/{controls,config}/**, pi-packages/pi-sidebar/test/**
  - Interface boundaries: work-panel ← focus, editor-slot input, question Ctrl+]
  - Focused check and PASS evidence: tests for thresholds, auto/manual, resize keys, drag, config round-trip
  - Return milestone: controls with passing tests
  - Stop / reassessment: Ctrl+Shift+R conflicts with an existing binding
- [x] AC-5: Session, Workspace and work-panel source panels
  - Outcome: panels rendered from public data with absorption declarations
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{work-panel.ts discovery,ui-preferences.ts,session-cost.ts}, pi-coding-agent footer data provider; skills tdd, simplify
  - Inputs: accepted core units and controls
  - Dependencies: AC-6 and AC-5 core units, AC-4 controls accepted
  - Output: panels and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-sidebar/src/panels/**, pi-packages/pi-sidebar/test/panels/**
  - Interface boundaries: read-only consumption of discovery API and registries
  - Focused check and PASS evidence: panel render tests, git branch/status reader and debounce tests with and without the theme, absorption declared/released with panel visibility, regular-mode overlay marked decorative
  - Return milestone: panels with passing tests
  - Stop / reassessment: discovery rows insufficient for a panel
- [x] AC-7: installer manages pi-sidebar
  - Outcome: managed package with preservation
  - Known entrypoints and skill paths: src/cli/pi-install.ts, src/cli/pi-install.test.ts, src/cli/operations/pi.ts; skills tdd
  - Inputs: Decision D-6
  - Dependencies: none
  - Output: inventory entry and tests
  - Owner: thoth-worker
  - Writes: src/cli/**, related tests, docs/agent/cli-installation.md and docs/installation.md package counts
  - Interface boundaries: other managed packages unchanged
  - Focused check and PASS evidence: installer tests pass (fresh, preserved copy, below floor, dry-run)
  - Return milestone: installer change with passing tests
  - Stop / reassessment: none
- [x] AC-8: docs, gate and live check
  - Outcome: docs and gate
  - Known entrypoints and skill paths: docs/agent routed docs, package READMEs
  - Inputs: accepted units
  - Dependencies: all units accepted
  - Output: docs and gate results
  - Owner: thoth-worker
  - Writes: docs and READMEs only, including first-publish bootstrap and trusted-publisher instructions for the new package in docs/agent/harness-packaging.md
  - Interface boundaries: none
  - Focused check and PASS evidence: check:ci, typecheck, build, test:pi-extensions and touched suites pass
  - Return milestone: gate results
  - Stop / reassessment: unrelated environment failures reported

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 REJECT (non-capturing overlay blocks root input; footer branch data; lockfile) and round 2 REJECT (handle-based decorative marking) repaired; round 3 fresh Oracle [OKAY] 2026-10-09. Cautions: visibility must honor options.visible, not rendered bounds; old-bundle first-owner closures cannot see the shared registration, so test mixed versions or disable gracefully; live terminal scrollback check pending.
**Implementation**: AUTHORIZED

User selected Implement on 2026-10-09 after [OKAY]; package scaffold and installer start first, core/theme units after pi-provider-status releases pi-core and theme.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: a37a2f8e80a9135d72c1207e31e9e5f66582dbb1541cef8033db0031ca628aad

A second live check removed the Ctrl+Shift+R shortcut in favor of `/sidebar resize` (AC-4 revised); round 6 FAIL (inline arrow priority, stale docs) and round 7 FAIL (one stale README line) repaired; round 8 fresh Oracle PASS on 2026-10-09.
A third live check (resumed-session history, animation tick, invisible resize status) led to repairs; round 9 FAIL (animation predicate) and round 10 FAIL (missing scope baseline) were closed by round 11, a fresh Oracle reviewing the full 16-file delta against bb699f2 with a frozen hash manifest: PASS on 2026-10-09.

After round 3, a live check led to an AC-5 revision (running items plus the 5 most recent finished, rendered through the shared pi-core row renderer); round 4 FAIL (untimestamped provider order) repaired; round 5 fresh Oracle PASS on 2026-10-09.

Round 1 FAIL (AC-6 absorption on control visibility) and round 2 FAIL (AC-6 fullscreen render-time residual) repaired; round 3 fresh Oracle PASS on 2026-10-09 against sources and rebuilt bundles. Round-3 repair scope: pi-core README.md, src/ui-preferences.ts, src/work-panel-host.ts, test/ui-preferences.test.ts; pi-sidebar src/session.ts, src/layout/fullscreen-adapter.ts, test/session.test.ts, test/layout/fullscreen-adapter.test.ts. Live user check in both Pi modes outstanding before archive.

- AC-1: PASS | packaging, frozen lockfile, build, test:pi-extensions (12), native bundle load | pi-sidebar in bundle lists, CI Linux and Windows, release discovery
- AC-2: PASS | real Pi 1.0.2 fullscreen tests and replay | width split, scrolling, guarded root read, owner-checked restore, foreign root preserved, fallback
- AC-3: PASS | real proxy inline tests and replay | width patch, viewport composition, editor and question focus, decorative registration refusal fallback, restore
- AC-4: PASS | controls/config/session tests (70) + native replay both modes | thresholds with hysteresis, `/sidebar resize` with live width status, arrow priority over retained work sections, Enter/Esc and listener cleanup, divider drag, no shortcut registered, atomic config preserving unknown keys
- AC-5: PASS | sidebar suite (64), core (944), theme (1079), round-5 replays | bounded panels with running + 5 recent finished, provider order for untimestamped sources, shared renderWorkPanelRow glyph/style parity, cost parity with current-provider (sub), event-driven git reader
- AC-6: PASS | pi-core (942) and pi-sidebar (54) suites, four independent replays | absorption hides render/selection/focus, restored on release and at the first render after takeover; isolated liveness predicates
- AC-7: PASS | installer tests (294 root) | sidebar managed >=0.3.0 with preservation, below-floor block, ambiguity fail-closed, dry-run
- AC-8: PASS | check:ci, typecheck, build, test:pi-extensions, seven package suites | all pass; docs incl. first-publish bootstrap
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:2286bbe82d0325423ae36ad939758ba9972cd4611506c3119e264103b2ef5488
- Source: .thoth/specs/cli-installation/spec.md | sha256:76e8c3123182b02e3ab2bdc0ce57f3c564d714959f0e65f38bcd296bd8472ad0

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Live user checks passed on 2026-10-09 in regular and fullscreen modes: layout, /sidebar on|off with work-panel absorption, /sidebar resize hint, divider drag, panel rendering parity, resumed-session Agents history and synced spinner animation.
pi-ecosystem source baseline refreshed after archiving pi-provider-status, which changed only the unrelated requirements "Provider rate-limit registry" and "Subscription provider cost and on-demand quota".
