# sdd-constitution Capability Spec

Introduce a new bundled, `ORCHESTRATOR_ONLY` governance skill `sdd-constitution`
that closes the constitution lifecycle by adding its missing AMENDMENT side.
The skill performs a GUIDED, human-confirmed semver amendment of the END-USER
project file `openspec/memory/constitution.md` ONLY — semver bump, `Last-Amended`
update, and a prepended `## Sync-Impact Report` entry. It is REPORT-ONLY for
everything else: it never edits any other bundled plugin asset, and because the
enforcement gates (`sdd-design`, `plan-reviewer`) read the constitution LIVE,
there are no static principle copies to realign. `sdd-verify` and `sdd-archive`
surface a non-blocking, report-only suggestion to run it when a completed change
touched governance/principles. This adds the MECHANISM by which future
amendments occur and does not alter the existing creation or enforcement
behavior.

## Assumptions

- **(a) Governance-touched detection heuristic (resolved, low-false-negative).**
  The report-only auto-suggest in `sdd-verify`/`sdd-archive` fires when ANY of
  the following hold for the completed change: (1) the change's
  `proposal.md` Impact / Affected Areas, `design.md`, `tasks.md`, or delta
  `spec.md` files reference `openspec/memory/constitution.md`, the constitution,
  or one or more named constitution principles; OR (2) the change modifies a
  governance document, specifically `src/skills/_shared/openspec-convention.md`
  (Constitution Governance section) or `openspec/memory/constitution.md` itself;
  OR (3) the change's artifacts otherwise name a constitution principle by title.
  The heuristic is deliberately broad (favoring false positives over false
  negatives) because the suggestion is advisory only and a human makes the final
  call; this is a defensible default and not a genuine fork.
- **(b) Suggestion text lives in `_shared` (resolved, DRY).** The auto-suggest
  prose is defined once as a shared snippet in
  `src/skills/_shared/openspec-convention.md` (Constitution Governance section)
  and REFERENCED by both `sdd-verify` and `sdd-archive`, rather than inlined
  independently in each skill. This prevents wording drift between the two
  trigger points. It does not conflict with the read-only-asset model: the
  shared convention is authored in-repo (a source asset), and at runtime the
  skills only READ the shared doctrine to emit advisory text — no asset is
  written.
- **(c) `sdd-constitution` is a standalone governance skill, not a pipeline
  phase (resolved).** It does NOT join `FULL_SDD_PHASE_ORDER`,
  `ACCELERATED_SDD_PHASE_ORDER`, `SDD_PHASES`, or the per-change SDD delegation
  matrix, because governance amendment is not a per-change pipeline phase. It is
  registered in `BUNDLED_SKILL_REGISTRY` as an `ORCHESTRATOR_ONLY` skill so it
  is discoverable and explicitly invocable, and it is surfaced via the
  report-only suggestion at the natural end-of-change moments.
- The single writable target is `openspec/memory/constitution.md`; every other
  bundled asset (any `SKILL.md`, any file under `src/`, templates) is read-only
  to this skill at runtime.
- The constitution header already carries `Version:`, `Ratified:`, and
  `Last-Amended:` fields and a `## Sync-Impact Report` section (bootstrapped by
  `sdd-init`); the skill operates on that existing shape and does not redefine
  it.

## Requirements

### Requirement: Guided Amendment of the Constitution File

The `sdd-constitution` skill MUST amend ONLY the end-user project file
`openspec/memory/constitution.md`. On an applied amendment it MUST update the
`Version:` field per the semver bump policy, MUST update the `Last-Amended:`
field to the current date, and MUST prepend exactly one entry to the
`## Sync-Impact Report` section (newest entry on top) in the format
`- X.Y.Z | change type | principles touched | downstream gates/artifacts affected`.

#### Scenario: A confirmed amendment updates version, date, and Sync-Impact Report

- GIVEN a constitution at `Version: 1.0.0` with an existing `## Sync-Impact Report`
- AND a human-confirmed MINOR amendment that adds a principle
- WHEN `sdd-constitution` applies the amendment
- THEN `Version:` is bumped to `1.1.0`
- AND `Last-Amended:` is set to the current date
- AND exactly one new entry is prepended to the top of the `## Sync-Impact Report`
  in the format `X.Y.Z | change type | principles touched | downstream gates/artifacts affected`

