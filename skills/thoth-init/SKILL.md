---
name: thoth-init
description: Initialize or synchronize the minimum project OpenSpec governance structure required by thoth-agents SDD flows.
license: MIT
compatibility: Requires Node.js >=22.13 and write access to the target project.
metadata:
  author: thoth-agents
  version: "1.0"
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
- `openspec/.thoth-agents.json`

The missing constitution is copied from the installed sibling
`thoth-constitution` skill. An existing constitution remains byte-for-byte
intact, while the thoth-managed manifest may be normalized to the current
contract. Any legacy `openspec/templates/` tree is outside the managed graph and
remains untouched. Inspect the JSON `created`, `managed`, and `preserved` arrays
when reporting the result.

The initializer never creates, copies, validates, reads, or synchronizes SDD
workflow templates. Those assets remain in the installed `thoth-sdd` skill and
are consumed directly from that bundle by the workflow phase contracts.

This operation is offline, idempotent, and harness-neutral. Every write stays
inside `openspec/`. It never installs or synchronizes skills, agents, plugins,
harness configuration, external dependencies, or global instruction files;
those are responsibilities of `npx thoth-agents install`.
