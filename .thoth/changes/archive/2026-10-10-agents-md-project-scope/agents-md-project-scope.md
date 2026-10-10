# Change: agents-md-project-scope

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- User decision (2026-10-10): `AGENTS.md` is this repository's development
  instructions, not part of the product. It must not contain or replicate
  anything the product contains. The product is the multi-agent
  plugin/extension/package that provides an SDD ecosystem in the harness. The
  same criterion applies to `docs/agent/`.
- Product policy owners (verified by Explorer): `src/harness/core/agent-pack.ts`
  (roles, orchestration/ownership/task-shaping policies, return contract,
  verification protocol); `src/agents/prompt-sections.ts`;
  `src/agents/prompt-dialects.ts`; `src/harness/core/sdd.ts`;
  `src/harness/core/memory-governance.ts`; `skills/**` (thoth-sdd, phase
  references, change template, validator, archive, init, constitution,
  plan-reviewer).
- `AGENTS.md` (260 lines): PROJECT content = purpose routing (10–11),
  progressive context (15–22), CodeGraph/webstorm-index protocol (31–48), map
  (50–63), commands (65–80), constraints opening (82–86), local closeout gate
  (215–226), PR/sharp edges (228–238, Codex installer mechanics are product
  description), definition of done (253–260). PRODUCT-RULE content = 23, 27–30,
  87–205, 209–214, part of 217, 240–251. No product rule lacks a product owner.
- `docs/agent/` (11 files): PRODUCT-RULE blocks in
  `agents-and-delegation.md` (14–119, 123–142, parts of 167–257),
  `architecture.md` (141–149, 166–168), `sdd-and-skills.md` (26–104, 113–114,
  119–120), `memory-governance.md` (20–36), `task-template.md` (26–42, 58–64),
  `runtime-integrations.md` (19–21), operator-facing imperatives in
  `cli-installation.md` (28, 91–100, 160–169) and `harness-packaging.md`
  (98–99, 113–114, 193–194, 259–260, 322, 419–420). `testing.md` and most of
  `index.md` are PROJECT. `routing-cases.json` is developer evaluation fixtures.
- `docs/agent/index.md:51–74` presents historical root-size measurements as
  "Current" (documented 8,465–9,855 chars vs measured 13,473–16,487) and lists
  obsolete `quick`/`deep` roles.
- Test coupling: `src/harness/core/agent-routing.test.ts:101–129,375–415`
  reads routing JSON, `AGENTS.md` and delegation docs and asserts `AGENTS.md`
  contains product-policy wording; `src/harness/provider-boundary.test.ts:9–28,
  77–92,149–194` reads `AGENTS.md` plus nine agent-context files through a
  closed manifest with aggregate content assertions. Both run in `pnpm test`.
- Incoming links/anchors to preserve: `docs/agent/testing.md#local-closeout-gate`,
  `harness-packaging.md#release-flow`, four Pi UI/provider anchors used by
  `index.md`/`architecture.md`; `docs/development.md:25,78,83–84`;
  `docs/tmux-integration.md:283`.
- No active `.thoth/specs/` capability or constitution clause references
  `AGENTS.md` or `docs/agent/`.

## Intent

Repository instructions (`AGENTS.md`, `docs/agent/`) describe only how to
develop thoth-agents. Product policy lives solely in product sources; developer
docs may describe product behavior and point to its owner, but never restate it
as instructions for the working agent.

## Non-goals

- No change to product sources or behavior (`src/` runtime code, `skills/`,
  generated plugin/Pi assets), including the "Proceed without review" /
  "Implement directly without review" wording drift (separate later change).
- No new docs files, no relocation of removed rules into new files.
- No change to `docs/agent/routing-cases.json` semantics beyond path/anchor fixes.
- No changes outside `AGENTS.md`, `docs/agent/`, the two coupled tests, and
  incoming links in `docs/development.md` / `docs/tmux-integration.md`.

## Acceptance

- AC-1: `AGENTS.md` contains only project development instructions and no
  restatement of product policy; it states in one short pointer that the working
  workflow comes from the installed product and where product policy is owned.
- AC-2: Every `docs/agent/` PRODUCT-RULE or MIXED block is removed or rewritten
  as description of product behavior with a pointer to its owning source;
  PROJECT and PRODUCT-DESCRIPTION content is preserved.
- AC-3: `docs/agent/index.md` has no stale "Current" measurements or obsolete
  roles, still routes every remaining doc, and all preserved anchors and
  incoming links resolve.
- AC-4: No test asserts product policy inside `AGENTS.md` or `docs/agent/`; a
  regression test asserts `AGENTS.md` does not restate representative product
  policy markers; product-policy assertions on product sources remain; focused
  tests, `pnpm run check:ci` and `pnpm run typecheck` pass.
- AC-5: The diff touches no product source or generated asset.

