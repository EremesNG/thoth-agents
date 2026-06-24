---
name: sdd-constitution
description: Guide a semver constitution amendment and Sync-Impact Report entry.
metadata:
  author: thoth-agents
  version: 1.0.0
---

# SDD Constitution Skill

Perform a guided, human-confirmed amendment of `openspec/memory/constitution.md`
ONLY — a semver version bump, an updated `Last-Amended` date, and one prepended
`## Sync-Impact Report` entry. This skill closes the constitution lifecycle by
adding its AMENDMENT side; it never edits any other bundled asset.

## Shared Conventions

- [../_shared/openspec-convention.md](../_shared/openspec-convention.md)
- [../_shared/persistence-contract.md](../_shared/persistence-contract.md)
- [../_shared/thoth-mem-convention.md](../_shared/thoth-mem-convention.md)

## Persistence Mode

The orchestrator passes the artifact store mode (`thoth-mem`, `openspec`, or
`hybrid`). Follow the persistence contract for read/write rules per mode.

- `thoth-mem`: record the amendment as a governance observation only — do NOT
  create or modify `openspec/` files.
- `openspec`: write `openspec/memory/constitution.md` only — do NOT call
  thoth-mem save tools.
- `hybrid`: do both — write the file AND record the governance observation
  (default).

## When to Use

- A native principle must be added, redefined, removed, or its guidance
  materially expanded or clarified, and the constitution must record it.
- A report-only suggestion from `sdd-verify` or `sdd-archive` flagged a
  completed change as governance-touching and a human chooses to record an
  amendment.

## Prerequisites

- An existing `openspec/memory/constitution.md` (bootstrapped by `sdd-init`).
- A human-described principle change (what changed and why).
- `change-name` — OPTIONAL context only; the skill may run standalone and is not
  a per-change pipeline phase.
- Selected persistence mode (default: `hybrid`).

## Workflow

1. Read the shared conventions, especially `openspec-convention.md` >
   Constitution Governance (amendment doctrine, read-only-asset rules, and the
   Sync-Impact Report entry format).
2. Load `openspec/memory/constitution.md` and read its `Version:`, `Ratified:`,
   `Last-Amended:` header fields and the existing `## Sync-Impact Report`
   section. If the file is absent, instruct the user to run `sdd-init` first;
   do NOT create the constitution here.
3. Determine the principle change from the human description. If no principle
   change is warranted, report a no-op and stop — write nothing.
4. Classify the bump per policy: MAJOR = a principle is removed or redefined;
   MINOR = a principle is added or guidance materially expanded; PATCH =
   clarification or wording with no behavioral change. Present the
   classification for confirmation via the harness blocking-input surface
   (AskUserQuestion-equivalent). Do NOT write any version bump before the user
   confirms, and NEVER use a runtime parser to auto-select the bump.
5. Apply the amendment to `openspec/memory/constitution.md` ONLY: bump the
   `Version:` field, set `Last-Amended:` to the current date, and PREPEND
   exactly one entry to the top of the `## Sync-Impact Report` section in the
   canonical format
   `- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`.
   Preserve all existing content and ALL prior Sync-Impact Report entries.
6. Emit REPORT-ONLY impact: name the live-read consuming gates (`sdd-design`,
   `plan-reviewer`) in the Sync-Impact entry, and FLAG any in-flight change
   `openspec/changes/{name}/design.md` or `tasks.md` that reference now-changed
   principles for HUMAN re-review. Do NOT edit those artifacts or any other
   bundled asset.
7. Persist per the selected mode: in modes that include OpenSpec write the
   constitution file; in modes that include thoth-mem record a governance
   observation per the persistence contract.

## Output Format

Return:

- `Constitution Version`: old `X.Y.Z` -> new `X.Y.Z` (or unchanged on no-op)
- `Bump`: MAJOR, MINOR, PATCH, or no-op
- `Sync-Impact Entry`: the single prepended line (or none on no-op)
- `Consuming Gates`: live-read gates that consume the changed principles
  (e.g. `sdd-design`, `plan-reviewer`)
- `In-Flight Artifacts Flagged`: change `design.md` / `tasks.md` flagged for
  human re-review, or none
- `Files Written`: `openspec/memory/constitution.md` only, or none
- `Status`: amended or no-op

## Rules

- NEVER edit, create, or delete any other `SKILL.md`, any file under `src/`, or
  any bundled/template asset — the ONLY writable target is
  `openspec/memory/constitution.md`.
- NEVER auto-bump: there is no runtime parser, and no `Version:` change is
  written without explicit human confirmation via the blocking-input surface.
- No-op when no principle change is warranted: report it and write nothing.
- Preserve all existing constitution content and ALL prior `## Sync-Impact
  Report` entries; only PREPEND the new entry and update the version/date.
- Propagation is report-only: document the consuming gates and flag in-flight
  change artifacts for human re-review; NEVER auto-fix them.
