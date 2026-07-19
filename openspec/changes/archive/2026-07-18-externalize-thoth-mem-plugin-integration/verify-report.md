# Verification Report: Externalize thoth-mem Plugin Integration

**Change:** `externalize-thoth-mem-plugin-integration`
**Artifact:** `openspec/changes/externalize-thoth-mem-plugin-integration/verify-report.md`
**Topic Key:** `sdd/externalize-thoth-mem-plugin-integration/verify-report`

## Round

round 2

## Completeness

- OpenSpec preflight passes: config, specs, changes, constitution, and required mechanism sections exist.
- All required planning artifacts were reviewed. Proposal, both specs, checklist, and design hashes match `plan-review.md`; the tasks hash changed only through expected post-approval execution-status updates.
- T001–T017 and the targeted remediation/re-review evidence are complete; report
  persistence remains the current T019 handoff, and archive is excluded.
- Spec coverage is 100%: 21/21 distinct normative requirements are present in the matrix, with no orphan requirement tags.
- Scenario coverage is 40/40 compliant; all 40 GWT scenarios are present in the matrix.
- The checklist is 26/26 checked, with zero clarification markers.
- All 21 tasks have an owner, traceability, Independent Test, Verification, Run, and Expected field.
- Of 125 referenced paths, all exist except the intentionally new `verify-report.md` artifact.

## Build and Test Evidence

Evidence was corroborated from task states, current code/tests, hashes, deletions, and diff inspection; commands were not rerun by the Oracle.

- T013: 25 files, 362 tests, and 2 snapshots.
- T014: `check:ci` across 230 files and typecheck.
- T015: build produced 137 declarations and 6 JavaScript bundles; dry package contained 163 files, the exact three harnesses, and no provider assets.
- T016: 75 files, 881 tests, and 2 snapshots; tree fingerprint unchanged.
- T017: `git diff --check HEAD` plus scope/secret/provider-state scan passed apart from the excluded `.gitignore` context.

The prior documentation findings were rechecked after targeted remediation and are
now compliant. Evidence remains corroborated from the persisted task records and
current diff; commands were not rerun by the Oracle.

## Compliance Matrix

### Normative Requirements (21)

| # | Requirement | Status | Anchors |
|---:|---|:---:|---|
| 1 | MH-1 Establish Exclusive Provider Ownership | C | `README.md:357-366`; `docs/skills-and-mcps.md:74-78`; `src/harness/provider-boundary.test.ts:121-183` |
| 2 | MH-2 Report Provider-Dependent Capability Truthfully | C | `README.md:357-360`; `src/cli/operations/types.ts:98-126`; `docs/skills-and-mcps.md:74-78` |
| 3 | MH-3 Preserve Neutral Orchestration and SDD Contracts | C | `src/harness/core/memory-governance.ts:35-65`; `src/sdd/artifact-governance/artifact-loader.ts:381-530` |
| 4 | MH-4 Preserve Handoff and Completion Continuity as Outcomes | C | `src/harness/core/memory-governance.ts:37-44,134-156` |
| 5 | MH-5 Keep Stage and Rollback Boundaries Explicit | C | `README.md:350-353`; `docs/agent/memory-governance.md:24-27` |
| 6 | Enforce thoth-mem Governance Across Harnesses | C | `README.md:357-360`; `docs/skills-and-mcps.md:74-78`; `src/harness/provider-boundary.test.ts:121-183` |
| 7 | Preserve SDD Skills Portability | C | `src/skills/_shared/persistence-contract.md:1-56`; `src/sdd/artifact-governance/artifact-loader.test.ts:113-247` |
| 8 | Limit Rollout Scope Safely | C | `docs/installation.md:94-103`; `src/harness/registry.ts:10-17`; `src/harness/registry.test.ts:62-73` |
| 9 | Render Canonical thoth-mem Tool Surface Across Harness Surfaces | C | `src/mcp/index.test.ts:15-19`; `src/harness/provider-boundary.test.ts:83-147` |
| 10 | Bootstrap Root thoth-mem Sessions Before Other Memory Operations | C | `src/plugin-node-runtime.test.ts:9-15`; `src/agents/prompt-rendering.test.ts:173-196` |
| 11 | SI-1 Remove Bundled Provider Guidance | C | `src/harness/core/skills.ts:39-149`; `src/harness/core/skills.test.ts:59-73` |
| 12 | SI-2 Prohibit Consumer Copies of Provider Protocol | C | `src/harness/provider-boundary.test.ts:83-147`; `src/agents/prompt-rendering.test.ts:186-196` |
| 13 | SI-3 Preserve Neutral Orchestration and SDD Guidance | C | `src/skills/_shared/persistence-contract.md:1-56`; `src/harness/core/memory-governance.ts:14-23` |
| 14 | SI-4 Preserve Handoff and Completion Continuity Without Provider Calls | C | `src/harness/core/memory-governance.ts:37-44,134-156`; `src/harness/core/memory-governance.test.ts:46-51` |
| 15 | SI-5 Scope Harness Guidance and Capability Claims | C | `src/harness/registry.test.ts:10-73`; adapter tests at `opencode.test.ts:111-146`, `codex.test.ts:338-344`, `claude-code.test.ts:128-135` |
| 16 | Express Shared Skill Semantics in Harness-Neutral Language | C | `src/harness/core/memory-governance.ts:97-114`; `src/agents/prompt-rendering.test.ts:262-274` |
| 17 | Fail Explicitly for Unsupported Harness Behavior | C | `src/cli/operations/types.ts:109-126`; `src/harness/registry.ts:42-57` |
| 18 | Preserve thoth-mem Topic-Key Discipline | C | `src/harness/core/memory-governance.ts:14-23`; `src/sdd/artifact-governance/artifact-loader.ts:155-182` |
| 19 | Use Canonical thoth-mem MCP Surface in Skill Guidance | C | `src/harness/provider-boundary.test.ts:88-147`; `src/agents/prompt-rendering.test.ts:186-196` |
| 20 | Encode thoth-mem Lifecycle Ownership in Skill Guidance | C | `src/plugin-node-runtime.test.ts:9-15`; `src/harness/provider-boundary.test.ts:88-147` |
| 21 | Teach High-Signal thoth-mem Retrieval Decisions | C | `src/skills/_shared/thoth-mem-convention.md:1-57`; `src/harness/provider-boundary.test.ts:83-147` |

