# Change: memory-orchestration-scenarios

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: low

## Exploration

- Archiving `root-memory-proactivity` (2026-10-13) applied a `MODIFIED memory-orchestration` delta to **Root memory routing**. The archiver (`skills/thoth-archive/scripts/archive.mjs:71–72`) rewrites a requirement with exactly one scenario, so the requirement's four `US2 - Bounded agent memory usage` scenarios were replaced by one.
- Scenario 1 (resume-triggered routing) was intentionally superseded. Scenarios 2–4 were lost from `memory-orchestration` although still present verbatim under **Delegated memory authorization** in `.thoth/specs/agent-delegation/spec.md`:
  - child dispatch envelope carries provider, project, stable root session identity or explicit unavailable state, authorization, and bounded context;
  - read-only roles granted `observe` may persist one durable provider observation without workspace mutation or root lifecycle authority;
  - `.thoth/` remains canonical and thoth-mem is not used as a mirror of project work.
- Delta grammar (`skills/thoth-sdd/scripts/validate.mjs:178`) allows one GIVEN/WHEN/THEN per delta; restoring them as separate requirements is the only expressible form.
- Changing `.thoth/specs` requires a declared delta applied by archive after fresh independent verification (`.thoth/constitution.md:103–104`).

## Intent

Restore the three lost memory-orchestration behaviors to the canonical `memory-orchestration` spec as separate requirements, without changing product code or other specs.

## Non-goals

- No product code, prompt, test, or `agent-delegation` spec changes.
- No change to the current **Root memory routing** requirement.
- No change to the archiver's one-scenario format.

## Acceptance

- AC-1: After archive, `.thoth/specs/memory-orchestration/spec.md` contains the unchanged **Root memory routing** requirement plus three new requirements covering dispatch memory identity, read-only `observe` authorization, and `.thoth/` canonicality, each with its GIVEN/WHEN/THEN matching the lost scenario.

## Clarifications

- None needed: the user asked to restore the lost scenarios; the one-scenario format makes separate requirements the faithful equivalent (reported to the user 2026-10-14).

## Decisions

- Restore as three `ADDED` requirements rather than one multi-scenario `MODIFIED` (format constraint).
- Statements reuse the original scenario wording and the matching `agent-delegation` normative language.

## Durable deltas

- `ADDED memory-orchestration` **Delegated memory identity** — When memory is relevant to a child dispatch, the dispatch envelope MUST carry the provider, project, stable root session identity or an explicit unavailable state, authorization, and bounded context.
  - GIVEN a child dispatch; WHEN memory is relevant; THEN the envelope carries provider, project, stable root session identity or an explicit unavailable state, authorization, and bounded context .
- `ADDED memory-orchestration` **Read-only observe authorization** — A read-only workspace role explicitly granted `observe` MAY persist a durable provider observation and MUST NOT thereby gain workspace mutation or root lifecycle authority.
  - GIVEN a read-only workspace role such as explorer or oracle; WHEN the parent explicitly grants `observe`; THEN the role may persist a durable provider observation without gaining workspace mutation or root lifecycle authority .
- `ADDED memory-orchestration` **Canonical project artifacts** — Project change records, durable specifications, and historical artifacts MUST remain canonical under `.thoth/`, and thoth-mem MUST NOT be used as a mirror of project work.
  - GIVEN a project change record, durable specification, or historical artifact; WHEN memory is used; THEN `.thoth/` remains canonical and thoth-mem is not used as a mirror of project work .

## Plan

Spec-only change applied by the archiver: the three `ADDED` deltas above. Verification: `validate.mjs --through verify`, fresh read-only Oracle comparing the deltas against the lost scenarios (`git show c3fd94f:.thoth/specs/memory-orchestration/spec.md`) and `agent-delegation`, then closeout and archive; inspect the resulting spec diff.

## Tasks

