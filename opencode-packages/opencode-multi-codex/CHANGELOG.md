# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-08

### Added

- Persistent native OpenAI credential mappings and numbered `openai-codex-N`
  providers for per-agent Codex account pinning.
- Per-request HTTP and WebSocket credential substitution using native token refresh.
- `/codex-add`, `/codex-remove`, `/codex-switch` and `/codex-status` TUI commands
  backed by server RPC, with session overrides and quota freshness/reset display.
- Usage-limit account blocking and automatic rotation, configurable through
  `autoSwitchOn429` in server plugin options.
- Separate server and TUI builds, package tests, and workspace CI/release support.

### Known limitations

- Auxiliary requests are not re-routed mid-retry; cross-account encrypted
  reasoning replay remains unverified live. Codex parity mirrors OpenCode v2.2.6
  and quota relies on unofficial backend contracts. See the README.
