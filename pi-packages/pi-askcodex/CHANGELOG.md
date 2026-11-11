# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

## [3.1.0] - 2026-11-10

### Changed

- `AskCodex` uses adaptive exposure in the `askcodex` namespace with its usage guidance: deferred when `codemode` or `tool_search` is active, direct otherwise.

## [3.0.0] - 2026-11-03

### Changed

- Require Pi 1.5.0 or newer.
- Animation levels select enabled effects without slowing animations that remain enabled.

## [2.1.0] - 2026-10-29

### Added

- Shared selectable animation intensity for AskCodex progress cards.

## [2.0.2] - 2026-10-23

### Changed

- Shorten model-facing tool definitions without changing parameters.

## [2.0.1] - 2026-10-21

### Fixed

- Detach previous render components so AskCodex cards no longer retain a growing component chain.

## [2.0.0] - 2026-10-20

### Changed

- Remove the `effort` alias; use `thinking`.
- Remove boolean `webSearch` values; use `live`, `cached`, or `disabled`. Condense tool guidance.

## [1.0.2] - 2026-10-18

### Fixed

- Recover the bundled Windows job launcher on the next call after slow startup, startup failure, or helper death.
- Isolate the launcher from other extensions so their failures cannot affect AskCodex processes.

## [1.0.1] - 2026-10-18

### Fixed

- Contain Windows app-server processes and descendants in a Job Object, avoiding unrelated processes regardless of PID reuse. If containment is unavailable, warn and terminate only the owned app-server leader.

## [1.0.0] - 2026-10-18

### Added

- Initial AskCodex delegation tool using the local Codex app-server over stdio, with Desktop binary discovery, explicit overrides, and PATH fallback warnings.
- Read-only and workspace-write sandboxes, thread continuation, web search, Pi context export, live progress, usage, cancellation, and timeouts.
- Exact or wildcard app-identifier allowlisting for session-only Computer Use approvals; UI prompts for other approvals and decline without UI.
- Thoth question-service approval prompts with native select fallback, literal command/app previews, and delegation instructions that defer Computer Use methods to Codex's bundled skill.
