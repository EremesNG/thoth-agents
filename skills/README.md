# Bundled thoth-owned skills

This directory is the canonical, versioned source for skills owned by
thoth-agents. `pnpm run integration:sync` copies those skills into the Codex and
Claude Code plugins; `npx thoth-agents install --agent=opencode` materializes
the same packaged skill trees globally under `~/.config/opencode/skills/`.

Owned workflow skills are `thoth-init`, `thoth-sdd`, `thoth-constitution`,
`thoth-archive`, and `plan-reviewer`. The last one implements the optional,
user-selected, read-only Oracle review before implementation. Mandatory external
skills (`simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling`) are not copied here:
the thoth-agents installer invokes `npx skills add` against their canonical
repositories so they retain a single source of truth. `thoth-init` only
initializes or synchronizes minimum project `openspec/` governance and never
installs skills.
