# Change: oracle-envelope-binding

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Closeout today checks root-written text only: `skills/thoth-sdd/scripts/validate.mjs:541–543`
  requires `**Reviewer**: oracle`, `**Independent from implementer**: Yes`,
  `**Verdict**: PASS`, plus the reviewed record prefix SHA-256 and source
  digests. Nothing ties those fields to what the Oracle actually returned.
- Since 317022f the Oracle's final verification returns one fenced
  `thoth-result` gate envelope (`review.kind` `final-verification`, verdict
  PASS|FAIL|BLOCKED, `reviewedRecord`, `reviewedRecordSha256`), validated by
  `skills/thoth-sdd/scripts/validate-result.mjs` (`validateResult(message,
  {reviewKind, recordSha256})`), in the same directory as `validate.mjs`.
- `skills/thoth-archive/scripts/archive.mjs` calls
  `validate({ change, through: 'closeout' })` before and during the archive
  transaction (lines ~162, ~184, ~217), so a closeout rule also gates archive.
- The record template is `skills/thoth-sdd/templates/change.md`; the
  Verification section sits after `## Authorization`, so content added there
  does not change the reviewed prefix digest.
- Spec `.thoth/specs/adaptive-sdd/spec.md` "Bind final review to judged record
  content" covers the prefix digest; no requirement binds the Oracle output.

## Intent

Closeout (and therefore archive) accepts a final PASS only when the record
contains the Oracle's actual final-verification envelope, the validator accepts
it for this record, and it agrees with the recorded Verdict and reviewed
digest. The record stays the single artifact.

## Non-goals

- No binding of plan-review envelopes (plan review stays optional and
  separately recorded).
- No native task-id authentication (not verifiable offline).
- No change to the Oracle envelope contract or prompts beyond telling root to
  paste the envelope.
- Threat model: the rule catches honest mistakes (missing, wrong, stale,
  non-PASS or contradictory pasted envelope). It does not defend against a
  record author deliberately forging or hiding content: offline validation
  cannot authenticate the Oracle (a forger could write one fake PASS envelope),
  so adversarial-authoring bypasses are out of scope; independent review of the
  actual diff remains the protection.

## Acceptance

- AC-1: The record template's Verification section has an `**Oracle
  envelope**:` marker followed by exactly one fenced `thoth-result` block
  holding the Oracle's unchanged final-verification envelope.
- AC-2: `validate.mjs --through closeout` extracts that block, validates it with
  `validateResult` using review kind `final-verification` and the record's
  computed prefix SHA-256, and fails with stable issue codes when it is missing,
  duplicated, invalid, not PASS, bound to another record path or digest, or
  inconsistent with `**Verdict**`/`**Reviewed record SHA-256**`; `verify` stays
  as today (envelope optional before final review). Archive inherits the rule.
- AC-3: thoth-sdd skill guidance (verify phase and closeout text) tells root to
  paste the unchanged validated envelope under the marker; existing archived
  records are untouched.
- AC-4: Tests cover valid binding and every failure case; local closeout checks
  pass before the final Oracle (focused tests, bundled-skills, `pnpm run
  check:ci`, `pnpm run typecheck`, `pnpm run build`) and a closeout fixture
  proves the full order verify → envelope embedded → closeout. This record's own
  closeout is post-PASS bookkeeping in Verification/Closeout only.

## Clarifications

- Resolved by user: proceed with phase C (2026-10-11) after choosing gate-only
  structured results.

## Decisions

- D1: The envelope lives inside the existing Verification section (after
  `## Authorization`), so it never alters the reviewed prefix digest and needs
  no new artifact.
- D2: Closeout reuses the shared validator module; no second parser.
- D3: Plan-review envelopes and task ids are out of scope to keep the change
  minimal.
- D4: Order for any substantial change: `verify` → fresh final Oracle → root
  pastes the unchanged envelope under the marker (post-PASS bookkeeping allowed
  in Verification) → `closeout` → archive. The envelope's `reviewedRecord`
  names the active record path; validation of an archived record accepts the
  original active path it was reviewed under and never requires rewriting the
  envelope; historical archived records without an envelope are not
  retrofitted or re-validated by this rule.

## Durable deltas

