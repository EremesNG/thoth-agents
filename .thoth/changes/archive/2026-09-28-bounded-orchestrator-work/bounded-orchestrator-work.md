# Change: bounded-orchestrator-work

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

Fresh read-only discovery in this worktree confirmed a clean starting tree. The canonical ownership contract in src/harness/core/agent-pack.ts already delegates unlocated local discovery before root search. src/agents/prompt-sections.ts renders that rule but omits the explicit known-source lookup exception. skills/thoth-sdd/references/phases/explore.md permits direct root exploration without stating that the specific discovery ownership rule governs it. Task and implementation guidance already require bounded outcomes, but the template presents only a bare acceptance checkbox. The record validator checks acceptance coverage, not semantic task size. Custom orchestrator prompts can replace default instructions; preserve this supported override and make its consequence explicit.

Research: GitHub Spec Kit tasks-template.md at 8d3f64cdccc877b6a297bc8167131103bb5b8ca0 organizes independently testable outcomes and dependencies. obra/superpowers writing-plans and subagent-driven-development at 8ca22dba9a94f28898bbce59f2537ff4d87c747d use reviewable deliverables, consumed/produced interfaces, scoped context, and replanning when a task proves oversized. Adopt those boundaries, not their entire workflow, timing heuristics, or per-task review pipeline. Donvito Pro at 30b7d0bb7e9b3b9a7d27e78a11c468f95c4cf704 supports delegation before substantive discovery. AX is a work-unit analogy, not evidence for a code-reading prohibition.

## Intent

Make the root a director by default with precise bounded direct consultation and make Worker/Designer assignments independently acceptable work units instead of whole multi-outcome phases. Preserve the existing five specialists, configured models/efforts, native lifecycle, user ownership, and independent verification.

## Non-goals

No scheduler, timer, runtime tracing system, process wrappers, model/effort changes, timeout changes, role split, configuration migration, constitution amendment, installation, global agent-file edits, or custom-prompt override removal. No guarantee of model compliance, latency, or cost savings. No mandatory Explorer before known implementation, no mandatory review after every small task, and no mechanical one-agent-per-file or per-test-step fragmentation.

## Acceptance

- AC-1: All default root surfaces consistently delegate unlocated local discovery before root search, explicitly permit one bounded known-source question, stop chained discovery, forbid duplicated discovery, and preserve explicit user ownership and independent verification.
- AC-2: Default root instructions state an experimental cumulative direct-code consultation budget of two fragments and approximately 200 lines per user request; changing files/tools/subtasks does not reset it. unlocated location still delegates at zero reads. Required instructions and pertinent coordination artifacts are excluded without allowing source/log dumps. Budget exhaustion delegates missing evidence and never bypasses required verification or creates a runtime enforcement claim.
- AC-3: The SDD skill and exploration guidance explicitly distinguish root responsibility for understanding from who gathers evidence; specific discovery ownership takes precedence over generic permission for direct work. Custom replacement prompts remain supported and documented as potentially omitting defaults, with a focused regression check.
- AC-4: The single-record task template, task/implementation guidance, and shared root task-shaping instructions require one independently acceptable outcome, concrete upstream input/output dependencies, owned writes and interface boundaries, focused check/pass evidence, and a meaningful return milestone/stop condition. A whole phase with separately acceptable outcomes is split before dispatch; independent precise Explorer questions can run in parallel within native capacity without duplicated investigation, while dependent questions wait for accepted evidence. Tiny cohesive mechanical work stays together.
- AC-5: Scope growth, missing interfaces, conflicting ownership, or newly discovered independent outcomes return bounded progress for root reassessment before expansion. Preserve native attention/waits, one writer, depth one, fresh specialists at new work boundaries, configured effort, and consolidated whole-project checks. A long productive task is not rejected solely by elapsed time.
- AC-6: Focused test-first regressions cover canonical policies, default rendering across supported harnesses, task template/skill contracts, and override behavior; routed docs contain concrete behavioral evaluation cases and honest instruction-level limitations. Applicable project checks and fresh independent final Oracle verification pass before closeout.

## Clarifications

- RESOLVED: User explicitly authorizes implementation of the previous recommendations and the added task/delegation improvement. Quick and Deep remain unified in Worker.
- RESOLVED: Treat the two-fragment/approximately-200-line budget as an experimental prompt contract, not runtime enforcement. Do not change native deadlines or provider configuration.
- RESOLVED: The .md task structure is an authoring/semantic acceptance contract. Do not invent a scheduler or a brittle schema that claims to validate semantic scope.
- RESOLVED: No material human-owned product decision remains. Optional plan review is offered once the concrete plan passes ready; existing implementation authorization is retained unless the user changes it.

