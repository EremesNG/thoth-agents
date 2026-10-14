# Change: recordless-final-verification

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- `src/harness/core/result-contract.ts:67,89-90` defines
  `recordBindingReviewKind: 'final-verification'` and
  `recordBindingRequiredFields: ['reviewedRecord', 'reviewedRecordSha256']`;
  `:119-125` makes both fields required in the `OracleReview` type.
  `scripts/generate-result-contract.ts` serializes the contract to
  `skills/thoth-sdd/scripts/result-contract.json` (`reviewedRecord` nonempty
  string, `reviewedRecordSha256` 64-hex string).
- `skills/thoth-sdd/scripts/validate-result.mjs:256-263` requires both binding
  fields for every `final-verification` envelope (PASS, FAIL and BLOCKED), even
  without `--record-sha256`; `:266-283` compares the digest when supplied.
- Small work has no record (`src/agents/prompt-sections.ts:221`), yet materially
  risky work needs Oracle (`:227`) and every Oracle gate must be validated before
  recording PASS (`:252`; `.thoth/specs/multi-harness-agent-pack/spec.md`
  "Structured specialist results"). A small materially risky change therefore can
  never obtain a validated PASS.
- Oracle instruction `src/harness/core/agent-pack.ts:500`: "Final-verification
  requires reviewedRecord and reviewedRecordSha256 from the assignment."
  Generated into `plugin/agents/oracle.md:75` and `pi/agents/thoth-oracle.md:78`.
- `skills/thoth-sdd/SKILL.md:173-176` and `references/phases/verify.md:3,7`
  describe record binding for substantial records only.
- Substantial closeout independently validates the embedded envelope with the
  calculated digest and compares record path and digest
  (`skills/thoth-sdd/scripts/validate.mjs:410-463`).
- Pins: `src/harness/core/validate-result.test.ts:283-326` (binding required
  without digest), `:411-417` byte identity of plugin copies;
  `src/harness/core/result-contract.test.ts:21-25`;
  `src/agents/prompt-rendering.test.ts:625-655` Oracle wording, `:668-672`
  specialist cap 5,000, `:853-868` root caps, `:872-914` hash baselines;
  `src/harness/bundled-skills.test.ts:310-338,371-393`.
- No separate TS runtime envelope validator exists.

## Intent

A small change verified by Oracle can obtain a validated final-verification
PASS: `validate-result.mjs` accepts an explicit `--no-record` option under which
a `final-verification` envelope must omit record binding, while the default
(no option) keeps requiring binding so a substantial verification cannot
silently drop it.

## Non-goals

- No change to plan-review validation or substantial closeout/archive checks.
- No nullable binding fields and no schema type change for present fields.
- No change to when Oracle is required for small work.
- No runtime enforcement in harness adapters.

## Acceptance

- AC-1: `validate-result.mjs --review-kind final-verification --no-record` accepts a PASS envelope without `reviewedRecord`/`reviewedRecordSha256` and rejects one that includes either field; without `--no-record` binding stays required; `--no-record` combined with `--record-sha256` or a non-final-verification review kind is a usage error; contract source, generated JSON, `OracleReview` type and plugin copies agree.
- AC-2: The Oracle prompt for every harness tells Oracle to omit both binding fields when the final-verification assignment names no record, root guidance and the thoth-sdd skill tell root to pass `--no-record` for recordless small-change final verification, and all prompts stay within existing caps.
- AC-3: The record declares an archive-ready ADDED `adaptive-sdd` requirement with a scenario for recordless final-verification validation, bound to the reviewed baseline digest.

## Clarifications

- Design chosen by the user (2026-10-13): explicit `--no-record` option; default strictness unchanged.

## Decisions

- SDD-DECISION: Under `--no-record`, present binding fields are invalid (new issue code) so the envelope truthfully reflects a recordless review.
- SDD-DECISION: `OracleReview` final-verification binding fields become optional in the TS type; the validator, not the type, enforces presence by mode.
- SDD-DECISION: The shipped declaration `skills/thoth-sdd/scripts/validate-result.d.mts` gains `noRecord` and `RECORD_BINDING_FORBIDDEN` so the public typings match the validator (root-authorized ripple during implementation).
- SDD-DECISION: Substantial closeout keeps calling the shared validator with the record digest, so its binding checks are unchanged.

## Durable deltas

- `ADDED adaptive-sdd` **Validate recordless small-change final verification** — The bundled result validator MUST accept an explicit no-record mode for final verification of a recordless small change assigned to Oracle, in which the envelope omits record binding, MUST reject binding fields in that mode, and MUST keep requiring record binding for final verification when the mode is not selected.
  - GIVEN a small change without a record that root assigned to Oracle and an Oracle PASS envelope without record binding; WHEN root validates it with the no-record mode and, separately, without it; THEN the first validation succeeds and the second fails for missing record binding.

## Plan

