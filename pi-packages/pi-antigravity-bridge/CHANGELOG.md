# Changelog

All notable changes to the Thoth package are documented here in Keep a Changelog style.
Upstream history, including the former mixed local notes, is preserved unchanged in [UPSTREAM-CHANGELOG.md](UPSTREAM-CHANGELOG.md).

## [Unreleased]

### Changed

- Require Pi 1.5.0 or newer.
- Animation levels select enabled effects without slowing animations that remain enabled.
- Use Pi's injected expand-key hints, honoring remapped and unbound actions.

### Fixed

- Pause the stream-json overall turn budget while tool calls are parked, resuming with the remaining budget after all parks resolve.
- Keep update notices on local package versions instead of repeatedly announcing upstream releases.

## [0.6.0] - 2026-10-29

### Added

- Shared selectable animation intensity for AskAntigravity cards.

### Fixed

- Launch agy through a neutral executable name inside Orca to avoid foreground-agent misidentification.

## [0.5.1] - 2026-10-23

### Changed

- Shorten model-facing tool definitions without changing parameters.

## [0.5.0] - 2026-10-23

### Changed

- Port upstream fixes through 1.8.7: refresh Gemini/Claude catalogs and aliases, remove GPT-OSS models, raise the MCP SDK floor, and fold consecutive ACP polling cards.
- Prefer bridged Pi delegation tools, with a longer synchronous window for delegation and configurable long-tool escalation.
- Refuse provider plan turns that agy cannot enforce; AskAntigravity follows the configured mode unless explicitly overridden. Headless reviews disclose command limitations.

### Fixed

- Bound ACP prompt-write acknowledgements; retire expired connections and prevent late writes from publishing expired turns.
- Verify tokenless ACP sign-in with a live probe, persist non-credential verification evidence, and invalidate it on authentication errors without cross-instance callbacks.
- Validate timeout budgets before spawning agy and include matching time-budget instructions.
- Recover completed, unpolled escalated results only for their owning conversation; keep polling and delivery claims safe across failures and shutdown.
- Restrict MCP replay to active tools; explicitly mask native subagents in staged prompts.
- Add a fail-closed read-only switch, strip skip-permission flags on plan runs, and save raw configuration without persisting environment overrides.
- Resolve tiered Claude base IDs, report explicit catalog-based API-equivalent costs, and fix YAML quoting in generated agent templates.

## [0.4.1] - 2026-10-21

### Fixed

- Detach previous render components so AskAntigravity cards no longer retain a growing component chain.

## [0.4.0] - 2026-10-20

### Changed

- Remove the AskAntigravity `effort` alias; use `thinking`. Condense tool guidance.

## [0.3.0] - 2026-10-18

### Fixed

- Contain Windows agy processes and descendants in hidden kill-on-close Job Objects, drain final output before settlement, and isolate the launcher from other packages. The warned fallback terminates only the owned leader.

## [0.2.2] - 2026-10-16

### Fixed

- Avoid detached agy launches on Windows.
- Refresh stale model discovery and resolve Gemini Argon models.

## [0.2.1] - 2026-10-10

### Added

- API-equivalent message cost reporting from explicit model prices.

## [0.2.0] - 2026-10-08

### Changed

- Publish the extension as a built bundle and remove the unused legacy Pi patch-cleanup command and startup notice.

## [0.1.0] - 2026-10-07

### Added

- First published Thoth fork of the Antigravity provider bridge, with opt-in AskAntigravity, private per-instance discovery, lazy model-gated startup, and scoped lifecycle integration.
- Object-union tool-schema support with warnings for unsupported tools, Render KIT cards with native fallback, and standard status/elapsed footers.

### Fixed

- Clean only owned subprocess trees and descriptor caches, hide Windows consoles, bound silent waits, and reliably terminate turns.
- Generate approval hooks as ES modules and sweep only attributable stale gate groups.
- Fit private MCP names within agy's tool-name limit and compute context usage from input/output/cache tokens rather than unreliable totals.
