# Proposal: Configure Model Effort by Harness

## Intent

Extend the CLI model-configuration workflow so each role can select a reasoning effort supported by its exact model and target harness. The capability source will be the validated `models.dev` catalog, while each harness adapter remains responsible for writing only values that its runtime can represent safely.

### Behavior Change

- **From:** Role model configuration carries model/provider selection only, with reasoning effort either hardcoded, inherited implicitly, or represented by harness-specific state that can become stale after a model change.
- **To:** Interactive and non-interactive configuration can carry an optional neutral effort selection, validate it against the selected model, and translate it through the OpenCode, Codex, or Claude adapter without breaking model-only flows.
- **Reason:** Effort capabilities vary by model and evolve independently of the CLI; a shared dynamic catalog avoids stale global allowlists while preserving harness-specific correctness.
- **Impact:** CLI prompts and flags, model catalog normalization and caching, managed configuration state, and all three harness writers/readers require coordinated changes and compatibility tests.

## Scope

### In Scope

- Read and normalize dynamic `reasoning_options` effort capabilities from `models.dev` for configured models.
- For Codex, expose exactly the effort values declared by the selected OpenAI model in `models.dev`, including values such as `none`, `minimal`, `xhigh`, `max`, or `ultra` only when present for that model.
- For OpenCode, retain a neutral effort selection but write it only when the runtime exposes a corresponding writable variant or provider-option surface; clear an existing managed variant when it becomes stale or incompatible after a model change.
- For Claude, support the official subagent effort field using a conservative adapter allowlist intersected with the selected model's known effort capabilities.
- Add an optional effort step to the TUI and a non-interactive `--role-effort` input, while retaining an explicit inherit/default choice.
- Add validated `models.dev` parsing, conditional requests using `ETag`, and a persistent last-known-good (LKG) cache for degraded or offline operation.
- Extend managed state version 1 with optional, backward-compatible effort maps; existing state without those maps remains valid.
- Preserve manual model entry and model-only configuration flows when effort metadata is unavailable or the user does not select an override.
- Add focused coverage for catalog normalization, cache fallback, CLI/TUI selection, state compatibility, per-harness serialization, incompatible selections, and stale OpenCode variant clearing.

### Confirmed Default Presets and Current-State Semantics

- Codex installation MUST recommend and emit these role defaults:
  - `oracle`: `gpt-5.6-sol` with `high`
  - `librarian`: `gpt-5.6-luna` with `low`
  - `explorer`: `gpt-5.6-luna` with `low`
  - `designer`: `gpt-5.6-terra` with `high`
  - `quick`: `gpt-5.6-luna` with `medium`
  - `deep`: `gpt-5.6-terra` with `xhigh`
- The generated OpenCode preset for provider `openai` MUST use the same role/model/effort mapping.
- Claude Code defaults and generation remain unchanged.
- The TUI's `Current effort` MUST reflect the installed harness artifact. An explicit on-disk effort wins even when the managed sidecar lacks `configuredEfforts`; an existing artifact with no effort field means `inherit`.
- `configuredEfforts` remains ownership and last-CLI-applied metadata. It MUST NOT override or substitute for observed on-disk current state.
- Only when a role artifact does not yet exist may the TUI show the effort that the installation renderer would actually emit.

### Deferred / Needs Discovery

- Confirm the exact writable OpenCode runtime/provider surface for every provider family and derive a deterministic mapping policy where runtime variants differ from `models.dev` effort values.
- Confirm the final Claude adapter integration points and managed-state ownership after the active `add-claude-code-harness-adapter` change lands.
- Identify whether existing cache/storage utilities can be reused without creating a second catalog cache mechanism.

### Out of Scope

- Mapping `reasoning_options` of type `toggle` or `budget_tokens` into effort levels in the MVP.
- Inventing effort values absent from the selected model's capabilities or coercing token budgets into qualitative effort.
- Changing upstream `models.dev`, OpenCode, Codex, or Claude runtime behavior.
- Modifying, merging, or archiving the active `add-claude-code-harness-adapter` change as part of this proposal.