1. Contract: add a no-record notion to `result-contract.ts` rules (e.g. forbidden
   binding under no-record), make `OracleReview` binding optional, regenerate
   `result-contract.json` with the existing generator script.
2. Validator: parse `--no-record` in `validate-result.mjs`; usage error with
   `--record-sha256` or non-final-verification kind; skip required binding and
   reject present binding in that mode; keep `validate.mjs` closeout unchanged.
3. Tests first in `validate-result.test.ts` and `result-contract.test.ts`.
4. Prompts and skill: Oracle line in `agent-pack.ts:500`; root validation line in
   `prompt-sections.ts:252` gains `[--no-record]`; `SKILL.md` Specialist result
   validation and `verify.md` explain the small-change mode; update pins and hash
   baselines that change; respect caps.
5. `pnpm run build` regenerates `plugin/` and `pi/` copies.

Focused seams: `pnpm vitest run src/harness/core/validate-result.test.ts
src/harness/core/result-contract.test.ts src/harness/sdd-validator.test.ts
src/agents/prompt-rendering.test.ts src/harness/bundled-skills.test.ts`,
`pnpm run typecheck`, `pnpm run check:ci`, `pnpm run build`, validator
`--through verify`.

## Tasks

- [x] AC-1: Validator and contract support explicit `--no-record` final verification
  - Outcome: contract, generated JSON, type and validator implement the mode with tests
  - Known entrypoints and skill paths: `src/harness/core/result-contract.ts`, `scripts/generate-result-contract.ts`, `skills/thoth-sdd/scripts/validate-result.mjs`, `skills/thoth-sdd/scripts/result-contract.json`, `src/harness/core/validate-result.test.ts`, `src/harness/core/result-contract.test.ts`; installed `tdd`, `simplify`
  - Inputs: Exploration and Decisions of this record
  - Dependencies: none
  - Output: code, generated JSON, tests
  - Owner: thoth-worker
  - Writes: the listed files plus `plugin/skills/thoth-sdd/scripts/{validate-result.mjs,result-contract.json}`
  - Interface boundaries: `validate.mjs` closeout consumer must keep passing its digest; `OracleReview` consumers
  - Focused check and PASS evidence: validate-result, result-contract and sdd-validator tests pass
  - Return milestone: tests, typecheck green
  - Stop / reassessment: closeout consumer requires changes or type change ripples beyond the contract module
- [x] AC-2: Oracle, root and skill guidance describe the no-record mode
  - Outcome: prompt and skill text updated in every harness within caps
  - Known entrypoints and skill paths: `src/harness/core/agent-pack.ts:500`, `src/agents/prompt-sections.ts:252`, `skills/thoth-sdd/SKILL.md:165-190`, `skills/thoth-sdd/references/phases/verify.md`, `src/agents/prompt-rendering.test.ts`, `src/harness/bundled-skills.test.ts`
  - Inputs: accepted AC-1 option name and behavior
  - Dependencies: AC-1 accepted
  - Output: prompt and skill text, pins, regenerated `plugin/` and `pi/` assets
  - Owner: thoth-worker
  - Writes: listed files and build-generated copies
  - Interface boundaries: root caps and specialist cap 5,000; hash baselines
  - Focused check and PASS evidence: prompt-rendering and bundled-skills tests pass; build leaves copies identical
  - Return milestone: tests, check:ci and build green
  - Stop / reassessment: cap breach or conflicting pinned wording
