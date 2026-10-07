# Change: sdd-review-hash-boundary

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- `skills/thoth-sdd/scripts/validate.mjs:513-534` hashes every byte before `## Verification`, so the root-owned `## Authorization` bookkeeping is inside the reviewed prefix. The SHA check is a substring `includes`, not an anchored exact line.
- `skills/thoth-sdd/SKILL.md:166-168` and `references/phases/verify.md:3` require a fresh independent review whenever that prefix changes, with no distinction for bookkeeping.
- Authorization fields must match exact values (`validate.mjs:471-511`), but `templates/change.md:63-79` only shows placeholder values and never lists accepted values or where notes go.
- Stages are `explore → specify → clarify → plan → tasks → checklist → ready → closeout` (`validate.mjs:22-31`); closeout structure (`:469-683`) is only checked after the final Oracle, so format errors surface after the hash is frozen.
- Observed incident (pi-bg-shell-selection): annotations in Authorization lines passed final Oracle, failed closeout, and normalizing them forced another Oracle round with no substantive change.
- `skills/thoth-archive/scripts/archive.mjs:162,184,217` delegates record validation to `validate({ through: 'closeout' })`; it has no separate record-hash boundary.
- Bundled copies under `plugin/skills/thoth-sdd/` mirror the canonical skill files.
- Fixtures in `src/harness/sdd-validator.test.ts:52-54` and `src/harness/sdd-archive.test.ts:48-50` hand-build records and hash the Verification prefix; no test covers a stale record prefix.
- `.thoth/specs/adaptive-sdd/spec.md` defines closeout and verification requirements but not the hash boundary.

## Intent

Final Oracle review binds only the content Oracle actually judges, structural record errors are caught before the final Oracle is requested, and the template makes accepted field values explicit, so bookkeeping fixes no longer force extra Oracle rounds while substantive edits still do.

## Non-goals

- No change to when Oracle is mandatory or optional, to plan-review rounds, or to fresh-instance rules.
- No root judgment of "substantive vs non-substantive" edits; the boundary stays mechanical.
- No whitespace or punctuation normalization of the hashed bytes.
- No change to archive transaction logic beyond what follows from the validator.
- No package version bumps.

## Acceptance

- AC-1: The reviewed record SHA-256 is computed from the exact UTF-8 bytes preceding the `## Authorization` heading; edits confined to Authorization, Verification, or Closeout keep a valid closeout, while any edit before `## Authorization` yields `SDD-VERIFICATION-STALE`; a record without an `## Authorization` heading fails closeout.
- AC-2: The SHA check requires exactly one anchored `**Reviewed record SHA-256**: <64 lowercase hex>` line whose value equals the computed digest; annotated, duplicated, or substring-embedded values fail.
- AC-3: A new `verify` stage, ordered between `ready` and `closeout`, runs every closeout structural check (complete tasks, authorization disposition/provenance, reviewed source entries and digests) while permitting placeholder values for Reviewer, Independent from implementer, Verdict, Reviewed record SHA-256, AC verification rows, and Archive; closeout behavior is otherwise unchanged.
- AC-4: The template lists accepted values for Authorization, Verification, and Archive fields and states that notes go on separate lines below the fields.
- AC-5: Skill, phase-reference, and agent docs state the new hash boundary, require `--through verify` before requesting final Oracle, and state that edits after PASS confined to Authorization/Verification/Closeout need no new review while edits before `## Authorization` do; bundled `plugin/skills` copies match canonical sources.

## Clarifications

- Resolved: the user approved all four proposed points (hash boundary, pre-Oracle validation, template values, anchored SHA plus stale test) on 2026-10-06.

## Decisions

- Hash boundary is the case-sensitive `^## Authorization\s*$` heading; Authorization remains structurally validated at `verify` and `closeout`, and its provenance stays root-owned as before.
- The pre-Oracle stage is named `verify`, matching the existing `references/phases/verify.md` phase.
- Reviewed source entries live in Verification and are prepared before Oracle, so `verify` checks them; AC verification rows are filled after PASS, so `verify` allows placeholder rows.
- One Worker owns all writes because the validator, tests, skill text, and bundled copies form one cohesive contract and the bundled-copy sync touches every surface.

## Durable deltas

