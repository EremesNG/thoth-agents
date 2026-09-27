---
name: thoth-work
description: Persist, validate, resume, and close AI-first repository work through an offline work contract without replacing native agent lifecycle authority.
license: MIT
compatibility: Node.js 22.19 or newer; offline filesystem and Git CLI access.
metadata:
  version: 1.1.0
---

# Thoth Work

Use this skill for non-trivial repository changes that benefit from durable
agreement, ownership, context, evidence, and recovery. Classify work before creating `work.yaml`:
clear, bounded, low-risk work stays artifact-free even with useful delegation.
Read [references/planning.md](references/planning.md) to explore, specify and
clarify before planning and persisting. Read [references/contract.md](references/contract.md)
for the canonical `.thoth/changes/<id>/work.yaml` format before writing it.
Reuse the planning reference for a ready plan or resumed choice. Offer Oracle review or
direct implementation; after Oracle [OKAY], offer implementation or stopping.
Only these two choices have the bounded three-unanswered-return defaults.

The root owns `work.yaml`, external unit files, semantic acceptance, and final
verification. A specialist may write only its assigned product surface and
`.thoth/changes/<id>/evidence/<unit>/checkpoint.json`. Native harness state is
authoritative for live agents. A checkpoint documents progress; it never says a
writer is running, dead, or safe to replace.

Resolve `<skill-dir>` to the installed directory containing this `SKILL.md`.
Invoke scripts from that absolute directory because a user's project does not
contain the installed skill tree. Run validation before dispatch and closeout:

```text
node "<skill-dir>/scripts/work.mjs" validate --project <root> --id <change> --through ready
node "<skill-dir>/scripts/work.mjs" validate --project <root> --id <change> --through closeout
```

Use `fingerprint --kind agreement|inputs|outputs` to calculate identities.
`checks[].command` is data and is never auto-executed; the root still deliberately
runs project-owned TDD and verification commands. Query native lifecycle before
resuming; unknown liveness blocks only overlapping writes or resources. Read
[references/recovery.md](references/recovery.md) when checkpointing or resuming,
and [references/examples.md](references/examples.md) for optional files, results,
and CLI examples.

Structural validation is not semantic review. Closeout requires fresh root
acceptance and an independent Oracle PASS before archive applies durable updates.