## Decisions

- Root owns this record, scope, evidence acceptance and orchestration; specialists own bounded implementation units. No writer approves its own final verification.
- Keep canonical policy and rendered wording aligned and concise; replace or clarify ambiguous clauses rather than appending conflicting policy blocks.
- Split tasks by independent acceptance and interface/dependency boundaries, not file count, duration, or a mandatory role sequence. Child autonomy covers local implementation inside the accepted outcome.
- Existing supported full custom prompt replacement remains an explicit escape from defaults; no silent wrapping or injection.
- Evidence references: https://github.com/github/spec-kit/blob/8d3f64cdccc877b6a297bc8167131103bb5b8ca0/templates/tasks-template.md ; https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/writing-plans/SKILL.md ; https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/subagent-driven-development/SKILL.md . These justify qualitative boundaries, not numeric budgets or savings.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Bound direct root consultation** — Default roots MUST delegate unlocated local discovery before searching and MUST limit direct code consultation to a known source and bounded question. A new discovery path or exhausted experimental cumulative budget of two fragments and approximately 200 lines per request MUST route missing evidence to a specialist. Tool, file and subtask changes MUST NOT reset the budget; required operating instructions and relevant coordination artifacts are excluded but MUST NOT hide source/log dumps. Explicit user ownership and required independent verification remain authoritative. Full custom prompt replacement MAY omit these defaults and MUST be documented truthfully.
  - GIVEN an initially bounded known-source question reveals an unlocated dependency; WHEN another discovery path is needed; THEN the root delegates the remaining question without using accumulated context or remaining budget to justify continued discovery.
- `ADDED adaptive-sdd` **Shape independently acceptable work units** — Root MUST own understanding and acceptance while applying the specific discovery ownership policy to evidence gathering. Each substantial-record task and delegated work unit across exploration, research, planning, implementation and verification MUST identify one independently acceptable outcome, concrete upstream inputs and produced result, owned writes and relevant interface boundaries, focused checks with pass evidence, and a meaningful return milestone/stop condition. A phase containing separable outcomes MUST be split before dispatch; cohesive tiny edits MUST NOT be fragmented mechanically. Missing context, ownership conflicts or material scope growth MUST return bounded evidence for root reassessment before expansion. Native lifecycle, operator settings and independent verification remain unchanged.
  - GIVEN a planned discovery or implementation assignment contains several separately acceptable outcomes; WHEN the root prepares dispatch; THEN it separates the outcomes, records their concrete dependencies, and dispatches only ready conflict-free units with bounded ownership and return conditions.

## Plan

1. Align canonical ownership/task-shaping policy with rendered root instructions and add focused red/green assertions across OpenCode, Codex, Claude and Pi. Preserve override behavior while making its boundary testable.
2. In a disjoint writer surface, strengthen SDD skill/template and phase guidance so the .md naturally records the same work-unit contract; align SDD phase metadata and relevant skill/protocol tests where required. Keep the existing validator semantics unless a concrete inconsistency requires a bounded follow-up decision.
3. Release U3a (SDD/task docs) as soon as U2 is accepted and U3b (root/operational docs) as soon as U1 is accepted, with non-overlapping writers; align the documents where they mirror the changed contracts. Add example split/unsplit assignments and a compact behavioral evaluation matrix. Distinguish static assertions from observed model execution.
4. Freeze owned inputs, consolidate applicable checks in order: pnpm run check:ci, pnpm run typecheck, pnpm run build, pnpm test. Diagnose only introduced failures; preserve external changes.
5. Fresh read-only Oracle judges actual diff, acceptance and executed evidence. Repair blockers through bounded assignments, record source/record digests, validate closeout, then archive declared deltas through the shipped skill.

## Tasks