- `ADDED adaptive-sdd` **Bind final review to judged record content** — The reviewed record digest MUST cover the exact bytes preceding the `## Authorization` heading, a `verify` validator stage MUST check closeout structure before final Oracle review, and edits after PASS confined to Authorization, Verification, or Closeout MUST NOT require a new review while any edit before `## Authorization` MUST invalidate the PASS.
  - GIVEN a substantial record with a final Oracle PASS and matching digest; WHEN root edits only Authorization, Verification, or Closeout lines; THEN closeout remains valid without a new Oracle round, and WHEN any byte before `## Authorization` changes THEN closeout fails as stale until a fresh independent review records a new digest .

## Plan

1. `validate.mjs`: add `verify` to the ordered stage list between `ready` and `closeout` and to every applicable stage-membership array and the task-completion guard (`validate.mjs:389-464`), so `verify` requires everything `ready` does plus completed tasks; compute the record prefix up to `^## Authorization\s*$` (error if missing at verify/closeout); parse exactly one anchored SHA line and compare by equality; gate Reviewer/Independent/Verdict/SHA/AC-row/Archive checks behind `closeout` while running tasks-complete, authorization, and source-entry checks for both `verify` and `closeout`. Update the stale message wording to reference the pre-Authorization content.
2. Tests (TDD first) in `src/harness/sdd-validator.test.ts` and `src/harness/sdd-archive.test.ts`: move fixture digests to the pre-Authorization prefix; add cases for Authorization-only edit still valid, pre-Authorization edit stale, missing Authorization heading, annotated/duplicate SHA lines, and `verify` passing with Verification placeholders but failing on malformed Authorization or stale source digest.
3. Text: `skills/thoth-sdd/SKILL.md` (gates/CLI section and stage list), `references/phases/verify.md`, `templates/change.md` (accepted values, notes guidance), `docs/agent/sdd-and-skills.md`. Do not run `integration:sync` / `generateIntegrationPackages()`, which rebuilds all of `plugin/`, `pi/`, and legacy roots; instead copy byte-for-byte only the four changed canonical assets (`SKILL.md`, `references/phases/verify.md`, `templates/change.md`, `scripts/validate.mjs`) to the matching `plugin/skills/thoth-sdd/` paths and keep `bundled-skills` and `generate-integration-packages` consistency tests green. The post-PASS edit allowance never waives structural checks, truthful provenance, stale-source rejection, or review of changed implementation.
4. Focused checks: `pnpm vitest run src/harness/sdd-validator.test.ts src/harness/sdd-archive.test.ts src/harness/bundled-skills.test.ts src/harness/generate-integration-packages.test.ts`, then `pnpm run check:ci`, `pnpm run typecheck`, `pnpm test`.

## Tasks

- [x] AC-1: Validator hash boundary, anchored SHA, and verify stage implemented test-first
  - Outcome: validate.mjs enforces the pre-Authorization digest, anchored exact SHA line, and new verify stage with passing focused tests
  - Known entrypoints and skill paths: skills/thoth-sdd/scripts/validate.mjs; src/harness/sdd-validator.test.ts; src/harness/sdd-archive.test.ts; skills/thoth-archive/scripts/archive.mjs (read-only); C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: accepted Exploration, Decisions, and Plan steps 1-2 in this record
  - Dependencies: none
  - Output: modified validator and tests
  - Owner: thoth-worker
  - Writes: skills/thoth-sdd/scripts/validate.mjs; src/harness/sdd-validator.test.ts; src/harness/sdd-archive.test.ts; plugin/skills/thoth-sdd/scripts/validate.mjs
  - Interface boundaries: validate() export and CLI flags used by archive.mjs; closeout semantics unchanged except AC-1 and AC-2
  - Focused check and PASS evidence: pnpm vitest run src/harness/sdd-validator.test.ts src/harness/sdd-archive.test.ts passes including new stale, annotation, missing-heading, and verify-stage cases
  - Return milestone: focused tests green with new cases listed
  - Stop / reassessment: archive.mjs needs its own hash logic change, or verify stage conflicts with existing stage membership logic
- [x] AC-2: Anchored SHA covered by the same validator unit
  - Outcome: duplicate, annotated, or substring SHA values fail closeout
  - Known entrypoints and skill paths: skills/thoth-sdd/scripts/validate.mjs; src/harness/sdd-validator.test.ts
  - Inputs: AC-1 unit
  - Dependencies: none (same unit as AC-1)
  - Output: tests asserting failure for each invalid SHA form
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: closeout error codes
  - Focused check and PASS evidence: new SHA-format tests pass
  - Return milestone: with AC-1 unit
  - Stop / reassessment: existing records in .thoth/changes/archive would be rejected by stricter parsing in a way that breaks a test
