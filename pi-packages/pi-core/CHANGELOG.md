# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- Isolate Windows job helpers by bundled launcher asset location so one consumer's helper failure or recovery cannot affect another's jobs.
- Recover Windows job launcher startup failures and helper death on the next launch without migrating existing jobs or retrying ambiguous launches.

### Added

- Windows Job Object launcher with pre-execution containment, direct stdio streams, unsigned exit codes, and job-only tree termination; unavailable containment is reported separately from target spawn errors.

- Versioned, process-wide question-service registry for separately bundled packages, with latest-compatible-provider lookup and per-registration withdrawal. The SDK-independent contract supports previews, per-question free-text control, abort signals, and structured answered/cancelled/unavailable results.
