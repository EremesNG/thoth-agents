# Design: Configure Model Effort by Harness

## Technical Approach

Add a shared, asynchronous model-capability catalog that normalizes `models.dev`
records into model options with optional effort values. The CLI transports an
open-valued neutral effort selection (`inherit` or a non-empty string) and each
harness adapter validates and serializes it according to its own writable
surface.

The catalog becomes shared CLI infrastructure rather than a TUI-only helper.
OpenCode continues to use `opencode models` as the authority for locally
available model IDs, while `models.dev` enriches matching IDs with effort
capabilities. Codex uses exact `openai/<model>` records. Claude aliases use the
official subagent effort set; concrete Claude IDs use the intersection of that
set and catalog metadata.

## Architecture Decisions

### Decision: Keep effort transport open-valued and capability-scoped

**Choice**: Represent an effective selection as:

```ts
type ModelEffortSelection =
  | { kind: 'inherit' }
  | { kind: 'effort'; value: string };

interface ModelEffortCapability {
  values: readonly string[];
  source: 'models-dev' | 'claude-official' | 'manual';
}
```

`ModelOption` gains an optional `catalogId` and `effort` capability.
`ModelRoleInput` gains optional `effort`; omitted, `null`, and `default` inputs
normalize to `inherit` before planning.

**Alternatives considered**: A global enum; harness-specific input types.

**Rationale**: A global enum would already be stale for Codex `ultra` and would
conflate model capability with harness serialization. One neutral contract
keeps CLI/TUI behavior consistent while validation remains model-specific.

### Decision: Validate tolerant `models.dev` input before cache promotion

**Choice**: Introduce a shared model-catalog module with a tolerant schema for
provider/model identity, `reasoning`, and the discriminated
`reasoning_options` forms. Only `type: "effort"` contributes selectable values
in this change. Unknown option types, `toggle`, and `budget_tokens` are retained
as non-selectable metadata or ignored safely.

The persistent cache uses a versioned shape:

```ts
interface ModelsDevCacheV1 {
  version: 1;
  etag?: string;
  fetchedAt: string;
  catalog: NormalizedModelsDevCatalog;
}
```

Cache paths follow platform conventions (`LOCALAPPDATA` on Windows,
`XDG_CACHE_HOME` when set, otherwise `~/.cache`) beneath
`thoth-agents/models-dev-v1.json`. Writes use a sibling temporary file and
atomic rename. A fresh `200` response is fully parsed and normalized before it
replaces the LKG cache; `304` reuses LKG; transport, parse, or validation failure
uses validated LKG; without LKG the existing manual/native model path remains
available. An in-process promise memo prevents duplicate concurrent refreshes.

**Alternatives considered**: No disk cache; storing raw unvalidated JSON;
duplicating OpenCode's refresh heuristics.

**Rationale**: The endpoint is unversioned and requires revalidation. A small
owned cache gives deterministic offline behavior without treating stale or
malformed remote data as authoritative.

### Decision: Make catalog loading asynchronous

**Choice**: Change `TuiOperations.modelOptions` and shared catalog entry points
to return promises. The TUI uses an explicit loading/error state before the
model picker; non-interactive commands await the same service. The prior
blocking child-process fetch is removed.

**Alternatives considered**: Preserve the synchronous API by embedding a
larger child-process protocol for headers and cache writes.

**Rationale**: ETag handling, atomic cache IO, and reusable non-interactive
catalog access are clearer in normal asynchronous Node code. The TUI already
has a screen boundary where loading can be represented and tested.

### Decision: Normalize identity without leaking harness syntax

**Choice**: The catalog indexes canonical IDs as `provider/model`. Codex bare
IDs normalize to `openai/<id>` for lookup but remain bare when written to TOML.
OpenCode retains `provider/model` IDs from `opencode models`. Claude aliases
remain aliases; concrete IDs normalize to their provider-qualified catalog ID.

**Alternatives considered**: Store only bare IDs; write catalog IDs directly
into every harness.

**Rationale**: Each harness has a different persisted syntax. Canonical lookup
identity must not alter user-facing or on-disk model values.