#### Scenario: Only the constitution file is written

- GIVEN a confirmed amendment
- WHEN `sdd-constitution` applies it
- THEN the only file written is `openspec/memory/constitution.md`

### Requirement: Human-Confirmed Semver Classification

The skill MUST classify the proposed amendment as MAJOR (a principle is removed
or redefined), MINOR (a principle is added or guidance is materially expanded),
or PATCH (clarification or wording with no behavioral change). It MUST present
this classification to the user for confirmation via the harness blocking-input
surface (AskUserQuestion-equivalent), and it MUST NOT auto-apply a bump without
explicit human confirmation. There MUST be no runtime parser that determines the
bump automatically.

#### Scenario: Classification is presented for confirmation before any bump

- GIVEN a proposed amendment that removes a principle
- WHEN `sdd-constitution` runs
- THEN it classifies the bump as MAJOR
- AND it presents the classification to the user via the harness blocking-input surface
- AND it does NOT write any version bump before the user confirms

#### Scenario: No automated bump without confirmation

- GIVEN a proposed amendment
- WHEN the user has not confirmed the semver classification
- THEN no `Version:` change is written
- AND no runtime parser auto-selects the bump level

### Requirement: Read-Only Bundled-Asset Constraint

The skill MUST NOT edit, create, or delete any bundled plugin asset. In
particular it MUST NOT modify any other `SKILL.md` or any file under `src/`.
When installed in a harness, bundled skills are read-only assets; the ONLY
writable target of this skill is the end-user project's
`openspec/memory/constitution.md`. An attempt to "propagate" an amendment by
editing a dependent skill MUST be refused in favor of a report-only Sync-Impact
Report entry.

#### Scenario: Attempt to realign a dependent skill is refused

- GIVEN a confirmed amendment that changes a principle consumed by `sdd-design`
- WHEN the skill considers propagating the change to the `sdd-design` `SKILL.md`
- THEN it MUST NOT edit `sdd-design/SKILL.md` or any other bundled asset
- AND it instead records the affected gate in the Sync-Impact Report entry as
  report-only documentation

#### Scenario: Constitution file is the sole write target

- GIVEN any `sdd-constitution` run that results in an applied amendment
- WHEN the set of files it wrote is inspected
- THEN it contains only `openspec/memory/constitution.md`
- AND no `SKILL.md`, template, or other `src/` asset is among them

### Requirement: Report-Only Propagation

Because the enforcement gates read the constitution LIVE, the skill MUST NOT
attempt to synchronize static copies of principle text. Instead it MUST record,
in the Sync-Impact Report entry, which downstream gates consume the changed
principles, and it MUST flag any in-flight change artifacts
(`openspec/changes/{name}/design.md`, `openspec/changes/{name}/tasks.md`) that
reference now-changed principles for HUMAN re-review. It MUST NOT auto-fix those
in-flight artifacts.

#### Scenario: Consuming gates are documented in the entry

- GIVEN a confirmed amendment to a principle enforced by the Constitution Check
- WHEN the Sync-Impact Report entry is written
- THEN the entry names the downstream gates that consume the principle
  (e.g. `sdd-design`, `plan-reviewer`)

#### Scenario: In-flight artifacts are flagged, not edited

- GIVEN an in-flight change whose `design.md` references a now-changed principle
- WHEN `sdd-constitution` applies the amendment
- THEN the in-flight `design.md` is flagged for human re-review
- AND `sdd-constitution` does NOT modify that `design.md` or `tasks.md`

### Requirement: Dual Trigger With Non-Blocking Auto-Suggest

The skill MUST support explicit invocation. Additionally, `sdd-verify` and
`sdd-archive` MUST surface a report-only suggestion to run `sdd-constitution`
when a completed change touched governance/principles (per the detection
heuristic in `## Assumptions`). This suggestion MUST NOT block verification or
archival; it is advisory and never a hard gate.

#### Scenario: Governance-touching change surfaces the suggestion

