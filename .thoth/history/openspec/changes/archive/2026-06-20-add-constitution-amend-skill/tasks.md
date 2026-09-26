# Tasks: Add Constitution Amendment Skill (`sdd-constitution`)

<!-- Coverage: 9 requirements, 18 GWT scenarios across spec sdd-constitution/spec.md -->
<!-- traceability: true — every task carries [USN] + Priority + Spec: + Independent Test -->
<!-- tdd: false — no forced test-before-impl ordering; single test task follows registry -->
<!-- [P] markers: 2 used (Phase 2 tasks 2.1–2.3 are markdown-only, independently writable; Phase 3 tasks 3.1–3.2 are markdown-only hooks, independently writable) -->
<!-- Ship order from design.md Migration/Rollout: SKILL.md -> registry+test -> _shared doctrine -> hook steps -->

---

> **Out-of-scope note (explicit non-task):** `openspec/config.yaml` is NOT
> touched. The `constitution` section and `version_policy: semver` already exist;
> a report-only design needs no new toggle (design Decision f). No task covers this.
> `src/harness/core/sdd.ts`, `src/agents/prompt-sections.ts`, and all pipeline-phase
> surfaces are also explicitly unchanged (design Decision a).

---

## Phase 1: Skill File and Registry (Compiled Anchor)

*SKILL.md lands first so its canonical description string can be verified before
it is copied into `skills.ts` and the test. The registry entry and test assertion
are produced together (they must agree byte-for-byte on the description string)
and follow immediately.*

- [x] 1.1 Create `src/skills/sdd-constitution/SKILL.md` — full canonical anatomy per design: YAML front-matter (`name: sdd-constitution`, canonical description), H1 + one-liner, Shared Conventions links, Persistence Mode block, When to Use, Prerequisites, Workflow (7 steps per design outline), Output Format, and Rules (MUST-NOTs). The description string in front-matter MUST be exactly: `Guide a semver constitution amendment and Sync-Impact Report entry.`
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-constitution/Guided Amendment of the Constitution File`, `sdd-constitution/Human-Confirmed Semver Classification`, `sdd-constitution/Read-Only Bundled-Asset Constraint`, `sdd-constitution/Report-Only Propagation`, `sdd-constitution/Idempotent No-Op and Content Preservation`, `sdd-constitution/Persistence Per Selected Mode`, `sdd-constitution/Harness-Neutral Behavior`
  **Independent Test:** File exists at `src/skills/sdd-constitution/SKILL.md`; grep for `Guide a semver constitution amendment and Sync-Impact Report entry.` in front-matter returns a match; grep for `NEVER edit` or read-only-asset prohibition returns a match; grep for `AskUserQuestion` or blocking-input returns a match; grep for `openspec/memory/constitution.md` as sole write target returns a match.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; no lint errors; `src/skills/sdd-constitution/SKILL.md` is present

- [x] 1.2 Register `sdd-constitution` in `BUNDLED_SKILL_REGISTRY` — add one entry at the end of the array in `src/harness/core/skills.ts` (after `sdd-archive`, before the closing `]` at ~line 148): `{ name: 'sdd-constitution', description: 'Guide a semver constitution amendment and Sync-Impact Report entry.', allowedRoles: ORCHESTRATOR_ONLY, sourcePath: 'src/skills/sdd-constitution', kind: 'skill', purpose: 'sdd' }`. Description string MUST be byte-identical to the SKILL.md front-matter.
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-constitution/Standalone Discoverable Governance Skill`
  **Independent Test:** `pnpm run typecheck` passes; the new literal satisfies `satisfies readonly SkillRegistryEntry[]`; grep `src/harness/core/skills.ts` for `sdd-constitution` returns a match.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Exit 0; `sdd-constitution` entry present and type-correct in `BUNDLED_SKILL_REGISTRY`

  > Depends on: 1.1 (description string defined in SKILL.md before being copied here)

