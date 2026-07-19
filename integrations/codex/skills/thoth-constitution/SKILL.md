---
name: thoth-constitution
description: Create, revise, and enforce the project constitution used by thoth-agents SDD planning gates. Use for constitution lifecycle or before artifact-backed planning.
---

# Thoth Constitution

The canonical project constitution is `openspec/memory/constitution.md`.

- During initialization, copy `templates/constitution.md` only when the project
  has no constitution. Never overwrite a project-owned constitution.
- Before planning, read every active principle and record a pre-design
  Constitution Check in `plan.md`.
- After design, repeat the check against concrete technical choices. A violation
  must be justified explicitly or block task generation.
- Amend principles only on explicit user direction or when a confirmed durable
  project rule changes. Record the amendment date and migration impact.
- Constitution gates are evidence, not boilerplate: name the affected design
  decision for each PASS, justified exception, or failure.
