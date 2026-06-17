# Tasks: Adopt Spec-Kit Rigor in the SDD Pipeline

<!-- Coverage formula: distinct requirements named by >=1 Spec: tag ÷ total ### Requirement: headings across all delta specs -->
<!-- Total requirements: sdd-governance(5) + sdd-consistency(5) + sdd-requirements-quality(4) + sdd-spec-authoring(5) + sdd-tasks-format(5) + sdd-phase-handoffs(4) = 28 -->

---

## Phase A: Governance, Consistency, and Requirements Quality

### Phase A.1: Config and Shared-Convention Foundation

- [x] A.1.1 Migrate `openspec/config.yaml` to canonical list+scalar `rules:` form and add all new mechanism sections — `openspec/config.yaml`
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-governance/Constitution Governance Config Section`, `sdd-consistency/Consistency Config Section`, `sdd-requirements-quality/Requirements-Quality Config Section`, `sdd-spec-authoring/Clarification Config Section`, `sdd-tasks-format/TDD Ordering Config Flag`, `sdd-phase-handoffs/Handoff Config Section`
  **Independent Test:** Parse `openspec/config.yaml` as YAML and verify the top-level `rules:` key contains `constitution`, `consistency`, `requirements_quality`, `clarification`, `tasks` (with `tdd` and `traceability` keys), `handoffs`, `apply`, `verify`, and `archive` sub-keys with no mapping-form remnants.
  **Verification**:
  - Run: `python -c "import yaml,sys; d=yaml.safe_load(open('openspec/config.yaml')); assert 'constitution' in d['rules']; assert 'consistency' in d['rules']; assert 'requirements_quality' in d['rules']; assert 'clarification' in d['rules']; assert 'handoffs' in d['rules']; assert 'tdd' in d['rules']['tasks']; print('config.yaml shape OK')"` (or any YAML parser; CI runs lint)
  - Expected: Script exits 0 with "config.yaml shape OK"; `pnpm run lint` produces no YAML errors

- [x] A.1.2 Update `src/skills/_shared/openspec-convention.md` — add Constitution artifact spec (path/semver/sync-impact), consistency severity+coverage model, requirements-quality checklist path (`checklists/requirements.md`), `[NEEDS CLARIFICATION]` cap + Assumptions policy, `handoffHints` surfacing rule, and new `config.yaml` shape documentation; add `Requirements checklist` and `Constitution` rows to Canonical Artifacts table — `src/skills/_shared/openspec-convention.md`
  **[USN-1]** | Priority: P1
  **Spec:** `sdd-governance/Harness-Agnostic Constitution Governance`, `sdd-consistency/Harness-Agnostic Consistency Gate`, `sdd-requirements-quality/Harness-Agnostic Checklist Mechanism`, `sdd-spec-authoring/Harness-Agnostic Clarification Discipline`, `sdd-tasks-format/Harness-Agnostic Tasks Format`, `sdd-phase-handoffs/Harness-Agnostic Handoff Hints`
  **Independent Test:** Grep `src/skills/_shared/openspec-convention.md` for `constitution.md`, `checklists/requirements.md`, `[NEEDS CLARIFICATION]`, `handoffHints`, `CRITICAL`, `MINOR`, `PATCH`, and `Canonical Artifacts` — all must be present.
  **Verification**:
  - Run: `grep -c "constitution.md\|checklists/requirements.md\|\[NEEDS CLARIFICATION\]\|handoffHints\|CRITICAL\|Canonical Artifacts" src/skills/_shared/openspec-convention.md`
  - Expected: Count >= 6 (each key term appears at least once); file opens without error

  > Depends on: A.1.1 (config shape documented here must match the live file)

### Phase A.2: Constitution Artifact and Bootstrap

- [x] A.2.1 Create `openspec/memory/constitution.md` — fixed-structure template with front-matter (`Version: 1.0.0`, `Ratified`, `Last-Amended`), five native principles each with Statement/Rationale/Gate Implications, and empty `## Sync-Impact Report` section — `openspec/memory/constitution.md` *(new file)*
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-governance/Versioned Constitution Artifact`
  **Independent Test:** Read `openspec/memory/constitution.md` and confirm it contains `Version: 1.0.0`, all five principle headings (delegate-first coordination, read-only role boundaries, governed persistence, multi-harness parity, evidence-led verification), and the `## Sync-Impact Report` section.
  **Verification**:
  - Run: `grep -E "Version: 1\.0\.0|delegate-first|read-only role|governed persistence|multi-harness parity|evidence-led" openspec/memory/constitution.md | wc -l`
  - Expected: Count >= 6; file exists at `openspec/memory/constitution.md`