- [x] 1.3 Add registration assertion in `src/cli/custom-skills.test.ts` — insert a new `test()` block alongside the existing `sdd-init` / `executing-plans` blocks (after ~line 92): `expect(CUSTOM_SKILLS).toContainEqual({ name: 'sdd-constitution', description: 'Guide a semver constitution amendment and Sync-Impact Report entry.', allowedAgents: ['orchestrator'], sourcePath: 'src/skills/sdd-constitution' })`. Description string MUST equal the `skills.ts` entry exactly.
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-constitution/Standalone Discoverable Governance Skill`
  **Independent Test:** Run `custom-skills.test.ts` in isolation; the new assertion passes.
  **Verification**:
  - Run: `pnpm test src/cli/custom-skills.test.ts`
  - Expected: All tests pass including the new `sdd-constitution` registration assertion

  > Depends on: 1.2 (registry entry must exist before the projection test can pass)

---

## Phase 2: Shared Doctrine (`_shared/openspec-convention.md`)

*The shared snippet must exist before the two hook skills can reference it.
All three prose blocks are additive to the Constitution Governance section and
are independent of each other in content but must be placed in order (amendment
workflow -> read-only-asset doctrine -> shared auto-suggest snippet). No compiled
dependency.*

- [x] 2.1 [P] Extend `src/skills/_shared/openspec-convention.md` — add amendment workflow doctrine block in the **Constitution Governance** section (after the existing `Constitution Check gate` bullet, before `### config.yaml mechanism-section backfill`): new sub-section `### Constitution Amendment` stating that `sdd-constitution` performs the guided, human-confirmed semver bump, `Last-Amended` update, and prepended `## Sync-Impact Report` entry (`- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`). State the ONLY writable target is `openspec/memory/constitution.md` and the bump is human-confirmed via blocking-input surface (no runtime parser, no auto-bump, no-op when no change).
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-constitution/Guided Amendment of the Constitution File`, `sdd-constitution/Human-Confirmed Semver Classification`
  **Independent Test:** Grep `src/skills/_shared/openspec-convention.md` for `### Constitution Amendment` and `Sync-Impact Report entry` — both must return matches; grep for `no runtime parser` or `no auto-bump` returns a match.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; `### Constitution Amendment` sub-section present in openspec-convention.md

- [x] 2.2 [P] Extend `src/skills/_shared/openspec-convention.md` — add read-only-asset + report-only-propagation doctrine block immediately after 2.1 content: new sub-section `### Read-Only Assets and Report-Only Propagation` stating that bundled skills are read-only when installed; `sdd-constitution` MUST NOT edit any other `SKILL.md`, any `src/` file, or any template; because enforcement gates read the constitution LIVE there are no static principle copies to realign; the Sync-Impact entry documents consuming gates (`sdd-design`, `plan-reviewer`) and flags in-flight `design.md`/`tasks.md` for human re-review instead of editing them.
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-constitution/Read-Only Bundled-Asset Constraint`, `sdd-constitution/Report-Only Propagation`
  **Independent Test:** Grep `src/skills/_shared/openspec-convention.md` for `### Read-Only Assets` and `report-only` and `in-flight` — all must return matches.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; `### Read-Only Assets and Report-Only Propagation` sub-section present

- [x] 2.3 [P] Extend `src/skills/_shared/openspec-convention.md` — add shared auto-suggest snippet block after 2.2 content: new sub-section `### Amendment Auto-Suggest (shared snippet)` containing the canonical quotable text defining the governance-touched heuristic (fires when ANY of: proposal.md/design.md/tasks.md/spec.md reference the constitution or a named principle; OR the change modifies openspec-convention.md Constitution Governance section or constitution.md itself; OR any artifact names a principle by title) and the non-blocking advisory suggestion text: `"This change touched governance/principles — consider running sdd-constitution to record a constitution amendment."` with explicit note that it MUST NOT block verification or archival.
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-constitution/Dual Trigger With Non-Blocking Auto-Suggest`
  **Independent Test:** Grep `src/skills/_shared/openspec-convention.md` for `### Amendment Auto-Suggest` and `governance-touching` and `MUST NOT block` — all must return matches.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; `### Amendment Auto-Suggest (shared snippet)` sub-section present

  > Note: 2.1, 2.2, 2.3 are marked `[P]` — they touch the same file but at
  > non-overlapping locations (three new sub-sections in sequence). If worked
  > by the same agent in a single pass, apply in order: 2.1 then 2.2 then 2.3.
  > If dispatched in parallel, use a worktree; the three edit sites do not overlap.

---

## Phase 3: Hook Skills (`sdd-verify` and `sdd-archive`)

*Depends on Phase 2: the shared snippet anchor referenced here must exist first.
The two hook edits are independent of each other.*

