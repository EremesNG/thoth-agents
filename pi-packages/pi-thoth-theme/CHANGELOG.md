# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

## [0.9.0] - 2026-11-08

### Added

- Opt-in `tools.collapsed` density (`frame` | `compact` | `line`): collapsed tool cards render one row (compact adds a continuation row) and terminal errors show the first error line; expanded and `frame` output are unchanged.
- `/thoth-theme` settings panel to edit icons, animation, tool density and module toggles; icons, animation and density apply live, module toggles take effect after `/reload`.

### Removed

- `/thoth-animation`; use `/thoth-theme` instead.

## [0.8.0] - 2026-11-03

### Changed

- Require Pi 1.5.0 or newer and preserve the empty-editor placeholder with current TUI cursor markers.
- Animation levels select enabled effects at full speed: reduced disables border breathing/shimmer, minimal keeps only the working indicator, and off is static.
- Use Pi's injected expand-key hints, honoring remapped and unbound actions and fitting arbitrary configured key tokens on narrow terminals.
- Include the local release history in the published package.

## [0.7.1] - 2026-10-30

### Changed

- Mark running cost remainder and align context colors with the sidebar.

## [0.7.0] - 2026-10-29

### Added

- `/thoth-animation` selector/direct setting for full/reduced/minimal/off intensity, persisted without overwriting malformed configuration.

### Fixed

- Coordinate input, tool, and working-indicator animation through the shared clock and update usage rendering only when cost changes.

## [0.6.3] - 2026-10-23

### Fixed

- Keep the expand key visible at narrow widths.
- Remove spurious write-preview blank lines, tolerate absent/null read ranges, and avoid treating bash's no-output sentinel as output.
- Keep welcome-card spacing consistent and show overflow when more than four providers are present.

## [0.6.2] - 2026-10-21

### Fixed

- Detach previous render components so tool cards no longer retain growing component chains.

## [0.6.1] - 2026-10-20

### Fixed

- Renew Orca child-work hold leases with a heartbeat.

## [0.6.0] - 2026-10-18

### Added

- Keep the Orca pane working while background work is pending.

### Fixed

- Keep editor working status active until background work settles.

## [0.5.0] - 2026-10-18

### Added

- Framed user messages with white text on Nile green.

### Changed

- Use shared Work panel column roles and terminal-status semantics.

## [0.4.0] - 2026-10-13

### Added

- Compact nested-call cards for Pi codemode tools.

## [0.3.0] - 2026-10-10

### Added

- Subagent usage from pi-core channels, shared subscription-aware session cost, shared cwd formatting, elapsed icon, and a diamond context gauge.

### Fixed

- Render untitled frame dividers continuously.

## [0.2.0] - 2026-10-08

### Added

- Unicode icon mode alongside Nerd Font and ASCII modes.

### Changed

- Publish the extension as a built bundle with packaged themes.

## [0.1.0] - 2026-10-07

### Added

- First published Egyptian theme with welcome card, status line, cumulative cost, styled tools, rounded input box, and modular configuration.
- Native tool-renderer integration, generic third-party frames, structured argument/result summaries, and configurable respect for package-owned renderers.
- Session-owned Render KIT provider with cached cards, semantic icons, standard animated status/elapsed footers, and result-driven success borders.
- Editor working status, breathing/shimmer effects, total-input/cache-hit metrics, and tokens-per-second display.

### Changed

- Remove the Orca Kitty fallback while retaining native image passthrough.