- [x] A.2.2 Update `src/skills/sdd-init/SKILL.md` — add bootstrap logic: create `openspec/memory/constitution.md` when absent (at `1.0.0` with five principles); preserve existing content and version when already present (idempotent); emit updated `config.yaml` template with new mechanism sections; document semver bump policy inline — `src/skills/sdd-init/SKILL.md`
  **[USN-2]** | Priority: P1
  **Spec:** `sdd-governance/Versioned Constitution Artifact` (scenarios: bootstrap missing, preserve existing), `sdd-governance/Constitution Semver Bump and Sync-Impact Report`
  **Independent Test:** Read `src/skills/sdd-init/SKILL.md` and confirm it describes (a) detecting absence of constitution.md and creating it, (b) detecting presence and preserving content+version, (c) semver bump policy (MAJOR/MINOR/PATCH), and (d) the updated config.yaml template.
  **Verification**:
  - Run: `grep -c "constitution.md\|semver\|MAJOR\|MINOR\|PATCH\|idempotent\|preserve" src/skills/sdd-init/SKILL.md`
  - Expected: Count >= 5 (all key concepts present in prose)

  > Depends on: A.1.2 (shared convention must document constitution before init references it), A.2.1 (template content must match the artifact created)

### Phase A.3: Consistency Gate in Plan-Reviewer

- [x] A.3.1 Update `src/skills/plan-reviewer/SKILL.md` — add cross-artifact consistency analysis section: CRITICAL/HIGH/MEDIUM/LOW severity model; requirement-coverage % computation from `Spec:` tags vs `### Requirement:` headings; `[NEEDS CLARIFICATION]` cap enforcement (flag any spec file exceeding 3 markers); blocking consistency gate on any CRITICAL finding with AskUserQuestion-equivalent override logged; Constitution Check enforcement (evaluate design/plan against each principle, block on violation, log override); TDD ordering check (when `tasks.tdd` enabled, flag implementation tasks preceding their test tasks); all checks gated by corresponding `config.yaml rules:` sections — `src/skills/plan-reviewer/SKILL.md`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd-consistency/Cross-Artifact Consistency Analysis`, `sdd-consistency/Requirement-Coverage Percentage`, `sdd-consistency/Blocking Consistency Gate with Override`, `sdd-consistency/Consistency Config Section`, `sdd-governance/Blocking Constitution Check Gate`, `sdd-spec-authoring/Clarification Cap Enforced by Plan-Reviewer`, `sdd-tasks-format/TDD Ordering Enforced by Plan-Reviewer`
  **Independent Test:** Read `src/skills/plan-reviewer/SKILL.md` and confirm it contains the terms: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `coverage percentage`, `[NEEDS CLARIFICATION]`, `Constitution Check`, `AskUserQuestion`, `tasks.tdd`.
  **Verification**:
  - Run: `grep -c "CRITICAL\|coverage percentage\|\[NEEDS CLARIFICATION\]\|Constitution Check\|AskUserQuestion\|tasks\.tdd" src/skills/plan-reviewer/SKILL.md`
  - Expected: Count >= 6

  > Depends on: A.1.1 (config sections must exist before plan-reviewer references them), A.1.2 (shared convention documents the severity model it cites)

### Phase A.4: Requirements-Quality Checklist at Spec Phase

- [x] A.4.1 Update `src/skills/sdd-spec/SKILL.md` — add: (a) `[NEEDS CLARIFICATION: ...]` marker discipline (cap ≤3 per file, informed-guess-first, record defaults in `## Assumptions` section); (b) generation of `openspec/changes/{change-name}/checklists/requirements.md` with one `## Domain:` section per authored domain, four-dimension checklist items (completeness, clarity, measurability, testability); (c) declare `handoffHints` (accepted assumptions, unresolved clarifications) for the design phase — `src/skills/sdd-spec/SKILL.md`
  **[USN-4]** | Priority: P1
  **Spec:** `sdd-spec-authoring/Clarification Markers Capped Per Spec File`, `sdd-spec-authoring/Informed-Guess-First Assumptions Policy`, `sdd-requirements-quality/Domain-Typed Requirements-Quality Checklist Artifact`, `sdd-requirements-quality/Checklist Gate Before Tasks`, `sdd-phase-handoffs/Hints Surfaced at Phase Transitions`
  **Independent Test:** Read `src/skills/sdd-spec/SKILL.md` and confirm it describes (a) the ≤3 marker cap, (b) Assumptions section policy, (c) generation of `checklists/requirements.md`, and (d) declaring `handoffHints`.
  **Verification**:
  - Run: `grep -c "checklists/requirements.md\|\[NEEDS CLARIFICATION\]\|Assumptions\|handoffHints\|completeness\|clarity\|measurability\|testability" src/skills/sdd-spec/SKILL.md`
  - Expected: Count >= 6

  > Depends on: A.1.2 (shared convention must document the checklist path and gate semantics before sdd-spec references them)