- [x] AC-1: U1 — Deliver consistent default-root ownership and bounded task-shaping instructions with focused regressions. Inputs: accepted policy in this record and current canonical/rendered contract. Owner: fresh Worker. Owned writes: src/harness/core/agent-pack.ts, src/harness/core/agent-pack.test.ts, src/agents/prompt-sections.ts, src/agents/prompt-rendering.test.ts and existing focused configured-role-prompt/prompt-utils test only if required. Output: default prompts and canonical policy agree; custom replacement remains unchanged. Checks: focused Vitest assertions for the owned policy/rendering/override surfaces, red before green. Milestone: return when these focused tests pass. Stop on required changes outside ownership; no skills/docs edits or whole-project checks. Skills: C:/Users/EremesNG/.agents/skills/tdd/SKILL.md and C:/Users/EremesNG/.agents/skills/simplify/SKILL.md.
- [x] AC-3: U2 — Deliver usable single-record outcome task authoring and SDD ownership precedence. Inputs: accepted work-unit fields and bounds in this record; independent of U1 source outputs. Owner: fresh Worker. Owned writes: skills/thoth-sdd/SKILL.md, skills/thoth-sdd/templates/change.md, skills/thoth-sdd/references/phases/explore.md, plan.md, tasks.md, implement.md; src/harness/core/sdd.ts, src/harness/core/sdd-protocol.test.ts, src/harness/bundled-skills.test.ts. Output: task template and phase guidance express the same bounded contract. Checks: focused existing SDD/skill assertions red then green, existing record validator accepts a correctly authored record. Milestone: return after owned guidance and focused tests agree. Stop if validator schema changes or another mutable surface is needed. Read/run existing src/harness/sdd-validator.test.ts and src/harness/core/sdd.test.ts as relevant without changing validator semantics. No U1 files, docs, scripts, or whole-project checks. Skills: installed tdd and simplify paths listed in U1.
- [x] AC-4: U3 — Deliver aligned operator-facing guidance and evaluable examples. Inputs: terminal root-accepted U2 for U3a; terminal root-accepted U1 for U3b. Owners: separate fresh Workers. U3a owned writes: docs/agent/sdd-and-skills.md and docs/agent/task-template.md. U3b owned writes: docs/agent/agents-and-delegation.md and AGENTS.md only for directly mirrored changed rules. Each returns its own independently acceptable documentation surface; no global wave barrier. Output: known-lookup, chained-discovery, unsupported-report, known-implementation and oversized-assignment cases; split and cohesive-task examples; override and experimental-budget limitations. Checks: links/clauses match accepted implementation; focused shipped context checks only if applicable without generating artifacts. Milestone: return once docs match accepted outputs. Stop before changing product code or adding new report/tool files. Skill: C:/Users/EremesNG/.agents/skills/progressive-context-router/SKILL.md (targeted refresh).
- [x] AC-5: U4 — Root accepts integrated outcomes, consolidates applicable checks and prepares the frozen diff and all AC evidence for a fresh independent Oracle. Inputs: terminal accepted U1-U3, executed check evidence and this record. Owned writes: root record only; Oracle none. Output: executed check evidence and complete reviewer inputs; the independent judgment is recorded separately in Verification. Stop on failed checks or stale/conflicting inputs; repair only affected units before a fresh judgment.

- [x] AC-2: Accept the U1 experimental cumulative consultation budget against focused cross-harness assertions; this is acceptance of U1, not a duplicate implementation assignment.
- [x] AC-6: Prepare U4 consolidated project checks and all acceptance evidence for independent final verification; record limitations of behavioral evaluation honestly.

- [x] AC-1: U1R — Repair the six remaining U1 regressions and preserve the existing 12,500-character root compactness limit. Input: terminal incomplete /root/worker_root_bounds, 49/55 focused tests pass, largest prompt 13,252 characters. Owner: fresh Worker /root/worker_prompt_compaction; same four U1 source/test files only, predecessor terminal. Output: accepted semantics restored with concise wording and both focused test files green. Check: the same focused Vitest command and whitespace check. Return after one concrete repair iteration; report any residual failure rather than beginning another broad reduction. No new functionality, relaxed budget or changed runtime settings.

## Authorization

**Plan review**: OKAY

Plan-review evidence: Fresh Oracle /root/oracle_bounded_plan returned [OKAY], zero blockers; ready validator and both baseline digests independently verified.
**Implementation**: AUTHORIZED

Implementation authorization evidence: User explicitly requested implementation of all agreed adjustments and improved task decomposition in this turn. Preserve any subsequent Stop or narrower direction; post-review implementation uses the explicit implementation authorization already given by the user; no Stop or narrowing instruction was received.

## Verification

U1 repair history (superseded by passing repair below): initial writer returned 49/55 focused tests with root compactness 13,252 > 12,500. U1R terminated after one iteration: canonical tests pass, rendered tests have 15 failures after removal of preexisting SDD wording; reported root 13,030. Both writers are terminal. Fresh Oracle /root/oracle_prompt_budget_diagnosis now provides a read-only exact repair diagnosis before further mutation; no speculative compression loop.

U3a accepted: terminal /root/worker_sdd_docs completed docs/agent/sdd-and-skills.md and docs/agent/task-template.md, with matching task fields and examples; git diff --check passed; no links changed.

