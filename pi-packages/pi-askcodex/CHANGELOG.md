# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- Defer Computer Use methods to Codex's own bundled `computer-use` skill; AskCodex developer instructions retain only delegation and approval notes instead of prescribing routing or APIs.

## [0.1.0] - 2026-10-16

### Added

- Initial `AskCodex` delegation tool using the local Codex app-server over stdio; no model provider or CLI/SDK fallback.
- Desktop-bundled binary discovery, explicit config/environment overrides, and PATH fallback warnings.
- Read-only and workspace-write sandbox modes, thread continuation, optional web search and Pi context export, live progress, token usage, cancellation, and timeouts.
- Exact app-identifier allowlisting with session-scoped approval, Pi UI prompts for other approvals, and decline without UI; no persistent approvals.
- Delegation and Computer Use routing instructions, offline fake-server tests, and configuration, safety, and troubleshooting documentation.