- `ADDED adaptive-sdd` **Closeout requires the validated Oracle envelope** — Substantial closeout and archive MUST require the record's Verification section to contain exactly one unchanged Oracle final-verification `thoth-result` envelope that the bundled validator accepts for this record's path and prefix SHA-256 with verdict PASS and that agrees with the recorded Verdict and reviewed digest; a missing, invalid, non-PASS or mismatched envelope MUST fail closeout.
  - GIVEN a record whose Verdict field says PASS but whose embedded Oracle envelope says FAIL; WHEN closeout validation runs; THEN closeout fails and archive is refused .

## Plan

Test-first. U1 extends the record template and closeout validation with the
envelope binding and tests. U2 updates the thoth-sdd skill guidance and runs
the final build. U3 (root) runs the local checks before the final Oracle; then
the fresh Oracle verifies, root embeds its unchanged envelope as post-PASS
bookkeeping, and closeout and archive run under the new rule (D4).

## Tasks

- [x] AC-1: U1 — Template marker and closeout envelope binding.
  - Outcome: closeout validates the embedded Oracle envelope
  - Known entrypoints and skill paths: skills/thoth-sdd/scripts/validate.mjs (closeout ~535–590); skills/thoth-sdd/scripts/validate-result.mjs; skills/thoth-sdd/templates/change.md; src/harness/sdd-validator.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: this record (AC-1, AC-2, D1, D2)
  - Dependencies: none
  - Output: code, template, tests
  - Owner: thoth-worker
  - Writes: skills/thoth-sdd/scripts/validate.mjs, skills/thoth-sdd/templates/change.md, src/harness/sdd-validator.test.ts (and archive tests if needed)
  - Interface boundaries: verify gate unchanged; archived records untouched
  - Focused check and PASS evidence: valid binding and each failure case red then green; archive refuses a mismatched record
  - Return milestone: issue codes and template excerpt
  - Stop / reassessment: validator import not usable from validate.mjs in installed copies
- [x] AC-2: U1 — Failure cases and archive inheritance (same unit).
  - Outcome: AC-2 behaviors
  - Known entrypoints and skill paths: as U1; skills/thoth-archive/scripts/archive.mjs; src/harness/sdd-archive.test.ts
  - Inputs: as U1
  - Dependencies: none
  - Output: covered by U1
  - Owner: thoth-worker
  - Writes: covered by U1
  - Interface boundaries: as U1
  - Focused check and PASS evidence: missing, duplicate, invalid, non-PASS, wrong path, wrong digest, Verdict mismatch tests; archived record validated under its original active path; ordering fixture (verify → embed → closeout)
  - Return milestone: with U1
  - Stop / reassessment: as U1
- [x] AC-3: U2 — Skill guidance and final build.
  - Outcome: thoth-sdd guidance tells root to paste the envelope
  - Known entrypoints and skill paths: skills/thoth-sdd/SKILL.md; skills/thoth-sdd/references/phases/verify.md; src/harness/bundled-skills.test.ts
  - Inputs: accepted U1
  - Dependencies: U1 accepted
  - Output: edited skill files; plugin copies via build
  - Owner: thoth-worker
  - Writes: listed skill files, bundled-skills test, plugin/ via build
  - Interface boundaries: activation descriptions unchanged
  - Focused check and PASS evidence: bundled-skills tests; build regenerates copies
  - Return milestone: diff summary
  - Stop / reassessment: none expected
- [x] AC-4: U3 — Pre-Oracle local checks and ordering fixture.
  - Outcome: local check evidence before final review; ordering proven by fixture
  - Known entrypoints and skill paths: this record
  - Inputs: accepted U1, U2
  - Dependencies: U1, U2 accepted
  - Output: Verification entries (the envelope itself is embedded after the final Oracle as post-PASS bookkeeping)
  - Owner: root
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: focused tests, check:ci, typecheck, build exit 0; ordering fixture test passes
  - Return milestone: before the final Oracle
  - Stop / reassessment: failures attributable to this change

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

User said "Adelante con la fase C" on 2026-10-11.
User explicitly selected Oracle plan review. Fresh Oracle REJECT (U3 closeout cycle) → AC-4/U3/D4 repaired; second fresh Oracle plan-review OKAY. Prior explicit authorization stands.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 5eb5fdf06cf6e719239f1d19a54fa0255d15127b1d9c1aae535a1dbdc7ac87bd

