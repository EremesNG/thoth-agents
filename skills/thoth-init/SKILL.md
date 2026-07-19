---
name: thoth-init
description: Initialize project SDD governance and OpenCode local skills from the installed bundle; Codex global agents and instructions remain CLI-owned.
---

# Thoth Init

Initialize the current project from this installed skill bundle. Resolve
`<skill-dir>` as the directory containing this `SKILL.md`, then run the bundled
script by absolute path:

```text
node "<skill-dir>/scripts/init.mjs" --project <project-root> --harness <opencode|codex|claude> --json
```

- OpenCode materializes the four thoth-owned workflow skills under
  `.agents/skills/`.
- Codex init creates project governance only. Codex plugin manifests cannot
  install custom agents or global instructions; first run the mandatory
  thoth-agents CLI setup that manages `~/.codex/agents/`,
  `~/.codex/AGENTS.md`, and `~/.codex/config.toml`.
- Claude uses auto-discovered plugin agents and owned skills; init creates only
  project governance assets.

For every harness, installation must already have used the thoth-agents CLI to
install mandatory external skills from their canonical repositories. This init
skill never invokes the CLI or downloads a skill.

The operation is offline and idempotent. It never overwrites the project
constitution, templates, or unrelated instruction content.