- GIVEN a completed change whose artifacts reference a constitution principle
- WHEN `sdd-verify` or `sdd-archive` runs on that change
- THEN it surfaces a report-only suggestion to run `sdd-constitution`
- AND verification/archival still completes without being blocked

#### Scenario: Non-governance change surfaces no suggestion

- GIVEN a completed change whose artifacts do not touch governance/principles
- WHEN `sdd-verify` or `sdd-archive` runs
- THEN no `sdd-constitution` suggestion is surfaced

#### Scenario: Suggestion never blocks

- GIVEN the report-only suggestion is surfaced
- WHEN the user does not run `sdd-constitution`
- THEN verification and archival proceed and complete normally

### Requirement: Standalone Discoverable Governance Skill

The `sdd-constitution` skill MUST be registered in `BUNDLED_SKILL_REGISTRY` as an
`ORCHESTRATOR_ONLY` SDD skill so it is discoverable and explicitly invocable. It
MUST NOT be inserted into `FULL_SDD_PHASE_ORDER`, the accelerated phase order,
`SDD_PHASES`, or the per-change SDD delegation matrix, because governance
amendment is not a per-change pipeline phase.

#### Scenario: Skill is registered and discoverable

- GIVEN the bundled skill registry
- WHEN it is inspected
- THEN it contains an `sdd-constitution` entry that is `ORCHESTRATOR_ONLY`
  with `sourcePath: 'src/skills/sdd-constitution'`, `kind: 'skill'`, `purpose: 'sdd'`

#### Scenario: Skill is absent from the pipeline phase order

- GIVEN the SDD phase orders and the per-change delegation matrix
- WHEN they are inspected
- THEN `sdd-constitution` does NOT appear as a pipeline phase in any of them

### Requirement: Persistence Per Selected Mode

Under modes that include thoth-mem (`thoth-mem`, `hybrid`), the amendment SHOULD
be recorded as a governance observation. Under modes that include OpenSpec
(`openspec`, `hybrid`), the write to `openspec/memory/constitution.md` is
authoritative. The skill MUST follow the persistence contract for read/write
rules per mode.

#### Scenario: Hybrid mode writes the file and records an observation

- GIVEN persistence mode `hybrid`
- WHEN `sdd-constitution` applies an amendment
- THEN it writes `openspec/memory/constitution.md`
- AND it records a governance observation in thoth-mem

#### Scenario: thoth-mem mode skips the file write

- GIVEN persistence mode `thoth-mem`
- WHEN `sdd-constitution` runs
- THEN it does not write canonical `openspec/` files
- AND it records the amendment in thoth-mem

### Requirement: Idempotent No-Op and Content Preservation

If no principle change is warranted, the skill MUST make no edit and MUST report
a no-op. When it does amend, it MUST preserve all existing constitution content
and ALL prior `## Sync-Impact Report` entries, only prepending the new entry and
updating the version/date fields.

#### Scenario: No warranted change yields a no-op

- GIVEN a constitution and a determination that no principle change is warranted
- WHEN `sdd-constitution` runs
- THEN it makes no edit to `openspec/memory/constitution.md`
- AND it reports a no-op

#### Scenario: Prior content and Sync-Impact entries are preserved

- GIVEN a constitution with existing principles and prior Sync-Impact Report entries
- WHEN a new amendment is applied
- THEN all existing principles and prior Sync-Impact Report entries remain intact
- AND only the new entry is prepended and the version/date fields updated

### Requirement: Harness-Neutral Behavior

The skill, its read-only-asset constraint, its semver/Sync-Impact doctrine, and
the report-only auto-suggest snippet MUST be defined once in the shared skill and
shared conventions layer and behave identically across OpenCode, Claude Code, and
Codex, with per-harness prose limited to declared capability gaps reported as
unsupported-capability limitations.

#### Scenario: Identical behavior across harnesses

- GIVEN the shared `sdd-constitution` skill and shared doctrine
- WHEN it runs under OpenCode, Claude Code, or Codex
- THEN the amendment behavior, read-only-asset constraint, and report-only
  propagation are identical across all three harnesses
