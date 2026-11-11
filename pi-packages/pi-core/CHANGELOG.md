# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

## [0.9.0] - 2026-11-10

### Added

- `createAdaptiveToolRegistrar`: registers occasional tools directly at load and, on `session_start`, defers them only when `codemode` or `tool_search` is active (`THOTH_AGENTS_PI_EXPOSURE=direct` opts out), falling back to direct registration on failure.

## [0.8.0] - 2026-11-08

### Added

- Optional `RenderCardOptions` tool-density hints (`surface: 'tool'`, `expanded`, `row`) so render kits can apply collapsed tool rows; the v1 kit contract is unchanged.

## [0.7.0] - 2026-11-03

### Added

- Compact Work panel summary while another component replaces the editor, including activation after `/reload`.
- Shared compact-count formatting for sidebar and Work panel summaries, grouped todo presentation, and completed-row limits.

### Changed

- Require Pi 1.5.0 or newer.
- Animation levels select enabled effects at a shared 100 ms cadence rather than slowing enabled effects.
- Do not supply a hard-coded expand-key fallback in the test Render KIT.
- Include the local release history in the published package.

### Fixed

- Restore focus to an owned panel displaced by an editor-slot question once the question closes, and settle owned overlays exactly once on session shutdown or owned hide; export `settleOwnedOverlays`.
- Use the pending glyph consistently in todo counts.

## [0.6.1] - 2026-10-30

### Changed

- Distinguish running cost remainder and align context colors across shared displays.

## [0.6.0] - 2026-10-29

### Added

- Shared process-wide animation clock and selectable full/reduced/minimal/off intensity with frame stepping.

### Fixed

- Coordinate Work panel animation and defer provider refreshes while animating.
- Skip redundant renders when provider updates leave panel lines and status unchanged.

## [0.5.1] - 2026-10-21

### Added

- `detachRenderContext` snapshots renderer inputs without retaining Pi's previous component, preserving shared state and invalidation callbacks.

## [0.5.0] - 2026-10-18

### Added

- List editors can opt out of `g`/`G` Home/End aliases.

## [0.4.1] - 2026-10-18

### Fixed

- Recover Windows launcher startup failure or helper death on the next launch, without retrying ambiguous launches or moving existing jobs.
- Isolate Windows launcher helpers by bundled asset location so one consumer's recovery cannot affect another's jobs.

## [0.4.0] - 2026-10-18

### Added

- Versioned process-wide question-service registry with previews, free-text policy, abort signals, structured results, and per-registration withdrawal.
- Windows Job Object launcher with pre-execution containment, direct stdio, unsigned exit codes, and job-only tree termination; distinguish unavailable containment from spawn errors.

### Changed

- Standardize Work panel columns, theme roles, terminal statuses, and active-first two-line Agents metrics.

## [0.3.0] - 2026-10-10

### Added

- Shared panel primitives and list-editor shell with keyboard/mouse normalization, viewports, styled selection, and dirty-discard handling.
- Task-state and subagent-usage channels, plus a shared editor slot with state-aware overlay focus.
- Discoverable Work panel v2 registry with data-only rows, summaries, stable keyed metrics, shared `formatCwd`, and full-row discovery.
- Provider-limit registry, UI preferences, decorative-overlay coordination, and shared session-cost helpers.

### Fixed

- Coordinate spinner cadence, row retention, panel heights, and cost-ranked history across package copies.

## [0.2.0] - 2026-10-08

### Added

- Finished-row linger behavior and provider overflow/selection hooks.

### Fixed

- Tolerate mixed registry contract versions and preserve question focus over panel overlays.

## [0.1.0] - 2026-10-07

### Added

- First published typed pi.events contract library with versioned envelopes, publish/request/subscribe helpers, and task-list state.
- Render KIT contract and registry, shared duration formatting, standard tool status footers, semantic icons, and reusable cards.
- Cross-package Work panel host, styled fields and detail cards, prompt-retained sections, and shared history-panel shell.

### Fixed

- Preserve same-card detail focus and hide empty Work panel sections.
