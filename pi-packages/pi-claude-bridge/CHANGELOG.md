# Changelog

All notable changes to the Thoth package are documented here in Keep a Changelog style.
Upstream history, including the former mixed local notes, is preserved unchanged in [UPSTREAM-CHANGELOG.md](UPSTREAM-CHANGELOG.md).

## [Unreleased]

### Changed

- Sync upstream through `acbe45b` (0.11.0), including thinking-off, fork/clone recording inheritance, verbatim tool-result replay, background Bash timeout exemption, and updated child policies; retain local append epochs.

### Removed

- Remove the AskClaude delegation tool, its settings and notices from the bridge; leftover `askClaude` config keys are ignored.
- Remove the one-time startup context notice. Configuration is global only; a project `.pi/claude-bridge.json` is no longer read.

## [0.4.0] - 2026-11-03

### Changed

- Require Pi 1.5.0 or newer and update the system-prompt preamble guard for that runtime.
- Sync upstream through `0b41f78`: replace local checkpoints with content-digest session recording, retaining matching history and forking on differences. Old checkpoint files are ignored and left in place; migration requires one history rebuild.
- Pin Claude Agent SDK to `0.3.308`, ignore project provider options, load only user Claude settings, isolate child environment overrides, and warn about Extra Usage.
- Apply bash default timeouts at execution, route tool results to their owning Pi session, close parked queries, and preserve every nonstreaming fallback block.
- Display validated Claude narration/progress blocks as text while replaying their original signed reasoning, without changing session-sync identity.
- Use Pi's injected expand-key hints, honoring remapped and unbound actions.

### Fixed

- Keep update notices on local package versions instead of repeatedly announcing upstream releases.

## [0.3.1] - 2026-10-25

### Fixed

- Launch native Claude children through a file-identity-validated neutral hardlink inside Orca across provider, summary, AskClaude, and quota paths. Preserve the original launcher on alias failure and retain SDK stderr diagnostics.

## [0.3.0] - 2026-10-23

### Changed

- Sync upstream through `df964a9` (0.9.3 plus pending fixes): native Pi summaries, session cwd, quota headers, continuation recovery, isolated reasoning effort, lazy diagnostics, and AskClaude deprecation.
- Retain local prompt/cache, rendering, schema wrapping, and quota behavior while updating the Claude Agent SDK to the 0.3.308 line.

### Fixed

- Allow `/claude quota` to fetch usage by removing non-essential-traffic suppression only from its short-lived child; distinguish ineligible authentication from missing usage data.
- Rebind abort signals when continuing queries parked at terminated tool batches.

## [0.2.5] - 2026-10-21

### Fixed

- Detach previous render components so AskClaude cards no longer retain a growing component chain.

## [0.2.4] - 2026-10-20

### Fixed

- Preserve the prompt cache across Pi restarts using validated per-session checkpoints. This mechanism is superseded by content-digest sync in Unreleased.

## [0.2.3] - 2026-10-18

### Changed

- Document `models.json` context-window overrides for bridge models; no runtime behavior change.

## [0.2.2] - 2026-10-13

### Added

- Forward selected tools' `toolGuidelines` to Claude as tool-guideline context.

## [0.2.1] - 2026-10-10

### Added

- Provider rate-limit reporting and the on-demand `/claude quota` command.

## [0.2.0] - 2026-10-08

### Changed

- Publish the extension as a built bundle.

## [0.1.0] - 2026-10-07

### Added

- First published Thoth fork of the Claude provider bridge, incorporating upstream 0.9.1.
- Object-union tool-schema wrapping, unsupported-tool warnings, Anthropic catalog API-equivalent prices, and Render KIT AskClaude cards with standard status/elapsed footers.
- Pi prompt-section projection and MCP tool-name disclosure.

### Fixed

- Preserve structured prompt section order on resume and keep appended instructions current without replacing the recorded prompt/cache prefix.
- Deliver changed keyed instruction blocks through bounded hook-context parts, with full replacement after ambiguous or partially delivered updates.
