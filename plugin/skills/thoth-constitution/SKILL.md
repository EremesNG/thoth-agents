---
name: thoth-constitution
description: Create or explicitly amend the active .thoth constitution with SemVer and sync-impact lifecycle validation.
license: MIT
compatibility: Requires Node.js >=22.19 for bundled validation.
metadata:
  author: thoth-agents
  version: "2.0"
---

# Thoth Constitution

Canonical active governance is `.thoth/constitution.md`; substantial change
records and durable specifications live under `.thoth/`. Historical changes are
preserved and are not an active workflow dependency. Routine SDD reads relevant
principles but does not amend constitution metadata.

Only explicit user direction or an accepted material governance change activates
amendment. Preserve original ratification, set last-amended to the amendment
date, choose MAJOR for redefinition/removal, MINOR for addition/material
expansion, PATCH for clarification, and refresh the Sync Impact Report (old/new
version, modified principles, added/removed sections, affected templates,
follow-up). Propagate changes to affected instruction and template surfaces,
then run:

```text
node "<skill-dir>/scripts/validate.mjs" --constitution .thoth/constitution.md --json
```

Initialization copies the bundled template only when the constitution is absent,
replaces date placeholders, and never overwrites project-owned governance.
