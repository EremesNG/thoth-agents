---
name: thoth-init
description: Initialize or synchronize the minimum offline .thoth governance structure required by thoth-agents workflows.
license: MIT
compatibility: Requires Node.js >=22.19 and write access to the target project.
metadata:
  author: thoth-agents
  version: "1.0"
---

# Thoth Init

Initialize or synchronize the current project's Thoth governance from this
installed skill bundle. Resolve `<skill-dir>` as the directory containing this
`SKILL.md`, then run the bundled script by absolute path:

```text
node "<skill-dir>/scripts/init.mjs" --project <project-root> --json
```

The project root must already exist. The initializer preflights the complete
target structure before changing it, then ensures these minimum paths exist:

- `.thoth/changes/archive/`
- `.thoth/specs/`
- `.thoth/constitution.md`
- `.thoth/.thoth-agents.json`

The missing constitution is copied from the installed sibling
`thoth-constitution` skill. An existing constitution remains byte-for-byte
intact, while the thoth-managed work schema manifest may be normalized to schema
version 1. Existing `openspec/` content is outside the managed graph and remains
untouched. Inspect the JSON `created`, `managed`, and `preserved` arrays when
reporting the result.

The initializer never creates, copies, validates, reads, or synchronizes
workflow templates. Workflow assets remain in the installed `thoth-work` skill
and are consumed directly from that bundle when persisted work requires them.

This operation is offline, idempotent, and harness-neutral. Every write stays
inside `.thoth/`. It never installs or synchronizes skills, agents, plugins,
harness configuration, external dependencies, or global instruction files;
those are responsibilities of `npx thoth-agents install`.
