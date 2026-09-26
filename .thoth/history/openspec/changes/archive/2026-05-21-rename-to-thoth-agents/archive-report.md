# Archive Report: Rename to thoth-agents

## Change

- Change name: `rename-to-thoth-agents`
- Pipeline type: full
- Persistence mode: openspec
- Archive date: 2026-05-21

## Verification Lineage

- Source verification report:
  `openspec/changes/rename-to-thoth-agents/verify-report.md`
- Verification verdict: PASS
- Evidence summary: `bun run check:ci`, `bun run typecheck`, `bun test` (531
  pass), `bun run identity:audit`, and residual old-name search all passed with
  remaining old-name references limited to rename/archive contexts.

## Merged Specs

- `project-identity` — merged delta requirements from
  `openspec/changes/rename-to-thoth-agents/specs/project-identity/spec.md` into
  `openspec/specs/project-identity/spec.md`.

## Audit Summary

- Added long-lived requirements establishing `thoth-agents` as the canonical
  active product, package, plugin, CLI, documentation, skill, install, and
  generated-artifact identity.
- Captured hard-cutover requirements that forbid old-name aliases, fallbacks,
  dual writes, legacy install targets, and preserved old-name managed output.
- Preserved role names as unchanged behavioral concepts while renaming only the
  project/package identity surfaces.
- Preserved proposal, design, tasks, delta spec, identity audit, verification
  report, and this archive report inside the archived change directory.
- Skipped thoth-mem persistence because the selected persistence mode is
  `openspec`, which writes OpenSpec files only.

## Residual Risks

- Release coordination remains outside this archived implementation: npm package
  name availability/ownership and repository URL publication policy should be
  confirmed before publishing.
- Archived OpenSpec history may still mention `oh-my-opencode-lite`; those
  references are intentionally historical and non-canonical.

## Status

Archived after moving the completed change to
`openspec/changes/archive/2026-05-21-rename-to-thoth-agents/`.