- AC-1: PASS | template test; plugin copy parity | `**Oracle envelope**:` marker with placeholder thoth-result block in Verification
- AC-2: PASS | sdd-validator and sdd-archive tests | closeout requires one valid final-verification PASS envelope bound to record path and prefix digest and consistent with Verdict/Reviewed SHA; issue codes SDD-ORACLE-ENVELOPE-{MISSING,DUPLICATE,INVALID,NOT-PASS,RECORD-MISMATCH,DIGEST-MISMATCH,VERDICT-MISMATCH}; archive refused on mismatch; archived active path accepted; verify unchanged
- AC-3: PASS | bundled-skills tests | thoth-sdd SKILL.md and verify phase state the order verify, fresh Oracle, paste unchanged envelope, closeout, archive; plan-review envelopes not embedded; activation descriptions unchanged
- AC-4: PASS | 209/209 focused tests (validator, archive, bundled-skills, harness core); typecheck, check:ci, build exit 0 | ordering fixture verify, embed, closeout passes; embedding leaves prefix digest unchanged
- Source: plugin/skills/thoth-archive/SKILL.md | sha256:7d7e100c3f739d3e8ea88764256cacab725a719c481f13b5febe33a1e666c8e3
- Source: plugin/skills/thoth-sdd/references/phases/verify.md | sha256:8feb39cf2a21e70b7a6e35a32fba4eb53d0ab891bf79893e476b9ecbb200a0bc
- Source: plugin/skills/thoth-sdd/scripts/validate.mjs | sha256:b74ec5e369100d6c28006997cab9307bff85ef5935e9f53b9fb4b6f5e3bd11a9
- Source: plugin/skills/thoth-sdd/SKILL.md | sha256:01d73a90e8fcf1919be8c8a5313c9c3b25f3e4268a3cfc59fa0beb0c42d65e42
- Source: plugin/skills/thoth-sdd/templates/change.md | sha256:c106093d1852104bb6bc9b394e53ba640e6b1fb552ef2b8a4f5d80386c78dd86
- Source: skills/thoth-archive/SKILL.md | sha256:7d7e100c3f739d3e8ea88764256cacab725a719c481f13b5febe33a1e666c8e3
- Source: skills/thoth-sdd/references/phases/verify.md | sha256:8feb39cf2a21e70b7a6e35a32fba4eb53d0ab891bf79893e476b9ecbb200a0bc
- Source: skills/thoth-sdd/scripts/validate.mjs | sha256:b74ec5e369100d6c28006997cab9307bff85ef5935e9f53b9fb4b6f5e3bd11a9
- Source: skills/thoth-sdd/SKILL.md | sha256:01d73a90e8fcf1919be8c8a5313c9c3b25f3e4268a3cfc59fa0beb0c42d65e42
- Source: skills/thoth-sdd/templates/change.md | sha256:c106093d1852104bb6bc9b394e53ba640e6b1fb552ef2b8a4f5d80386c78dd86
- Source: src/harness/bundled-skills.test.ts | sha256:6a75bb46c6774d129c68a87de664f711b7e59f3ebc68d8b5758ebb04a438fdfc
- Source: src/harness/sdd-archive.test.ts | sha256:0f811b13a302426f2be7862452837ceaf3f8049969a0cb8bb870d60811530a03
- Source: src/harness/sdd-validator.test.ts | sha256:84390a9a2f70deb622369a35cf15fd6ca2d6896cca387ef7517bdcb9acc45731
- Source: .thoth/specs/adaptive-sdd/spec.md | sha256:c5a19841921fb8f9bd65892dc85fa5f0fa296e85ea1741b9961358125b278da0

