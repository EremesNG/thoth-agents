---
name: thoth-init
description: Initialize canonical offline .thoth governance without modifying existing project records.
license: MIT
compatibility: Requires Node.js >=22.19 and write access to target project.
metadata:
  author: thoth-agents
  version: "2.0"
---

# Thoth Init

Run the installed script by absolute skill-root path:

```text
node "<skill-dir>/scripts/init.mjs" --project <project-root> --json
```

For a new project, initialize `.thoth/changes/archive/`, `.thoth/specs/`, and
`.thoth/constitution.md`. A missing constitution comes from the sibling
thoth-constitution template with date placeholders filled. Preserve an existing
constitution and all existing `.thoth` change/spec history byte-for-byte; never
auto-migrate or overwrite project governance. Refuse symlinked ancestors,
unknown path collisions, or an active legacy OpenSpec tree rather than creating a
duplicate active store. Migration is an explicit project change, not an init side
effect.

The operation is offline and idempotent. It creates no manifests, change records,
workflow templates, OpenSpec tree, process tools, or mirrored state. Return JSON
`created` and `preserved` paths. No installer or network access is involved.
This skill presents no interactive choices and does not infer missing target
facts. Any orchestrator choice around initialization follows the shared SDD
recommendation and per-question retry policy.
