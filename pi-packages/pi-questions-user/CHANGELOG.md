# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- Release previous question tool components instead of retaining them through Pi's render context.

### Added

- Dock-backed provider for pi-core's shared question service, registered only in UI sessions and withdrawn on shutdown. Other Thoth packages can disable free-text answers per question; abort disposes the dock and returns cancellation, while an unavailable dock lets callers choose a fallback. The `ask_user_question` tool's schema and behavior are unchanged.

### Changed

- Question panels use content-sized height capped at 45% of terminal rows, without a baseline or six-row content floor. Single questions omit tabs/progress; priority-ordered hints occupy one clipped row. Editor reservations keep height stable while navigating, answering and typing.
- Narrow previews start collapsed; `p` outside editors toggles the preview below the options, retaining that choice across tabs. Wide right-hand previews remain visible.
- Prompts stay pinned above the options (up to three rows, then ellipsis). Options get space before context; context alone scrolls with Alt+arrows in a viewport capped at six rows including its overflow counter, with a three-body-row preference when space permits.
- Tool `context` is limited to 500 characters by Pi argument validation. Longer proposals, tables and findings must be visible response text before the tool call. Internal question-service requests retain unrestricted context.
- `ask_user_question` label properties no longer carry per-key default descriptions; one shared `labels` description covers them. Keys, defaults, validation and rendering are unchanged.
