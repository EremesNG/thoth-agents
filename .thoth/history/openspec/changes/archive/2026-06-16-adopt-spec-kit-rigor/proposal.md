# Proposal: Adopt Spec-Kit Rigor in the SDD Pipeline

## Intent

Raise SDD front-end rigor (governance -> requirements -> consistency) by
adopting seven mechanisms inspired by github/spec-kit, while preserving our
back-end strengths (multi-agent dispatch, sdd-verify, sdd-archive, thoth-mem).
We adopt spec-kit MECHANICS, not its content: the constitution holds NATIVE
thoth-agents principles, not spec-kit's nine articles. Delivery is phased.

## Scope

### In Scope — Phase A (high value)

1. **Project constitution**: versioned (semver) `openspec/memory/constitution.md`
   carrying native principles (delegate-first coordination, read-only role
   boundaries, governed persistence, multi-harness parity, evidence-led
   verification) plus a sync-impact report, and a **blocking "Constitution
   Check" gate** (override via AskUserQuestion). `sdd-init` bootstraps it;
   `plan-reviewer` and/or `sdd-design` enforce the gate.
2. **/analyze-style consistency**: UPGRADE `plan-reviewer` with
   proposal<->spec<->design<->tasks coverage checks, severity levels, and a
   requirement-coverage percentage, behind a **blocking consistency gate**
   (override via AskUserQuestion). Not a new phase.
3. **Requirements-quality checklists** ("unit tests for English"), domain-typed:
   generated around `sdd-spec` as a durable artifact validating requirement
   QUALITY (completeness, clarity, measurability), consumed before tasks.

### In Scope — Phase B (medium value)

4. **`[NEEDS CLARIFICATION]` markers** capped at 3 per spec, informed-guess-first
   (fill defaults, record in Assumptions, escalate only genuine forks);
   `sdd-spec` emits, `plan-reviewer` enforces the cap.
5. **Task traceability**: add `[USN]` story id, priority P1/P2/P3, and an
   "Independent Test" to the `sdd-tasks` template; `executing-plans` consumes them.
6. **Explicit TDD ordering** in tasks, gated by `config.yaml tasks.tdd`.
7. **Phase handoffs**: optional handoff hints in `SddPhaseContract`
   (`src/harness/core/sdd.ts`) plus skill prose, so each phase forwards what the
   next must preserve.

All mechanisms are harness-agnostic (OpenCode, Claude Code, Codex), implemented
in shared `_shared` conventions and unified phase contracts; harness-specific
prose only on a capability gap. `config.yaml rules:` gains one section per
mechanism.

### Deferred / Needs Discovery

- `taskstoissues` GitHub-issue export and inline `[P]` parallel markers
  (opportunistic follow-up).

### Out of Scope

- Replacing multi-agent apply with spec-kit's monolithic `/implement`.
- Removing or weakening `sdd-verify` or `sdd-archive`.
- Adopting the Python/uvx CLI.

## Approach

Phase A first (governance, consistency, requirement quality), then Phase B
(traceability, TDD, handoffs). Logic lands in harness-neutral shared
conventions and the section pipeline so all three harnesses inherit it; explore
confirmed no dialect conflicts. Both new gates block with explicit user override.

## Affected Areas

- `src/skills/_shared/{openspec-convention.md,persistence-contract.md,thoth-mem-convention.md}`
- `plan-reviewer`, `sdd-spec`, `sdd-tasks`, `sdd-init`,
  `requirements-interview`, `executing-plans`, `sdd-design`
- `src/harness/core/sdd.ts` (+ its test)
- `openspec/config.yaml`; new `openspec/memory/constitution.md`

## Risks

- **Gate friction** -> gates honor explicit AskUserQuestion override.
- **Multi-harness drift** -> logic in `_shared`/section pipeline, not dialects.
- **Template churn breaking apply** -> markers optional/back-compatible;
  `executing-plans` tolerates their absence.
- **Constitution staleness** -> semver + sync-impact report on edits.

## Rollback Plan

Each mechanism is additive and independently revertable. Removing
`constitution.md`, the new `config.yaml rules:` sections, the
`plan-reviewer`/`sdd-spec`/`sdd-tasks` additions, and the optional
`SddPhaseContract` handoff field restores prior behavior; no main spec or
archived change is touched.

## Success Criteria

1. Constitution exists, semver-versioned, bootstrapped by `sdd-init`; blocking
   Constitution Check fires in `plan-reviewer`/`sdd-design` with working override.
2. `plan-reviewer` reports cross-artifact coverage %, severity levels, and a
   blocking consistency gate.
3. A requirements-quality checklist is produced at `sdd-spec` and consumed
   before tasks.
4. Specs enforce <=3 `[NEEDS CLARIFICATION]` markers with documented assumptions.
5. Tasks carry `[USN]`/priority/Independent Test; `executing-plans` consumes them.
6. `tasks.tdd` toggles test-first ordering.
7. `SddPhaseContract` carries handoff hints surfaced in phase prose.
8. All criteria hold across OpenCode, Claude Code, and Codex; `pnpm run check:ci`
   passes.
