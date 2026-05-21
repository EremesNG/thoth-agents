# Archive Report: Codex Install Agent Command

## Change

- Change name: `codex-install-agent-command`
- Pipeline type: full
- Persistence mode: openspec
- Archive date: 2026-05-20

## Verification Lineage

- Source verification report:
  `openspec/changes/codex-install-agent-command/verify-report.md`
- Verification verdict: PASS
- Evidence summary: `bun run check:ci`, `bun run typecheck`, focused CLI/Codex
  tests, and full `bun test` passed; the full suite reported 511 tests.

## Merged Specs

- `multi-harness-agent-pack` — merged delta requirements from
  `openspec/changes/codex-install-agent-command/specs/multi-harness-agent-pack/spec.md`
  into `openspec/specs/multi-harness-agent-pack/spec.md`.

## Audit Summary

- Added the public `install --agent=opencode|codex` contract while preserving
  OpenCode as the default installer path.
- Promoted conservative Codex installer requirements for package preparation,
  docs-backed plugin enablement, root instruction composition, six role subagent
  materialization, managed setup plans, safe TOML merges, and trust/precedence
  diagnostics.
- Updated the Codex plugin packaging requirement so installation consumes the
  `.codex-plugin/` package without claiming automatic trust or replacing
  non-plugin Codex root/subagent surfaces.
- Preserved proposal, design, tasks, delta spec, verification report, and this
  archive report inside the archived change directory.
- Skipped thoth-mem persistence because the selected persistence mode is
  `openspec`, which writes OpenSpec files only.

## Residual Risks

- Future doctor/repair commands can reuse the setup-plan metadata but remain a
  follow-up implementation area.
- Plugin enablement remains gated on safely derived docs-backed identifiers;
  otherwise `/plugins` and `/hooks` review remain the required user steps.

## Status

Archived after moving the completed change to
`openspec/changes/archive/2026-05-20-codex-install-agent-command/`.
