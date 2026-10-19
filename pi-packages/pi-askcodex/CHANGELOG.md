# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.0.2] - 2026-10-18

### Fixed

- Recover the bundled Windows job launcher on the next AskCodex call after a slow or failed helper start or helper death, instead of staying unavailable for the rest of the session.
- Run AskCodex's Windows job launcher helper separately from other Thoth extensions, so another extension's helper failure or recovery never affects AskCodex app-server processes.

## [1.0.1] - 2026-10-18

### Fixed

- Contain Windows app-server processes and descendants in a Job Object, avoiding unrelated processes regardless of PID reuse or stale parent links. If the job launcher is unavailable, warn and terminate only the app-server leader through its own process handle.

## [1.0.0] - 2026-10-18

First published release.

### Added

- Initial `AskCodex` delegation tool using the local Codex app-server over stdio; no model provider or CLI/SDK fallback.
- Desktop-bundled binary discovery, explicit config/environment overrides, and PATH fallback warnings.
- Read-only and workspace-write sandbox modes, thread continuation, optional web search and Pi context export, live progress, token usage, cancellation, and timeouts.
- Exact app-identifier allowlisting with session-scoped approval, Pi UI prompts for other approvals, and decline without UI; no persistent approvals.
- Whole-identifier, case-insensitive `*` and `?` wildcard patterns in `allowedApps` for session-only Computer Use app-access approvals, including packaged-app ids. `*` allows any app even without UI; other approval policies are unchanged.
- Approval prompts rendered through the Thoth question UI when pi-questions-user provides the shared service, with command/cwd/reason or app-name/identifier previews, no recommended option, and no free-text answer; native select fallback when no compatible provider or dock is available.
- Delegation and approval developer instructions that defer Computer Use methods to Codex's own bundled `computer-use` skill, offline fake-server tests, and configuration, safety, and troubleshooting documentation.
