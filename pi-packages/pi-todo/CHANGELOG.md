# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

## [0.6.0] - 2026-11-08

### Added

- Todo tool cards opt into the theme's collapsed tool row density.

## [0.5.0] - 2026-11-03

### Added

- Group, order, and archive todos in compact views; cap completed rows without hiding pending work.

### Changed

- Require Pi 1.5.0 or newer.
- Use shared compact Work panel counts and pending glyphs, with muted pending rows.
- Use Pi's injected expand-key hints, honoring remapped and unbound actions.
- Include the local release history in the published package.

### Fixed

- Skip corrupted todo snapshots whole when restoring a session, validating every task, dependency id, and next id while retaining the last valid state.

## [0.4.5] - 2026-10-29

### Changed

- Refresh the coordinated Pi package release; no package-local runtime changes since 0.4.4.

## [0.4.4] - 2026-10-23

### Changed

- Shorten model-facing tool definitions without changing parameters.

## [0.4.3] - 2026-10-23

### Fixed

- Persist task-list snapshots so codemode mutations replay correctly.

## [0.4.2] - 2026-10-21

### Fixed

- Detach previous render components so todo cards no longer retain a growing component chain.

## [0.4.1] - 2026-10-20

### Changed

- Stop repeating field descriptions inside batch operations; validation and behavior are unchanged.

## [0.4.0] - 2026-10-13

### Added

- Atomic batch actions with call-scoped references and create-time status.

### Changed

- Align documented root progress tracking with the Pi `todo` tool.

## [0.3.0] - 2026-10-10

### Added

- Discoverable Work panel v2 rows and one-line tool-call summaries with expandable task lists.

## [0.2.0] - 2026-10-08

### Added

- Plan-progress counts and a shared Todos panel opened from Work panel entries or `/todos`.

### Changed

- Keep completed tasks visible until the next recognized prompt without changing task state; publish the extension as a built bundle.

### Fixed

- Preserve question focus when opening panel overlays.

## [0.1.0] - 2026-10-07

### Added

- First published Thoth fork of `@juicesharp/rpiv-todo` 2.12.0 with the existing todo schema, branch-state replay, pi-core task snapshots, and open-task reinjection before agent start, including after compaction.
- Render KIT tool cards with native fallback, standard status/elapsed footers, and a styled Todos Work panel section.

### Fixed

- Use single-cell list glyphs and semantic status icons so card borders remain aligned.