## Clarifications

- Resolved by user (2026-10-10): `AGENTS.md` must not contain or replicate
  product content; apply the same criterion to `docs/agent/`.

## Decisions

- D1: Removed product rules are deleted from repository instructions, not
  relocated; the installed product delivers them and product sources own them.
- D2: `AGENTS.md` keeps one sentence noting that this repository is developed
  with thoth-agents installed, so its workflow (SDD, delegation, verification)
  comes from the product, with pointers to the owning sources; `.thoth/` is this
  repository's own governance managed through the product skills.
- D3: Operator install/upgrade procedures in `cli-installation.md` and
  `harness-packaging.md` stay as product documentation, phrased descriptively
  (what the procedure is), not as instructions to the working agent.
- D4: `index.md` drops hard-coded prompt-size figures and the obsolete roles;
  where size matters it points to the owning cap assertions in
  `src/agents/prompt-rendering.test.ts`.
- D5: `docs/agent/task-template.md` keeps its project sections and replaces the
  unit contract with a pointer to `skills/thoth-sdd/templates/change.md` and
  `AGENT_RETURN_CONTRACT`.
- D6: Tests are updated first (red): the AGENTS-product-wording assertions are
  replaced by a guard that `AGENTS.md` omits representative product-policy
  markers; doc-content assertions that encode product policy are moved to or
  already covered by product sources; manifest reads follow the kept files.
- D7: Repository development constraints that are not product policy remain in
  `AGENTS.md` (scope/unrelated edits, backward-compatibility stance, commands,
  closeout gate, CodeGraph/webstorm-index usage, PR, sharp edges, done).

## Durable deltas

- None.

## Plan

Test-first. U0 rewrites the two coupled tests to the new contract and confirms
they fail against current docs for the expected reason. U1 (AGENTS.md, index.md,
task-template.md, incoming links) and U2 (remaining docs/agent files) then run in
parallel on disjoint files using `progressive-context-router` guidance. Root
runs the focused tests, `pnpm run check:ci`, `pnpm run typecheck`, a link/anchor
check, and a diff scope check, then requests a fresh Oracle verification.

## Tasks

- [x] AC-4: U0 — Coupled tests express the new repository-instruction contract and fail for the expected reason.
  - Outcome: updated `agent-routing.test.ts` and `provider-boundary.test.ts`
  - Known entrypoints and skill paths: src/harness/core/agent-routing.test.ts:101-129,375-415; src/harness/provider-boundary.test.ts:9-28,77-92,149-194; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: this record's Exploration and Decisions D1, D6
  - Dependencies: none
  - Output: tests that assert AGENTS.md omits representative product-policy markers and no longer require product policy in AGENTS.md/docs; red run evidence
  - Owner: thoth-worker
  - Writes: src/harness/core/agent-routing.test.ts, src/harness/provider-boundary.test.ts
  - Interface boundaries: product-source assertions remain intact; no src runtime edits
  - Focused check and PASS evidence: `pnpm vitest run src/harness/core/agent-routing.test.ts src/harness/provider-boundary.test.ts` fails only on the new AGENTS guard
  - Return milestone: red evidence plus the list of markers used
  - Stop / reassessment: an assertion that cannot be satisfied without editing product sources
- [x] AC-1: U1 — AGENTS.md, index.md, task-template.md and incoming links follow the project-only contract.
  - Outcome: project-only AGENTS.md, refreshed router, reduced task template, resolving links
  - Known entrypoints and skill paths: AGENTS.md; docs/agent/index.md; docs/agent/task-template.md; docs/development.md; docs/tmux-integration.md; C:/Users/EremesNG/.pi/agent/skills/progressive-context-router/SKILL.md
  - Inputs: accepted U0 tests; Decisions D1, D2, D4, D5, D7
  - Dependencies: U0 accepted
  - Output: edited files
  - Owner: thoth-worker
  - Writes: AGENTS.md, docs/agent/index.md, docs/agent/task-template.md, docs/development.md, docs/tmux-integration.md
  - Interface boundaries: preserve anchors used elsewhere; no product sources
  - Focused check and PASS evidence: U0 tests pass for AGENTS.md; links in edited files resolve
  - Return milestone: diff summary and check output
  - Stop / reassessment: a kept rule with no clear project/product classification
- [x] AC-2: U2 — Remaining docs/agent files describe rather than restate product policy.
  - Outcome: rewritten agents-and-delegation, architecture, sdd-and-skills, memory-governance, runtime-integrations, cli-installation, harness-packaging
  - Known entrypoints and skill paths: docs/agent/{agents-and-delegation,architecture,sdd-and-skills,memory-governance,runtime-integrations,cli-installation,harness-packaging}.md; C:/Users/EremesNG/.pi/agent/skills/progressive-context-router/SKILL.md
  - Inputs: accepted U0 tests; Decisions D1, D3; Exploration line ranges
  - Dependencies: U0 accepted
  - Output: edited files
  - Owner: thoth-worker
  - Writes: the seven listed docs/agent files
  - Interface boundaries: preserve `#release-flow`, Pi UI/provider anchors and routing-case paths
  - Focused check and PASS evidence: U0 tests pass; anchors referenced by index.md, architecture.md and routing-cases.json resolve
  - Return milestone: diff summary per file and check output
  - Stop / reassessment: content whose product owner cannot be identified
