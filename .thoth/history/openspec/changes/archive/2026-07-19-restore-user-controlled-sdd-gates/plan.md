# Implementation Plan: Restore user-controlled SDD gates

## Technical context

Version 0.2.11 placed two explicit human gates around SDD: the
`requirements-interview` flow recommended a route and waited for the user to
confirm it, and the root prompt offered “Review plan with Oracle (Recommended)”
or “Proceed to execution” after `tasks.md`. The bundled `plan-reviewer` skill
provided blocker-only `[OKAY]`/`[REJECT]` review and durable freshness evidence.

Version 0.3 replaced that model with `classifySddRoute()` decisions,
`routineUserPauses: false`, Accelerated fast-forward planning, and a mandatory
Full-only `analyze` phase. The current architecture deliberately keeps only seven
roles, makes `openspec/` canonical, delegates every final verification to Oracle,
and generates one shared plugin from canonical `src/` and `skills/` sources.

This change restores the two user decisions without restoring the removed phase
agents, requirements-interview, executing-plans, or thoth-mem artifact mirroring.
The current Full-only `analyze` phase becomes a conditional `plan-review` phase
available to both artifact-backed routes. Final `verify` remains mandatory and
independent for every route.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: JUSTIFIED EXCEPTION — accepted FR-001 and FR-004 redefine route authority and make pre-implementation Oracle review user-selected; final Oracle verification, depth-one delegation, and one-writer ownership remain intact. The explicit amendment is part of FR-006.
- **Explicit role boundaries**: PASS — root retains all coordination writes, Oracle remains read-only, and no role or mutable-surface ownership is added.
- **Proportional Spec Kit-compatible SDD**: JUSTIFIED EXCEPTION — the current text assigns route selection to root; FR-001 explicitly transfers final route choice to the user after an evidence-based recommendation. A MAJOR constitution amendment will reconcile the principle.
- **Truthful multi-harness contracts**: PASS — canonical prompts and owned skills will be generated for OpenCode, Codex, and Claude Code, with native blocking-input names and no claimed enforcement beyond each harness.
- **Independent provider ownership**: PASS — plan-review persistence remains under `openspec/`; no thoth-mem hook, protocol, topic, or provider effect is vendored or claimed.
- **Evidence-led completion**: JUSTIFIED EXCEPTION — Full currently mandates pre-implementation analysis; FR-002/FR-004 make that review optional while preserving mandatory post-implementation Oracle verification and archive closeout. The amendment records this narrower assurance boundary.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Treat classifier output as a recommendation whenever `requestedRoute` is absent; set `requiresUserInput` for route confirmation and instruct root prompts to present all three choices with the recommendation first. Explicit user routes remain authoritative. | `src/harness/core/sdd.ts` (`classifySddRoute`, workflow routing rules); `src/agents/prompt-sections.ts`; `skills/thoth-sdd/SKILL.md` | `classifySddRoute()` results and rendered orchestrator prompts for all dialects |
| FR-002 | Replace mandatory Full `analyze` with conditional `plan-review`, available after `tasks` for Accelerated and Full. Mark both artifact-backed policies as having the intentional post-`ready` user pause; implementation depends on `tasks`, not review completion. | `src/harness/core/sdd.ts` (`SddPhaseId`, `SDD_PHASES`, policies, protocols, required order, entry checks); `skills/thoth-sdd/SKILL.md` | `getSddWorkflowContract()`, `getRequiredSddPhaseOrder()`, `canEnterSddPhase()` |
| FR-003 | Restore a self-contained `plan-reviewer` owned skill adapted to current `spec.md`/`plan.md`/`tasks.md`. Keep read-only Oracle, default `[OKAY]`, `[REJECT]` only for true blockers, maximum three blockers, SHA-256 freshness manifest, root-owned OpenSpec persistence, review loop/override, and separate implementation confirmation after `[OKAY]`. Add optional `plan-review.md` to the artifact graph. | `skills/plan-reviewer/SKILL.md`; `skills/plan-reviewer/templates/plan-review.md`; `src/harness/core/sdd.ts`; remove obsolete `skills/thoth-sdd/references/phases/analyze.md` | Skill contract assertions plus phase/artifact graph tests |
| FR-004 | Keep `verify` required and Oracle-owned for all routes; update agent-pack, Oracle prompt, phase protocol, and governance wording so optional plan review cannot be mistaken for final verification. | `src/harness/core/sdd.ts`; `src/harness/core/agent-pack.ts`; `src/agents/prompt-sections.ts`; `openspec/memory/constitution.md`; `skills/thoth-constitution/templates/constitution.md` | Phase ownership/required-order tests, Oracle prompt tests, constitution validator |
| FR-005 | Add `plan-reviewer` to canonical owned-skill lists used by integration generation and `thoth-init`; generated `plugin/` remains output produced by `integration:sync`. | `src/harness/generate-integration-packages.ts`; `skills/thoth-init/scripts/init.mjs`; `skills/README.md`; generated `plugin/` | `generateIntegrationPackages()` tests and bundled `thoth-init` materialization test |
| FR-006 | Amend constitution 4.0.0 -> 5.0.0 (MAJOR) because route authority and mandatory Full analysis are redefined; propagate to repository instructions, canonical skill/template guidance, routed docs, and public workflow/install/packaging docs. | `openspec/memory/constitution.md`; `skills/{thoth-constitution,thoth-init,thoth-sdd,plan-reviewer}`; `AGENTS.md`; `docs/agent/`; `docs/{sdd-pipeline,skills-and-mcps,quick-reference,installation,codex-install,codex-plugin-packaging,claude-code-install,claude-code-plugin-packaging}.md`; `README.md` | Constitution lifecycle validator, prompt/bundle tests, focused text-contract inspection |

