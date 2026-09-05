---
name: thoth-constitution
description: Create or explicitly amend the project constitution, choose its governance SemVer bump, propagate its impact, and validate lifecycle metadata. Use only for constitution lifecycle work; routine SDD planning reads the constitution without activating this skill.
license: MIT
compatibility: Requires Node.js >=22.19 for bundled validation scripts.
metadata:
  author: thoth-agents
  version: "1.0"
---

# Thoth Constitution

The canonical project constitution is `openspec/memory/constitution.md`.
Resolve `<skill-dir>` as the directory containing this `SKILL.md`. Every bundled
validator or template path below is anchored to that installed skill root rather
than the project or current working directory.

## Routine SDD

- Read every active principle before planning.
- Record concrete pre-design and post-design Constitution Check evidence in
  `plan.md`.
- Do not amend the constitution, bump its version, or run lifecycle validation
  for an ordinary feature change.

## Explicit amendment

Activate this lifecycle only on explicit user direction or when the user accepts
a confirmed durable governance change.

1. Read the current constitution and every affected template, instruction, and
   durable workflow document.
2. Classify the governance version bump:
   - **MAJOR** removes or redefines a principle or compatibility boundary.
   - **MINOR** adds a principle/section or materially expands guidance.
   - **PATCH** clarifies wording without semantic change.
3. Preserve the original ratification date, set `Last amended` to today, and
   update `Version` using complete `MAJOR.MINOR.PATCH` SemVer.
4. Prepend or refresh the HTML-comment `Sync Impact Report`: old → new version,
   modified principles, added/removed sections, affected templates with status,
   and follow-up TODOs.
5. Propagate the accepted rule to every affected template, instruction, and
   documentation surface in the same change.
6. Remove unexplained placeholders and deferred TODOs, then run:

```bash
node "<skill-dir>/scripts/validate.mjs" \
  --constitution openspec/memory/constitution.md --json
```

Initialization copies `<skill-dir>/templates/constitution.md` only when the
project has no constitution, resolves its date placeholders, and never
overwrites a project-owned constitution.
