# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- Release previous question tool components instead of retaining them through Pi's render context.

### Added

- Dock-backed provider for pi-core's shared question service, registered only in UI sessions and withdrawn on shutdown. Other Thoth packages can disable free-text answers per question; abort disposes the dock and returns cancellation, while an unavailable dock lets callers choose a fallback. The `ask_user_question` tool's schema and behavior are unchanged.

### Changed

- `ask_user_question` label properties no longer carry per-key default descriptions; one shared `labels` description covers them. Keys, defaults, validation and rendering are unchanged.