- [x] A.4.2 Update `src/skills/requirements-interview/SKILL.md` — add alignment note: genuine forks unresolved at interview become `[NEEDS CLARIFICATION]` markers or recorded Assumptions downstream; note does not confer gate ownership — `src/skills/requirements-interview/SKILL.md`
  **[USN-4]** | Priority: P2
  **Spec:** `sdd-spec-authoring/Informed-Guess-First Assumptions Policy`
  **Independent Test:** Read `src/skills/requirements-interview/SKILL.md` and find a note referencing `[NEEDS CLARIFICATION]` and Assumptions as downstream handling for unresolved forks.
  **Verification**:
  - Run: `grep -c "\[NEEDS CLARIFICATION\]\|Assumptions" src/skills/requirements-interview/SKILL.md`
  - Expected: Count >= 1

### Phase A.5: Constitution Check in Design Phase

- [x] A.5.1 Update `src/skills/sdd-design/SKILL.md` — add Constitution Check self-review step (evaluate the emerging design against each constitution principle before finalizing; report and block on any violation detected during authoring; log override if user proceeds); add consumption of upstream `handoffHints` from the spec phase (surface recorded assumptions and clarification resolutions at design start) — `src/skills/sdd-design/SKILL.md`
  **[USN-5]** | Priority: P1
  **Spec:** `sdd-governance/Blocking Constitution Check Gate`, `sdd-phase-handoffs/Hints Surfaced at Phase Transitions`
  **Independent Test:** Read `src/skills/sdd-design/SKILL.md` and confirm it describes (a) a Constitution Check self-review step naming each principle, (b) blocking and override semantics matching the shared convention, and (c) reading upstream `handoffHints`.
  **Verification**:
  - Run: `grep -c "Constitution Check\|handoffHints\|AskUserQuestion\|Assumptions" src/skills/sdd-design/SKILL.md`
  - Expected: Count >= 3

  > Depends on: A.1.2 (constitution artifact path and override semantics defined in shared convention), A.2.1 (constitution.md must exist to be referenced)

### Phase A.6: Phase-A Integration Check

- [x] A.6.1 Run typecheck and lint to confirm Phase A skill and config changes are coherent — no TS errors introduced (sdd.ts not yet touched), no lint failures in modified markdown
  **[USN-6]** | Priority: P1
  **Spec:** (Integration gate — covers all Phase A requirements by confirming no regressions)
  **Independent Test:** CI pipeline completes lint and typecheck clean with only Phase A files modified.
  **Verification**:
  - Run: `pnpm run lint && pnpm run typecheck`
  - Expected: Both commands exit 0 with no errors

  > Depends on: A.1.1, A.1.2, A.2.1, A.2.2, A.3.1, A.4.1, A.4.2, A.5.1

