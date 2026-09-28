<!--
Sync Impact Report
- Version change: 9.0.0 -> 10.0.0
- Modified principles: Replace work.yaml/route-selection workflow with mandatory proportional understanding followed by risk-aware classification; make one ID-named Markdown record the sole substantial-change artifact; establish .thoth as active governance and specification storage.
- Added sections: None
- Removed sections: None
- Templates: ✅ skills/thoth-constitution/templates/constitution.md; ✅ skills/thoth-sdd; ✅ skills/thoth-init; ✅ skills/thoth-archive; ✅ root prompts and active documentation
- Follow-up TODOs: None
-->
# thoth-agents Project Constitution

**Version**: 10.0.0<br>
**Ratified**: 2026-06-16<br>
**Last amended**: 2026-09-28

## Principles

### 1. Native runtime authority and human ownership

OpenCode, Codex, Claude Code, and Pi own dispatch, capacity, status, wait,
steering, cancellation, and terminal results through their native primitives.
thoth-agents MUST NOT implement a scheduler, queue, execution database, lifecycle
mirror, or per-change process tooling. Capability gaps MUST remain explicit and
use a truthful bounded fallback.

The root orchestrator owns intent, scope, material decisions, coordination,
semantic acceptance, and synthesis. Product, architecture, security, secret, and
destructive decisions remain human-owned. An unresolved material decision MUST
block classification and implementation; routine technical assumptions MUST be
bounded by evidence and accepted intent.

### 2. Proportional SDD and classification

Every change MUST complete explore, specify, and clarify in order, at a scale
proportional to its uncertainty and impact, before classification. These phases
MUST NOT force a saved document, specialist agent, or interview. Root MUST
investigate repository facts before asking the user, and MUST ask only when a
material human-owned decision cannot safely be inferred. Only after understanding
is settled may root classify by meaningful coordination and contract impact,
uncertainty, and risk/failure cost. File count alone MUST NOT increase scope; a
clear, low-risk localized mechanical change may span several files and remain
small. New material uncertainty, broader coordination, or increased risk MUST
reopen understanding and classification before work expands.

Small, clear, low-risk work MUST use test-first implementation and focused
verification without a persistent change record. Substantial work MUST use only
`.thoth/changes/<id>/<id>.md`, with a safe lowercase kebab-case ID, for accepted
intent, non-goals, decisions, plan, tasks, verification, and closeout. A patch-sized
change may still require planning when its coordination impact, uncertainty, or
risk warrants it. No change alias, duplicate record, sidecar report, evidence
directory, or generated process tool is permitted. Package versions MUST NOT be
auto-incremented as part of workflow execution.

### 3. Bounded roles and authorization

The pack contains `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`,
and `worker`. Explorer, librarian, and Oracle are read-only; designer owns
material UI/UX work; worker owns bounded nonvisual implementation regardless of
complexity. Delegation depth is one, each mutable surface has one writer, and no
writer approves their own work.

For substantial work, optional read-only Oracle plan review follows ready only
when selected; its result does not authorize implementation. After a selected
review returns `[OKAY]`, the root preserves the separate `Implement (Recommended)` /
`Stop` decision. Explicit answers and Stop win. For each choice, only the third confirmed
answerless native return MAY select its recommendation; pending questions,
unavailable tools or UI, failures, and interruption MUST NOT count. These
choices MUST NOT settle material human-owned decisions. A selected plan review
never replaces final verification.

### 4. Independent verification and durable governance

Every change MUST be verified. Small low-risk work receives focused checks;
substantial or materially risky work MUST receive a fresh independent read-only
Oracle judgment against the accepted intent, actual diff, executed checks, and
residual risks. A writer MUST NOT approve its own result. Failed verification
blocks closeout until bounded same-intent corrections are reverified.

The active constitution MUST reside at `.thoth/constitution.md`; durable
specifications MUST reside at `.thoth/specs/<capability>/spec.md`; substantial
change records and archives MUST remain under `.thoth/changes/`. `thoth-init`
MUST initialize only absent minimum `.thoth/` governance and preserve existing
project-owned content. Only explicit accepted governance amendments update the
constitution using its SemVer lifecycle, preserving original ratification.
Declared exact-title durable deltas MUST be applied transactionally only after
fresh passing verification. Historical changes remain preserved; archive
collisions, unsafe IDs, and symlinked ancestors fail closed. Historical material
under `.thoth/history/openspec/` is not active workflow state.

## Governance

- Amendments require explicit user direction, a refreshed Sync Impact Report,
  original ratification, an ISO last-amended date, and propagation to affected
  templates, instructions, specifications, and documentation.
- Routine work reads relevant active principles; it does not amend lifecycle
  metadata.
- MAJOR versions redefine or remove a principle or compatibility boundary.
- MINOR versions add a principle or materially expand guidance.
- PATCH versions clarify wording without changing semantic behavior.