- [x] 3.1 [P] Modify `src/skills/sdd-verify/SKILL.md` — insert a new step 9 into the Workflow, after the current step 8 (the `round N` stamping step, ~line 99–102) and before `## Output Format` (~line 104):
  > 9. Apply the governance-touched heuristic from `_shared/openspec-convention.md` > Constitution Governance > Amendment Auto-Suggest. When it matches, surface the shared report-only `sdd-constitution` suggestion. This is advisory and MUST NOT change the verdict or block verification.
  Reference the shared snippet — do NOT restate the heuristic or suggestion text inline. Optionally add `Constitution Suggestion: surfaced or none` to `## Output Format`.
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-constitution/Dual Trigger With Non-Blocking Auto-Suggest`
  **Independent Test:** Grep `src/skills/sdd-verify/SKILL.md` for `governance-touched heuristic` or `Amendment Auto-Suggest` and for `MUST NOT change the verdict` — both must return matches; grep for any inline copy of the suggestion wording returns no match (only the reference).
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; step 9 present in sdd-verify Workflow referencing `_shared` snippet; not inlining heuristic prose

  > Depends on: Phase 2 complete (snippet anchor must exist before being referenced)

- [x] 3.2 [P] Modify `src/skills/sdd-archive/SKILL.md` — insert a new step 7 into the Workflow, after the current step 6 (the audit-trail report, ~line 58–59), renumbering the existing thoth-mem steps 7→8 and 8→9 accordingly:
  > 7. Apply the governance-touched heuristic from `_shared/openspec-convention.md` > Constitution Governance > Amendment Auto-Suggest. When it matches, surface the shared report-only `sdd-constitution` suggestion. This is advisory and MUST NOT block archival.
  Reference the shared snippet — do NOT restate it. Optionally add `Constitution Suggestion: surfaced or none` to `## Output Format`.
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-constitution/Dual Trigger With Non-Blocking Auto-Suggest`
  **Independent Test:** Grep `src/skills/sdd-archive/SKILL.md` for `governance-touched heuristic` or `Amendment Auto-Suggest` and for `MUST NOT block archival` — both must return matches; old step numbers 7 and 8 are renumbered to 8 and 9.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; step 7 present in sdd-archive Workflow referencing `_shared` snippet with steps 8/9 renumbered

  > Depends on: Phase 2 complete (snippet anchor must exist before being referenced)

---

## Phase 4: Verification

*Final gate. Runs after all prior phases are complete. Tasks are sequential per
AGENTS.md CI order (lint -> typecheck -> focused test -> build -> full suite ->
cross-platform scan).*

- [x] 4.1 Run lint and typecheck across the full project — validates that the new registry literal compiles, all markdown/YAML edits are coherent, and no TS error exists
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-constitution/Standalone Discoverable Governance Skill`
  **Independent Test:** Both commands exit 0 after all prior phases are complete.
  **Verification**:
  - Run: `pnpm run lint && pnpm run typecheck`
  - Expected: Both exit 0 with no errors; `sdd-constitution` entry satisfies `satisfies readonly SkillRegistryEntry[]`

  > Depends on: Phases 1–3 complete

- [x] 4.2 Run the targeted registration test in isolation — confirms the projected `sdd-constitution` entry with the exact description string and `allowedAgents: ['orchestrator']`
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-constitution/Standalone Discoverable Governance Skill`
  **Independent Test:** Test file exits green; description string is byte-identical across `skills.ts`, `custom-skills.test.ts`, and SKILL.md front-matter.
  **Verification**:
  - Run: `pnpm test src/cli/custom-skills.test.ts`
  - Expected: All tests pass including the new `sdd-constitution` registration assertion; 0 failures

  > Depends on: 4.1

- [x] 4.3 Run the build — confirms the bundle includes the new skill source path
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-constitution/Standalone Discoverable Governance Skill`
  **Independent Test:** Build exits 0; no missing-module or unresolved-path errors.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Exit 0; no build errors; `src/skills/sdd-constitution` is included in the bundle

  > Depends on: 4.2
  > Note: if `pnpm run build` triggers `generate-schema` and updates `thoth-agents.schema.json`, stage that file as part of the change (it is a side-effect of the registry addition).

- [x] 4.4 Run the full test suite — confirms no pre-existing tests regressed
  **[USN-1]** | Priority: P1
  **Spec:** (Full suite regression gate — covers all requirements)
  **Independent Test:** `pnpm test` exits 0 with 0 failing suites.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All test suites pass; 0 regressions in any existing file; new registration test passes

  > Depends on: 4.3

- [x] 4.5 Cross-platform ripgrep scan — use the repo `Grep` tool (NOT POSIX shell `grep` or `python`; fails on Windows/PowerShell) to verify key invariants hold across files
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-constitution/Standalone Discoverable Governance Skill`, `sdd-constitution/Read-Only Bundled-Asset Constraint`
  **Independent Test:** All checks below return expected results.
  **Verification**:
  - Run: Grep `src/harness/core/skills.ts` for `sdd-constitution`; Grep `src/cli/custom-skills.test.ts` for `sdd-constitution`; Grep `src/skills/sdd-constitution/SKILL.md` for `Guide a semver constitution amendment`; Grep `src/skills/sdd-verify/SKILL.md` for `Amendment Auto-Suggest`; Grep `src/skills/sdd-archive/SKILL.md` for `Amendment Auto-Suggest`; Grep `src/harness/core/sdd.ts` for `sdd-constitution` (must return NO match — skill is absent from phase orders)
  - Expected: First five greps each return at least one match; sixth grep (sdd.ts) returns zero matches confirming the skill is not a pipeline phase

  > Depends on: all prior phases
