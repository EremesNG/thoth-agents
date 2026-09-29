# Change: orchestrator-question-defaults

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

The accepted terminal Explorer audit identified shared root guidance in src/agents/prompt-sections.ts, protocol rendering in src/harness/core/sdd.ts, and choice policy in skills/thoth-sdd/SKILL.md and skills/plan-reviewer/SKILL.md. The first two answerless returns have no explicit retry procedure. plan-reviewer makes offering review permissive. The closeout validator accepts SKIPPED without selection provenance. All five maintained plugin skills were audited; thoth-init, thoth-archive and thoth-constitution have no separate retry budget. Active governance and adaptive-sdd limit defaults to the two SDD choices. The worktree began clean at 8822db754e306353addb50dc8d1970e48108ee8d.

## Intent

Implement the user's explicit policy: every orchestrator choice presents a recommendation, retries the same question after the first and second confirmed empty native returns, and must select the recommendation after the third. At ready always offer Oracle review (recommended) or direct implementation. Align maintained plugin skills, generated guidance, governance, templates and checks.

## Non-goals

No scheduler, runtime question wrapper, lifecycle mirror, new process scripts, historical record rewrites, dependency changes, package version bump, or edits to installed plugin caches. No invented secrets, missing facts, or claims that prompts override native host restrictions.

## Acceptance

- AC-1: Generated root instructions apply an explicit per-question three-return policy to all orchestrator choices; first/second empty returns cannot authorize dependent work or skip Oracle; third must choose the recommendation; explicit answers and Stop win; unavailable/open/failed/interrupted/prohibited questioning is not counted as an empty return.
- AC-2: All maintained plugin skills and active documentation/governance are consistent with mandatory ready offer, separate review and implementation decisions, retained user authorization, and independent final verification. Human-owned choices have a meaningful safe recommendation; missing required facts or secrets are never fabricated.
- AC-3: The substantial-record template and validator require bounded selection provenance for plan-review disposition; SKIPPED requires an explicit direct-implementation choice and cannot result from an unanswered recommended-review question. Tests reject missing/contradictory provenance and cover valid explicit and three-empty-recommended selections without claiming runtime enforcement.
- AC-4: Focused regressions and applicable full checks pass, environment-only external integration gaps are reported with concrete evidence, and a fresh read-only Oracle independently verifies the final diff and acceptance outcomes before archive.

## Clarifications

- RESOLVED: User explicitly requests implementation and alignment of all plugin skills. The broader default policy intentionally supersedes the prior two-choice limitation.
- RESOLVED: This host forbids repeating request_user_input after an empty answer. That higher-priority limitation must be reported rather than silently claiming three attempts or converting silence into a declined review. This session can choose the recommended review under host best-judgment guidance if its one native offer is empty.
- RESOLVED: The change covers choices with a meaningful recommended action, not fabrication of requested facts or secrets; safe deferral can be the recommendation where necessary.

## Decisions

