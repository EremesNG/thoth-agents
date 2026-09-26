# Tasks: Extend Spec-Kit Rigor (Phase 2)

<!-- Coverage formula: distinct requirements named by >=1 Spec: tag ÷ total ### Requirement: headings across all delta specs -->
<!-- Mechanisms: #1 [P] parallel markers, #2 sub-artifacts, #3 sdd-clarify phase -->
<!-- traceability: true (config.yaml rules.tasks) — every task carries [USN] + Priority + Spec: + Independent Test -->
<!-- tdd: false — no forced test-before-impl ordering -->
<!-- No [P] markers used in this tasks.md — parallel_markers defaults disabled; mechanism not built yet -->

---

## Phase 1: Shared Contract Foundation (sdd.ts + config.yaml)

*Unblocks all skill prose and all tests. Compile surface and config shape must land first.*

- [x] 1.1 Add `'clarify'` to `SddPhaseId` union and insert the `clarify` `SddPhaseContract` entry — `src/harness/core/sdd.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/New sdd-clarify Phase Contract`
  **Independent Test:** `pnpm run typecheck` passes with `'clarify'` in the union and the new entry in `SDD_PHASES`; no other test file is touched yet.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Exit 0, no TypeScript errors; `'clarify'` is a valid `SddPhaseId` value

- [x] 1.2 Insert `'clarify'` into `FULL_SDD_PHASE_ORDER` between `'spec'` and `'design'`; renumber `order` for `design` (5→6) through `archive` (11→12); set `design.prerequisites = ['proposal', 'clarify']`; update `SDD_WORKFLOW_CONTRACT` route prose to `spec -> clarify -> design` — `src/harness/core/sdd.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Phase Order and Prerequisite Renumber`
  **Independent Test:** `pnpm run typecheck` still passes; the `FULL_SDD_PHASE_ORDER` array contains `'clarify'` at index between `'spec'` and `'design'`; `design.order === 6`.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Exit 0; no TS errors from order-type or union mismatches

  > Depends on: 1.1 (union must include `'clarify'` before the entry is inserted)

- [x] 1.3 Convert `rules.design` in `openspec/config.yaml` from a bare list to `guidance:` subkey form; add `sub_artifacts: false` and `complexity_threshold` mapping; add `parallel_markers: false` under `rules.tasks` — `openspec/config.yaml`
  **[USN-1]** | Priority: P1
  **Spec:** `parallel-markers/Parallel Markers Config Toggle`, `sub-artifacts/Sub-Artifacts Config Gate`
  **Independent Test:** Parse `openspec/config.yaml` as YAML; confirm `rules.design.guidance` is a list, `rules.design.sub_artifacts === false`, `rules.design.complexity_threshold` is a mapping, `rules.tasks.parallel_markers === false`.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; no YAML parse or lint errors in `openspec/config.yaml`

---

## Phase 2: Delegation Matrix Wiring (prompt-sections.ts)

*Depends on Phase 1 (needs `'clarify'` in `SddPhaseId` to call `primarySddRole('clarify')` without a TS error).*

- [x] 2.1 Add `sdd-clarify -> ${primarySddRole('clarify')}` entry to `renderSddDelegationMatrix()` between the spec and design entries; update the `Full SDD:` route prose string to `spec -> clarify -> design -> tasks` — `src/agents/prompt-sections.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Delegation Matrix sdd-clarify Entry`
  **Independent Test:** `pnpm run typecheck` passes; grep `src/agents/prompt-sections.ts` for `sdd-clarify` returns a match.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Exit 0; `primarySddRole('clarify')` resolves through the typed contract with no TS error

  > Depends on: 1.1, 1.2 (phase contract must exist for `primarySddRole` to resolve)

---

## Phase 3: New Skill File

*No compiled dependency; depends on Phase 1 for the contract shape it documents.*

