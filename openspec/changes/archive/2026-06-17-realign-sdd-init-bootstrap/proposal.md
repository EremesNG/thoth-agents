# Proposal: Realign sdd-init for idempotent bootstrap backfill

## Intent

After the `adopt-spec-kit-rigor` change, `sdd-init` produces a full
OpenSpec setup for greenfield projects (all five `config.yaml` mechanism
sections plus `openspec/memory/constitution.md`), but it never backfills
those pieces into projects whose `openspec/` was created BEFORE spec-kit
rigor landed.

Two defects combine to make this impossible today:

- **HOW gap** — In `src/skills/sdd-init/SKILL.md`, step 5 short-circuits
  whenever `config.yaml` + `specs/` + `changes/` all exist ("report what
  exists and ask; do not overwrite") and returns without reaching step 7
  (mechanism sections: constitution / consistency / requirements_quality /
  clarification / handoffs plus the `tasks.traceability` and `verify`
  toggles) or step 7a (create `constitution.md`). Existing projects are
  therefore never realigned.
- **WHEN gap** — Even an improved skill would not run: the orchestrator /
  dispatch gate only invokes `sdd-init` "when `openspec/` is missing", so
  existing-but-stale projects never trigger it.

This change makes `sdd-init` an idempotent realignment tool: detect what is
absent, additively create only those pieces, preserve all existing content
and values, and align the dispatch/gate semantics so the skill is invoked on
existing-but-stale `openspec/`, not only when `openspec/` is missing.

## Scope

### In Scope

1. **Additive idempotent backfill (HOW)** — Add a realignment path in
   `src/skills/sdd-init/SKILL.md` reachable from the "openspec already
   exists" branch (today's step 5). It detects what is absent and creates
   only that, never overwriting existing values, never renumbering or
   recreating an existing `constitution.md`, and reports what was added.
   - **From**: existing-`openspec/` branch reports and asks, then returns.
   - **To**: existing-`openspec/` branch performs additive backfill of the
     missing constitution and missing `config.yaml` mechanism sections /
     toggles, then reports the additions.
   - **Reason**: pre-rigor projects must gain the mechanism artifacts that
     the rigor gates depend on, without disturbing existing content.
   - **Impact**: re-running `sdd-init` on a fully-aligned project is a
     no-op; running it on a partial project converges it.

2. **Partial-openspec detection** — Define detection of a partially-present
   `openspec/` (e.g. `config.yaml` present but `specs/` or `changes/`
   missing; `config.yaml` present but missing one or more mechanism
   sections; `constitution.md` absent). Backfill targets each missing piece
   independently rather than treating "openspec exists" as all-or-nothing.

3. **`config.yaml` mechanism-section merge** — Merge any absent mechanism
   section (`constitution`, `consistency`, `requirements_quality`,
   `clarification`, `handoffs`) and the absent `tasks.traceability` /
   `verify` toggles, preserving every existing value. Never rewrite a value
   that is already present.

4. **Dispatch / gate alignment (WHEN)** — Align the trigger semantics so
   `sdd-init` (in realignment mode) is dispatched on existing-but-stale
   `openspec/`, not only when `openspec/` is missing. Touchpoints:
   - `src/harness/core/sdd.ts` init-phase `condition` (currently "Only when
     OpenSpec persistence is selected and `openspec/` is missing.").
   - `src/agents/prompt-sections.ts` dispatch guidance ("If openspec
     persistence is selected and openspec/ is missing, dispatch sdd-init
     first.").
   - `src/skills/requirements-interview/SKILL.md` init-recommendation gate
     ("If it is not initialized, recommend running the `sdd-init` skill").

5. **Shared convention documentation** — In
   `src/skills/_shared/openspec-convention.md`, document `config.yaml`
   mechanism-section backfill idempotency semantics. The constitution
   idempotency is already documented under Constitution Governance; the
   config.yaml additive-merge contract is the undocumented gap. The
   pre-flight rule ("openspec not initialized -> recommend sdd-init") should
   reflect that a partial/stale `openspec/` also warrants realignment.

6. **Tests** — Update / extend the affected tests to lock the new behavior:
   `src/harness/core/sdd.test.ts` (init-phase condition), `src/agents/index.test.ts`
   (dispatch guidance string), and `src/harness/writers/skill-layout.test.ts`
   if new semantic anchors are added to the skill.

### Deferred / Needs Discovery

- Exact wording of the realigned init-phase `condition` and dispatch
  guidance string (must keep a missing-`openspec/` project triggering, while
  also triggering on stale/partial). Resolve in the tasks phase against the
  current test assertions.
- Whether the realignment path warrants a distinct semantic anchor in
  `SKILL.md` (and therefore a `skill-layout.test.ts` update) or can live
  under existing anchors. Decide while authoring the skill edit.

### Out of Scope

- Tooled / automatic semver bump of the constitution — the manual bump
  policy stays; no runtime parser is introduced.
- Overwriting or renumbering an existing `constitution.md`.
- Creating placeholder SDD artifacts (`proposal.md`, `design.md`,
  `tasks.md`, spec files) during init.
- Any new persistence backend or generated-artifact pipeline; skills ship as
  raw markdown via `package.json` `files[]` + `custom-skills.ts`
  `copyDirRecursive`, so editing `SKILL.md` suffices for skill content.

## Approach

The skill keeps its greenfield create path unchanged. The existing-`openspec/`
branch stops being a dead end: it computes a per-piece "absent set" (missing
directories, missing `config.yaml` mechanism sections / toggles, missing
`constitution.md`) and applies only the additive creates for that set,
preserving every present value and never renumbering the constitution. It
then reports exactly what was added (and reports a no-op when nothing was
absent). The dispatch/gate layer is widened so the init phase is recommended
whenever `openspec/` is missing OR stale (partial structure or missing
mechanism artifacts), keeping the missing-`openspec/` trigger intact. Tests
are updated to assert both the widened condition string and the additive
behavior anchors.

## Affected Areas

**HOW layer (backfill mechanics):**
- `src/skills/sdd-init/SKILL.md` — primary: add idempotent realignment /
  backfill step reachable from the existing-`openspec/` branch; update Rules.
- `src/skills/_shared/openspec-convention.md` — document `config.yaml`
  mechanism-section additive-merge idempotency; reflect partial/stale
  `openspec/` in the pre-flight realignment recommendation.

**WHEN layer (dispatch / gate trigger):**
- `src/harness/core/sdd.ts` — widen the init-phase `condition`.
- `src/agents/prompt-sections.ts` — widen the dispatch guidance line.
- `src/skills/requirements-interview/SKILL.md` — widen the
  init-recommendation gate to cover stale/partial `openspec/`.

**Tests:**
- `src/harness/core/sdd.test.ts` — init-phase condition assertion.
- `src/agents/index.test.ts` — dispatch guidance string assertion.
- `src/harness/writers/skill-layout.test.ts` — extend only if new semantic
  anchors are introduced in `SKILL.md`.
- `src/cli/custom-skills.test.ts` / `src/harness/core/skills.test.ts` — touch
  only if a skill description changes.

## Risks

- **Cross-surface drift** — HOW and WHEN must agree. If the gate widens but
  the skill backfill is incomplete (or vice versa), stale projects either
  never realign or trigger init that does nothing useful. Mitigation: land
  both layers in the same change and assert both in tests.
- **Test-string coupling** — `sdd.test.ts` and `index.test.ts` assert the
  exact condition / guidance strings; widening them requires synchronized
  test updates or the suite breaks.
- **Accidental overwrite** — A merge implemented carelessly could clobber a
  customized `config.yaml` value or renumber a constitution. Mitigation:
  strict additive-only semantics, explicit "never overwrite present values"
  rule, idempotency assertions.
- **Idempotency regression** — Re-running on a fully-aligned project must be
  a no-op. Mitigation: explicit no-op detection and reporting.

## Rollback Plan

The change is confined to prose skills (`SKILL.md`, shared convention) and a
small number of string constants plus their tests. To roll back, revert the
edits to `src/skills/sdd-init/SKILL.md`,
`src/skills/_shared/openspec-convention.md`,
`src/skills/requirements-interview/SKILL.md`, `src/harness/core/sdd.ts`,
`src/agents/prompt-sections.ts`, and the corresponding test files. No data
migration, no generated artifacts, and no persistence-schema changes are
involved, so reverting restores the prior missing-`openspec/`-only behavior
cleanly. Because the skill backfill is additive and never overwrites, any
realignment already applied to a project's `openspec/` remains valid after a
code rollback.

## Success Criteria

1. Running `sdd-init` on a project whose `openspec/` predates spec-kit rigor
   adds the missing `config.yaml` mechanism sections / toggles and creates
   `constitution.md` (at `1.0.0`) without altering any existing value.
2. Running `sdd-init` on a fully-aligned project is a reported no-op; an
   existing `constitution.md` is never renumbered or recreated.
3. Partial-`openspec/` states (missing dir, missing section, missing
   constitution) are each detected and individually backfilled.
4. The init-phase `condition` and dispatch guidance recommend `sdd-init` for
   existing-but-stale `openspec/` while still triggering when `openspec/` is
   missing.
5. `src/skills/_shared/openspec-convention.md` documents the `config.yaml`
   mechanism-section additive-merge idempotency contract.
6. Affected tests pass and assert both the widened trigger and the additive
   backfill behavior (`pnpm run lint`, `pnpm run typecheck`, `pnpm test`).