### GWT Scenarios (40)

| # | Requirement › Scenario | Status | Anchors |
|---:|---|:---:|---|
| 1 | MH-1 Establish Exclusive Provider Ownership › MH-1.1 All three supported harnesses use the same ownership boundary | C | `README.md:357-366`; `docs/skills-and-mcps.md:74-78`; `src/harness/provider-boundary.test.ts:121-183` |
| 2 | MH-1 Establish Exclusive Provider Ownership › MH-1.2 Generated and installed outputs omit provider-owned assets | C | `src/harness/provider-boundary.test.ts:83-147`; `src/harness/writers/codex-plugin-package.ts:55-59` |
| 3 | MH-1 Establish Exclusive Provider Ownership › MH-1.3 A harness outside the accepted scope is rejected | C | `src/harness/registry.ts:27-57`; `src/harness/registry.test.ts:62-73` |
| 4 | MH-2 Report Provider-Dependent Capability Truthfully › MH-2.1 Provider integration is absent | C | `src/cli/operations/types.ts:98-126`; `src/cli/operations/types.test.ts:80-106` |
| 5 | MH-2 Report Provider-Dependent Capability Truthfully › MH-2.2 Provider integration is incomplete or degraded | C | `src/cli/operations/types.test.ts:40-53`; `src/cli/tui/components/StatusView.tsx:32-80` |
| 6 | MH-2 Report Provider-Dependent Capability Truthfully › MH-2.3 Unrelated orchestration remains usable | C | `src/sdd/artifact-governance/artifact-loader.ts:479-509`; test `:138-197` |
| 7 | MH-2 Report Provider-Dependent Capability Truthfully › MH-2.4 Installed provider guidance is authoritative | C | `README.md:357-360`; `docs/skills-and-mcps.md:74-78`; `src/harness/provider-boundary.test.ts:121-183` |
| 8 | MH-3 Preserve Neutral Orchestration and SDD Contracts › MH-3.1 Orchestration governance survives externalization | C | `src/harness/core/memory-governance.ts:35-65`; `src/agents/index.test.ts:707-750` |
| 9 | MH-3 Preserve Neutral Orchestration and SDD Contracts › MH-3.2 Persistence modes preserve their declared semantics | C | `src/sdd/artifact-governance/artifact-loader.ts:381-530`; test `:113-247` |
| 10 | MH-3 Preserve Neutral Orchestration and SDD Contracts › MH-3.3 Canonical SDD identities remain stable | C | `src/sdd/artifact-governance/artifact-loader.ts:155-182`; `src/skills/_shared/persistence-contract.md:29-56` |
| 11 | MH-4 Preserve Handoff and Completion Continuity as Outcomes › MH-4.1 Delegated handoff preserves required context | C | `src/harness/core/memory-governance.ts:37-44`; `src/agents/index.test.ts:651-678` |
| 12 | MH-4 Preserve Handoff and Completion Continuity as Outcomes › MH-4.2 Completion preserves future continuity | C | `src/harness/core/memory-governance.ts:39-41`; `README.md:348-350` |
| 13 | MH-4 Preserve Handoff and Completion Continuity as Outcomes › MH-4.3 Continuity capability is unavailable | C | `src/harness/core/memory-governance.ts:134-156`; test `:111-125` |
| 14 | MH-5 Keep Stage and Rollback Boundaries Explicit › MH-5.1 Stage 1 does not claim parity | C | `README.md:350-353`; `docs/agent/memory-governance.md:26-27` |
| 15 | MH-5 Keep Stage and Rollback Boundaries Explicit › MH-5.2 Consumer rollback leaves provider ownership intact | C | `docs/agent/memory-governance.md:24-25`; `src/cli/codex-config-io.test.ts:43-65` |
| 16 | Enforce thoth-mem Governance Across Harnesses › Consumer and provider governance remain separated | C | `README.md:357-360`; `docs/skills-and-mcps.md:74-78`; `src/harness/provider-boundary.test.ts:121-183` |
| 17 | Preserve SDD Skills Portability › SDD remains portable with truthful provider dependencies | C | `src/skills/_shared/persistence-contract.md:1-56`; `src/sdd/artifact-governance/artifact-loader.test.ts:113-247` |
| 18 | Limit Rollout Scope Safely › Supported harness scope and capability are distinct | C | `docs/installation.md:94-103`; `src/harness/registry.ts:10-17`; `src/harness/registry.test.ts:62-73` |
| 19 | Render Canonical thoth-mem Tool Surface Across Harness Surfaces › Legacy consumer tool-surface requirement is absent | C | `src/mcp/index.test.ts:15-19`; `src/harness/provider-boundary.test.ts:83-147` |
| 20 | Bootstrap Root thoth-mem Sessions Before Other Memory Operations › Legacy consumer bootstrap requirement is absent | C | `src/plugin-node-runtime.test.ts:9-15`; `src/agents/prompt-rendering.test.ts:173-196` |
| 21 | SI-1 Remove Bundled Provider Guidance › SI-1.1 The bundled provider skill is removed | C | `src/harness/core/skills.test.ts:59-73`; `src/harness/writers/skill-layout.test.ts:248-270` |
| 22 | SI-1 Remove Bundled Provider Guidance › SI-1.2 Installed provider guidance supplies memory protocol | C | `src/harness/core/memory-governance.ts:41-44`; `docs/skills-and-mcps.md:74-78` |
| 23 | SI-1 Remove Bundled Provider Guidance › SI-1.3 Provider guidance is absent | C | `src/cli/tui/components/StatusView.tsx:26-80`; `src/cli/operations/types.test.ts:80-106` |
| 24 | SI-2 Prohibit Consumer Copies of Provider Protocol › SI-2.1 Consumer guidance avoids lifecycle prescriptions | C | `src/harness/provider-boundary.test.ts:88-147`; `src/agents/prompt-rendering.test.ts:173-196` |
| 25 | SI-2 Prohibit Consumer Copies of Provider Protocol › SI-2.2 Consumer guidance avoids exhaustive callable vocabulary | C | `src/harness/provider-boundary.test.ts:88-147`; `src/agents/prompt-rendering.test.ts:186-196` |
| 26 | SI-2 Prohibit Consumer Copies of Provider Protocol › SI-2.3 Missing capability does not create fallback guidance | C | `src/sdd/artifact-governance/artifact-loader.test.ts:138-247`; `src/harness/core/memory-governance.ts:42-44` |
| 27 | SI-3 Preserve Neutral Orchestration and SDD Guidance › SI-3.1 Role and gate rules remain portable | C | `src/harness/core/memory-governance.ts:35-65`; adapter tests `opencode.test.ts:111-146`, `codex.test.ts:338-344`, `claude-code.test.ts:128-135` |
| 28 | SI-3 Preserve Neutral Orchestration and SDD Guidance › SI-3.2 SDD persistence identities remain canonical | C | `src/skills/_shared/persistence-contract.md:29-56`; `src/sdd/artifact-governance/artifact-loader.ts:155-182` |
| 29 | SI-3 Preserve Neutral Orchestration and SDD Guidance › SI-3.3 Provider absence preserves valid non-provider modes | C | `src/sdd/artifact-governance/artifact-loader.ts:393-438,479-530`; test `:138-220` |
| 30 | SI-4 Preserve Handoff and Completion Continuity Without Provider Calls › SI-4.1 Handoff guidance states required context | C | `src/harness/core/memory-governance.ts:37-44`; `src/agents/index.test.ts:651-678` |
| 31 | SI-4 Preserve Handoff and Completion Continuity Without Provider Calls › SI-4.2 Completion guidance preserves continuation | C | `src/harness/core/memory-governance.ts:39-41`; `src/harness/core/memory-governance.test.ts:46-51` |
| 32 | SI-4 Preserve Handoff and Completion Continuity Without Provider Calls › SI-4.3 Continuity support is degraded or unavailable | C | `src/harness/core/memory-governance.ts:134-156`; test `:111-125` |
| 33 | SI-5 Scope Harness Guidance and Capability Claims › SI-5.1 All supported harnesses receive boundary-consistent guidance | C | `src/harness/adapters/opencode.test.ts:111-146`; `codex.test.ts:338-344`; `claude-code.test.ts:128-135` |
| 34 | SI-5 Scope Harness Guidance and Capability Claims › SI-5.2 Unsupported harness behavior is explicit | C | `src/harness/registry.ts:42-57`; `src/harness/registry.test.ts:62-73` |
| 35 | Express Shared Skill Semantics in Harness-Neutral Language › Shared wording separates consumer outcomes from provider operations | C | `src/harness/core/memory-governance.ts:97-114`; `src/agents/prompt-rendering.test.ts:262-274` |
| 36 | Fail Explicitly for Unsupported Harness Behavior › Capability gaps remain visible without disabling unrelated behavior | C | `src/cli/operations/types.ts:109-126`; `src/sdd/artifact-governance/artifact-loader.ts:479-509` |
| 37 | Preserve thoth-mem Topic-Key Discipline › Canonical identity is preserved without protocol duplication | C | `src/harness/core/memory-governance.ts:14-23`; `src/sdd/artifact-governance/artifact-loader.ts:155-182` |
| 38 | Use Canonical thoth-mem MCP Surface in Skill Guidance › Exact callable-surface guidance is removed | C | `src/harness/provider-boundary.test.ts:88-147`; `src/agents/prompt-rendering.test.ts:186-196` |
| 39 | Encode thoth-mem Lifecycle Ownership in Skill Guidance › Consumer lifecycle sequencing is removed | C | `src/plugin-node-runtime.test.ts:9-15`; `src/harness/provider-boundary.test.ts:88-147` |
| 40 | Teach High-Signal thoth-mem Retrieval Decisions › Consumer retrieval protocol is removed | C | `src/skills/_shared/thoth-mem-convention.md:1-57`; `src/harness/provider-boundary.test.ts:83-147` |

## Design Coherence

The implementation coheres with external ownership, ephemeral evidence-only states,
stable persistence modes, canonical SDD identities, resumable completion, exact
registry, provider-safe rollback, Stage 2 follow-up, and no archive. The targeted
documentation remediation now aligns the public ownership boundary and the
three-harness rollout with the implementation and regression evidence.

## Issues Found

### Critical

- None.

### Warnings

- **[W1]** Excluded unrelated staged change `.gitignore:41` removes `.claude/`.
  - file: `.gitignore:41`
  - scenario / criterion: Excluded unrelated staged change; no verdict/count impact.
  - fix: Keep separated; no verdict/count impact.

## Verdict

pass

The targeted remediation resolved the prior documentation findings. Compliance
Summary: requirements **21/21**; scenarios **40/40**. W1 is context-only and has
no verdict or count impact.

## Constitution Suggestion

This change touched governance/principles — consider running `sdd-constitution` to record a constitution amendment. Non-blocking.

### Recommended Next Action

Proceed to the pre-archive user gate with the clean round-2 result. Keep W1
separated from this change and do not archive automatically.
