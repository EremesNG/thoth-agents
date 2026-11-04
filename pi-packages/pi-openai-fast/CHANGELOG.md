# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

## [0.3.0] - 2026-11-03

### Changed

- Require Pi 1.5.0 or newer.
- Include the local release history in the published package.

### Fixed

- Preserve `Usage.cost.totalFromProvider` and leave provider-billed totals unchanged instead of applying the priority multiplier.

## [0.2.1] - 2026-10-10

### Changed

- Document provider-status and Pi-sidebar integration; no runtime behavior change.

## [0.2.0] - 2026-10-08

### Changed

- Publish the extension as a built bundle.

## [0.1.0] - 2026-10-07

### Added

- First published priority-tier extension: register `<id>-fast` virtual models for OpenAI Responses/Codex Responses providers, including extension providers.
- Request `service_tier: "priority"` only for matching agent-loop calls, leaving compaction and other direct calls on the standard tier.

### Fixed

- Price Codex fast requests at the priority tier.
