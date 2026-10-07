# Feature Specification: Restore model defaults

**Change ID**: `restore-model-defaults`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Operators need to adopt shipped model and reasoning-effort defaults after updates preserve installed customizations.<br>
**Impact**: Add an explicit restore action to each harness model menu, using the existing preview/apply workflow.<br>
**Affected capabilities**: `model-catalog`

## User stories

### US1 - Restore shipped role defaults (Priority: P1)

As an operator, I can preview and explicitly apply the shipped model and effort defaults for a selected harness.

**Independent test**: Render the model menu with custom installed values, choose restore, verify defaults in the preview and no writes until Apply.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** customized roles in OpenCode, Codex or Pi, **When** restore is selected, **Then** the preview contains every managed role's shipped model and effort, with no writes.
2. **Given** a restoration preview, **When** Back is chosen, **Then** installed values remain unchanged.
3. **Given** an applyable restoration preview, **When** Apply is chosen, **Then** supported managed model and effort fields are replaced with shipped defaults while unrelated fields remain intact.
4. **Given** Claude Code's manager-owned package, **When** restore is selected, **Then** its own model/effort defaults are displayed with the existing blocking explanation and no cache writes.

## Edge cases

- Restore includes roles already displaying default values so persisted customization state can be made consistent.
- Pending manual menu edits do not supply restoration values; backing out preserves that draft.
- Catalog missing, loading or unsupported effort must never silently remove default effort or claim a successful restore.
- OpenCode includes orchestrator; the other three harnesses leave ambient root settings unchanged.
- Partial apply failures remain visible under existing harness semantics; no new atomicity claim.

## Functional requirements

- **FR-001 — Preview shipped model defaults**: `[ADDED model-catalog]` The model configuration menu MUST offer Restore defaults for each harness, opening a write-free preview of all managed roles using package-defined models and efforts independently of installed customizations and manual drafts.
- **FR-002 — Apply model defaults explicitly**: `[ADDED model-catalog]` The restore workflow MUST require explicit Apply, preserve unrelated configuration and existing ownership checks, replace both managed model and effort values, and leave ambient root models unchanged except for OpenCode's managed orchestrator.
- **FR-003 — Report restore capability limits**: `[ADDED model-catalog]` Restoration MUST retain catalog/runtime validation and native cache ownership restrictions, block unsupported plans with actionable explanations, and never report unapplied values as restored.

## Success criteria

- **SC-001** `[buildable]`: Tests cover restore preview and cancellation for all 4 harnesses, plus the exact shipped role sets and efforts independent of installed state.
- **SC-002** `[buildable]`: 3 isolated apply tests prove model and effort replacement for OpenCode, Codex and Pi with unrelated fields retained, and prove Claude remains blocked without writes.

## Assumptions

- Each harness uses its existing native default mapping; Claude does not adopt OpenAI models.
- Restore is an explicit assignment of current shipped values, not a new persistent automatic-follow-defaults mode.
- Existing canonical model-catalog requirements cover discovery, fallback, overrides and effort allocation, not an explicit menu restore action. These additions do not change role defaults or the older allocation prose.

## Dependencies

- Existing package preset constants, catalog metadata, plan builders and managed writers.

## Out of scope

- New CLI flags, changing Update/Sync preservation, editing native Claude caches, installing packages, live model calls, root session selection, and changing the model matrix.