- Accepted material governance change activates thoth-constitution lifecycle under the user's explicit policy and implementation direction. Preserve original ratification and update version, amendment date and Sync Impact Report; do not change package version.
- Existing public verification seams are rendered root/protocol instructions and the shipped SDD record validator. Extend their existing tests, using red/green slices; no new runtime mechanism is introduced.
- Existing explicit implementation authorization from the user remains valid. A plan review does not itself supply authorization; an explicit later Stop would supersede the existing authorization.
- Root owns this record and final acceptance. Workers own disjoint implementation surfaces. Canonical spec changes are applied by archive only after independent PASS.
- Compact provenance contract: `**Plan review selection**` accepts EXPLICIT_REVIEW, EXPLICIT_SKIP, or DEFAULT_REVIEW_AFTER_3 at closeout. SKIPPED requires EXPLICIT_SKIP; OKAY requires EXPLICIT_REVIEW or DEFAULT_REVIEW_AFTER_3. Missing, other, or contradictory selections fail closeout. The initial placeholder is permitted before closeout only. This declaration is not runtime authentication of the native choice.
- Selected fresh Oracle plan review /root/oracle_question_plan returned [OKAY], independently confirmed ready PASS, and accepted the compact provenance contract with no blockers. Existing user implementation authorization remains applicable.
- User explicitly requested a modest increase to the prompt size limit during implementation. Raise the existing rendered-root threshold from 12,500 to 13,500 characters; measured expanded policy was 13,004. Preserve clarity and the semantic assertions.
- Integration diagnosis and bounded mechanical fixes: root aligned existing OpenCode, Codex and Claude root-size assertions to the explicit 13,500 total cap and the Pi assertion to its shared-policy wording; specialist limits remain unchanged. The project build regenerated the tracked plugin copies and asset manifest from canonical sources.
- Test environment: inherited CODEX_HOME overrides installer test homeDir fixtures and directed checks into the live Orca home. A representative dry-run failed before writes, then passed with that variable absent only in the child test process. Root used that isolated environment for the full suite; no runtime-home files were changed for this fix.
- External verification limitation: four publish-marketplace integration tests fail at fixture creation (src/harness/publish-marketplace.test.ts:98) because the sibling C:/Users/EremesNG/orca/workspaces/thoth-agents/thoth-plugins checkout is absent. All other 1,134 tests pass; this change does not provision or modify another repository. Final Oracle must judge the change with this explicit limitation, not a claimed all-green suite.

## Durable deltas

- `MODIFIED adaptive-sdd` **Preserve selected review and implementation authorization** — Substantial work MUST have a ready plan and tasks and MUST always offer Oracle plan review (Recommended) or direct implementation. Every orchestrator choice MUST present a meaningful recommendation, repeat the same question after the first and second confirmed answerless native returns without starting dependent work, and select its recommendation on the third. Explicit answers and Stop prevail; counters are per question. Open, unavailable, failed, interrupted or host-prohibited questions MUST NOT count. A higher-priority host limitation MUST be disclosed and MUST NOT be reported as three completed attempts or an explicit decline. Missing facts and secrets MUST NOT be fabricated. Review approval does not authorize implementation; preserve the separate implementation decision and applicable prior explicit authorization. SKIPPED review requires explicit direct-implementation selection with recorded provenance; silence never selects SKIPPED. Same-intent review blockers require correction and a fresh review; final independent verification remains mandatory.
  - GIVEN the ready review choice returns empty once or twice; WHEN root processes that return; THEN it repeats the same choice and does not implement dependent work.

## Plan

1. Align the shared generated root prompt and SDD protocol, all relevant skill instructions, active docs and constitution with the accepted general policy. Audit remaining maintained skills and add only needed cross-references. Keep native capability limits explicit.
2. Extend the sole-record template and shipped validator with compact plan-review selection evidence sufficient to distinguish explicit selection from a third-empty default. Preserve status/authorization separation; no event history or runtime state is added. Implement with focused red/green validator tests.
3. Apply simplify within the diff, run focused checks and applicable full checks in project order, then obtain fresh read-only Oracle final judgment. Root updates this record and archives declared deltas using the installed archival contract only after PASS.

## Tasks

- [x] AC-1: Generated root and protocol instructions expose the complete general choice policy.
  - Owner: worker for guidance alignment
  - Writes: src/agents/prompt-sections.ts, src/harness/adapters/pi.ts, src/harness/core/sdd.ts, related prompt/protocol tests
  - Inputs: accepted user policy and terminal Explorer map
  - Dependencies: ready plan and review disposition
  - Check: focused rendered-prompt and protocol tests fail before implementation and pass afterward
  - Return milestone: aligned guidance and focused passing regressions; stop on new runtime requirements
