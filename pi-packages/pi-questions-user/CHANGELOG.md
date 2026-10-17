# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Dock-backed provider for pi-core's shared question service, registered only in UI sessions and withdrawn on shutdown. Other Thoth packages can disable free-text answers per question; abort disposes the dock and returns cancellation, while an unavailable dock lets callers choose a fallback. The `ask_user_question` tool's schema and behavior are unchanged.
