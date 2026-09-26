# Verification Report: Predictable specialist-writer routing

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

**Reviewer instance**: fresh `oracle_reverify_routing_matrix`

## Review dimensions

- **Completeness**: PASS — every accepted FR and buildable SC is represented; the seven-case cross-harness regression closes the prior coverage gap.
- **Correctness**: PASS — independent focused, integration, formatting, type, full-suite, context, rendering, and diff checks pass.
- **Coherence**: PASS — specification, plan, tasks, canonical sources, tests, skills, documentation, and generated plugin agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Root limited to one Direct micro-action; artifact-backed implementation selects specialists; Oracle remains independent. | Focused suite and three-harness root render probe | PASS |
| FR-002 | SDD owner/protocol deterministically distinguishes designer, quick, and deep with one-writer and escalation rules. | SDD and protocol tests | PASS |
| FR-003 | Seven structured role contracts render use/non-use, mutation, escalation, verification, and compact returns across harness artifacts. | Routing and adapter tests | PASS |
| FR-004 | OpenCode/Claude use native names; Codex conditionally uses `agent_type` with truthful role-prefixed fallback. | OpenCode, Codex, Claude, and capability tests | PASS |
| FR-005 | Exact proportional effort defaults, Claude frontmatter, and override precedence are implemented. | Constants, adapters, provider, and installation tests | PASS |
| FR-006 | Child semantic rule families render once; all six specialist prompts are below recorded baselines. | Prompt tests and measured generated-agent sizes | PASS |
| FR-007 | Seven explicit cases exercise canonical roles, SDD phase owners, and actual OpenCode/Codex/Claude rendered packages. | `src/harness/core/agent-routing.test.ts` in focused and full suites | PASS |
| FR-008 | Skills, docs, installation expectations, and generated plugin remain aligned. | Integration parity and full suite | PASS |
| SC-001 `[buildable]` | All three roots omit artifact-backed orchestrator ownership and retain exactly the bounded Direct exception. | Independent render probe | PASS |
| SC-002 `[buildable]` | Seven expected owners and meaningful forbidden alternatives are covered through shared and rendered surfaces. | Matrix regression | PASS |
| SC-003 `[buildable]` | Conditional Codex selector/fallback and conservative enforcement diagnostics pass. | Codex adapter and surface tests | PASS |
| SC-004 `[buildable]` | explorer/quick low, designer/deep medium, librarian/oracle high, root xhigh; all Claude agents carry effort. | Focused configuration and adapter tests | PASS |
| SC-005 `[buildable]` | Always-loaded context remains 8,465 characters (~2,117 tokens); validator is clean; all six specialist prompts decreased. | Context validator, budget, and generated-size measurements | PASS |
| SC-006 `[buildable]` | Formatting, types, integration parity, focused regressions, full suite, and supplied build evidence are green. | Independent checks plus corroborated writer build result | PASS |
| SC-007 `[outcome]` | No representative post-release consumer telemetry exists yet. | Residual risk `R-SC-007` | RISK |

## Convergence closure

- **V-001: CLOSED** — each of exactly seven cases derives one unique candidate from all seven production `useWhen` contracts, checks route/phase ownership, and inspects real generated OpenCode, Codex, and Claude artifacts.
- **V-002: CLOSED** — `writer-quick-known` declares `quick`, forbids orchestrator/designer/deep, and is read and asserted by executable regression code.
- **V-003: CLOSED** — broad direct-work wording is absent from canonical and generated roots; the bounded Direct micro-action exception and no-self-verification remain.

## Executed checks

- Focused changed suite: 12 files, 198 tests passed.
- `pnpm run integration:verify`: 2 files, 12 tests passed; committed plugin equals generated output.
- `pnpm run check:ci`: 239 files passed without fixes.
- `pnpm run typecheck`: passed.
- `pnpm test`: 82 files, 991 tests passed.
- Context validator: 0 errors, 0 warnings, 0 info.
- Context budget: 8,465 always-loaded characters (~2,117 estimated tokens).
- Three-harness root probe: broad wording absent; bounded exception, selected-writer routing, and no-self-review present.
- `git diff --check`: passed.
- Changed and untracked file secret-pattern scan: no matches.
- Oracle did not rerun the writing build command; the writer's exit-zero build is corroborated by independent typecheck, generation parity, integration, and full-suite checks.

## Stable findings

- Generated specialist sizes match: explorer 3,435; librarian 3,412; oracle 3,910; designer 3,417; quick 3,375; deep 3,463 characters.
- One-writer ownership, delegation depth one, and read-only explorer/librarian/Oracle boundaries remain intact.
- Changed-file scope matches the accepted plan and convergence tasks; no stale generated or unrelated output was found.

## Critical issues

None.

## Warnings

- The independent Oracle did not rerun `pnpm run build` because it writes generated/build output. The writer's passing build was corroborated by the independent checks above.

## Residual risks

- SC-007: Residual risk `R-SC-007` requires measuring the next representative artifact-backed consumer SDD for at least one appropriate specialist assignment and zero duplicate root implementation; static prompt contracts cannot substitute for consumer telemetry.

## Verification history

- Round 1: FAIL on partial V-001, missing V-002, and contradictory warning V-003.
- Convergence round 1: T040–T042 resolved all three findings.
- Round 2: PASS by a new Oracle instance.