- [x] AC-1: Declare three ADDED requirements restoring the lost memory-orchestration scenarios
  - Outcome: deltas in this record match the three lost scenarios
  - Known entrypoints and skill paths: this record; `.thoth/specs/memory-orchestration/spec.md`; `.thoth/specs/agent-delegation/spec.md`; `skills/thoth-archive/SKILL.md`
  - Inputs: Exploration evidence
  - Dependencies: none
  - Output: validated deltas ready for archive
  - Owner: root
  - Writes: this record only (spec written by archiver)
  - Interface boundaries: archiver delta grammar; constitution spec-update rule
  - Focused check and PASS evidence: `validate.mjs --through verify` exit 0; Oracle PASS; post-archive spec contains four requirements
  - Return milestone: verify gate passes
  - Stop / reassessment: validator rejects ADDED deltas

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Fresh Oracle plan review OKAY (validated). Non-blocking: archiver trims one trailing space in Root memory routing.
**Implementation**: AUTHORIZED
User authorized item 4 (2026-10-14) before review; prior explicit authorization honored.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 73ae4bee341fad3f0910c52aba7b77b1264739dbdc0d36d8a0abaa7f44158930

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 is achievable exactly through the three declared ADDED deltas, without obligation drift or semantic changes to Root memory routing.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/memory-orchestration-scenarios/memory-orchestration-scenarios.md",
      "claim": "SHA-256 of the exact 5105 UTF-8 bytes before ## Authorization independently matches 73ae4bee341fad3f0910c52aba7b77b1264739dbdc0d36d8a0abaa7f44158930.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "scenario-comparison",
      "locator": "c3fd94f:.thoth/specs/memory-orchestration/spec.md; .thoth/specs/agent-delegation/spec.md",
      "claim": "All three declared GIVEN/WHEN/THEN triples match US2 scenarios 2–4 in both sources, ignoring trailing whitespace only.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "validation",
      "locator": "node skills/thoth-sdd/scripts/validate.mjs --change .thoth/changes/memory-orchestration-scenarios --through verify --json",
      "claim": "Exit 0; valid true; no errors. Current canonical source SHA-256 matches 979ec196609744cd2b851e05b1e14229515390be203dba8fbafc48a240319906. Three overlap-review warnings were assessed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "read-only-projection",
      "locator": "skills/thoth-archive/scripts/archive.mjs: planUpdates and assertReviewedBaselines",
      "claim": "Exact current planning functions executed in memory produce one canonical update containing Root memory routing plus the three declared requirements, with no title collisions. Existing routing semantics and all declared statements/scenarios are preserved. Projected spec SHA-256 is 73341eb084ed5789b1feb9b419a6801021af3fb864704b02b4bdaabc8bf3fc61.",
      "basis": "observed",
      "uncertainty": "Archive mutation was deliberately not executed."
    },
    {
      "id": "E5",
      "kind": "scope-and-freshness",
      "locator": "git status --short; git diff --exit-code; git diff --cached --exit-code; frozen-input byte comparisons",
      "claim": "Branch is master; only the change directory is untracked; staged and tracked diffs are empty. Reviewed record, specs, and planning/validation inputs remained unchanged throughout checking.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding and current source digest",
      "method": "Independent SHA-256 calculation over exact record-prefix and canonical-spec bytes.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E3"],
      "reason": "Both hashes match the assigned record and declared baseline."
    },
    {
      "check": "Scenario fidelity and absence of obligation drift",
      "method": "Compare parsed triples against both sources; inspect normative statements and existing routing boundaries.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Dispatch identity, explicit observe permission without expanded authority, and canonical artifact boundaries are faithfully restored."
    },
    {
      "check": "AC-1 achievability and title safety",
      "method": "Read-only execution of exact archiver planning functions with assertions on update scope, requirement titles, statements, scenarios, and existing requirement equality.",
      "outcome": "pass",
      "evidenceIds": ["E4"],
      "reason": "Projection contains exactly four requirements and modifies no other capability."
    },
    {
      "check": "Required verify gate and spec-only scope",
      "method": "Run the assigned validator and inspect staged/unstaged diffs and input freshness.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E5"],
      "reason": "Gate passes; no product implementation diff exists."
    }
  ],
  "risks": [
    {
      "description": "Archiver normalization removes one trailing space from Root memory routing; preservation is semantic rather than byte-identical.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root validates this unchanged envelope, records PASS evidence, runs closeout, then archives and checks the resulting spec diff.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/memory-orchestration-scenarios/memory-orchestration-scenarios.md",
    "reviewedRecordSha256": "73ae4bee341fad3f0910c52aba7b77b1264739dbdc0d36d8a0abaa7f44158930"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | Oracle read-only archive projection + scenario comparison | Oracle evidence E2, E4; post-archive spec diff inspected by root
- Source: .thoth/specs/memory-orchestration/spec.md | sha256:979ec196609744cd2b851e05b1e14229515390be203dba8fbafc48a240319906

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
