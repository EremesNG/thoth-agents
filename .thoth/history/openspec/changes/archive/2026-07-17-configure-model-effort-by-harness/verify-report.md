# Verification Report: Configure Model Effort by Harness

## Round

round 2

## Verdict

pass

## Completeness

- Tasks: 21/21 complete.
- Requirements: 14/14 reviewed.
- Given/When/Then scenarios: 39/39 compliant.
- Round-1 critical C1: closed.
- Round-1 warning W1: closed.
- Implementation and verification evidence are specification-complete.

## Build and Test Evidence

- Round-1 remediation inspection: PASS.
  - Remaining OpenAI preset concatenations: 0.
  - Expected OpenAI template literals: 6.
  - Codex test path uses a template literal.
- `pnpm run check:ci`: PASS — 234 files checked, no fixes or diagnostics.
- Independent focused verification: PASS — 12 files, 153/153 tests.
- Coordinator typecheck: PASS.
- Coordinator build, declarations, and schema generation: PASS.
- Full suite evidence: PASS — 76 files, 793/793 tests.
- Formatting remediation changed no behavior; the same focused scenarios remain green.

## Compliance Matrix

| # | Requirement › Scenario | Result | Evidence |
|---|---|---|---|
| 1 | Dynamic effort discovery › Dynamic metadata supplies effort options | Compliant | Exact effort extraction tests pass. |
| 2 | Dynamic effort discovery › Dynamic metadata omits effort options | Compliant | No effort values are invented. |
| 3 | Conditional refresh › Remote catalog is unchanged | Compliant | ETag/304 reuses validated LKG. |
| 4 | Conditional refresh › Remote catalog changes validly | Compliant | Valid 200 response is promoted. |
| 5 | Conditional refresh › Remote catalog is invalid or unavailable | Compliant | Validated LKG is retained. |
| 6 | Conditional refresh › No validated LKG exists | Compliant | Manual/native fallback remains available. |
| 7 | Manual catalog preservation › Manual-only model remains available | Compliant | Manual models survive catalog merging. |
| 8 | Neutral effort › Role inherits harness behavior | Compliant | Model persists without forced effort. |
| 9 | Neutral effort › Explicit effort changes independently | Compliant | Effort changes without changing model. |
| 10 | Neutral effort › Effort returns to neutral | Compliant | Explicit clear removes only effort output. |
| 11 | Neutral effort › Null/default normalizes to inherit | Compliant | Shared normalization tests pass. |
| 12 | Interactive effort › User configures effort in TUI | Compliant | Model-to-effort flow passes. |
| 13 | Interactive effort › No explicit effort support | Compliant | Picker offers inherit only. |
| 14 | Non-interactive effort › Valid CLI effort override | Compliant | Supported input applies atomically. |
| 15 | Non-interactive effort › Invalid CLI effort override | Compliant | Invalid input rejects the plan. |
| 16 | State persistence › Existing model-only v1 state loads | Compliant | Missing effort maps remain valid. |
| 17 | State persistence › Optional effort maps round-trip | Compliant | Explicit entries persist; inherit is optional. |
| 18 | Codex contract › Supported effort selected | Compliant | Exact metadata intersects Codex surface. |
| 19 | Codex contract › Unsupported effort supplied | Compliant | Unsupported values reject. |
| 20 | Codex contract › Extended effort model-published | Compliant | none/max/ultra remain conditional. |
| 21 | Codex contract › No exact OpenAI effort record | Compliant | Only inherit is offered. |
| 22 | OpenCode contract › Confirmed variant selected | Compliant | Exact representable variant is emitted. |
| 23 | OpenCode contract › Variant unconfirmed | Compliant | Unsupported variant is not emitted. |
| 24 | OpenCode contract › Generated variant stale | Compliant | Owned stale variant clears safely. |
| 25 | OpenCode contract › User-owned variant diverges | Compliant | Divergent variant is preserved. |
| 26 | Claude contract › Alias official values | Compliant | Official alias values remain available. |
| 27 | Claude contract › Concrete model intersection | Compliant | Official/catalog intersection is used. |
| 28 | Claude contract › Inherit neutral | Compliant | Inherit emits no effort field. |
| 29 | Non-destructive regeneration › Existing model-only config | Compliant | Installed effort is preserved. |
| 30 | Non-destructive regeneration › Unrelated user config | Compliant | Unrelated fields remain intact. |
| 31 | Non-destructive regeneration › Manual model selected | Compliant | Manual models round-trip. |
| 32 | Excluded controls › User configures role effort | Compliant | Toggle and budget tokens remain excluded. |
| 33 | Installation presets › Fresh Codex installation emits defaults | Compliant | Six exact model/effort pairs pass. |
| 34 | Installation presets › OpenCode OpenAI preset mirrors Codex | Compliant | Six role pairs match; orchestrator unchanged. |
| 35 | Installation presets › Claude defaults remain stable | Compliant | Claude defaults remain unchanged. |
| 36 | Installed current effort › Manual effort visible without sidecar | Compliant | Installed effort is read directly. |
| 37 | Installed current effort › Existing artifact omits effort | Compliant | Missing field is inherit despite stale sidecar. |
| 38 | Installed current effort › Installed value diverges from state | Compliant | Installed value wins and is preserved. |
| 39 | Installed current effort › Missing artifact uses renderer recommendation | Compliant | Codex uses confirmed default; Claude uses inherit. |

## Design Coherence

Implementation follows the approved design: one shared six-role preset drives Codex and OpenCode OpenAI; OpenCode orchestrator, other providers, and Claude defaults remain unchanged; installed Codex/Claude artifacts are authoritative; absent effort means inherit; missing artifacts use renderer recommendations; model-only/no-op preserves installed effort; explicit inherit propagates through `clearEffort`; `configuredEfforts` remains ownership-only; OpenCode reads the actual configured variant; dynamic models.dev filtering remains green; Biome formatting/style checks pass.

## Issues Found

### Critical

None.

### Warnings

None.

## Constitution Suggestion

This change touched governance/principle artifacts; consider `sdd-constitution`. Advisory only.

## Final Verdict

**pass**