U2 accepted: terminal /root/worker_sdd_units returned completed; focused pnpm exec vitest run src/harness/core/sdd-protocol.test.ts src/harness/bundled-skills.test.ts src/harness/sdd-validator.test.ts src/harness/core/sdd.test.ts passed 36 tests across four files; owned diff whitespace check passed. U3a released against this output.

U1 accepted after mechanical Oracle-guided removal of duplicated rendering and restoration of original SDD gates. Focused tests 55/55 passed. New defensive-copy assertion failed before cloning directConsultation and passed after. Broader suite found stricter harness limits and exact routing clauses; further mechanical edits preserve those constraints without relaxing tests. check:ci, typecheck and build pass after final source edits. Full-suite environment failures were traced to inherited CODEX_HOME and absent sibling marketplace fixture; tests use process-local removal of CODEX_HOME and THOTH_PLUGINS_ROOT=C:/DEV/Proyectos/Webstorm/thoth-plugins, with no persistent configuration changes. Isolated affected environment group improved to 99/100; the remaining routing phrase was repaired.

U3b accepted: terminal /root/worker_root_docs completed AGENTS.md and docs/agent/agents-and-delegation.md; behavioral cases and default/custom boundaries documented. Diff whitespace check passed. Final measured root lengths: OpenCode 10,987; Codex 12,294; Claude 11,741, below unchanged harness-specific caps (10,999 / 12,355 / 11,840). Generated plugin/Pi assets refreshed by the standard build; no global installation performed.

Final integration: pnpm run check:ci, pnpm run typecheck, pnpm run build and git diff --check passed. Complete suite via pnpm exec vitest run --reporter=json passed 1067/1067 across 98 files after unsetting inherited CODEX_HOME and setting THOTH_PLUGINS_ROOT only in the test shell. Standard build refreshed tracked plugin/Pi assets. Static contracts and test execution do not establish real-model adherence or latency/cost improvement; documented cases remain the manual behavioral evaluation protocol.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 72b2b7fc5ef9134e3d31d468e9c7ba785d71cfadef4761ce61390cffcb1395dc

- AC-1: PASS | focused and complete Vitest suite | director lookup/discovery routing assertions pass across four default harnesses
- AC-2: PASS | agent-pack and root rendering assertions | cumulative two-fragment/~200-line budget, exclusions, no resets and verification safeguards pass
- AC-3: PASS | SDD protocol/bundled-skill and custom replacement tests | discovery ownership precedence and unchanged full prompt replacement verified
- AC-4: PASS | task-template and phase protocol assertions plus routed examples | all-stage outcomes, concrete dependencies, bounded ownership and independent Explorer parallelism present
- AC-5: PASS | routing/rendering/SDD protocol assertions | bounded return for scope growth, native lifecycle and configured effort preserved
- AC-6: PASS | check:ci, typecheck, build, complete Vitest and diff whitespace check | 1067/1067 tests pass across 98 files with process-local test environment isolation; fresh Oracle /root/oracle_bounded_final independently returned PASS
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:d271e4cb5556d60c5d7bef39233cac692558f0a698eae1246cc1471cc0959f03
- Source: .thoth/specs/adaptive-sdd/spec.md | sha256:3765f013372ea0a49c6ee2c240465bceaa1f350f29efd1a7eac92725bf7f9b10

