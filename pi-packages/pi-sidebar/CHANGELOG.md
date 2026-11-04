# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

## [0.7.0] - 2026-11-03

### Changed

- Require Pi 1.5.0 or newer.
- Animation levels select enabled effects without slowing animations that remain enabled.
- Share compact counts with the Work panel, group todo rows by status, and respect archive/completed-row limits and muted pending styling.
- Include the local release history in the published package.

### Fixed

- Close the settings and curves panels on session shutdown without touching the invalidated context.
- Fold untracked cost into the legend only when no task is live.

## [0.6.0] - 2026-10-30

### Changed

- Show Cost as a share-of-total bar with ranked legend and a running remainder indicator.
- Draw Cost and Context bars as hairlines with a classic option and aligned context colors.

## [0.5.0] - 2026-10-29

### Added

- Shared selectable animation intensity.

### Fixed

- Keep input responsive with revision-keyed plan caching and coordinated animation rather than repeated serialization.

## [0.4.0] - 2026-10-18

### Changed

- Retain launch ordering, prioritize Agents columns, compact managed agent names, and use active-first two-line Agents rows.
- Use 50-column default and 36-column minimum sidebar widths.

## [0.3.0] - 2026-10-10

### Added

- First published read-only sidebar for fullscreen and regular Pi, with guarded layout ownership, resize controls, settings/cost overlays, provider summaries, and Work panel absorption.
- Elapsed cost curves, icon header counters, aligned metrics, and ranked task costs.
- `/sidebar resize`, cached layout/session data, and bundled pi-core without a runtime pi-core dependency.

### Fixed

- Restore resumed history, synchronize animation, keep resize guidance visible, and preserve active plus three recent finished rows.
- Keep fair panel heights, mode-aware curve colors, path-free task labels, and agent-prefixed curve legends.