- [x] 3.1 Create `src/skills/sdd-clarify/SKILL.md` — new phase skill mirroring `sdd-spec`/`sdd-design` structure: frontmatter (`name: sdd-clarify`, description), Shared Conventions block (links to three `_shared` files), Persistence Mode block, When to Use, Prerequisites (`change-name`, spec artifact, `checklists/requirements.md`), Workflow with six steps: (1) read conventions; (2) recover `sdd/{change}/spec` via recall funnel; (3) taxonomy scan (ambiguity taxonomy: ambiguous quantifiers, undefined terms, missing error/edge behavior, unresolved decision forks, underspecified data shapes, unstated non-functional bounds; plus unresolved `[NEEDS CLARIFICATION]` markers); (4) bounded Q&A capped at `rules.clarification.max_markers_per_spec` (3) per spec file; (5) in-place write-back into delta spec file(s) and re-save `sdd/{change}/spec`; (6) re-validate `checklists/requirements.md` and declare `handoffHints` for design. Boundary section: no duplication of `requirements-interview`. Output Format section. Rules section — `src/skills/sdd-clarify/SKILL.md` *(new file)*
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/sdd-clarify Skill Content`
  **Independent Test:** File exists at `src/skills/sdd-clarify/SKILL.md`; grep for `taxonomy`, `bounded Q&A`, `write-back`, `re-validate`, `requirements-interview` all return matches.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; new skill file present, no lint errors introduced

---

## Phase 4: Skill Prose Updates (markdown)

*No compiled dependency; can proceed after Phase 1 config is stable. Tasks within this phase are independent of each other.*

- [x] 4.1 Update `src/skills/sdd-tasks/SKILL.md` — document the optional `[P]` marker placed AFTER the `N.M` number (`- [ ] 2.1 [P] Title`), gated by `rules.tasks.parallel_markers`; emit only on intra-phase, dependency-free, same-agent tasks; note that `[P]` is back-compatible (absence = today's behavior); add a `[P]` example line to the task template — `src/skills/sdd-tasks/SKILL.md`
  **[USN-1]** | Priority: P1
  **Spec:** `parallel-markers/[P] Marker Placement After N.M`, `parallel-markers/Parallel Markers Emission Gate`
  **Independent Test:** Grep `src/skills/sdd-tasks/SKILL.md` for `[P]` and `parallel_markers` — both must appear; the example line shows `2.1 [P]` (not `[P] 2.1`).
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; `[P]` and `parallel_markers` present in the file

- [x] 4.2 Update `src/skills/executing-plans/SKILL.md` — at the Phase 2 grouping logic, add: when `rules.tasks.parallel_markers` is on, consume contiguous `[P]`-marked tasks within a phase as an explicit parallel batch for same-role tasks; recommend worktree isolation for overlapping writers; when toggle is off or `[P]` is absent, fall back to today's implicit consecutive+same-agent grouping unchanged (back-compat) — `src/skills/executing-plans/SKILL.md`
  **[USN-1]** | Priority: P1
  **Spec:** `parallel-markers/executing-plans Parallel Batch Consumption`, `parallel-markers/Worktree Isolation for Overlapping Writers`, `parallel-markers/Back-Compat Fallback`
  **Independent Test:** Grep `src/skills/executing-plans/SKILL.md` for `parallel_markers`, `worktree`, and `back-compat` (or `fallback`) — all must appear.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; `parallel_markers`, worktree isolation, and fallback behavior documented

- [x] 4.3 Update `src/skills/sdd-design/SKILL.md` — add Optional Sub-Artifacts section: gate = `rules.design.sub_artifacts` AND `complexity_threshold` met (config is hard floor, author selects within the gate); `design.md` always produced regardless; name `research.md`, `data-model.md`, `contracts/` (subdir), `quickstart.md`; cite `checklists/` as precedent for `contracts/` layout; note that clarify now precedes design (consume the clarified spec) — `src/skills/sdd-design/SKILL.md`
  **[USN-2]** | Priority: P1
  **Spec:** `sub-artifacts/Optional Sub-Artifact Types`, `sub-artifacts/Sub-Artifact Gate Logic`, `sub-artifacts/design.md Always Present`
  **Independent Test:** Grep `src/skills/sdd-design/SKILL.md` for `sub_artifacts`, `complexity_threshold`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` — all must appear.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; all six sub-artifact-related terms present in the file