### Decision: Codex intersects model capabilities with its documented subagent surface

**Choice**: Codex exposes and accepts the intersection of the selected model's
validated `reasoning_options[type="effort"]` values and the documented Codex
subagent surface `none|minimal|low|medium|high|xhigh|max|ultra`. `none`, `max`,
or `ultra` work only when the exact model publishes them; unknown future values
remain non-writable until the Codex surface documents them. `inherit` removes
`model_reasoning_effort`.

Codex role TOML gains parse/replace/remove helpers for
`model_reasoning_effort`. A single typed Codex installation-default map
supplies both model and effort to fresh rendering. Explicit user configuration
replaces or clears that default; no-op/model-only planning preserves installed effort.

**Alternatives considered**: Retain low/medium/high role defaults; trust every
catalog string without checking the Codex writer surface.

**Rationale**: Codex subagent documentation defines the writable surface while
making several values model-dependent; `models.dev` supplies the second,
per-model half of the contract.

### Decision: OpenCode writes only conservatively confirmed runtime output

**Choice**: OpenCode model availability still comes from `opencode models` and
matching entries are enriched from `models.dev`. A dedicated OpenCode effort
adapter intersects catalog values with provider-specific runtime-writable
variant values verified against the supported OpenCode transform behavior.
Unknown providers or unconfirmed values expose `inherit` only and return an
actionable validation error if supplied non-interactively.

The MVP writes the existing `variant` field only; it does not invent a generic
provider-options object absent from the local schema. Provider-specific tables
are isolated behind `openCodeWritableEfforts(model)` so they can be updated or
replaced by runtime discovery later. In particular, `max` for
`openai/gpt-5.6-sol` is not written while the active OpenCode runtime does not
generate that variant.

When a CLI-managed model/effort change makes the current variant unsupported,
or the new selection is `inherit`, apply deletes only that role's `variant`
when it still equals the effort recorded in the OpenCode managed-state sidecar.
If the on-disk variant diverges from recorded ownership, apply preserves it and
reports a warning unless the user explicitly supplies a replacement effort.

**Alternatives considered**: Treat every catalog effort as a variant; duplicate
all of OpenCode's provider transforms; add arbitrary provider options now.

**Rationale**: Catalog capability and runtime variant existence are currently
different contracts. The adapter makes that mismatch explicit and safe.

### Decision: Claude aliases use official frontmatter values

**Choice**: Extend the Claude subagent writer/parser with optional `effort`.
For `sonnet`, `opus`, and `haiku`, available explicit values are
`low|medium|high|xhigh|max`; Claude owns final compatibility/downgrade. For a
concrete catalog model, intersect that set with its published effort values.
`inherit` model or effort emits no effort field.

**Alternatives considered**: Only allow inherit for aliases; trust arbitrary
catalog values.

**Rationale**: The user selected official alias efforts, and the frontmatter
surface is narrower than the external catalog.

### Decision: Extend managed state v1 additively for all three harnesses

**Choice**: `ManagedModelState` gains optional
`configuredEfforts?: Record<string, string>`. Explicit values are stored using
the same key convention as `configuredModels`; inherited roles are omitted.
The parser accepts absent/invalid optional maps as empty and keeps `version: 1`.
Codex and Claude apply paths continue to own their model/effort fields and keep
the existing backup/idempotency behavior. OpenCode gains the same version-1
sidecar beside `thoth-agents.json[c]`, keyed by role, so stale cleanup can prove
ownership instead of treating every non-empty variant as generated.

**Alternatives considered**: State version 2; required effort maps; treating all
OpenCode variants as CLI-owned without persisted evidence.

**Rationale**: A version bump would discard existing ownership tracking, while
optional maps preserve every model-only state file.

### Decision: Share one confirmed role preset between Codex and OpenCode OpenAI