- Source: AGENTS.md | sha256:bdafb709cbb8e71d158c536e9cc293a2036f06cda9f7096fad1fd6ea3481f1ad
- Source: docs/agent/agents-and-delegation.md | sha256:c70610844fd5439ad1fd84c56a907b41885831ab4354065f7ae83430c35e0e15
- Source: docs/agent/sdd-and-skills.md | sha256:903ba83e0c359a64d974f86ac30247a3426b862309b6b624dc9df988b1923c44
- Source: docs/agent/task-template.md | sha256:d14e953c9e5e88d2f3e88df83ba3fe566238db92f40379862c7b50b05b92c3e0
- Source: pi/.thoth-agents-assets.json | sha256:4cc13e9bd427fded23d91fe4ab21058c0b3c0f97e0262c1521d734136be6e2ab
- Source: pi/agents/thoth-designer.md | sha256:24dc16f98cec129e4fc789472ee18793e9a5fcdac2b61fb285ac751606746a3d
- Source: pi/agents/thoth-worker.md | sha256:980d7cd9750a91211ee24b1ea5366f2f49fd37f55705ec75f81e2bac2f9ae3db
- Source: plugin/.claude-plugin/.thoth-agents-plugin-assets.json | sha256:6316ba07991eebcd0fd272f21b69ddec12962e247b50e0e547126d34066abcc3
- Source: plugin/agents/designer.md | sha256:404e5f3a3fc1429f6b7f04ec0ef4e045ff39a9a9b421f880d76c0d48fb64e0c5
- Source: plugin/agents/orchestrator.md | sha256:3d00d94ac2b01a53f77ad24a93b8a043e8d8f1897190cbf26f8c3e8b49cd8025
- Source: plugin/agents/worker.md | sha256:d69ec91220d920484886abc94d5da4af813dfac5180d653612900dfc33db8c4a
- Source: plugin/skills/thoth-sdd/SKILL.md | sha256:27c3ad5c5e977dcd15d7a54493dcdbec81fdae8b1c99d79c3be0f9c97b48e566
- Source: plugin/skills/thoth-sdd/references/phases/explore.md | sha256:7e92a9e78d1d30963cd140ce52e41e93c64ca1810ae80e7a9ab5daea74312f0f
- Source: plugin/skills/thoth-sdd/references/phases/implement.md | sha256:1528d75db3e443f5c31cf50a4b1d948ee8b8c3a6a50bbf0c864884041d49c036
- Source: plugin/skills/thoth-sdd/references/phases/plan.md | sha256:2ce5687f9441ee57bc5e3468c608f53cf0b4b7f4efa1cb034bd101db6c765bc9
- Source: plugin/skills/thoth-sdd/references/phases/tasks.md | sha256:d212f55872b8f97cff06ed84ded9db87ccd61d663e957bf899124396072092e0
- Source: plugin/skills/thoth-sdd/templates/change.md | sha256:d0700e923d2f34674b9f84e6af6a879ba672a40ced6a79de4fd97efdab3b53a6
- Source: skills/thoth-sdd/SKILL.md | sha256:27c3ad5c5e977dcd15d7a54493dcdbec81fdae8b1c99d79c3be0f9c97b48e566
- Source: skills/thoth-sdd/references/phases/explore.md | sha256:7e92a9e78d1d30963cd140ce52e41e93c64ca1810ae80e7a9ab5daea74312f0f
- Source: skills/thoth-sdd/references/phases/implement.md | sha256:1528d75db3e443f5c31cf50a4b1d948ee8b8c3a6a50bbf0c864884041d49c036
- Source: skills/thoth-sdd/references/phases/plan.md | sha256:2ce5687f9441ee57bc5e3468c608f53cf0b4b7f4efa1cb034bd101db6c765bc9
- Source: skills/thoth-sdd/references/phases/tasks.md | sha256:d212f55872b8f97cff06ed84ded9db87ccd61d663e957bf899124396072092e0
- Source: skills/thoth-sdd/templates/change.md | sha256:d0700e923d2f34674b9f84e6af6a879ba672a40ced6a79de4fd97efdab3b53a6
- Source: src/agents/prompt-rendering.test.ts | sha256:52ec9ef344501a8f6b70f587285a42ce5d34832294c45bf65db97f8d4f0172f8
- Source: src/agents/prompt-sections.ts | sha256:3b6eaacaa094f56c92c3224cc40ab2ea45604dfb20a838ff4c96effde2616e99
- Source: src/harness/bundled-skills.test.ts | sha256:5f4c0b5127abfc2b66466a9314ff5ca1af5e161d0dd615d426a430057e72fa06
- Source: src/harness/core/agent-pack.test.ts | sha256:cdf5b1e054655f98c9b432c0209608edafb6206a5aa72c7fee4909c343c3d6a0
- Source: src/harness/core/agent-pack.ts | sha256:d5a4e67fc748a879cc5c21dfe16261ff88fc3cd7c00fcdff119cda6a9af49970
- Source: src/harness/core/sdd-protocol.test.ts | sha256:9d8fc898a14aaf74b78d0b28de8ee24b33dd141cf4d82daaf2850dad00809a79
- Source: src/harness/core/sdd.ts | sha256:edb3ea760c983df176af0254fb57b736a3bb05f003824bd3c68f721fb3b52c99

Independent final judgment: /root/oracle_bounded_final returned PASS with no blockers, confirmed all 32 source hashes and reviewed-prefix digest, checked actual canonical/generated diffs, reused fresh integrated test evidence, and confirmed the two additional requirements complement existing contracts. Remaining limitation: static tests do not establish model adherence or cost/latency gains.

Fresh closeout judgment: /root/oracle_closeout_freshness returned PASS, independently confirmed all 32 source/spec hashes and prefix 72b2b7fc5ef9134e3d31d468e9c7ba785d71cfadef4761ce61390cffcb1395dc, and reconstructed the prior reviewed prefix by reverting only Authorization normalization. No product/source changes occurred after the actual-diff PASS.

## Closeout

**Archive**: READY
