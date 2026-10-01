# Change: evidence-only-discovery-roles

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Facts-only Explorer (subtask_thoth-explorer_1790868586278_b533a393, worktree HEAD
  e809b90 lineage): all five specialists share one return contract. Canonical field
  array `AGENT_RETURN_CONTRACT` at `src/harness/core/agent-pack.ts:377` includes
  `nextAction`; it is rendered into routing descriptions (`agent-pack.ts:414`) and the
  root delegation section ("Child return fields: … nextAction",
  `src/agents/prompt-sections.ts:260`). `childSections()` (`prompt-sections.ts:295`)
  serves all specialists; the return list ends with `- nextAction` (`:357`).
- Blocked-question rule for every specialist asks for "a recommended default":
  Pi `prompt-sections.ts:400`, non-Pi `:409`; the Codex worker fixture pins the latter
  (`src/harness/__fixtures__/codex/agent-worker.toml:46`).
- Generic delegation guidance requests "next action" (`agent-pack.ts:280`), pinned by
  `src/harness/core/agent-pack.test.ts:113`; `nextAction` is pinned by
  `src/agents/prompt-rendering.test.ts:418`, `src/harness/core/agent-routing.test.ts:368`,
  `src/harness/core/agent-pack.test.ts:224`.
- All four harnesses consume the shared renderer: OpenCode
  (`src/harness/adapters/opencode.ts:29,47`), Pi (`pi.ts:94-101`), Codex
  (`codex.ts:152,228-233`), Claude Code (`claude-code.ts:124,235-241`,
  `writers/claude-code-subagent.ts:69-71`) via `src/agents/configured-role-prompt.ts:29`.
