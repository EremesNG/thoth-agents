# Archive Report: Route-independent implementation ownership

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-21-route-independent-implementation-ownership/`

## Completed scope

- FR-001–FR-007 and buildable SC-001–SC-006 are implemented and verified:
  SDD route governs artifacts and gates, while root versus specialist
  implementation ownership is selected independently from task shape,
  demonstrated net gain, continuity, and explicit safe user direction.
- Direct may use `designer`, `quick`, or `deep`; Accelerated and Full may remain
  root-owned. The specialist matrix applies only after deciding to delegate.
- Canonical code, OpenCode/Codex/Claude roots, SDD skills, active instructions,
  fixtures, tests, generated plugin assets, and maintainer documentation agree.

## Verification lineage

- `verify-report.md` records independent fresh-Oracle PASS with focused,
  integration, full-suite, formatting, type, build, parity, context-budget,
  diff, and bounded secret-scan evidence.
- `plan-review.md` records the independent pre-implementation Oracle approval.

## Canonical specification sync

- Updated: `adaptive-sdd`, `multi-harness-agent-pack`.
## Deviations and residual warnings

- No implementation deviation from the accepted plan.
- Post-archive integrity inspection found that the archive parser truncated or
  omitted wrapped acceptance-scenario clauses. The parser received regression
  coverage and the two canonical requirements were repaired from the declared
  archived scenarios; no undeclared requirement prose was added.
- W-001: the executable matrix validates fixture semantics and production
  triggers but does not directly assert the `delegation_net_gain` and
  `ownership_rationale` fields. Add direct assertions only if fixture drift
  appears.
- RISK-SC-007: outcome validation remains post-release. Observe one justified
  specialist outside artifact-backed routes and one justified root
  implementation inside Accelerated/Full, recording route, task shape, owner,
  rationale, mutable surface, and confirmation that route alone did not decide.

## Follow-up

- Complete the two representative SC-007 consumer observations after release;
  no repository implementation work is pending for this archive.

## Post-archive integrity verification

- A fresh read-only Oracle returned PASS for the multiline-scenario repair.
- It confirmed that `Use adaptive-root delegation` contains exactly the six
  declared US1/US2 scenarios and `Select specialist writers deterministically`
  contains exactly the six declared US2/US3 scenarios, with no invented or
  omitted scenario.
- Canonical and generated archive scripts have identical SHA-256
  `2E6AD460D080C5DC15B6355F972CB4FDC4210C6C7F8C2AFD70FF5FCFDECFE531`.
- Independent checks passed: archive 44/44 tests, parser/validator/generation
  140/140 tests, both `node --check` invocations, targeted Biome, and
  `git diff --check`.