---

## Phase B: Traceability, TDD Ordering, and Phase Handoffs

### Phase B.1: TypeScript Contract — handoffHints Field

- [x] B.1.1 Update `src/harness/core/sdd.ts` — add optional `handoffHints?: string[]` to `SddPhaseContract`; populate it on `proposal`, `spec`, and `design` phase entries with example hint strings; extend `getSddWorkflowContract` deep-clone to copy `handoffHints` array defensively (mutating the clone must not mutate the source) — `src/harness/core/sdd.ts`
  **[USN-7]** | Priority: P1
  **Spec:** `sdd-phase-handoffs/Optional Handoff Hints on Phase Contracts`, `sdd-phase-handoffs/Harness-Agnostic Handoff Hints`
  **Independent Test:** Compile `src/harness/core/sdd.ts` standalone (`tsc --noEmit`) and confirm the field is optional (a `SddPhaseContract` without `handoffHints` must still type-check; a contract with it must expose the array).
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Exit 0, no TypeScript errors

- [x] B.1.2 Update `src/harness/core/sdd.test.ts` — add assertions: (a) `handoffHints` field is optional — phase without it is still returned by `getSddPhase` without error; (b) `proposal`, `spec`, and `design` phases expose the `handoffHints` array; (c) `getSddWorkflowContract()` deep-clone copies `handoffHints` — mutating the clone array does not mutate the source; (d) regression: all existing gate (`oracle-review`/`user-confirmation`/`iterative-verify`), order, and role assertions still pass — `src/harness/core/sdd.test.ts`
  **[USN-7]** | Priority: P1
  **Spec:** `sdd-phase-handoffs/Optional Handoff Hints on Phase Contracts`, `sdd-phase-handoffs/Hints Surfaced at Phase Transitions`
  **Independent Test:** Run the sdd test file in isolation and confirm all new and existing assertions pass.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts`
  - Expected: All tests pass; no existing gate/role/order test fails; new handoffHints assertions pass

  > Depends on: B.1.1 (field must exist before tests can assert on it)

### Phase B.2: Task Template Update — Traceability and TDD

- [x] B.2.1 Update `src/skills/sdd-tasks/SKILL.md` — add to the task template: `[USN-<n>]` story id, `P1/P2/P3` priority, `Spec:` trace tag (`{domain}/{Requirement Name}` format), and `Independent Test` descriptor; implement `tasks.tdd` ordering (when enabled, sequence test-authoring tasks before implementation tasks within each phase); add handoffHints consumption (read upstream `handoffHints` from spec/design, surface preservation constraints at task generation start); clarify that `[USN]`/priority/`Independent Test`/`Spec:` are additive to the existing `Verification` block — `src/skills/sdd-tasks/SKILL.md`
  **[USN-8]** | Priority: P1
  **Spec:** `sdd-tasks-format/Per-Task Traceability Fields`, `sdd-tasks-format/TDD Ordering Config Flag`, `sdd-phase-handoffs/Hints Surfaced at Phase Transitions`
  **Independent Test:** Read `src/skills/sdd-tasks/SKILL.md` and confirm it contains a task template example showing `[USN-n]`, `Priority:`, `Spec:`, `Independent Test:`, `tasks.tdd` ordering prose, and `handoffHints` consumption.
  **Verification**:
  - Run: `grep -c "\[USN\|Priority:\|Spec:\|Independent Test\|tasks\.tdd\|handoffHints" src/skills/sdd-tasks/SKILL.md`
  - Expected: Count >= 5

  > Depends on: A.1.1 (config `tasks.tdd` and `tasks.traceability` keys must exist), A.1.2 (convention must document `Spec:` trace tag and `[USN]` semantics)

- [x] B.2.2 Update `src/skills/executing-plans/SKILL.md` — add consuming logic for `[USN]`, priority, and `Independent Test` fields: surface them during task dispatch when present; tolerate their absence (back-compat scenario: legacy `tasks.md` without these fields executes without error) — `src/skills/executing-plans/SKILL.md`
  **[USN-8]** | Priority: P2
  **Spec:** `sdd-tasks-format/Backward-Compatible Consumption of Traceability Fields`
  **Independent Test:** Read `src/skills/executing-plans/SKILL.md` and find explicit language stating (a) `[USN]`/priority/`Independent Test` are surfaced when present, and (b) their absence on legacy tasks does not cause an error.
  **Verification**:
  - Run: `grep -c "\[USN\]\|priority\|Independent Test\|tolerate\|absent\|back.compat\|legacy" src/skills/executing-plans/SKILL.md`
  - Expected: Count >= 3

  > Depends on: B.2.1 (template must be defined before consuming skill references it)

### Phase B.3: Handoff Prose in Design and Spec Skills

- [x] B.3.1 Add `handoffHints` surfacing prose to `src/skills/sdd-design/SKILL.md` — the design phase must emit `handoffHints` (coverage decisions, architecture constraints) for the tasks phase to consume; prose references the shared convention wording — `src/skills/sdd-design/SKILL.md`
  **[USN-9]** | Priority: P2
  **Spec:** `sdd-phase-handoffs/Hints Surfaced at Phase Transitions`, `sdd-phase-handoffs/Handoff Config Section`
  **Independent Test:** Read `src/skills/sdd-design/SKILL.md` and confirm it describes emitting `handoffHints` for the downstream tasks phase, referencing the `rules.handoffs.surface_hints` config key.
  **Verification**:
  - Run: `grep -c "handoffHints\|surface_hints\|tasks phase\|preserve" src/skills/sdd-design/SKILL.md`
  - Expected: Count >= 2

  > Depends on: A.5.1 (design skill already updated; this extends it with emit-side prose), A.1.2 (convention documents the wording to source)

- [x] B.3.2 Confirm `src/skills/sdd-spec/SKILL.md` already declares `handoffHints` emit (covered in A.4.1); add emit-side language for the `rules.handoffs.surface_hints` config gate — `src/skills/sdd-spec/SKILL.md`
  **[USN-9]** | Priority: P2
  **Spec:** `sdd-phase-handoffs/Handoff Config Section`
  **Independent Test:** Read `src/skills/sdd-spec/SKILL.md` and confirm `surface_hints` or `rules.handoffs` is mentioned.
  **Verification**:
  - Run: `grep -c "surface_hints\|rules\.handoffs\|handoffHints" src/skills/sdd-spec/SKILL.md`
  - Expected: Count >= 1

  > Depends on: A.4.1

### Phase B.4: Full Integration Gate

- [x] B.4.1 Run the full test suite to confirm all sdd.ts/sdd.test.ts changes and any markdown-adjacent TypeScript changes pass, and no pre-existing test regresses
  **[USN-10]** | Priority: P1
  **Spec:** (Integration gate — covers `sdd-phase-handoffs/Optional Handoff Hints on Phase Contracts` regression proof, `sdd-tasks-format/Harness-Agnostic Tasks Format`, `sdd-consistency/Harness-Agnostic Consistency Gate`)
  **Independent Test:** `pnpm test` completes with 0 failing test suites.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All test suites pass; sdd.test.ts new handoffHints assertions pass; no existing gate/role/order assertion regresses

  > Depends on: B.1.1, B.1.2, B.2.1, B.2.2, B.3.1, B.3.2, A.6.1

- [x] B.4.2 Run `pnpm run check:ci` (lint → typecheck → build → test) as the final pre-merge gate across all Phase A and Phase B changes
  **[USN-10]** | Priority: P1
  **Spec:** (Full pipeline gate — satisfies proposal Success Criterion 8: all criteria hold and `pnpm run check:ci` passes)
  **Independent Test:** `pnpm run check:ci` exits 0 with no errors in any step.
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: All four stages (lint, typecheck, build, test) exit 0; build artifacts produced under `dist/`

  > Depends on: B.4.1 (all unit tests must pass before the full gate is meaningful)
