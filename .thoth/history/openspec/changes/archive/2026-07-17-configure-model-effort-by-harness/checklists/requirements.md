# Requirements Quality Checklist

## Domain: model-catalog

- [x] Completeness: The domain covers validated `models.dev` effort extraction, effort-only MVP filtering, ETag refresh, validated last-known-good persistence, stale/offline behavior, and manual fallback.
- [x] Clarity: The catalog is the source of model-published effort values, validation precedes LKG promotion, and `toggle` plus `budget_tokens` remain excluded.
- [x] Measurability: Scenarios expose observable request, cache, fallback, validation, and normalized capability outcomes suitable for fixtures and conditional-request tests.
- [x] Testability: Valid, malformed, unchanged, unavailable, and previously cached catalog responses can be independently exercised without a live network dependency.

## Domain: multi-harness-agent-pack

- [x] Completeness: The domain covers neutral role effort, `null`/`default` normalization, TUI and CLI input, backward-compatible state `v1`, Codex model-plus-surface intersection, OpenCode catalog-plus-runtime confirmation with persisted ownership, Claude alias/concrete-model behavior, preservation, and exclusions.
- [x] Clarity: `inherit` is always neutral; Codex intersects model metadata with its documented subagent surface; OpenCode confirmation requires catalog publication, runtime representation, and managed ownership before automatic removal; Claude aliases use the official set while concrete models use an intersection.
- [x] Measurability: Scenarios explicitly verify conditional `none`/`max`/`ultra`, actionable OpenCode rejection with no emission, managed stale-field removal versus preservation of divergent user values, Claude's five official explicit values, and omission for `inherit`.
- [x] Testability: Harness behavior can be verified with deterministic model metadata, runtime-capability fixtures, generated artifact assertions, CLI parsing tests, and model-only state migration fixtures.

- [x] Preset completeness: The confirmed Codex role/model/effort defaults and the matching OpenCode `openai` preset are enumerated exactly, while Claude defaults are explicitly unchanged.
- [x] Current-state clarity: Existing installed artifacts are authoritative; an explicit effort is shown as written, an absent effort field means `inherit`, and sidecar metadata cannot replace observed state.
- [x] Migration measurability: Missing-artifact behavior is tied to the effort actually emitted by the installation renderer, with focused scenarios for legacy sidecars lacking `configuredEfforts`.
- [x] Preservation testability: Manual on-disk divergence, no-op/model-only updates, explicit clearing, and OpenCode actual-config behavior have deterministic regression cases.

## handoffHints

- Implement and verify catalog resilience separately from harness serialization.
- Use focused fixtures to prove fallback ordering, backward compatibility, capability intersections, and preservation of unrelated configuration.
- Preserve the clarified Codex, OpenCode, and Claude Code resolution rules verbatim in design decisions and adapter contracts.
- Treat effort toggle controls and `budget_tokens` as explicit non-goals during design and implementation review.
