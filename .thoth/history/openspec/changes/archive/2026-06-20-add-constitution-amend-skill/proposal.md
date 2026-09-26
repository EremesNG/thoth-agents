# Proposal: Add Constitution Amendment Skill (`sdd-constitution`)

## Intent

The project constitution (`openspec/memory/constitution.md`) has a lifecycle
with two of three sides present:

- **CREATION** — `sdd-init` bootstraps the file at `v1.0.0` with the five native
  thoth-agents principles and an empty `## Sync-Impact Report` (idempotent).
- **ENFORCEMENT** — the Constitution Check gate in `sdd-design` (self-review) and
  `plan-reviewer` (independent enforcement) reads the constitution LIVE on every
  run, gated by `rules.constitution.enforce_check`.
- **AMENDMENT** — **missing.** There is no path to change a principle, so the
  constitution stays at `v1.0.0` forever even when governance evolves.

This change adds the missing AMENDMENT side as a new bundled skill
`sdd-constitution`. It mirrors the INTENT of spec-kit's `/speckit.constitution`
command — guided semver amendment + Sync-Impact Report — adapted to our
architecture. Critically, because our enforcement gates read the constitution
LIVE (rather than copying principle text into static templates as spec-kit does),
there are NO static principle copies to realign; the skill therefore amends the
end-user constitution file ONLY and is REPORT-ONLY for everything else. As with
prior spec-kit adoptions, we adopt the MECHANIC, not the content, and the
behavior is identical across OpenCode, Claude Code, and Codex.

## Scope

### In Scope

1. **New bundled skill `sdd-constitution` that amends the constitution file.**
   The skill performs a GUIDED amendment of the END-USER project file
   `openspec/memory/constitution.md` ONLY:
   - A guided semver bump per the established policy: MAJOR = a principle is
     removed or redefined; MINOR = a principle is added or guidance materially
     expanded; PATCH = clarification or wording. The bump is MANUAL but guided —
     no runtime parser and no automated bump without a human decision.
   - Update the header `Last-Amended` date.
   - Prepend a new entry to the `## Sync-Impact Report` section (newest on top) in
     the established format
     `- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`.
   - From: constitution can only be CREATED (v1.0.0) and ENFORCED; no amend path.
   - To: an explicit guided skill amends the constitution file with a semver
     bump, updated date, and a Sync-Impact Report entry.
   - Reason: close the lifecycle so governance can actually evolve past v1.0.0.
   - Impact: NEW `src/skills/sdd-constitution/SKILL.md`; the only file the skill
     ever writes is `openspec/memory/constitution.md`.

2. **Dual trigger: explicit invocation + report-only auto-suggest.** The skill is
   triggerable BOTH by explicit invocation AND auto-suggested (report-only, NOT a
   hard gate) by `sdd-archive` and `sdd-verify` when a completed change touched
   governance / principles.
   - From: no signal that a completed change may warrant a constitution amendment.
   - To: `sdd-verify` and `sdd-archive` surface a non-blocking suggestion to run
     `sdd-constitution` when governance/principles were touched.
   - Reason: amendments are easy to forget; surface them at the natural
     end-of-change moments without forcing ceremony.
   - Impact: `src/skills/sdd-verify/SKILL.md`, `src/skills/sdd-archive/SKILL.md`
     (advisory, report-only text — never a gate).

3. **Report-only for everything except the constitution file.** CRITICAL
   architectural constraint: when the plugin is INSTALLED in a harness
   (OpenCode / Codex), bundled skills are READ-ONLY assets. The skill MUST NEVER
   edit another `SKILL.md` or any plugin asset. Unlike spec-kit — which copies
   principle text into static `.specify` templates and must propagate edits — our
   enforcement gates read the constitution LIVE, so there are NO static principle
   copies to realign. The Sync-Impact Report entry therefore only DOCUMENTS which
   gates consume the principles and FLAGS any in-flight change artifacts
   (`design.md` / `tasks.md`) that referenced now-changed principles for HUMAN
   re-review.
   - From: spec-kit's model assumes a Consistency Propagation Checklist that
     edits dependent templates.
   - To: propagation is REPORT-ONLY documentation; no dependent asset is edited.
   - Reason: respect the read-only nature of installed plugin assets and the
     live-read enforcement architecture.
   - Impact: `src/skills/_shared/openspec-convention.md` (extend the Constitution
     Governance section with the amendment workflow doctrine).

