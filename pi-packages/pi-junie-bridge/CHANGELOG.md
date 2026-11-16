# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-15

### Added

- Initial Junie ACP model provider using the locally installed, authenticated CLI.
- Model/effort discovery, streaming, persistent session mappings and Pi tools over
  authenticated loopback MCP.
- Native-tool permission dialogs with headless rejection and brave mode forced off.
- On-demand `/junie quota` and `/junie models` commands.
- Windows Job Object launcher assets and hermetic fake-agent tests.
- Short Pi model ids mapped to Junie ACP model values.
- Headless sessions block Junie's native shell and file-mutation tools with a
  model-visible reason pointing to the Pi MCP tools (`pi/bash`, `pi/edit`,
  `pi/write`), so commands and edits follow Pi's tool policy.
- Per-turn display line with the real Junie model, effort and the cost the bridge
  attributes to that turn (sub-cent costs render as `<$0.0001`). Telemetry is
  fire and forget and never delays the next turn, an abort or shutdown.
- Process-global state is replaced on extension reload.