- [x] AC-3: Archive-ready spec delta declared against the reviewed baseline
  - Outcome: ADDED requirement consistent with the implementation and a current Source digest
  - Known entrypoints and skill paths: this record; `skills/thoth-sdd/scripts/validate.mjs`
  - Inputs: accepted AC-1 and AC-2 outputs
  - Dependencies: AC-1, AC-2 accepted
  - Output: finalized delta text in this record
  - Owner: root
  - Writes: this record only
  - Interface boundaries: canonical application is a post-PASS archive action via `thoth-archive`
  - Focused check and PASS evidence: `--through verify` passes with the Source digest matching `.thoth/specs/adaptive-sdd/spec.md`
  - Return milestone: before requesting final Oracle
  - Stop / reassessment: stale digest or overlap with an existing requirement

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 7791b80e22c3e859f7b54f67f7e2b3e0233ec1a44b6ac5fa131d0d81f649e74a

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1, AC-2 and AC-3 are satisfied. Explicit recordless validation works without weakening default binding or substantial closeout.",
  "evidence": [
    {
      "id": "E1",
      "kind": "digest",
      "locator": ".thoth/changes/recordless-final-verification/recordless-final-verification.md; .thoth/specs/adaptive-sdd/spec.md",
      "claim": "Independently hashed the 9,310 exact bytes before ## Authorization: 7791b80e22c3e859f7b54f67f7e2b3e0233ec1a44b6ac5fa131d0d81f649e74a. Canonical baseline matches d8a7b0616f499c4d03e2c81bfb4708f0225940839dacc1b31bbd99a152a65dbb. Reviewed-input snapshot remained unchanged during validation.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E2",
      "kind": "execution",
      "locator": "Assigned five-file vitest command; pnpm run typecheck; pnpm run check:ci; git diff --check",
      "claim": "All 366 tests passed across five files. Typecheck, check:ci and diff whitespace checks passed. Biome reported warnings and infos, not errors.",
      "basis": "observed",
      "uncertainty": "Full build was not rerun because it regenerates workspace assets."
    },
    {
      "id": "E3",
      "kind": "cli-probes",
      "locator": "skills/thoth-sdd/scripts/validate-result.mjs",
      "claim": "All 16 direct stdin probes passed: default rejects missing or partial binding and accepts complete binding; expected digests enforce freshness; --no-record accepts omitted binding and rejects either or both fields; digest and plan-review combinations exit 2. Default plan-review remains valid.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E4",
      "kind": "contract-review",
      "locator": "src/harness/core/result-contract.ts; skills/thoth-sdd/scripts/{result-contract.json,validate-result.d.mts}; plugin copies",
      "claim": "TS and generated JSON agree, with unchanged present-field schemas. Declaration changes are limited to noRecord?: boolean and RECORD_BINDING_FORBIDDEN, explicitly recorded in Decisions. Canonical/plugin contract, validator, declaration and guidance files are byte-identical.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E5",
      "kind": "regression-review",
      "locator": "skills/thoth-sdd/scripts/validate.mjs:410-470; plugin counterpart; src/harness/sdd-validator.test.ts",
      "claim": "Both closeout consumers are byte-identical to HEAD. They still invoke strict validation with the calculated digest and enforce PASS, record path, digest and recorded verdict consistency. Existing closeout regression tests passed.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E6",
      "kind": "prompt-review",
      "locator": "src/agents/prompt-rendering.test.ts; prompt renderers; generated plugin/pi agents",
      "claim": "Oracle omission guidance appears in all four harnesses. Oracle lengths are OpenCode 4846, Codex 4889, Claude 4859 and Pi 4963, all below 5000. Root lengths are respectively 12261/12500, 13547/13800, 13014/13300 and 15380/15600. Non-Pi snapshot updates affect only orchestrator and Oracle. Changed generated agents match current renderers byte-for-byte; both asset manifests match their files.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E7",
      "kind": "spec-review",
      "locator": "Record Durable deltas; adaptive-sdd canonical baseline; repository validate.mjs --through verify --json",
      "claim": "Repository verify gate passed. The ADDED requirement and scenario match implemented mode behavior. The overlap warning was independently resolved: existing requirements govern verification and substantial record binding, not explicit recordless result validation. The change directory contains only its sole record.",
      "basis": "observed",
      "uncertainty": "Canonical application remains the post-PASS archive action."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Actual diff review, direct stdin CLI probes, contract tests, typecheck and byte comparisons.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Explicit no-record behavior, incompatibility errors, default strictness and all contract surfaces agree."
    },
    {
      "check": "AC-2",
      "method": "Reviewed root/skill guidance; rendered every harness; executed prompt tests and generated-asset comparisons.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E6"],
      "reason": "Recordless guidance is present, existing caps hold and intentional snapshot changes are bounded."
    },
    {
      "check": "AC-3",
      "method": "Compared the declared delta against implementation and the independently hashed canonical baseline; ran repository verify gate.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E7"],
      "reason": "The delta is structurally archive-ready, semantically distinct and bound to the current baseline."
    },
    {
      "check": "Substantial closeout regression",
      "method": "Compared consumers with HEAD, inspected strict validation call and ran existing regressions plus digest probes.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "No-record mode cannot silently bypass the unchanged substantial closeout consumer."
    },
    {
      "check": "Review binding and freshness",
      "method": "Exact-byte SHA-256 calculation and before/after input snapshot comparison.",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Assigned digest and baseline match; reviewed inputs did not change."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope with the matching record digest, record acceptance evidence, run closeout, then archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/recordless-final-verification/recordless-final-verification.md",
    "reviewedRecordSha256": "7791b80e22c3e859f7b54f67f7e2b3e0233ec1a44b6ac5fa131d0d81f649e74a"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | validate-result tests and 16 direct CLI probes | default binding required; --no-record accepts recordless and rejects binding; incompatible options exit 2
- AC-2: PASS | prompt-rendering and bundled-skills tests, independent rendering | omission guidance in all harnesses; Oracle Pi 4963/5000; roots below caps
- AC-3: PASS | repository validator --through verify | baseline digest current; delta consistent and non-overlapping
- Source: .thoth/specs/adaptive-sdd/spec.md | sha256:d8a7b0616f499c4d03e2c81bfb4708f0225940839dacc1b31bbd99a152a65dbb

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
