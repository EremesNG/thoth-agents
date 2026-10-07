# Feature Specification: Preflight Durable Delta Intent

**Change ID**: `preflight-durable-delta-intent`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Prevent incorrect `ADDED`, `MODIFIED`, `REMOVED`, or `RENAMED` metadata from surviving specification, planning, implementation, and Oracle verification only to fail—or create a duplicate contract—during archive.<br>
**Impact**: Specification guidance will require comparison with canonical requirement titles, the SDD validator will preflight durable delta intent from the `specify` gate onward, and the archive executable will reuse the same deterministic decision rules as its final no-write safety check.<br>
**Affected capabilities**: `adaptive-sdd`

## User stories

### US1 - Reject incorrect delta intent before planning (Priority: P1)

As an SDD root, I can receive deterministic feedback when a durable delta conflicts with the canonical requirement baseline so that I correct the specification before downstream work begins.

**Independent test**: Invoke the installed validator CLI through `specify` against temporary OpenSpec fixtures and observe its exit status, stable diagnostic codes, and warnings.

**Covers**: FR-001, FR-002, SC-001, SC-003

**Acceptance scenarios**:

1. **Given** a canonical capability already contains the exact named requirement, **When** the specification marks that title `ADDED`, **Then** the validator rejects it with a stable added-title-exists diagnostic.
2. **Given** a canonical capability or named requirement does not exist, **When** the specification marks that title `MODIFIED` or `REMOVED`, **Then** the validator rejects it with a stable missing-title diagnostic.
3. **Given** a rename names a missing previous title or collides with an existing destination title, **When** the specification gate runs, **Then** the validator rejects the invalid rename before planning.
4. **Given** a valid addition targets an existing capability under a new exact title, **When** the specification gate runs, **Then** the validator accepts the deterministic title check and emits a semantic-overlap review warning that identifies the existing capability baseline.
5. **Given** the root selects a durable marker, **When** it authors the specification, **Then** it first reads the affected canonical specification and preserves exact existing titles for modification or removal, uses `RENAMED` for title changes, and uses `ADDED` only for genuinely new behavior.

### US2 - Preserve the same final archive defense (Priority: P1)

As a maintainer, I can rely on the archive executable to apply the same durable-delta decision rules before any permanent write so that validator and archive behavior cannot drift.

**Independent test**: Invoke the installed archive CLI with otherwise archivable fixtures containing inverse delta mistakes and verify the stable diagnostics, unchanged canonical files, and retained active change.

**Covers**: FR-003, SC-002

**Acceptance scenarios**:

1. **Given** an otherwise ready change marks an existing title `ADDED`, **When** archive preflight runs, **Then** it reports the same added-title-exists code, changes no canonical specification, and leaves the active change in place.
2. **Given** an otherwise ready change marks a missing title `MODIFIED`, **When** archive preflight runs, **Then** it reports the same missing-title code, changes no canonical specification, and leaves the active change in place.
3. **Given** all durable deltas agree with the canonical baseline, **When** archive runs, **Then** its existing transactional synchronization behavior remains unchanged.

## Edge cases

- A capability directory or canonical specification may be absent; only `ADDED` is valid against that empty baseline.
- Multiple deltas targeting one capability must be evaluated in declaration order against one simulated title set before any write.
- `RENAMED` requires the previous exact title and must not overwrite a different existing destination title.
- Exact-title checks cannot prove that differently named requirements are semantically distinct; additions to an existing nonempty capability therefore require an explicit warning and root judgment.
- A malformed or duplicate canonical requirement title must fail preflight truthfully rather than be treated as an empty baseline.
- `[INTERNAL]` requirements do not participate in canonical preflight.

## Functional requirements

- **FR-001 — Preserve traceable specification semantics**: `[MODIFIED adaptive-sdd]` Accelerated and Full specification authoring MUST inspect every affected canonical capability before choosing durable delta metadata; `MODIFIED` and `REMOVED` MUST preserve an existing exact requirement title, `RENAMED` MUST name the exact previous title when the title changes, and `ADDED` MUST be used only when no canonical requirement already expresses the behavior.
- **FR-002 — Enforce route-specific structural gates**: `[MODIFIED adaptive-sdd]` The validator MUST compare every declared durable delta with the canonical requirement baseline at `specify` and every downstream artifact gate, MUST reject deterministically incompatible exact-title operations with stable diagnostic codes, MUST evaluate multiple deltas in declaration order, MUST warn when an exact-title-valid `ADDED` targets an existing nonempty capability, and MUST preserve valid additions to absent capabilities and `[INTERNAL]` behavior.
- **FR-003 — Transactionally archive verified durable deltas**: `[MODIFIED adaptive-sdd]` Archive MUST use the same canonical parser and durable-delta preflight rules as the validator, MUST report the same stable incompatibility codes before staging or changing permanent specifications, and MUST preserve its existing transactional apply, rollback, report update, and dated-move behavior for valid deltas.

## Success criteria

- **SC-001** `[buildable]`: Focused validator CLI tests pass for correct `ADDED` and `MODIFIED` baselines and reject inverse `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED` mismatches with their expected stable diagnostic codes before `ready`.
- **SC-002** `[buildable]`: Focused archive CLI tests reject both `ADDED`-for-existing and `MODIFIED`-for-missing fixtures with the same diagnostic codes while proving canonical content and the active change remain unchanged.
- **SC-003** `[buildable]`: Canonical and generated SDD authoring assets expose the complete delta-selection rules, and integration verification reports zero stale or missing shared preflight assets.

## Assumptions

- Canonical requirement identity remains the exact Markdown title following `### Requirement:`.
- A warning, authoring guidance, and Oracle coherence review remain necessary for semantic overlap between differently named requirements because deterministic tooling cannot prove behavioral equivalence.
- The installed thoth-owned skill bundle contains `thoth-sdd` and `thoth-archive` as sibling skills, as already required by archive closeout.

## Dependencies

- Existing structural validator at `skills/thoth-sdd/scripts/validate.mjs`.
- Existing transactional archive executable at `skills/thoth-archive/scripts/archive.mjs`.
- Existing integration package generator that copies the complete canonical skill trees.

## Out of scope

- Automatically rewriting a user's selected delta marker.
- Fuzzy or embedding-based semantic equivalence decisions between differently titled requirements.
- Changing archive transaction ordering, recovery guarantees, or canonical Markdown format.
- Changing Direct routing or creating SDD artifacts for Direct work.