- Repository instructions repeat the generic contract: `AGENTS.md:161` ("uncertainty and
  next action"), `AGENTS.md:233-234` ("recommended next action"),
  `docs/agent/agents-and-delegation.md:68-69`, `docs/agent/task-template.md:58,60`.
  Implementation handoff guidance (`skills/thoth-sdd/references/phases/implement.md:40,52-53`)
  concerns writers.
- Oracle legitimately separates observations, risks and recommendations
  (`prompt-sections.ts:281`, `agent-pack.ts:187,194,199`); plan-reviewer returns
  blockers with smallest repairs. Worker/Designer share the same return list and differ
  in write authority and local implementation judgment (`prompt-sections.ts:316`,
  `agent-pack.ts:207-209,240`). Root recommendation policy (orchestrator choices,
  safe deferral, Review/Implement recommendations) is separate and unaffected.
- Spec `.thoth/specs/multi-harness-agent-pack/spec.md` requires preserving return
  contracts (`Preserve the six-role contract`) and escalation "through its return
  contract" (lines 403, 431) but defines no evidence-only rule.
- Custom `prompt` replacement/append (`configured-role-prompt.ts:25-39`) can change
  effective instructions; out of scope.

## Intent

Explorer and Librarian explore and report facts only: no recommended fixes, designs,
defaults or next actions. Root decides or asks Oracle. Oracle keeps its judgment;
Worker and Designer keep their implementation next step.

## Non-goals

- No change to Oracle, Worker or Designer return contracts or responsibilities.
- No change to root recommendation policy (orchestrator choices, plan-review offer,
  safe deferral).
- No change to custom prompt replacement/append behavior.
- No runtime enforcement; this is prompt and documentation guidance.

## Acceptance

- AC-1: Canonical contract: role-specific return fields. Explorer and Librarian
  return `conclusion, evidence, verification, risks, openQuestions` (no `nextAction`);
  Oracle, Worker and Designer keep the current six fields. Routing descriptions and
  the root delegation section render per-role fields truthfully; generic delegation
  guidance stops requesting "next action" from discovery roles.
- AC-2: Explorer/Librarian prompts state the evidence-only rule: report facts with
  evidence and uncertainty; never recommend fixes, designs, defaults or next actions;
  a `conclusion` is a factual finding, not advice. Open questions go to
  `openQuestions` as the question, the possible options and the facts for each option,
  without recommending one. Pi and non-Pi blocked-question wording for these two roles
  drops "recommended default"; the other three roles keep it. The configured step
  budget (`renderStepBudget`, `prompt-sections.ts:458`, "return partial evidence with
  the next target") is role-scoped: discovery roles return partial evidence and what
  remains unexamined, without a next target; other roles keep current wording; tests
  cover configured `steps` for all five roles.
- AC-3: Every harness output reflects AC-1/AC-2 (OpenCode, Pi, Codex, Claude Code)
  with tests pinning: discovery roles lack `nextAction`/recommended default and carry
  the evidence-only rule; Oracle/Worker/Designer unchanged; fixtures updated. Committed
  generated assets (`plugin/**`, `pi/**`, including Pi provenance hashes) are
  refreshed by root with `pnpm run build` after the worker finishes, so
  `generate-integration-packages.test.ts` equality passes.
- AC-4: Repository instructions: `AGENTS.md` subagent return contract and line 161,
  `docs/agent/agents-and-delegation.md`, `docs/agent/task-template.md` distinguish
  discovery roles (facts only) from Oracle/Worker/Designer, using the
  progressive-context-router skill.
- AC-5: Durable delta below applied at archive; root `check:ci`, `typecheck`,
  `build`, `pnpm test` (known four missing-sibling failures only) pass.

## Clarifications

- Scope: only Explorer and Librarian (user, 2026-10-01).
- Open questions: return the question and the options with their facts, without
  recommending (user, 2026-10-01).

## Decisions

- Represent per-role return fields in the canonical pack (single source) rather than
  per-harness string edits, so all four harnesses stay consistent.
- Plan review round 1 (fresh Oracle): REJECT — step budget asked discovery roles for a
  next target; worker-owned full-test milestone preceded required asset generation.
  Repaired in AC-2/AC-3, Tasks and Plan (root regenerates assets).
- Keep `openQuestions` for discovery roles; it carries options and facts, no default.
- The ADDED requirement does not overlap existing ones: `Preserve the six-role contract`
  only requires preserving whatever return contracts exist, and `Expose routable role
  contracts` covers roster selection; neither defines discovery-role output content.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Keep discovery roles evidence-only** — Explorer and Librarian MUST return facts with evidence, verification, risks and open questions only, MUST NOT recommend fixes, designs, defaults or next actions, and MUST escalate an open question it cannot settle as the question with its possible options and the facts for each option without choosing one. Oracle judgment and Worker/Designer implementation handoffs MUST remain unchanged, and every harness MUST render the same role-specific return contract.
  - GIVEN an Explorer or Librarian assignment that ends with findings and an open choice it cannot settle; WHEN the specialist returns in any harness; THEN its return lists facts and the open question with options and their facts, contains no recommendation or next action, and root decides or asks Oracle.

## Plan

1. Worker (sole writer of `src/agents/**`, `src/harness/**`): test-first per-role
   return contract in `agent-pack.ts`, prompt sections incl. step budget,
   routing/delegation guidance, fixtures and tests for all harnesses; focused checks
   only (generated-asset equality is expected to fail until step 3).
2. Root (parallel, disjoint files; progressive-context-router skill): `AGENTS.md`,
   `docs/agent/agents-and-delegation.md`, `docs/agent/task-template.md`.
3. Root (after worker): `pnpm run build` to refresh committed `plugin/**` and `pi/**`
   generated assets and Pi provenance hashes; review that the asset diff is limited to
   the contract lines.
4. Root: full checks, commit, fresh Oracle verification, archive, merge.

## Tasks

- [ ] AC-1: per-role return contract
  - Outcome: discovery roles return five fields; others six; rendering truthful
  - Known entrypoints and skill paths: `src/harness/core/agent-pack.ts:280,377,414`, `src/agents/prompt-sections.ts:260,295,357`, tdd skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Exploration, Clarifications
  - Dependencies: none
  - Output: code + tests
  - Owner: worker
  - Writes: `src/agents/**`, `src/harness/**`
  - Interface boundaries: role names, permissions and other prompt sections unchanged
  - Focused check and PASS evidence: `prompt-rendering`, `agent-routing`, `agent-pack` tests assert per-role fields; targeted vitest green
  - Return milestone: focused tests green
  - Stop / reassessment: the contract array is consumed by a public/config interface that requires one shared list
- [ ] AC-2: evidence-only rule and blocked questions
  - Outcome: discovery prompts carry the rule; no recommended default for them
  - Known entrypoints and skill paths: `src/agents/prompt-sections.ts:400,409,458`, `src/agents/explorer.ts`, `src/agents/librarian.ts`, tdd skill
  - Inputs: AC-1
  - Dependencies: AC-1 (same writer)
  - Output: code + tests
  - Owner: worker
  - Writes: `src/agents/**`
  - Interface boundaries: Oracle/Worker/Designer wording unchanged
  - Focused check and PASS evidence: rendering tests for Pi and non-Pi dialects of all five roles, with and without configured `steps`
  - Return milestone: tests green
  - Stop / reassessment: none
- [ ] AC-3: harness outputs and fixtures
  - Outcome: four harness renderings reflect AC-1/AC-2
  - Known entrypoints and skill paths: `src/harness/adapters/{opencode,pi,codex,claude-code}.ts`, `src/harness/__fixtures__/**`
  - Inputs: AC-1, AC-2
  - Dependencies: AC-2
  - Output: tests/fixtures
  - Owner: worker (source/fixtures); root (generated `plugin/**`, `pi/**` via `pnpm run build`)
  - Writes: `src/harness/**`; root: `plugin/**`, `pi/**`
  - Interface boundaries: unrelated generated content unchanged
  - Focused check and PASS evidence: adapter/fixture and agent/harness focused tests green; diff of fixtures limited to contract lines
  - Return milestone: focused tests green (generated-asset equality left to root build)
  - Stop / reassessment: fixture drift beyond the contract lines
- [ ] AC-4: repository instructions
  - Outcome: instructions distinguish discovery roles from others
  - Known entrypoints and skill paths: `AGENTS.md:161,233-234`, `docs/agent/agents-and-delegation.md:68-69`, `docs/agent/task-template.md:58,60`, progressive-context-router skill `C:\Users\EremesNG\.pi\agent\skills\progressive-context-router\SKILL.md`
  - Inputs: Clarifications
  - Dependencies: none
  - Output: docs
  - Owner: root
  - Writes: those three files
  - Interface boundaries: other instruction content unchanged
  - Focused check and PASS evidence: text review; `pnpm run check:ci`
  - Return milestone: docs committed
  - Stop / reassessment: none
- [ ] AC-5: checks and delta
  - Outcome: full checks pass; delta ready
  - Known entrypoints and skill paths: thoth-archive skill
  - Inputs: AC-1..AC-4
  - Dependencies: AC-3, AC-4
  - Output: check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: root check:ci, typecheck, build, test
  - Return milestone: fresh Oracle PASS
  - Stop / reassessment: failures beyond the known four

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: PENDING

The user explicitly selected Review plan with Oracle. Round 1 returned [REJECT] (step
budget next target; asset regeneration ordering), repaired here; round 2 fresh Oracle
subtask_thoth-oracle_1790870114788_f7752c4b returned [OKAY]. Caution: generated-asset
review must allow expected Pi provenance-hash changes.

## Verification

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:315d62b8e1486723de465ea010dc43b2ff6eed838bf623e5bf090c477eaa4391

## Closeout

**Archive**: PENDING
