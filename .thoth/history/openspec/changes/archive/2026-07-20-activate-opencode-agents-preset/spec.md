# Feature Specification: Activate the applied OpenCode agents preset

**Change ID**: `activate-opencode-agents-preset`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Applying role models from the interactive OpenCode configuration flow
currently writes root-level `agents` overrides but leaves `preset: openai`
selected. Users need either Apply path to activate a real `agents` preset that
represents the configuration they just applied.<br>
**Impact**: OpenCode model application will materialize a complete effective
seven-role roster under `presets.agents`, select it with `preset: agents`, and
keep the resulting managed configuration readable and safely reapplicable.<br>
**Affected capabilities**: `cli-installation`

## User stories

### US1 - Activate applied model assignments (Priority: P1)

As an OpenCode user, I can apply unchanged or edited role assignments and have
the resulting `agents` preset become active so that the configuration I applied
is the configuration OpenCode selects.

**Independent test**: Build and apply an OpenCode model plan against a temporary
managed configuration, then read the persisted JSON and prove that
`preset: agents` selects a complete `presets.agents` roster containing both the
requested assignments and every unchanged effective role value.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** the managed OpenCode config selects `openai`, **When** the user applies one edited role, **Then** the persisted config selects `agents` and `presets.agents` contains the changed assignment plus every unchanged effective role assignment.
2. **Given** no role is dirty and the TUI sends every displayed role, **When** the user selects Apply, **Then** the same complete `agents` preset is materialized and activated.
3. **Given** the active preset and root overrides each contribute fields to a role, **When** model configuration is applied, **Then** the materialized `agents` preset preserves their field-level effective value before applying the requested model or effort change.

### US2 - Reapply the activated preset safely (Priority: P1)

As an OpenCode user, I can reopen model configuration after applying it and
apply again so that activating `agents` does not turn the managed installation
into blocked roster drift.

**Independent test**: After applying a model plan, query public OpenCode status,
read the model roles, and build a second model plan; the active complete
`agents` preset is recognized, its values are returned, and the second plan is
eligible to apply.

**Covers**: FR-003, FR-004, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** a complete applied `presets.agents` roster is active, **When** managed status is evaluated, **Then** the roster is recognized without an `opencode-roster-drift` blocker.
2. **Given** a complete applied `agents` preset, **When** model roles are loaded again, **Then** the selected preset and permitted root overrides determine the displayed effective values without falling back to `openai`.
3. **Given** the first apply completed successfully, **When** a second valid model plan is built and applied, **Then** it remains eligible and preserves the activated `agents` preset.

## Edge cases

- A dirty Apply payload may contain only one role; materialization still needs
  all seven effective roles before `agents` is activated.
- A missing lite config is seeded from the generated OpenAI configuration before
  the full `agents` preset is materialized.
- Root role overrides may contain non-model fields or only an effort/variant;
  field-level merging must preserve those values and unrelated configuration.
- Existing named presets, `$schema`, tmux, fallback, and other unrelated keys
  remain untouched.
- Malformed, unrecognized, unsupported-role, duplicate-role, or stale plans
  remain rejected under the existing safety and provenance contracts.
- User-owned effort variants remain subject to the existing managed-state
  ownership rules.

## Functional requirements

- **FR-001 — Activate the applied agents preset**: `[ADDED cli-installation]` Applying any valid OpenCode model configuration plan MUST persist `preset: agents` and MUST materialize the applied configuration under the real named preset `presets.agents`.
- **FR-002 — Materialize the complete effective roster**: `[ADDED cli-installation]` Before activation, the system MUST derive all seven effective role configurations from the selected preset, root overrides, and canonical defaults using field-level precedence, apply the requested role changes, and preserve unrelated presets and configuration keys.
- **FR-003 — Recognize the managed agents preset**: `[ADDED cli-installation]` OpenCode status and model-role readback MUST recognize a complete active `presets.agents` roster as a valid managed configuration and MUST keep subsequent valid model plans eligible to apply.
- **FR-004 — Preserve public guidance and regression evidence**: `[INTERNAL]` Operation-level tests and public CLI documentation MUST state and prove that both unchanged Apply and dirty Apply activate the complete `agents` preset while install and sync continue to establish the built-in `openai` preset.

## Success criteria

- **SC-001** `[buildable]`: 100% of filesystem-backed dirty-Apply fixtures persist exact `preset: agents` and all seven roles under `presets.agents`, including the requested changed model.
- **SC-002** `[buildable]`: 100% of enumerated active-preset fields, root override fields, unrelated presets, and non-model configuration keys survive the focused merge fixtures without data loss.
- **SC-003** `[buildable]`: Two consecutive valid model plans apply successfully in the round-trip fixture, with zero `opencode-roster-drift` blockers and identical activated role readback between applies except for the requested change.
- **SC-004** `[buildable]`: Focused OpenCode operation/TUI tests, formatting checks, typecheck, and independent Oracle verification complete with zero failures.

## Assumptions

- `agents` means a real named preset stored at `presets.agents`; the root-level
  `agents` map remains an override layer and is not itself treated as a preset.
- Apply and the former Apply changes path share the same public model-plan
  backend, so operation-level persistence and round-trip coverage exercises both
  TUI entry paths.
- Install and sync keep `openai` as the built-in initial preset; only explicit
  model application activates `agents`.

## Dependencies

- Existing OpenCode plan provenance, configuration parser/writer, model-role
  readback, status classification, and managed effort state.
- No new package or network dependency.

## Out of scope

- Changing Codex or Claude Code model persistence.
- Adding additional built-in provider presets or changing install/sync defaults.
- Migrating arbitrary legacy `preset: agents` plus root-only `agents` layouts.
- Redesigning model catalog discovery or effort validation.