## Approach

1. Introduce a harness-neutral effort capability and selection model that keeps `inherit` distinct from a concrete open-string effort value.
2. Enrich the shared model catalog with validated `models.dev` reasoning metadata and resilient `ETag`/LKG caching; malformed fresh data must not replace the last valid catalog.
3. Carry optional effort selections through TUI and non-interactive role inputs, preserving the current model-only and manual-entry paths.
4. Persist optional effort maps in managed state v1 without making them required or invalidating existing files.
5. Translate the neutral selection in each harness adapter:
   - Codex writes the exact selected OpenAI model-supported effort.
   - OpenCode writes only a confirmed runtime variant/provider representation and removes stale managed variants when no longer valid.
   - Claude writes only conservative officially supported subagent effort values.
6. Validate at input and serialization boundaries, then exercise online, cached, offline, incompatible-value, and model-change scenarios with focused tests.

The active `add-claude-code-harness-adapter` change is an explicit dependency/overlap. This change will consume its resulting adapter contracts rather than editing or superseding its OpenSpec artifacts.

## Affected Areas

- CLI/TUI model catalog loading, model selection, role prompts, and non-interactive option parsing.
- Shared operation input types and validation for role-level effort selections.
- OpenCode, Codex, and Claude configuration adapters and their managed-state readers/writers.
- Models.dev HTTP client behavior, schema normalization, cache metadata, and LKG persistence.
- Harness-specific and cross-harness unit/integration fixtures for model capabilities and effort serialization.
- OpenSpec coordination with `openspec/changes/add-claude-code-harness-adapter/`, without modifying that change.

## Risks

- `models.dev` may add unknown reasoning option types or effort strings; parsing must be tolerant while serialization remains capability-checked.
- OpenCode variants can differ from raw `models.dev` effort values, so direct variant emission could produce invalid configuration unless runtime writability is verified.
- Cached capabilities can become stale; the CLI must identify degraded data and reject selections that the target adapter cannot safely represent.
- Updating a model can leave a previously managed effort/variant behind; adapters must clear incompatible managed values without deleting unrelated user configuration.
- Concurrent work on the Claude adapter can cause contract conflicts; design and implementation must rebase on the active change's final interfaces.
- Optional fields added to managed state v1 could accidentally become required through strict parsing; backward-compatibility fixtures must guard this.

## Rollback Plan

- Remove the optional effort prompts/flag and effort transport while leaving existing model selection behavior intact.
- Stop writing optional managed effort maps; readers continue ignoring unknown optional fields so previously written state remains non-breaking.
- Revert harness effort serialization independently, preserving model/provider writes and unrelated user configuration.
- Disable remote refresh and use the last valid catalog or manual/model-only flow if the `models.dev` integration proves unreliable.
- Do not roll back, modify, or archive `add-claude-code-harness-adapter`; resolve any overlap by reverting only this change's Claude effort integration.

## Success Criteria

- The CLI offers only the selected model's declared effort values for Codex/OpenAI and never exposes a global hardcoded superset.
- OpenCode never writes a nonexistent variant/provider effort representation and clears stale managed variants after incompatible model changes.
- Claude writes only conservative officially supported subagent effort values compatible with its completed adapter contract.
- TUI users and `--role-effort` callers can select a role effort or inherit/default without disrupting manual or model-only configuration.
- Existing managed state v1 files without effort maps load unchanged, while new optional maps round-trip correctly.
- Valid `ETag` refreshes update the catalog; invalid responses preserve the LKG cache; cached/offline operation remains usable.
- `toggle` and `budget_tokens` reasoning options are retained or ignored safely but are not presented as qualitative effort in the MVP.
- Focused tests demonstrate correct behavior across Codex, OpenCode, and Claude, including incompatibility rejection and stale-value cleanup.
