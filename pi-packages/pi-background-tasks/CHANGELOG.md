# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

### Changed

- Discover unverified shell candidate paths during tool registration without starting PowerShell version probes; retain full validation and diagnostics at launch.

## [0.8.0] - 2026-11-11

### Added

- `/bg` history rows show a status glyph per state, elapsed duration and the exit code or signal of failed tasks.

### Changed

- The `/bg` panel uses the shared history panel chrome (single hint row, `✕ Close`, `?` help); stop and paging bindings are unchanged.

## [0.7.0] - 2026-11-10

### Changed

- `bg_task_list`, `bg_task_log`, `bg_task_stop` and `bg_task_clear` use adaptive exposure in the `bg_tasks` namespace: deferred when `codemode` or `tool_search` is active, direct otherwise.
- Shorter `bg_task_spawn` and `bg_task_watch` descriptions.

## [0.6.0] - 2026-11-03

### Fixed

- Lead budget-truncated status with the actionable incident text and label partial incident rows in the paging summary.
- Detect damaged log, metadata, and incident paging cursors with explicit copy/restart guidance; resume only independently witnessed source positions, rejecting unsafe legacy offsets without skipping retained evidence.
- Deduplicate ordinary completion callbacks by source and task ID even when status wording changes; urgent transitions remain distinct and immediate.
- Advance watch progress only when the observed outcome changes, ignoring poll timing, JSON formatting, and terminal redraws while preserving legacy progress clocks on resume.

### Changed

- Require Pi 1.5.0 or newer.
- Use Pi's injected expand-key hints, honoring remapped and unbound actions.
- Use shared compact Work panel counts.
- Include the local release history in the published package.

## [0.5.4] - 2026-10-29

### Fixed

- Cache registration-time PowerShell discovery to keep the TUI responsive during child launches; launches still revalidate their environment.

## [0.5.3] - 2026-10-23

### Changed

- Shorten model-facing tool definitions without changing parameters.

## [0.5.2] - 2026-10-23

### Fixed

- Hold completion callbacks until the parent agent is idle.

## [0.5.1] - 2026-10-21

### Fixed

- Detach previous render components so task cards no longer retain a growing component chain.

## [0.5.0] - 2026-10-20

### Changed

- Expose only standalone `bg_task_*` tools, removing action wrappers and legacy parameter aliases; condense tool guidance.

## [0.4.1] - 2026-10-18

### Fixed

- Recover failed Windows launcher starts on the next launch rather than caching failure for the session.

## [0.4.0] - 2026-10-18

### Added

- Distinct timeout, expected-exit, and resolved-failure statuses.

### Fixed

- Watch task directories so atomic metadata replacement publishes fresh task state.

## [0.3.0] - 2026-10-10

### Added

- Task-state publication through pi-core and discoverable data-only Work panel v2 rows.

### Changed

- Use shared panel primitives and overlay mouse handling for task history and detail views.

## [0.2.0] - 2026-10-08

### Changed

- Publish the extension as a built bundle; count cancelled tasks as failed and use semantic panel glyphs.

## [0.1.0] - 2026-10-07

### Added

- First published Thoth local-jobs fork of pi-better-background-tasks, with explicit spawn/watch/status/log/stop operations, framed tool cards, and compact automated completion notices.
- Reload-persistent jobs with verifiable cleanup on other shutdowns, Windows Job Object containment through a hidden PowerShell helper, and caller-declared shell execution.
- Render KIT integration, standard status/elapsed footers, and a Work panel section with task details and log tails.
- Task history panel and `/bg`, with prompt-retained Work panel rows.

### Fixed

- Retain cleanup ownership through termination verification, leader exits, helper failures, lost acknowledgements, and reload-gap watch completion.
- Serialize Windows job queries with release, allow sufficient time for PowerShell validation probes, and hide empty Work panel sections.