- [x] AC-3: U3 — Router, links, scope and local closeout verified.
  - Outcome: closeout evidence
  - Known entrypoints and skill paths: docs/agent/index.md; this record
  - Inputs: accepted U1 and U2
  - Dependencies: U1, U2 accepted
  - Output: check results recorded in Verification
  - Owner: root
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: focused tests, `pnpm run check:ci`, `pnpm run typecheck` exit 0; `git diff --stat` touches only owned paths
  - Return milestone: before final Oracle request
  - Stop / reassessment: failures attributable to product sources
- [x] AC-5: U4 — Diff scope confirms no product source or generated asset changed.
  - Outcome: scope evidence
  - Known entrypoints and skill paths: git diff
  - Inputs: accepted U1, U2
  - Dependencies: U1, U2 accepted
  - Output: path list in Verification
  - Owner: root
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: `git diff --name-only` lists only owned paths
  - Return milestone: with U3
  - Stop / reassessment: unexpected path changes

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

User said "Adelante" on 2026-10-10 after agreeing to apply the criterion to AGENTS.md and docs/agent/.
User explicitly selected Oracle plan review; fresh Oracle returned [OKAY] with no blockers (risk noted: negative markers cannot prove full semantic compliance; final review must inspect rewrites). Prior explicit authorization stands.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 81dcb862556b853cb06fb5951da99f8e916c33a1baefbb7ab8648a87a803427e

- AC-1: PASS | AGENTS guard in agent-routing.test.ts; diff review | AGENTS.md 260 -> 124 lines, guard passes
- AC-2: PASS | diff review of 7 docs/agent files | net -276 lines; owner/test pointers; operator procedures descriptive
- AC-3: PASS | link/anchor check (U1 46, U2 41 links) | all resolve; index.md stale measurements and quick/deep roles removed
- AC-4: PASS | vitest agent-routing, provider-boundary, agent-pack, prompt-rendering; check:ci; typecheck | 147/147 passed; check:ci exit 0; tsc exit 0; git diff --check exit 0
- AC-5: PASS | git status --short | only AGENTS.md, 9 docs/agent files, docs/tmux-integration.md, 2 test files, this record
- Source: AGENTS.md | sha256:ec371573eba2bd89dafec3de63c17ec0001153ea864c431a2a24940471e43d38
- Source: docs/agent/agents-and-delegation.md | sha256:1156147b58563b769da978db284ad4189678481e2a31bab2c48fcd7705b634a5
- Source: docs/agent/architecture.md | sha256:14d241dfbe87bb819abafe7ab1d03e21d6f0b3d8214bbeba4814a6d3bb4cfdf7
- Source: docs/agent/cli-installation.md | sha256:57a0fa94cfed6beb6f606c838bac3adec7e06bb3f93cc419495e39ab53d52df0
- Source: docs/agent/harness-packaging.md | sha256:a81ebdf6dd471cbcf900d37357561b06e44d9feee8aa7f12734e3b781e01fd93
- Source: docs/agent/index.md | sha256:d0f6809dbe64d85118f41f79e67f1816c50d7b8334ea330edbbd55eb596d1d15
- Source: docs/agent/memory-governance.md | sha256:ed502c67b464a489ddde4105d0db7c9851c4ac12ce2373bc1270e922c847edab
- Source: docs/agent/runtime-integrations.md | sha256:c07f22a9e7b2b021407ed36ab5adf15ec5700c92038483260317da58d3783829
- Source: docs/agent/sdd-and-skills.md | sha256:3cc1f07556b772edc1585a2d8c1d648ae57461790567e9caecdba81306697976
- Source: docs/agent/task-template.md | sha256:b3d671cc01dc69d0baf4b9707375e4c2baf16b2c0869ff8244c4a4361bb6e63a
- Source: docs/tmux-integration.md | sha256:f79e059e60e5e85508a571ab35c2f4a4e4d58e7735c743886561fdce254accbc
- Source: src/harness/core/agent-routing.test.ts | sha256:b4aadbbc826670de6bf79bea4ceb06d540aab6abf8e296f0d85e8ff8d99de5db
- Source: src/harness/provider-boundary.test.ts | sha256:99d98be9984811e3db3aac853cad0cb2e5dd5853b0c8ed95e5d4b5393b36cab3

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
