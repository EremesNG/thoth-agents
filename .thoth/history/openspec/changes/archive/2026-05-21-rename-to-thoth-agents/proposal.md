# Proposal: Rename to thoth-agents

## Intent
Rename the product, package, configuration, install, generated artifact, test,
and documentation identity from `oh-my-opencode-lite` to `thoth-agents`. This is
a hard cutover for a completely new ecosystem with no existing users, installs,
or persisted data to preserve, and it reflects the project moving from an
OpenCode-plugin-only identity to a broader multi AI-agents ecosystem.

## Scope
### In Scope
- Public package, CLI, binary, plugin, schema, marketplace, and generated
  manifest names that currently expose `oh-my-opencode-lite`.
- OpenCode and Codex install surfaces, including managed plugin paths, local
  source directories, marketplace entries, and user-facing commands.
- Repository docs, OpenSpec artifacts, bundled skill/agent metadata, fixtures,
  tests, and snapshots that assert or document the old identity.
- Source constants and validators such as `PACKAGE_NAME`, config I/O defaults,
  and installer target naming.

### Out of Scope
- Compatibility aliases for old install paths, package names, config names, or
  plugin IDs.
- Functional changes to delegation, SDD, thoth-mem, OpenCode, or Codex behavior
  beyond name/path/config identity updates.
- Rebranding role names such as orchestrator, explorer, librarian, oracle,
  designer, quick, and deep.

## Approach
Treat `thoth-agents` as the canonical identity everywhere user-facing or
machine-consumed names are intentionally project-owned. The spec and design
phases should classify old-name occurrences by semantic ownership before
editing: canonical project identity, historical/archive reference, third-party
example, or rename-context text. Implementation should update tests alongside
source and prefer deterministic fixture regeneration over manual snapshot drift.

## Affected Areas
- `package.json`, package exports/binaries, build metadata, and release-facing
  names.
- CLI install/config code, including OpenCode config entries and Codex Personal
  plugin paths such as `~/.codex/plugins/oh-my-opencode-lite`.
- Agent, skill, MCP, manifest, schema, fixture, and generated artifact writers.
- Documentation, README/install instructions, OpenSpec specs/archives, and test
  assertions referencing the old name.

## Risks
- Accidental mixed identities could corrupt generated configs or docs.
- Archived specs may need historical context preserved while active specs adopt
  the new name.
- Package, binary, and plugin ID changes may require coordinated release or npm
  availability decisions outside code changes.

## Rollback Plan
Revert the rename change set before release, including source constants,
metadata, generated fixtures, docs, tests, and OpenSpec updates. If released,
rollback requires a new corrective release that restores the old package/plugin
identity and documents user remediation.

## Success Criteria
- No active source, tests, generated fixtures, or current docs expose
  `oh-my-opencode-lite` as the canonical product identity.
- Install flows target `thoth-agents` names and paths without compatibility
  aliases.
- Automated typecheck, lint/check, and tests pass after the rename.
- Remaining old-name references are intentionally historical or externally
  scoped and documented by the spec/design.