Repair after final review FAIL: fence-aware envelope extraction in validate.mjs (marker and thoth-result fence recognized only at top level of the Verification section; examples inside other fences ignored; unclosed fences fail closed) with regressions; 82 focused tests, typecheck, check:ci, build pass. Root digest computation corrected to the anchored heading.
Second repair after re-verification FAIL: all top-level thoth-result candidates in Verification counted regardless of marker position (exactly one, right after a single marker); the original block text is passed verbatim to validateResult (no wrapper reconstruction); duplicate, wrapper and 11-case closeout/validator parity regressions; 93 validator/archive + 7 bundled-skills tests, build, typecheck, check:ci pass.
Third repair after re-verification FAIL (fenced-example heading truncated Verification and hid a second envelope; list examples misclassified): whole-file fail-closed rule — exactly one marker line and exactly one thoth-result fence-opening line anywhere in the record, both between the anchored Authorization and Closeout headings, block immediately after the marker, validated verbatim; records must not contain other thoth-result fences or marker lines (documented). 110 focused tests, typecheck, check:ci, build pass.
Fourth repair (scoped by the honest-mistake threat model now stated in Non-goals): case-insensitive thoth-result candidate detection; binding must lie between the anchored Verification and Closeout headings; no forgery detection. 125 focused tests, typecheck, check:ci, build pass.
Fifth repair: placement bounded by the first column-0 `## ` heading after `## Verification` (not specifically Closeout); intervening H2 refused, H3 accepted; 133 focused tests, typecheck, check:ci, build pass.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1–AC-4 and D1–D4 satisfy the stated honest-mistake threat model; no blocking findings remain.",
  "evidence": [
    {
      "id": "E1",
      "kind": "tests",
      "locator": "src/harness/{sdd-validator,sdd-archive,bundled-skills}.test.ts",
      "claim": "Fresh focused run passed all 133 tests across three files.",
      "basis": "observed",
      "uncertainty": "None for this run."
    },
    {
      "id": "E2",
      "kind": "CLI probes",
      "locator": "Temporary copies outside the repository; canonical and plugin skill scripts",
      "claim": "Valid binding passes. Missing, wrong-record, stale-digest, non-PASS, duplicate/contradictory, misplaced, malformed and field-mismatched envelopes fail. Intervening H2 fails; H3 passes. Archive refusal preserves files; successful archive preserves the envelope, applies only the declared delta, and archived validation accepts the original active reviewedRecord path.",
      "basis": "observed",
      "uncertainty": "Synthetic envelopes exercised structure, not Oracle provenance; temporary copies were removed."
    },
    {
      "id": "E3",
      "kind": "integrity",
      "locator": ".thoth/changes/oracle-envelope-binding/oracle-envelope-binding.md and diff against HEAD 317022f",
      "claim": "The independently computed prefix digest matches the assigned digest. All 14 Source hashes match; all 13 changed files are covered. Five changed plugin assets are byte-identical to canonical assets. Relevant inputs remained unchanged during review.",
      "basis": "observed",
      "uncertainty": "None for reviewed bytes."
    },
    {
      "id": "E4",
      "kind": "contract inspection",
      "locator": "skills/thoth-sdd/{scripts/validate.mjs,templates/change.md,SKILL.md,references/phases/verify.md}; skills/thoth-archive/",
      "claim": "Closeout validates the extracted block verbatim through validateResult. Placement ends at the first column-zero H2 after Verification. Template and guidance preserve verify → independent Oracle → validate and paste unchanged envelope → closeout → archive. Historical archives are untouched.",
      "basis": "observed",
      "uncertainty": "Offline validation cannot authenticate authorship."
    }
  ],
  "verification": [
    {
      "check": "AC-1–AC-3 and D1–D4",
      "method": "Inspect actual diff and contracts; run canonical/plugin CLI probes on temporary copies.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Binding, failure codes, section boundaries, shared validation, ordering and archive behavior satisfy the scoped requirements."
    },
    {
      "check": "AC-4 focused regressions",
      "method": "pnpm exec vitest run src/harness/sdd-validator.test.ts src/harness/sdd-archive.test.ts src/harness/bundled-skills.test.ts",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "133/133 tests passed."
    },
    {
      "check": "Source digests, delta coverage, plugin parity and freshness",
      "method": "Independent SHA-256 calculations, byte comparisons and final unchanged-input check.",
      "outcome": "pass",
      "evidenceIds": ["E3"],
      "reason": "All reviewed sources and the canonical adaptive-sdd baseline match; no uncovered diff or review-time drift."
    },
    {
      "check": "typecheck, check:ci and build",
      "method": "Reuse supplied passing worker evidence.",
      "outcome": "not-run",
      "evidenceIds": [],
      "reason": "Not independently rerun under the assigned read-only, focused-check scope."
    }
  ],
  "risks": [
    {
      "description": "Deliberate envelope forgery remains possible without native provenance authentication; explicitly outside this change's threat model.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged result, paste its envelope under the existing Verification marker, complete truthful PASS/READY bookkeeping, then run closeout and archive without changing reviewed inputs.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/oracle-envelope-binding/oracle-envelope-binding.md",
    "reviewedRecordSha256": "5eb5fdf06cf6e719239f1d19a54fa0255d15127b1d9c1aae535a1dbdc7ac87bd"
  }
}
```

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