4. **Registration and registration test.** Register the new skill in the bundled
   skill registry and assert it.
   - Impact: `src/harness/core/skills.ts` `BUNDLED_SKILL_REGISTRY` (new entry:
     `ORCHESTRATOR_ONLY`, `sourcePath: 'src/skills/sdd-constitution'`,
     `kind: 'skill'`, `purpose: 'sdd'`); `src/cli/custom-skills.test.ts`
     (registration assertion).

All behavior is harness-neutral: the skill and shared doctrine live in
`src/skills/`, and the registry entry is shared. Zero dialect-specific handling
is required, so OpenCode, Claude Code, and Codex inherit identical behavior.

### Deferred / Needs Discovery

Carried forward to spec/design (do NOT resolve here):

- **(a)** The exact prose mechanism by which `sdd-verify` / `sdd-archive` detect
  "governance / principles were touched" (heuristic on touched paths/principle
  references vs. an explicit author signal in the change artifacts).
- **(b)** Whether the auto-suggest text is shared via the `_shared` convention or
  inlined per skill, to avoid drift between `sdd-verify` and `sdd-archive`.
- **(c)** Whether `sdd-constitution` participates in the SDD phase contract /
  delegation matrix at all, or remains a standalone explicitly-invoked skill
  outside `FULL_SDD_PHASE_ORDER` (it is not a pipeline phase).

### Out of Scope

Explicit exclusions (NOT part of this change):

- **No editing of plugin skills or assets at runtime.** The skill never modifies
  any `SKILL.md`, template, or bundled asset; the only writable target is
  `openspec/memory/constitution.md`.
- **No runtime parser and no fully-automated semver bump.** The bump stays manual
  but guided; no tooling auto-detects MAJOR/MINOR/PATCH without a human.
- **No auto-fixing of in-flight change artifacts.** When `design.md` / `tasks.md`
  referenced now-changed principles, this is REPORTED for human re-review, never
  performed automatically.
- **No new `config.yaml` toggle.** The `constitution` section already exists; a
  report-only design needs no new toggle (`enforce_check` continues to gate the
  separate Constitution Check, which this change does not alter).
- **No change to the enforcement gates' behavior.** `sdd-design` and
  `plan-reviewer` Constitution Check logic is untouched; this change only adds
  the amendment path and report-only suggestions.

## Approach

Implement entirely in the harness-neutral skill layer:

- Author `src/skills/sdd-constitution/SKILL.md` as a guided amendment workflow
  whose ONLY write target is `openspec/memory/constitution.md` (semver bump +
  `Last-Amended` + prepended Sync-Impact Report entry). It restates the
  read-only-asset constraint explicitly so it can never edit another skill.
- Extend the existing Constitution Governance section of
  `src/skills/_shared/openspec-convention.md` with the amendment doctrine: the
  guided semver bump, the Sync-Impact Report entry format, the report-only
  propagation model, and the read-only-asset prohibition.
- Add report-only auto-suggest prose to `src/skills/sdd-verify/SKILL.md` and
  `src/skills/sdd-archive/SKILL.md` (advisory, never a gate).
- Register the skill in `BUNDLED_SKILL_REGISTRY` and add the registration
  assertion in `src/cli/custom-skills.test.ts`.

Each piece is additive and independently revertable; absence of the new skill
leaves today's creation + enforcement behavior unchanged.

## Affected Areas

