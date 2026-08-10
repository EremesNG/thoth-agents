# Feature Specification: [Feature name]

**Change ID**: `[feature]`<br>
**Route**: Accelerated | Full<br>
**Status**: Draft

## Intent and scope

**Why**: [User or operator value.]<br>
**Impact**: [Observable behavior and compatibility impact.]<br>
**Affected capabilities**: `[capability-slug]` | None

## User stories

### US1 - [Outcome] (Priority: P1)

As a [actor], I can [capability] so that [value].

**Independent test**: [How this story is demonstrated in isolation.]

**Covers**: FR-001, SC-001

**Acceptance scenarios**:

1. **Given** [context], **When** [action], **Then** [observable result].

## Edge cases

- [Boundary or failure scenario.]

## Functional requirements

- **FR-001 — [Requirement name]**: `[DELTA capability-slug]` The system MUST [observable behavior].

Replace `DELTA` after inspecting `openspec/specs/<capability>/spec.md`. Use
`ADDED` only for behavior not expressed by a canonical requirement, `MODIFIED`
or `REMOVED` only with the exact existing requirement title, and
`RENAMED capability-slug FROM Exact previous title` when the title changes. Only
`ADDED` is valid when the canonical capability is absent. An addition to an
existing nonempty capability requires semantic-overlap review even when its
exact title is new.

Use exactly one delta marker per FR: `[INTERNAL]`, `[ADDED capability-slug]`,
`[MODIFIED capability-slug]`, `[REMOVED capability-slug]`, or
`[RENAMED capability-slug FROM Previous requirement name]`.

## Success criteria

- **SC-001** `[buildable]`: [Measurable criterion implemented by this change.]
- **SC-002** `[outcome]`: [Measurable product or operational outcome observed later.]

## Assumptions

- [Documented safe assumption.]

## Dependencies

- [External or internal dependency, or None.]

## Out of scope

- [Explicit non-goal.]
