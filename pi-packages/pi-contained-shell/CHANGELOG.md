# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added

- Contain Windows `bash` and `powershell` commands and their descendants in Job Objects, terminating them on timeout, abort, or shell exit.
- Fall back to Pi default execution with a session warning when the launcher is unavailable; leave non-Windows tools unchanged.