**Choice**: Define one role-keyed constant for the six subagents with these
model/effort pairs: `oracle=gpt-5.6-sol/high`,
`librarian=gpt-5.6-luna/low`, `explorer=gpt-5.6-luna/low`,
`designer=gpt-5.6-terra/high`, `quick=gpt-5.6-luna/medium`, and
`deep=gpt-5.6-terra/xhigh`. Codex renders bare model IDs and
`model_reasoning_effort`; the OpenCode `openai` provider preset renders the
same models as `openai/<model>` plus matching variants. Claude does not consume
this constant.

**Alternatives considered**: Separate duplicated maps; deriving installation
defaults from the live catalog; leaving Codex effort implicit.

**Rationale**: A static product preset must be deterministic offline and shared
to prevent harness drift. Runtime/catalog validation still governs user-selected
changes, but installation cannot depend on remote catalog availability.

### Decision: Read current effort from installed artifacts, not the sidecar

**Choice**: `getCodexModelRoles` and `getClaudeCodeModelRoles` read each
installed role file and parse both model and effort. When the file exists and its
effort field is absent, the effective current value is `inherit`; no fallback
to `configuredEfforts` occurs. If the role file does not exist, the operations
layer uses the renderer's installation recommendation. OpenCode keeps reading
the actual `variant` from `thoth-agents.json[c]`.

Codex and Claude setup resolvers preserve an installed explicit effort during
no-op and model-only planning. `configuredEfforts` is consulted only to decide
whether the CLI owns a field for safe replacement/removal and is updated after
an explicit CLI effort change.

**Alternatives considered**: Backfilling missing sidecar entries with defaults;
showing the last CLI-applied effort; continuing to parse regenerated plan
content.

**Rationale**: Sidecar state can be absent, stale, or intentionally diverge after
manual editing. Only the serialized harness artifact describes the current
runtime configuration.

## Data Flow

1. CLI/TUI requests model options for a harness.
2. The catalog service conditionally refreshes `models.dev`, validates the
   response, and selects fresh, LKG, or manual/native data.
3. Harness identity normalization attaches a model-specific effort capability.
4. The user selects a model, then `inherit` or one offered effort. A model
   change resets an incompatible pending effort to `inherit`.
5. `ModelRoleInput` carries model/provider/effort into preview planning.
6. The harness adapter validates the selection again against the exact model
   and writable surface.
7. Apply writes or removes only owned model/effort fields and updates optional
   managed effort state where applicable.

## File Changes

### New

- `src/cli/model-catalog/types.ts` — normalized catalog and effort contracts.
- `src/cli/model-catalog/models-dev.ts` — tolerant parsing, fetch, ETag, and LKG selection.
- `src/cli/model-catalog/cache.ts` — cross-platform path and atomic cache IO.
- `src/cli/model-catalog/index.ts` — shared harness catalog service.
- `src/cli/model-catalog/models-dev.test.ts` — schema, 200/304/failure/LKG tests.
- `src/cli/model-catalog/cache.test.ts` — cache validation and atomic replacement tests.
- `src/cli/model-effort.ts` — normalization and shared validation helpers.
- `src/cli/model-effort.test.ts` — inherit/open-value validation tests.
- `src/cli/opencode-effort.ts` — conservative runtime-writable effort adapter.
- `src/cli/opencode-effort.test.ts` — provider/runtime mappings and mismatch tests.

### Modified