- [x] AC-3: Verify stage covered by the same validator unit
  - Outcome: --through verify accepts Verification placeholders and rejects malformed Authorization or stale sources
  - Known entrypoints and skill paths: skills/thoth-sdd/scripts/validate.mjs; src/harness/sdd-validator.test.ts
  - Inputs: AC-1 unit
  - Dependencies: none (same unit as AC-1)
  - Output: verify-stage tests
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: --through CLI values
  - Focused check and PASS evidence: verify-stage tests pass
  - Return milestone: with AC-1 unit
  - Stop / reassessment: stage list consumers outside validate.mjs require changes
- [x] AC-4: Template lists accepted values and notes guidance
  - Outcome: change.md shows accepted values per field and separate-line notes guidance
  - Known entrypoints and skill paths: skills/thoth-sdd/templates/change.md; plugin/skills/thoth-sdd/templates/change.md; src/harness/bundled-skills.test.ts
  - Inputs: Decisions in this record
  - Dependencies: none
  - Output: updated template and bundled copy
  - Owner: thoth-worker
  - Writes: skills/thoth-sdd/templates/change.md; plugin/skills/thoth-sdd/templates/change.md
  - Interface boundaries: validator regexes must still accept a filled template; placeholder lines must remain valid before closeout
  - Focused check and PASS evidence: bundled-skills and generate-integration-packages tests pass; a template-derived record still passes ready
  - Return milestone: template diff plus passing tests
  - Stop / reassessment: guidance text cannot coexist with validator line regexes
- [x] AC-5: Rule text and bundled copies updated
  - Outcome: SKILL.md, verify.md, docs/agent/sdd-and-skills.md describe the boundary, verify gate, and post-PASS edit rule; plugin copies match
  - Known entrypoints and skill paths: skills/thoth-sdd/SKILL.md; skills/thoth-sdd/references/phases/verify.md; docs/agent/sdd-and-skills.md; plugin/skills/thoth-sdd/
  - Inputs: AC-1 unit stage name and boundary
  - Dependencies: AC-1 unit accepted
  - Output: updated docs and bundled copies
  - Owner: thoth-worker
  - Writes: skills/thoth-sdd/SKILL.md; skills/thoth-sdd/references/phases/verify.md; docs/agent/sdd-and-skills.md; plugin/skills/thoth-sdd/SKILL.md; plugin/skills/thoth-sdd/references/phases/verify.md
  - Interface boundaries: bundled-skills text assertions
  - Focused check and PASS evidence: byte-identical canonical and plugin copies of the four changed assets; pnpm run check:ci, pnpm run typecheck, pnpm test pass
  - Return milestone: full suite green
  - Stop / reassessment: consistency tests require regenerating packages beyond the four copied files

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 6f2d15748f11b9354bb1416b3616b069a25649f409f6fdeab2c711e50416c222

- AC-1: PASS | boundary tests and in-memory closeout checks | Authorization/Verification/Closeout edits stay valid; pre-Authorization edits give SDD-VERIFICATION-STALE; missing or case-wrong heading fails
- AC-2: PASS | SHA-format tests | annotated, duplicate, embedded, uppercase, missing, and trailing-space digests fail
- AC-3: PASS | focused tests and --through verify on this record | placeholders pass; incomplete tasks, malformed authorization, stale or missing sources fail; closeout error codes unchanged
- AC-4: PASS | template inspection and template-derived ready test | accepted values and separate-line notes documented; placeholder fields valid at ready
- AC-5: PASS | docs inspection and byte comparison | boundary and verify-gate wording present; four canonical/plugin pairs identical; vitest 58/58, pnpm test 1547 passed 3 skipped, typecheck and check:ci pass
- Source: .thoth/specs/adaptive-sdd/spec.md | sha256:4757d93b9098df518ef6aa91d4129333f06331570a396f16f15001479c2c9a89

## Closeout

**Archive**: READY

Plan review: round 1 REJECT (integration:sync would rebuild all bundle roots), repaired to copy only four assets; round 2 OKAY. Final verification: fresh Oracle PASS on 2026-10-06, independent of the thoth-worker implementer. These notes were added after PASS without changing the reviewed digest.