- [x] 4.4 Update `src/skills/_shared/openspec-convention.md` — four additive edits: (1) add `clarify` to directory-structure/lifecycle prose between spec and design; (2) add optional sub-artifacts (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`) to Canonical Artifacts table and directory structure (marked optional, gated); (3) add Parallel Task Markers note (`[P]` syntax, placement after `N.M`, toggle, back-compat); (4) update the documented `config.yaml` shape with `rules.tasks.parallel_markers`, `rules.design.sub_artifacts`, `rules.design.complexity_threshold`, and `rules.design.guidance` subkey form — `src/skills/_shared/openspec-convention.md`
  **[USN-1]** | Priority: P1
  **Spec:** `parallel-markers/Convention Doc [P] Marker Note`, `sub-artifacts/Convention Doc Sub-Artifacts Table`, `sdd-clarify-phase/Convention Doc Lifecycle Entry`
  **Independent Test:** Grep `src/skills/_shared/openspec-convention.md` for `clarify`, `parallel_markers`, `sub_artifacts`, `research.md`, `contracts/` — all must appear.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; all five terms present in the convention doc

- [x] 4.5 Update `src/skills/sdd-init/SKILL.md` — extend the emitted `config.yaml` template and the mechanism-section backfill list to include the three new toggles (`rules.tasks.parallel_markers`, `rules.design.sub_artifacts`, `rules.design.complexity_threshold`) as additive/idempotent entries, so realignment backfills them on stale projects — `src/skills/sdd-init/SKILL.md`
  **[USN-2]** | Priority: P2
  **Spec:** `sub-artifacts/sdd-init Config Template Update`, `parallel-markers/sdd-init Config Template Update`
  **Independent Test:** Grep `src/skills/sdd-init/SKILL.md` for `parallel_markers`, `sub_artifacts`, `complexity_threshold` — all three must appear in the emitted template or backfill prose.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; all three new toggle keys present in the sdd-init skill

- [x] 4.6 Update `src/skills/sdd-spec/SKILL.md` — add a one-line boundary note that residual ambiguity surfacing after spec is resolved by the new `sdd-clarify` phase (boundary alignment; no behavior change to spec authoring itself) — `src/skills/sdd-spec/SKILL.md`
  **[USN-3]** | Priority: P2
  **Spec:** `sdd-clarify-phase/sdd-spec Boundary Alignment Note`
  **Independent Test:** Grep `src/skills/sdd-spec/SKILL.md` for `sdd-clarify` — must return at least one match.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Exit 0; `sdd-clarify` reference present in sdd-spec skill

---

## Phase 5: Tests

*Depends on Phase 1 (sdd.ts changes) and Phase 2 (prompt-sections.ts) being complete before tests can be green. Tasks within this phase are independent of each other.*

- [x] 5.1 Update `src/harness/core/sdd.test.ts` — four targeted additions: (a) update the `models the full SDD phase order` assertion to expect `'clarify'` between `'spec'` and `'design'` in both `FULL_SDD_PHASE_ORDER` and `getRequiredSddPhaseOrder('full')`; (b) new test: `getSddPhase('clarify')` matches `{ requiredFor: ['full'], prerequisites: ['spec'], producesArtifact: false, owner: 'write-capable-agent', artifactSkill: 'sdd-clarify', defaultAgentRole: 'deep' }` and exposes non-empty `handoffHints`; (c) new test: `getSddPhase('design').prerequisites` equals `['proposal', 'clarify']` and `canEnterSddPhase({ pipeline: 'full', target: 'design', completed: ['requirements-interview', 'explore', 'proposal', 'spec'] })` is `false`, becoming `true` only after `'clarify'` is added to `completed`; (d) new test: `getRequiredSddPhaseOrder('accelerated')` does NOT contain `'clarify'`; (e) regression: all existing gate, role, and `handoffHints` optionality assertions pass (order values shift but ids/gates unchanged) — `src/harness/core/sdd.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Phase Order Test`, `sdd-clarify-phase/clarify Phase Contract Test`, `sdd-clarify-phase/design Prerequisites Test`, `sdd-clarify-phase/Accelerated Pipeline Omits clarify`
  **Independent Test:** Run the sdd test file in isolation; all new and existing assertions pass.
  **Verification**:
  - Run: `pnpm test src/harness/core/sdd.test.ts`
  - Expected: All tests pass; no existing gate/role/order assertion regresses; four new clarify-related assertions pass

  > Depends on: 1.1, 1.2 (contract changes must be in place)

- [x] 5.2 Update `src/agents/prompt-rendering.test.ts` — add assertion: the rendered `<sdd-delegation-matrix>` contains a `sdd-clarify ->` routing entry and the correct default role token (e.g. `@deep`) — `src/agents/prompt-rendering.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Delegation Matrix sdd-clarify Entry`
  **Independent Test:** Run the prompt-rendering test file in isolation; the new assertion on `sdd-clarify ->` passes.
  **Verification**:
  - Run: `pnpm test src/agents/prompt-rendering.test.ts`
  - Expected: All tests pass; new `sdd-clarify ->` assertion passes

  > Depends on: 1.1, 2.1 (matrix must include the entry)

- [x] 5.3 Update `src/agents/index.test.ts` — replace the route-order regex at L339 (`/propose\s*->\s*spec\s*->\s*design\s*->\s*tasks/i`) with one expecting `spec -> clarify -> design -> tasks` (e.g. `/spec\s*->\s*clarify\s*->\s*design\s*->\s*tasks/i`) — `src/agents/index.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Route Prose Updated`
  **Independent Test:** Run the index test file in isolation; the updated regex matches the route prose in the rendered prompt.
  **Verification**:
  - Run: `pnpm test src/agents/index.test.ts`
  - Expected: All tests pass; the old `/propose.*spec.*design.*tasks/` pattern is replaced; new pattern matches

  > Depends on: 1.2, 2.1 (route prose updated in sdd.ts + prompt-sections.ts)

- [x] 5.4 Update `src/sdd/artifact-governance/tasks-validator.test.ts` — add test: a task line with `[P]` placed AFTER the number (`- [ ] 2.1 [P] Title`) is accepted with no `tasks.malformed-numbering` finding; confirm `TASK_NUMBERING = /^(\d+\.\d+)\s+.+$/` matches `taskBody = "2.1 [P] Title"` (number first, then space, then rest). No validator source change required — `src/sdd/artifact-governance/tasks-validator.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `parallel-markers/[P] Back-Compatible With tasks-validator`
  **Independent Test:** Run the tasks-validator test file in isolation; the new `[P]`-acceptance test passes; no `tasks.malformed-numbering` is emitted for `2.1 [P] Title`.
  **Verification**:
  - Run: `pnpm test src/sdd/artifact-governance/tasks-validator.test.ts`
  - Expected: All tests pass; new `[P]`-after-number test passes with `valid: true` and no malformed-numbering finding

---

## Phase 6: Verification

*Final gate. Runs after all prior phases are complete.*

- [x] 6.1 Run typecheck and lint across the full project — validates that all compiled changes (sdd.ts, prompt-sections.ts) and markdown/YAML edits are coherent
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Phase Contract Typecheck Gate`, `parallel-markers/Parallel Markers Config Toggle`, `sub-artifacts/Sub-Artifacts Config Gate`
  **Independent Test:** No TS or lint errors exist after all Phase 1–5 changes are complete.
  **Verification**:
  - Run: `pnpm run lint && pnpm run typecheck`
  - Expected: Both commands exit 0 with no errors

  > Depends on: all prior phases

- [x] 6.2 Run the four targeted test files in isolation to confirm each mechanism's tests pass before the full suite
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Phase Order Test`, `parallel-markers/[P] Back-Compatible With tasks-validator`, `sdd-clarify-phase/Delegation Matrix sdd-clarify Entry`, `sdd-clarify-phase/Route Prose Updated`
  **Independent Test:** Each targeted run exits green; no cross-file interference.
  **Verification**:
  - Run: `pnpm test src/harness/core/sdd.test.ts && pnpm test src/agents/prompt-rendering.test.ts && pnpm test src/agents/index.test.ts && pnpm test src/sdd/artifact-governance/tasks-validator.test.ts`
  - Expected: All four test files pass with 0 failures

  > Depends on: 5.1, 5.2, 5.3, 5.4

- [x] 6.3 Run the full test suite to confirm no pre-existing tests regressed
  **[USN-3]** | Priority: P1
  **Spec:** (Full suite regression gate — covers all mechanisms)
  **Independent Test:** `pnpm test` exits 0 with 0 failing suites.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All test suites pass; no regressions in any existing file

  > Depends on: 6.2

- [x] 6.4 Cross-platform ripgrep scan to confirm key symbols are wired correctly — use the repo `Grep` tool (NOT POSIX shell `grep` or `python` — fails on Windows/PowerShell)
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-clarify-phase/Phase Order Test`, `parallel-markers/Convention Doc [P] Marker Note`, `sub-artifacts/Convention Doc Sub-Artifacts Table`
  **Independent Test:** All six checks below return at least one match.
  **Verification**:
  - Run: Grep `src/harness/core/sdd.ts` for `clarify`; Grep `src/agents/prompt-sections.ts` for `sdd-clarify`; Grep `src/agents/prompt-sections.ts` for `clarify`; Grep `openspec/config.yaml` for `parallel_markers`; Grep `openspec/config.yaml` for `sub_artifacts`; Grep `openspec/config.yaml` for `complexity_threshold`
  - Expected: Each grep returns at least one match; no key symbol is absent from its target file

  > Depends on: all prior phases