- [x] AC-2: Plugin skills and active governance describe one consistent policy.
  - Owner: fresh skills/governance worker after explicit release of untouched AC-2 surfaces
  - Writes: maintained skills instruction files, active AGENTS.md and routed docs, .thoth/constitution.md, constitution template as needed; exclude SDD record template and validator scripts
  - Inputs: accepted user policy, five-skill audit, existing constitution
  - Dependencies: same ready plan
  - Check: inspect all five maintained skills, validate constitution and aligned normative text
  - Return milestone: bounded alignment and documented unchanged skills; stop on unrelated governance changes
- [x] AC-3: Record validation rejects unsupported review skipping.
  - Owner: validator worker
  - Writes: skills/thoth-sdd/templates/change.md, skills/thoth-sdd/scripts/validate.mjs, src/harness/sdd-validator.test.ts, src/harness/sdd-archive.test.ts
  - Inputs: accepted policy and existing public validator seam
  - Dependencies: ready plan and compact provenance contract agreed with guidance worker
  - Check: red/green rejection of missing/invalid skip provenance and acceptance of legitimate explicit and three-empty selections
  - Return milestone: minimal schema and passing focused checks; stop before changing runtime or unrelated validation
- [x] AC-4: Integrated checks and frozen handoff are ready for fresh independent verification.
  - Owner: root checks; fresh read-only Oracle judgment
  - Writes: this record only before archive
  - Inputs: terminal accepted worker results and frozen diff
  - Dependencies: AC-1, AC-2, AC-3 completed
  - Check: check:ci, typecheck, build, test; fresh Oracle PASS; closeout validator and archive checks
  - Return milestone: passing integrated checks and frozen record for Oracle; root closeout and archive follow only after fresh independent PASS; stop on outstanding failures

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: acf262fda9b2c63ce6d23adae8a47ada107df30706373f58f2a8d785e912f6e7

- AC-1: PASS | pnpm exec vitest run src/agents/prompt-rendering.test.ts src/harness/core/sdd-protocol.test.ts | 50 tests pass after observed red; shared roots and Pi aligned; user-approved 13,500 character threshold passes
- AC-2: PASS | bundled constitution validator and five-skill consistency review | version 10.1.0 validated; original ratification preserved; all five skills plus active docs aligned; assigned diff check passed
- AC-3: PASS | pnpm exec vitest run src/harness/sdd-validator.test.ts src/harness/sdd-archive.test.ts | 23 tests pass; red missing-selection case observed before guard; rejects duplicate, absent, unsupported, contradictory and premature-default selections; focused Biome and diff checks pass
- AC-4: PASS | fresh independent Oracle /root/oracle_question_closeout and integrated checks | check:ci passes with diagnostics limited to errors; typecheck passes; build and integration sync pass; full suite with CODEX_HOME removed only in child process has 1,134 passes and four ENOENT fixture failures from missing sibling thoth-plugins checkout; git diff --check passes. Node v24.21.0 / pnpm 11.2.2.
- Source: .thoth/specs/adaptive-sdd/spec.md | sha256:37a1a967474b48370595570d54baca5863bf0e08e4d999679f39f8813b0b6bd1
- Source: src/agents/prompt-sections.ts | sha256:536681321d394df0445a1ea151a6ed1cf08e24895be27045f48a779f371bb3f9
- Source: src/harness/core/sdd.ts | sha256:6dd8b0705674f63de1c97c37ee51dbd3aee9a2d91e61a843d0d9770136164d29
- Source: src/harness/adapters/pi.ts | sha256:6a3a4dee602c79f2da119d7dc0ce26339c1f55692b8d48c6f63a1c0a2e5cdb32
- Source: skills/thoth-sdd/scripts/validate.mjs | sha256:7aeae868895adf1d3011cf83bac575d8dba02aa4e2e7e56473800f812db31fcc
- Source: .thoth/constitution.md | sha256:168a4356bd8080b99c80a9433310c6473d8cbaf9122b0179b48a3d209b7cf82b

## Closeout

**Archive**: READY
