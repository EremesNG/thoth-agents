# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Windows Job Object launcher with pre-execution containment, direct stdio streams, unsigned exit codes, and job-only tree termination; unavailable containment is reported separately from target spawn errors.

- Versioned, process-wide question-service registry for separately bundled packages, with latest-compatible-provider lookup and per-registration withdrawal. The SDK-independent contract supports previews, per-question free-text control, abort signals, and structured answered/cancelled/unavailable results.
