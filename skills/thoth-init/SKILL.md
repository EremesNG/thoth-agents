---
name: thoth-init
description: Initialize or synchronize the minimum project OpenSpec governance structure required by thoth-agents SDD flows.
---

# Thoth Init

Initialize or synchronize the current project's OpenSpec governance from this
installed skill bundle. Resolve `<skill-dir>` as the directory containing this
`SKILL.md`, then run the bundled script by absolute path:

```text
node "<skill-dir>/scripts/init.mjs" --project <project-root> --json
```

The project root must already exist. The initializer preflights the complete
target structure before changing it, then ensures these minimum paths exist:

- `openspec/changes/archive/`
- `openspec/specs/`
- `openspec/memory/`
- `openspec/templates/`
- `openspec/.thoth-agents.json`

Missing constitution and SDD template files are copied from the installed
bundle. Existing constitution and template files remain byte-for-byte intact;
the thoth-managed manifest may be normalized to the current contract. Inspect
the JSON `created`, `managed`, and `preserved` arrays when reporting the result.

This operation is offline, idempotent, and harness-neutral. Every write stays
inside `openspec/`. It never installs or synchronizes skills, agents, plugins,
harness configuration, external dependencies, or global instruction files;
those are responsibilities of `npx thoth-agents install`.
