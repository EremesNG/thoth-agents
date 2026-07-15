# Proposal: Fix Codex Providerless Model Apply

## Intent

Correct the focused Codex model-configuration defect in which catalog metadata can reintroduce an `openai/` prefix after selection. The normalized models.dev catalog intentionally separates catalog identity (`openai/<model>`) from the providerless runtime model ID (`<model>`), and the TUI begins with that providerless selection. When an effort selection conditionally forwards provider metadata, however, Codex planning currently re-adds the provider before the generated role TOML and managed state are written.

### Behavior Change

- **From:** A Codex model-and-effort change can plan and persist `openai/<model>` while a model-only change can retain `<model>`, creating inconsistent outbound model IDs. The prefixed value can appear in the plan preview, role TOML `model` line, and managed `configuredModels` state.
- **To:** Every Codex model value that reaches planning, the generated role TOML, or Codex managed model state MUST be providerless (for example, `gpt-5.3-codex-spark`). `openai/<model>` remains available only as catalog/lookup/effort metadata.
- **Reason:** Codex runtime and persisted model IDs use bare model identifiers. The catalog provider is selection metadata, not part of the Codex runtime identifier.
- **Impact:** Codex model-only and model-plus-effort flows will use the same outbound identifier. Existing tests that encode prefixed Codex output will change; OpenCode provider-qualified behavior will not.

## Scope

### In Scope

- Apply a Codex-boundary-only normalization policy in model planning/application; do not redesign shared catalog identity or introduce a global model-normalization layer.
- Keep `src/cli/model-catalog/models-dev.ts`'s catalog/runtime ID split intact: provider-qualified `catalogId` and provider metadata remain available for exact OpenAI effort lookup, while Codex outbound model values remain providerless.
- Make Codex model-only and model-plus-effort changes produce the same providerless model ID in the plan preview, override payload, generated role TOML, and managed state.
- Ensure Codex role TOML persistence and both managed model-state maps (`models` and `configuredModels`, where written for the operation) do not store `openai/` as part of a Codex model ID.
- Preserve effort validation against the exact `openai/<model>` catalog record without allowing that lookup metadata to alter the runtime/persisted ID.
- Add focused regressions in `src/cli/operations/codex.test.ts` and `src/cli/codex-install.test.ts` for providerless planning, TOML persistence, managed state, model-only behavior, and model-plus-effort behavior.
- Treat `src/cli/tui/App.tsx` as an input-contract anchor: its conditional provider forwarding for effort metadata must no longer cause a different Codex model serialization result.

### Deferred / Needs Discovery

- Determine whether the pre-override `nextState.models` observation in `applyCodexManagedModelOverrides` materially violates the same providerless persistence contract. It currently observes rendered role content before applying the override; this change must make that ownership/tracking implication explicit rather than silently excluding it.

### Out of Scope

- Changes to OpenCode provider-qualified model behavior, including its provider/runtime configuration semantics.
- A global catalog-ID or shared model-normalization refactor.
- Claude Code model flows.
- Unrelated Codex install, update, sync, plugin, or marketplace behavior.

## Approach

1. Trace the Codex model value from `ModelRoleInput` through `buildCodexModelPlan`, the plan preview, and `applyCodexManagedModelOverrides` to identify the one Codex-only outbound normalization boundary.
2. Retain provider and catalog ID only for Codex effort validation; prevent them from being concatenated into the model value supplied to role TOML writers or managed-state records.
3. Route model-only and model-plus-effort inputs through the same Codex serialization path so a provider field changes effort validation metadata only, not the runtime model ID.
4. Verify role TOML and managed-state writes preserve providerless IDs while existing backup, unrelated TOML-field preservation, and explicit effort behavior remain unchanged.
5. Resolve and document the pre-override `nextState.models` observation before task breakdown if it affects the asserted state contract.

## Affected Areas

- `src/cli/model-catalog/models-dev.ts`: existing catalog/runtime ID split that the change must preserve.
- `src/cli/tui/App.tsx`: source of conditional provider metadata forwarding during an effort selection.
- `src/cli/operations/codex.ts`: Codex model planning and the current provider re-addition point.
- `src/cli/codex-install.ts`: generated role TOML and managed-model-state application path.
- `src/cli/operations/codex.test.ts`: currently asserts prefixed Codex planning/application behavior.
- `src/cli/codex-install.test.ts`: providerless installation-default contract and persistence coverage.

## Risks

- Stripping or ignoring provider metadata too early could break exact OpenAI catalog effort validation; lookup identity and outbound runtime identity must remain separate.
- A shared normalization change could accidentally alter OpenCode's provider-qualified output; the correction must stay in the Codex path.
- The managed-state `models` observation may have ownership semantics distinct from `configuredModels`; changing it without discovery could affect regeneration or user-owned-model preservation.
- Existing managed files that contain a prefix require deliberate handling during an explicit Codex model apply so the focused fix does not overwrite unrelated user edits.

## Rollback Plan

- Revert only the Codex-boundary normalization and its focused regression updates if Codex runtime evidence disproves the providerless contract.
- Preserve the existing role-TOML and managed-state backup behavior so an applied change remains recoverable through the current managed-write backups.
- Do not roll back or modify catalog normalization, OpenCode behavior, Claude flows, or unrelated Codex install/sync surfaces as part of this change.

## Success Criteria

- A Codex selection with runtime ID `gpt-5.3-codex-spark`, provider `openai`, and catalog ID `openai/gpt-5.3-codex-spark` previews and applies the model as `gpt-5.3-codex-spark`.
- After an applied Codex model change, the role TOML `model` line and Codex managed model state contain the providerless model ID; `openai/` remains only in catalog/effort lookup metadata.
- Model-only and model-plus-effort Codex changes serialize the same model ID while still accepting/rejecting effort values from the exact OpenAI catalog record.
- Focused Codex operation/install regressions cover the corrected providerless behavior and retain providerless default fixtures.
- Existing OpenCode tests continue to demonstrate unchanged provider-qualified behavior.
- The final task breakdown explicitly resolves or records the pre-override `nextState.models` observation instead of silently leaving its contract ambiguous.