- NEW `src/skills/sdd-constitution/SKILL.md` — the guided amendment skill.
- `src/harness/core/skills.ts` — new `BUNDLED_SKILL_REGISTRY` entry
  (~line 148; `ORCHESTRATOR_ONLY`, `sourcePath: 'src/skills/sdd-constitution'`,
  `kind: 'skill'`, `purpose: 'sdd'`).
- `src/skills/_shared/openspec-convention.md` — extend the Constitution
  Governance section (~lines 178-205) with the amendment workflow doctrine.
- `src/skills/sdd-verify/SKILL.md` — report-only auto-suggest of
  `sdd-constitution` when governance/principles were touched.
- `src/skills/sdd-archive/SKILL.md` — same report-only auto-suggest.
- `src/cli/custom-skills.test.ts` — registration assertion for the new skill.
- NO change to `openspec/config.yaml` (constitution section already present;
  report-only design needs no new toggle).

## Risks

- **Read-only-asset violation** (the key risk) — if the skill prose is ambiguous,
  an agent could attempt to "propagate" by editing another `SKILL.md`. Mitigation:
  the skill and shared doctrine MUST state the read-only-asset prohibition
  explicitly and constrain the write target to the constitution file alone.
- **Auto-suggest drift** — `sdd-verify` and `sdd-archive` suggestion text could
  diverge (see deferred (b)); keep wording aligned or share it via `_shared`.
- **Suggestion misfire** — over- or under-triggering the report-only suggestion
  (see deferred (a)); because it is advisory-only, a misfire is low-impact (a
  human decides), but the detection heuristic should be conservative.
- **Semver misjudgment** — a human could pick the wrong bump level; mitigated by
  the guided policy prose, and acceptable because the policy is human-owned by
  design (no runtime parser).

## Rollback Plan

Each piece is additive and independently revertable. Deleting
`src/skills/sdd-constitution/SKILL.md`, removing its `BUNDLED_SKILL_REGISTRY`
entry and the `custom-skills.test.ts` assertion, and reverting the doctrine and
auto-suggest additions to `openspec-convention.md` / `sdd-verify` / `sdd-archive`
restores prior behavior. No main spec, archived change, `config.yaml`, or
enforcement-gate logic is touched, so rollback is clean.

## Success Criteria

1. `sdd-constitution` exists as a bundled, registered, `ORCHESTRATOR_ONLY` SDD
   skill and performs a guided amendment of `openspec/memory/constitution.md`
   ONLY: semver bump (MAJOR/MINOR/PATCH per policy), updated `Last-Amended` date,
   and a prepended Sync-Impact Report entry in the established format.
2. The skill is triggerable both explicitly and via a report-only (non-blocking)
   auto-suggestion surfaced by `sdd-verify` and `sdd-archive` when a completed
   change touched governance/principles.
3. The skill NEVER edits any other `SKILL.md` or plugin asset; propagation is
   report-only and only documents consuming gates and flags in-flight change
   artifacts for human re-review.
4. No runtime parser, no automated bump, no auto-fix of in-flight artifacts, and
   no new `config.yaml` toggle are introduced.
5. All criteria hold across OpenCode, Claude Code, and Codex; the registration
   assertion passes and `pnpm run check:ci` passes.

## Constitution Check

This change is consistent with the native thoth-agents constitution and, in fact,
strengthens its lifecycle. It upholds **multi-harness parity** (the skill and
shared doctrine are fully shared, zero dialect-specific handling), **governed
persistence** (the only write target is the canonical
`openspec/memory/constitution.md`; no improvised persistence), **delegate-first
coordination** (the skill is `ORCHESTRATOR_ONLY` and routes through the existing
registry), and **read-only role boundaries / installed-asset integrity** (the
skill is explicitly forbidden from editing any bundled asset). No existing
principle is removed or redefined by THIS change, so no constitution version bump
is required for it; it merely adds the MECHANISM by which future amendments occur.