- `src/cli/tui/model-catalog.ts` — compatibility facade over the shared async catalog.
- `src/cli/tui/model-catalog.test.ts` — harness normalization/manual fallback coverage.
- `src/cli/tui/operations.ts` — async options and current effort reads.
- `src/cli/tui/App.tsx` — model+effort draft state, loading, dirty tracking, reset behavior.
- `src/cli/tui/components/ModelScreen.tsx` — display current effort.
- `src/cli/tui/components/ModelChoiceScreen.tsx` — second-stage effort picker.
- `src/cli/tui/App.test.tsx` and `src/cli/tui/operations.test.ts` — interactive scenarios.
- `src/cli/operations/types.ts` and `src/cli/types.ts` — optional role effort transport.
- `src/cli/parser.ts`, `src/cli/parser.test.ts`, `src/cli/commands.ts`, and `src/cli/commands.test.ts` — repeatable `--role-effort` parsing/help/planning.
- `src/cli/managed-state-io.ts` and its focused tests — optional `configuredEfforts`.
- `src/cli/operations/codex.ts` and tests — exact-model validation and plan/apply fields.
- `src/cli/codex-install.ts` and tests — TOML effort parse/replace/remove and state persistence.
- `src/harness/adapters/codex.ts` and tests/fixtures — remove hardcoded effort generation.
- `src/cli/operations/opencode.ts` and tests — validated variant write/clear.
- `src/cli/paths.ts` and focused tests — OpenCode managed-state sidecar path.
- `src/config/schema.ts` tests/JSON schema only if generated output changes; the existing open string variant remains valid.
- `src/cli/operations/claude-code.ts` and tests — alias/concrete validation.
- `src/cli/claude-code-install.ts` and tests — effort parse/write/remove and state.
- `src/harness/writers/claude-code-subagent.ts` and tests — optional official effort frontmatter.
- `src/harness/adapters/claude-code.ts` and fixtures/tests — supply configured effort or omit.

## Interfaces / Contracts

- `getModelOptions(harness): Promise<ModelOption[]>` always resolves with a
  usable native/manual fallback; catalog degradation is surfaced as diagnostics
  rather than an empty hard failure.
- `effortsForModel(harness, model): readonly string[]` always includes the
  neutral UI option separately and never mutates cached arrays.
- `--role-effort <role>=<effort>` is repeatable. `inherit`, `default`, or an
  omitted value normalize to no override; malformed/duplicate conflicting
  entries fail before apply.
- Planning remains preview-first and atomic: any invalid role effort prevents
  all role updates.
- `configuredEfforts` contains explicit overrides only; missing means inherit.

## Testing Strategy

- Follow TDD for every behavior slice: catalog parser/cache, neutral transport,
  CLI parsing, TUI flow, then each harness adapter/install path.
- Use fixture responses for effort, toggle, budget tokens, unknown option
  types, malformed payloads, 304, stale LKG, and first-run offline behavior.
- Add Codex fixtures containing `none`, `max`, and `ultra` on different model
  records and prove model-unadvertised or Codex-undocumented values fail.
- Add OpenCode coverage for a confirmed variant, `gpt-5.6-sol/max` rejection,
  managed stale variant removal, divergent user variant preservation/warning,
  and unrelated-field preservation.
- Add Claude alias and concrete-model intersection/frontmatter round trips.
- Preserve all existing model-only, manual model, backup, idempotency, and
  unsupported-harness tests.
- Verification order: focused Vitest files, `pnpm run lint`,
  `pnpm run typecheck`, `pnpm run build`, then `pnpm test`.

## Migration / Rollout

- State remains v1; absent effort maps are inherit.
- Existing model-only commands and TUI flows remain valid.
- Fresh Codex installation emits the confirmed role defaults. Existing role
  artifacts preserve their explicit effort; an absent field remains `inherit`.
- OpenCode model changes clear incompatible role variants only with matching
  sidecar ownership; divergent user variants and other fields are preserved.
- Claude effort work must rebase on the active
  `add-claude-code-harness-adapter` implementation without modifying that
  change's OpenSpec artifacts.
- Cache corruption is self-healing: discard invalid cache content, revalidate
  remotely, then fall back to manual/native catalogs.

## Constitution Check

- **Delegate-first coordination — PASS**: implementation and verification are
  split into delegated, reviewable tasks.
- **Read-only role boundaries — PASS**: discovery/review remain read-only;
  only implementation roles write code or artifacts.
- **Governed persistence — PASS**: OpenSpec is the selected store; model state
  and disposable cache ownership are explicit and separate.
- **Multi-harness parity — PASS**: one neutral workflow is provided to all
  harnesses while preserving their distinct contracts.
- **Evidence-led verification — PASS**: every external/fallback path and
  harness mapping has focused deterministic tests plus full CI checks.

No constitution violations require an override.

## Open Questions

None. Future support for `toggle`, `budget_tokens`, or richer OpenCode provider
options requires a separate proposal.
