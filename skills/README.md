# Bundled thoth-owned skills

This directory is the canonical, versioned source for skills owned by
thoth-agents. `pnpm run integration:sync` copies those skills into the Codex and
Claude Code plugins; OpenCode exposes `/thoth-init`, which materializes them
project-locally.

Owned workflow skills are `thoth-init`, `thoth-sdd`, `thoth-constitution`,
`thoth-archive`, and `plan-reviewer`. The last one implements the optional,
user-selected, read-only Oracle review before implementation. Mandatory external
skills (`simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling`) are not copied here:
the thoth-agents installer invokes `npx skills add` against their canonical
repositories so they retain a single source of truth.
