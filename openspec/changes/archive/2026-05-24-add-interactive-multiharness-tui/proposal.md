# Proposal: Add Interactive Multi-Harness TUI

## Intent

Provide a rich terminal UI for `thoth-agents` that makes install, update,
status, harness selection, and model configuration easier to use while
preserving the package's existing dual surface: OpenCode plugin entrypoint via
`plugin: ["thoth-agents@latest"]` and npm binary entrypoint via
`thoth-agents`.

## Scope

### In Scope

- Add an interactive no-arg CLI experience inspired by Gentle-AI's TUI patterns.
- Preserve non-interactive commands and flags for automation, including existing
  install and generate behavior.
- Distinguish OpenCode plugin auto-install from npm binary availability; plugin
  cache/fetch behavior remains owned by OpenCode.
- Provide TUI flows for harness selection, install/update status, diagnostics,
  model/provider configuration, and safe next-step guidance.
- Respect existing OpenCode and Codex adapter boundaries, managed install
  surfaces, and instruction-level enforcement disclosures.

### Out of Scope

- Replacing OpenCode plugin loading, cache, or marketplace behavior.
- Treating `plugin: ["thoth-agents@latest"]` as installing a global
  `thoth-agents` binary on `PATH`.
- Adding new supported harnesses beyond OpenCode and Codex.
- Changing the seven-agent roster, SDD pipeline semantics, or thoth-mem
  governance model.

## Approach

Design the CLI as a shared command core plus an interactive TUI shell. The TUI
SHOULD call the same underlying install, generate, status, update, and
configuration services used by non-interactive commands rather than duplicating
side effects. No-arg invocation MAY enter the TUI only when an interactive TTY
is available; scripted/non-TTY execution MUST keep deterministic command
behavior. The design phase should evaluate TUI dependencies, output snapshots,
and how model configuration maps to existing Codex managed state and OpenCode
configuration without crossing ownership boundaries.

## Affected Areas

- `src/cli/` parsing, command routing, installer UX, tests, and help text.
- Shared setup/update/status service boundaries for OpenCode and Codex.
- Documentation and package metadata describing binary versus plugin surfaces.
- OpenSpec specs for CLI/TUI behavior and multi-harness packaging constraints.

## Risks

- Ambiguous no-arg behavior could break automation if TTY detection is not
  explicit.
- TUI dependency choices could increase package size or Node runtime coupling.
- Model configuration UI could overclaim provider or per-agent support if not
  aligned with existing Codex/OpenCode capability limits.
- Update flows could accidentally mutate OpenCode-owned plugin cache state.

## Rollback Plan

Keep the TUI behind routing that can fall back to current non-interactive
commands. If the interactive layer fails validation, disable no-arg TUI entry
and retain existing `install`, `generate`, and adapter behavior unchanged.

## Success Criteria

- `thoth-agents` offers a polished interactive menu on supported interactive
  terminals without breaking CI or scripted usage.
- Existing non-interactive install/generate commands remain compatible.
- Docs and CLI output clearly separate OpenCode plugin installation from npm
  binary installation.
- Status/update/model configuration flows respect OpenCode and Codex ownership
  boundaries and disclose capability limits.
- Focused tests cover TTY routing, command preservation, TUI service calls, and
  package surface messaging.
