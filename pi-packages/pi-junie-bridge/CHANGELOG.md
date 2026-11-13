# Changelog

## [Unreleased]

### Fixed

- Per-turn telemetry is fire and forget: the post-terminal Junie settings read is
  never awaited by the next turn, an abort or shutdown, so a stalled local file
  cannot delay any of them and no settle timer exists to leak or keep the process
  alive. The line is emitted only while its session instance is alive and no newer
  prompt or continuation has started, so a cancelled, refused or closed turn emits
  nothing and display order never inverts. Abort keeps precedence over a pending
  line, including a parked Pi tool continuation. Sub-cent costs render as
  `<$0.0001` instead of `$0.0000`.

### Changed

- Per-turn display line reports the real Junie model, effort and the cost the
  bridge attributes to that turn; local `summary.json` snapshots, auxiliary model
  breakdown and their persisted baseline state are gone.

## [0.1.0] - 2026-11-12

### Added

- Initial Junie ACP model provider using the locally installed, authenticated CLI.
- Model/effort discovery, streaming, persistent session mappings and Pi tools over
  authenticated loopback MCP.
- Native-tool permission dialogs with headless rejection and brave mode forced off.
- On-demand `/junie quota` and `/junie models` commands.
- Windows Job Object launcher assets and hermetic fake-agent tests.
