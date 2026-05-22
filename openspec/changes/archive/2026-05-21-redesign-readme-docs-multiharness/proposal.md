# Proposal: Redesign README and Docs for Multi-Harness Positioning

## Intent
Reposition thoth-agents documentation around its new multi-harness identity while
preserving OpenCode as the stable baseline and Codex as the current additional
supported harness with documented capability and enforcement caveats.

## Scope
### In Scope
- Redesign `README.md` into an onboarding-first product overview: visual opener,
  concise identity statement, what it is and is not, harness support matrix,
  quick start, seven-agent roster, docs index, and next steps.
- Preserve the seven-agent roster, role names, and existing agent images.
- Update `docs/installation.md` to be harness-aware while preserving accurate
  OpenCode and Codex commands and port/auth guidance.
- Update `docs/quick-reference.md`, `docs/skills-and-mcps.md`, and
  `docs/provider-configurations.md` so OpenCode-specific wording is scoped and
  shared behavior is described in harness-neutral terms.
- Add cross-links from existing Codex docs where needed without rewriting their
  dedicated technical content.
- Add small OpenCode-scope notes to `docs/tmux-integration.md` where examples or
  troubleshooting are currently harness-specific.

### Out of Scope
- Runtime, installer, CLI, generated artifact, or agent behavior changes.
- New harness support beyond OpenCode and Codex.
- Replacing thoth-mem, changing SDD rules, or renaming the seven roles.
- Recreating agent images or changing visual assets except for placement.

## Approach
Use the current main specs as the source of truth: thoth-agents is canonical,
OpenCode behavior remains preserved, and Codex support must disclose
instruction-level governance or activation caveats where applicable. Rewrite the
README as the primary orientation surface, then align docs pages to the same
taxonomy: shared concept first, harness-specific binding second.

## Affected Areas
- `README.md`
- `docs/installation.md`
- `docs/quick-reference.md`
- `docs/skills-and-mcps.md`
- `docs/provider-configurations.md`
- `docs/tmux-integration.md`
- Cross-links to existing `docs/codex-*.md` pages

## Risks
- Overstating Codex runtime parity or hard enforcement where behavior is
  instruction-level.
- Accidentally weakening OpenCode-first commands that remain the default path.
- Removing useful seven-agent visual identity while restructuring the README.

## Rollback Plan
Revert the documentation-only edits for the affected README and docs pages. No
code or generated runtime artifacts should need rollback.

## Success Criteria
- README presents thoth-agents as multi-harness with OpenCode and Codex clearly
  supported and scoped.
- Existing OpenCode install and run commands remain discoverable and accurate.
- Codex docs remain dedicated and linked, with capability caveats visible.
- High-priority docs no longer describe shared skills, agents, or config as
  OpenCode-only unless explicitly scoped to OpenCode.
- Seven-agent roster names and images remain present in the README.