### Route-selection contract

`classifySddRoute()` continues to compute the evidence-based recommendation so
existing risk heuristics stay centralized. Its `route` field is final only when
`requestedRoute` is present; otherwise `requiresUserInput` is true and the root
must ask the user to select Direct, Accelerated, or Full. An uncertain request
may still require clarification after a route is selected, but route selection
is never inferred from silence.

### Plan-review contract

`plan-review` is conditional, Oracle-owned, read-only, and available only to
Accelerated and Full after `tasks`. It is deliberately absent from
`getRequiredSddPhaseOrder()`, so selecting “Proceed without review” permits
`implement`. Selecting review invokes the bundled `plan-reviewer`; the root
persists `plan-review.md` only for an actual review. A stale or rejected artifact
does not imply approval, but it only triggers a new review when the user still
wants that review. Final `verify` is a separate required phase.

### Constitution amendment

The amendment preserves the 2026-06-16 ratification date, keeps `Last amended`
at 2026-07-19, and bumps 4.0.0 to 5.0.0. It modifies principles 1, 3, and 6:
the root recommends routes while the user selects; optional plan review is
Oracle-owned when requested; every final verification remains mandatory Oracle
work. The initialization template receives equivalent generic wording so new
projects do not reintroduce mandatory `analyze` semantics.

## Optional support artifacts

- `research.md`: Not needed; v0.2.11 and v0.3.0 Git tags plus current code provide direct evidence recorded in this spec and plan.
- `data-model.md`: Not needed; no persisted product data or schema changes.
- `contracts/`: Not needed; the typed SDD interfaces, skill contract, and prompt rendering are the public seams.
- `quickstart.md`: Not needed; existing workflow documentation will be updated in place.

## Risks and migrations

- **High-risk route chosen against recommendation**: The root must state concrete risk but honor the user's selection. Mandatory final verification and normal safety policy remain unchanged.
- **Review skip confused with self-verification**: Prompt, phase, skill, and constitution wording explicitly separate optional `plan-review` from required `verify`; ownership tests cover all routes.
- **Stale plan approval reused**: `plan-reviewer` records SHA-256 digests for `spec.md`, `plan.md`, `tasks.md`, and the active requirements checklist when present; changed content invalidates `[OKAY]`. No runtime parser is invented outside the skill contract.
- **Provider boundary regression**: The restored skill writes only root-owned OpenSpec artifacts. Historical thoth-mem topic-key behavior is intentionally not copied.
- **Generated bundle drift**: Only canonical source is edited manually. `pnpm run integration:sync` regenerates `plugin/`, followed by `integration:verify` and build checks.
- **Phase-name migration**: Active contracts/tests/docs replace `analyze` with conditional `plan-review`. Historical archives remain immutable. No backward-compatible alias is retained.
- **Rollback**: Revert canonical SDD/prompt/skill/constitution changes and rerun `integration:sync`; no user data migration or external state rollback is required.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: JUSTIFIED EXCEPTION — the design changes only final route authority and optional pre-implementation review; it preserves root coordination, Oracle-only final verification, depth one, and one writer. The planned 5.0.0 amendment resolves the accepted exception.
- **Explicit role boundaries**: PASS — `plan-review` uses existing read-only Oracle and root-owned artifact persistence; implementation and generated-output ownership remain explicit.
- **Proportional Spec Kit-compatible SDD**: JUSTIFIED EXCEPTION — a user-selected route and optional review are the accepted new proportionality contract, with exact prompt and typed-interface seams and a planned MAJOR amendment.
- **Truthful multi-harness contracts**: PASS — one canonical prompt/skill source produces all supported harness surfaces and missing blocking input is disclosed instead of silently downgraded.
- **Independent provider ownership**: PASS — the design explicitly excludes thoth-mem persistence and retains `openspec/` as canonical.
- **Evidence-led completion**: JUSTIFIED EXCEPTION — only the pre-implementation review becomes optional; test-first work, final Oracle verification, closeout, and archive remain mandatory and covered. The planned 5.0.0 amendment removes the contradiction.
