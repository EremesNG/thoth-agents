# Change: pi-behavioral-evals

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Comparison with addyosmani/agent-skills (`1be8e341`, 2026-10-10): its CI runs
  structural and lexical routing checks only; behavioral runs are manual
  (`claude -p` stream-json executor plus an LLM judge, no turn or cost caps)
  or native `claude plugin eval` (deterministic `tool_used`/`regex` graders plus
  LLM judges, plugin/no-plugin ablation). Pi's own repository has a private
  `@earendil-works/pi-evals` harness that runs real `AgentSession`s under
  `vitest-evals` and asserts tool traces.
- Local evaluation assets today: `docs/agent/routing-cases.json` (v9, 29
  cases) consumed by `src/harness/core/agent-routing.test.ts` through regexes
  over rendered OpenCode/Codex/Claude prompts (Pi not included); no test runs a
  model against the four target contracts.
- Contract owners: plan review vs authorization — `src/harness/core/sdd.ts`
  `SDD_PHASE_PROTOCOLS`, `getSddWorkflowContract()`; writer self-approval and
  fresh Oracle — `src/harness/core/agent-pack.ts` `ORCHESTRATION_POLICY`,
  `VERIFICATION_PROTOCOL`, `sdd.ts` `getSddFinalVerificationDecision()`;
  delegated memory scope — `src/harness/core/memory-governance.ts`
  `getRoleMemoryGovernance()`, `renderMemoryGovernanceInstructions()`;
  small-change proportionality — `sdd.ts` `classifySddChange()`.
- Pi SDK 1.0.2 seams (pinned in root and pi-subagents): `DefaultResourceLoader`
  with `noExtensions` + `additionalExtensionPaths`, `createAgentSession`,
  `ModelRuntime`, `SessionManager.inMemory`, `SettingsManager.inMemory`,
  `customTools`, `session.subscribe` (`tool_execution_*`, `message_end` with
  `usage.cost.total`, `turn_start`/`turn_end`), `session.abort()`. Production
  root instructions are injected by `src/pi.ts` `thothAgentsPiExtension()` in
  `before_agent_start` (root `package.json` `pi.extensions: ./dist/pi.js`).
- Real subagents: `pi-packages/pi-subagents` extension registers
  `subagent_run`/`status`/`result`/`cancel`; child cost is aggregated on the
  extension bus channel `thoth:subagents:usage` (`{ totalCost, runCount }`,
  `pi-packages/pi-core/src/subagents.ts`); child turns/tool uses appear in task
  `usage`/`runtime_metrics` of tool results; `session_shutdown` closes the
  manager; `subagent_cancel` cancels one task. Parent abort alone is not proven
  to stop background children.
- `ask_user_question` (`@thoth-agents/pi-questions-user`) returns `no_ui`
  without UI and production removes it from active tools in non-UI sessions.
- Offline fixture provider: `pi-packages/pi-subagents/test/runner/fixtures/provider-fixture.ts`
  (`streamSimple`, `https://fixture.invalid`, zero cost).
- Existing Pi cap packages (`pi-turn-limit`, `@bacnh85/pi-budget`, others) are
  experimental, parent-only or non-aborting; none caps child cost.
- Governance: constitution principles 1–4 and `adaptive-sdd` spec forbid
  per-change process scripts, wrappers and evidence generators; `project-tooling`
  spec allows project verification scripts through pnpm;
  `external-required-skills` keeps QA executables project-owned. thoth-mem
  tools are externally installed and not guaranteed in a session.

## Intent

Give thoth-agents a repository-owned evaluation suite for four product
contracts: deterministic contract cases that run with the normal test suite, and
an opt-in live Pi evaluation that drives the real product (root extension and
real subagents) with a real model under turn, cost and time caps, grading tool
calls deterministically without an LLM judge.

## Non-goals

- No change to product behavior, prompts or skills.
- No LLM-as-judge grading, no plugin/no-plugin ablation, no other harness live
  runs (OpenCode, Codex, Claude) in this change.
- No live model calls in CI; no stored result reports or evidence files.
- No new published package; caps live inside the evaluation harness.
- No fake subagents (user accepted real subagents under caps). Only the
  question tool is scripted because non-UI sessions cannot answer it.

## Acceptance

- AC-1: A versioned contract case file covers the four contracts with positive
  and negative cases; a deterministic test validates its schema and checks each
  case against the owning product functions and rendered root prompts for all
  four harnesses (including Pi), running in `pnpm test`.
- AC-2: An evaluation harness creates isolated Pi SDK sessions (temp workspace
  and agent dir; only auth copied; explicit extensions: thoth root extension and
  real pi-subagents), records parent tool calls and child task metrics, scripts
  `ask_user_question` answers per case, and enforces parent turn, combined
  parent+child USD cost and wall-time caps by aborting and shutting down the
  session; a cap hit yields an INCONCLUSIVE result, never PASS. Offline
  self-tests using a synthetic provider prove capture, scripting and every cap
  path and run in `pnpm test`.
- AC-3: Live cases for the four contracts assert deterministic tool-call
  expectations and run only through `pnpm run eval:pi` with an explicit
  `THOTH_EVAL_MODEL`; without it the command fails fast with guidance, and
  normal tests never call a real model.
- AC-4: `docs/agent/testing.md` describes the suite (deterministic vs live,
  command, environment variables, caps, cost risk, how to read results), and
  the router routes to it.
- AC-5: Local closeout passes (focused tests, `pnpm run check:ci`,
  `pnpm run typecheck`, `pnpm run build` if packaging inputs change); one live
  run is executed only with explicit user consent and its outcome reported as
  findings, not as a change gate.

## Clarifications

- Resolved by user: deterministic cases in CI plus optional live evaluation
  with deterministic tool-call grading (no LLM judge).
- Resolved by user: live harness is Pi; turn/cost caps are sufficient; real
  subagents are acceptable.

## Decisions

- D1: Caps are implemented inside the evaluation harness, not as a published
  package or third-party dependency: parent `turn_start` count, parent
  `message_end` `usage.cost.total` plus `thoth:subagents:usage` `totalCost`,
  and wall time. Lifecycle is explicit: the harness emits the SDK session
  start and, on breach or case end, calls `session.abort()`, explicitly emits
  `session_shutdown` (as the pi-subagents real-SDK fixtures do, because SDK
  1.0.2 `dispose()` does not emit it) so the subagent manager cancels and awaits
  children, then disposes. Cleanup is idempotent and bounded by a timeout. An
  offline self-test proves a running real child is terminated after a cap hit.
  Overshoot by the in-flight
  request is accepted and documented. Missing model pricing (zero cost) is reported as
  a warning; turn and time caps still apply.
- D2: Defaults (overridable by env): 30 parent turns, USD 1.00 per case,
  USD 5.00 per run, 10 minutes per case, 1 trial per case.
- D3: Isolation: temporary git workspace per case built from in-repo fixtures,
  temporary agent dir with only the user's Pi auth copied read-only, in-memory
  settings and session, `noExtensions` with explicit extension paths. Because
  `src/pi.ts` and child resource loading resolve global paths from
  `PI_CODING_AGENT_DIR` or the home directory independently of the SDK
  `agentDir`, the harness binds `PI_CODING_AGENT_DIR` and any subagent
  history/config locations to temporary paths before loading extensions and
  restores them afterwards; evaluation files run sequentially (no concurrent
  environment mutation). A self-test with a sentinel operator directory proves
  operator state is unchanged. The operator's `~/.pi/agent` is never written.
- D4: Grading is deterministic over recorded tool calls, written paths and
  question payloads; each case yields PASS, FAIL or INCONCLUSIVE with reasons,
  printed to the console; no report files.
- D5: Layout: evaluation sources and fixtures under a top-level `evals/`
  directory; deterministic and offline tests run in the root `pnpm test` via
  the root vitest include; live cases use a separate vitest config invoked by
  `pnpm run eval:pi`. The production `tsconfig.json` (`rootDir: ./src`) is not
  changed; a separate `tsconfig.evals.json` (noEmit) typechecks `evals/` and the
  `typecheck` script runs it too. The harness loads extension source entries
  (`src/pi.ts`, `pi-packages/pi-subagents/index.ts`) through Pi's TypeScript
  extension loader, so no prior build is needed in CI. File names inside this layout
  follow existing repository naming conventions.
- D6: Initial live cases (one trial each by default):
  small change (no `.thoth/changes/` write, no plan-review question);
  substantial ready (plan-review question offers both canonical options before
  any implementation write; with review selected and `[OKAY]`, no implementation
  write without separate authorization);
  verification closeout on a seeded implemented record (a `thoth-oracle`
  `subagent_run` precedes any PASS verdict write; no self-approval);
  delegated discovery (each `subagent_run` task states a MEMORY scope of none,
  recall or observe). Root `mem_*` tool assertions are out of scope because the
  provider is externally installed. Graders require positive progress (no PASS
  on inactivity), detect writes from a workspace snapshot diff (covering bash and
  child writes, not only the write tool), and for closeout correlate a completed
  `thoth-oracle` task result with any later verdict write.
- D7: The `routing-cases.json` consumer is not rewritten; Pi is added to the
  rendered-surface checks in the new contract test only.

- D8: (Follow-up after structured-specialist-results, commit 13de34e.) Graders
  consume specialist results only through the shared validator
  (`skills/thoth-sdd/scripts/validate-result.mjs` `validateResult`): Oracle
  approval = a valid envelope with the expected review kind and verdict
  (plan-review OKAY, final-verification PASS); invalid or missing envelope →
  INCONCLUSIVE when no root approval write followed, FAIL when a root approval
  write followed. The free-text parsers `evals/pi/oracle-verdict.ts` and the
  root-approval detector are replaced or reduced accordingly; envelope validity
  per specialist task is reported.
- D9: Two cases deferred from pi-lean-skill-catalogs join the live set: plan
  review where the root forwards no skill path and the Oracle must still return
  a valid plan-review envelope (catalog-driven skill use), and a trusted project
  designer skill that the designer child must read without the root forwarding
  it. Eval sessions configure the repository thoth-agents package so children
  discover its skills like production.
- D10: Child discovery setup for D9: the harness writes an eval-owned temporary
  `agent/settings.json` declaring the repository thoth-agents package by
  absolute local path with package extensions disabled (the root extension is
  still loaded explicitly), and trusts only the disposable case workspace;
  parent `additionalSkillPaths` and in-memory packages are not relied on. An
  offline real-SDK self-test proves a real child sees repository skills and the
  trusted project skill in its effective prompt, and that untrusted workspaces
  do not.
- D11: Child read evidence for D9: a claimed read or a valid envelope is never
  read evidence. The harness captures child tool calls with task attribution
  from native child-session data before cleanup (foreground task tool results
  or the child's nested session/transcript), and grading requires a successful
  `read` of the expected SKILL.md path by the designer task and no forwarded
  path in the root's assignment for the no-forwarding cases; negative offline
  traces cover no read, failed read, read by another task, and forwarded path.

## Durable deltas

- `ADDED project-tooling` **Opt-in live behavioral evaluations** — The repository provides deterministic contract evaluation cases in the normal test suite and an opt-in live Pi evaluation command that is capped by turns, cost and time, grades tool calls deterministically and never runs in CI.
  - GIVEN a developer without `THOTH_EVAL_MODEL`; WHEN they run `pnpm test` or `pnpm run eval:pi`; THEN no real model is called and the live command explains the required configuration .

## Plan

Test-first throughout. U1 builds the case file, schema and deterministic test.
U2 builds the harness with offline self-tests on a synthetic provider. U3 adds
the live cases and command on top of U1's case file and U2's harness. U4
documents the suite. Root runs closeout, asks the user before any live run, then
requests a fresh Oracle verification.

## Tasks

- [x] AC-1: U1 — Contract case file, schema and deterministic contract test.
  - Outcome: versioned case file and a passing deterministic test in `pnpm test`
  - Known entrypoints and skill paths: src/harness/core/sdd.ts; src/harness/core/agent-pack.ts; src/harness/core/memory-governance.ts; src/harness/adapters/pi.ts renderPiRootInstructions; src/harness/core/agent-routing.test.ts renderRoutingSurfaces; vitest.config.ts; tsconfig.json; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: this record (Exploration, D5, D7)
  - Dependencies: none
  - Output: evals/ case file + schema + test; root vitest include, tsconfig.evals.json and typecheck script updates
  - Owner: thoth-worker
  - Writes: evals/ (case file, schema, deterministic test), vitest.config.ts, tsconfig.evals.json, package.json typecheck script, biome.json if needed
  - Interface boundaries: read-only use of product exports; no product source edits
  - Focused check and PASS evidence: red then green run of the new test; typecheck exit 0
  - Return milestone: case schema and per-contract case list
  - Stop / reassessment: a contract not checkable through exported product functions or rendered prompts
- [x] AC-2: U2 — Isolated, capped Pi SDK evaluation harness with offline self-tests.
  - Outcome: harness library and passing offline self-tests in `pnpm test`
  - Known entrypoints and skill paths: src/pi.ts thothAgentsPiExtension and its global path resolution (lines ~91-95, 159-174); pi-packages/pi-subagents/src/extension/subagents-extension.ts session_shutdown (~229-238); pi-packages/pi-subagents/index.ts; pi-packages/pi-subagents/test/runner/providers-real-sdk.test.ts; pi-packages/pi-subagents/test/runner/background-tasks-real-sdk.test.ts; pi-packages/pi-subagents/test/runner/fixtures/provider-fixture.ts; pi-packages/pi-core/src/subagents.ts; pi-packages/pi-questions-user/src/schema.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: this record (D1–D5); accepted U1 evaluation config (vitest include, tsconfig.evals.json)
  - Dependencies: U1 accepted
  - Output: evals/pi harness (session factory, caps, recorder, scripted question tool, fixture workspace builder, grading helpers) and self-tests
  - Owner: thoth-worker
  - Writes: evals/pi/ harness and self-test files, root package.json devDependencies only if strictly needed, pnpm-lock.yaml if so
  - Interface boundaries: consumes extension source entries per D5; never writes the operator's ~/.pi/agent
  - Focused check and PASS evidence: offline self-tests prove tool capture, scripted answers, turn cap, cost cap (parent and child-channel), time cap, INCONCLUSIVE outcome, termination of a running real child after a cap hit, and an unchanged sentinel operator directory; all without a prior build
  - Return milestone: harness API summary and self-test results
  - Stop / reassessment: child cost or shutdown not controllable through documented seams, or source extension entries not loadable without a build
- [x] AC-3: U3 — Live Pi contract cases and `eval:pi` command.
  - Outcome: four live cases runnable via `pnpm run eval:pi`, fail-fast without `THOTH_EVAL_MODEL`
  - Known entrypoints and skill paths: U1 case file; U2 harness; package.json scripts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted U1 and U2 outputs; D6
  - Dependencies: U1, U2 accepted
  - Output: live case files, separate vitest config, package.json script
  - Owner: thoth-worker
  - Writes: evals/pi live case files and fixtures, vitest live config, package.json scripts
  - Interface boundaries: live config excluded from `pnpm test` and CI
  - Focused check and PASS evidence: `pnpm run eval:pi` without the env var exits non-zero with guidance; the live cases execute end to end against the synthetic provider path or are type-checked; `pnpm test` does not collect them
  - Return milestone: case list with assertions and command behavior
  - Stop / reassessment: an expectation that cannot be graded from recorded tool calls
- [x] AC-4: U4 — Developer documentation and routing.
  - Outcome: testing guide section and router entry
  - Known entrypoints and skill paths: docs/agent/testing.md; docs/agent/index.md; C:/Users/EremesNG/.pi/agent/skills/progressive-context-router/SKILL.md
  - Inputs: accepted U3 output
  - Dependencies: U3 accepted
  - Output: edited docs
  - Owner: thoth-worker
  - Writes: docs/agent/testing.md, docs/agent/index.md
  - Interface boundaries: describe the project QA suite only; no product policy restatement (AGENTS.md guard)
  - Focused check and PASS evidence: links resolve; agent-routing and provider-boundary tests pass
  - Return milestone: diff summary
  - Stop / reassessment: none expected
- [x] AC-3: U6 — Envelope-based grading and catalog cases (follow-up).
  - Outcome: graders use the shared validator; two catalog cases with offline traces
  - Known entrypoints and skill paths: evals/pi/{live-cases,oracle-verdict,record-verdict,harness}.ts; evals/contracts.json; skills/thoth-sdd/scripts/validate-result.mjs; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: D8, D9, D10, D11; commits 13de34e and bfc4d49
  - Dependencies: none
  - Output: updated graders, cases, fixtures, tests, docs/agent/testing.md
  - Owner: thoth-worker
  - Writes: evals/**, docs/agent/testing.md
  - Interface boundaries: no product source edits
  - Focused check and PASS evidence: pure grader tests pass; root runs full evals suite
  - Return milestone: case list and grader rules
  - Stop / reassessment: child catalog cannot see repository skills in isolated sessions, or child tool calls cannot be captured with task attribution through native data
- [x] AC-5: U5 — Closeout checks and consented live run.
  - Outcome: local closeout evidence and, with user consent, one live run's findings
  - Known entrypoints and skill paths: this record
  - Inputs: accepted U1–U4
  - Dependencies: U1–U4 accepted
  - Output: Verification entries
  - Owner: root
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: focused tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` exit 0
  - Return milestone: before final Oracle request
  - Stop / reassessment: user declines the live run (record as not run)

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

User said "Muy bien, adelante con el siguiente paso" on 2026-10-10 for this evaluation slice.
User explicitly selected Oracle plan review. First fresh Oracle returned [REJECT] (3 blockers: child shutdown, global path isolation, build/typecheck prerequisites); root repaired D1, D3, D5, D6, U1, U2; a second fresh Oracle returned [OKAY]. Prior explicit authorization stands.

User explicitly selected Oracle plan review for the D8/D9 follow-up (2026-10-11): fresh Oracle REJECT (child settings discovery; child read observability) → D10/D11 added; second fresh Oracle OKAY (envelope: plan-review OKAY; root validated the envelope content with validate-result.mjs). Prior authorization ("adelante con el paso siguiente de las evaluaciones") stands.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1f574990aaffc2c8ab7afd36af167125847d743c7fbdf7a37cc7304ab9cbf393

- AC-1: PASS | evals/contracts.json + deterministic tests in pnpm test | four contracts, positive/negative cases, product exports and four harness root prompts (incl. Pi) checked
- AC-2: PASS | offline harness self-tests (synthetic provider) | capture, scripted answers, turn/cost(parent+child)/time caps, INCONCLUSIVE on cap, real child termination, settle wait, sentinel operator dir unchanged, parent skills loaded like production
- AC-3: PASS | pnpm vitest run evals 14 files 189/189 incl. offline traces for all six live cases, envelope grading via validate-result.mjs, task-attributed child reads; eval:pi without THOTH_EVAL_MODEL exits 1; live config not collected by pnpm test | live v5 (openai-codex/gpt-6.1-sol): verification-fresh-oracle PASS (Oracle final-verification PASS envelope), plan-review-no-forwarded-skills PASS (plan-review OKAY envelope, no forwarded skill path), designer-project-skill PASS; live v4: plan-review-choice, memory-recall-bounded-reads, small-no-record PASS
- AC-4: PASS | docs/agent/testing.md eval section + index route | links resolve; routing/provider-boundary tests pass
- AC-5: PASS | check:ci, typecheck, build exit 0; consented live runs with openai-codex/gpt-6.1-sol | findings: v1 caps/CRLF grader defect; v2 small+memory PASS; v3 (parent skills) plan-review behaved correctly (grader label defect fixed), verification Oracle legitimately BLOCKED a defective fixture (fixture fixed); total live spend about USD 1.2 plus one cancelled run of unrecovered cost; v4/v5 live spend about USD 1.3
- Source: evals/contracts.json | sha256:265eeaf1f5760d9923ca5b9d3a776a92b8870916c3109ca4e86d0edd3ce780e5
- Source: evals/contracts.test.ts | sha256:14734fa769b09fd3cb62b87e0037e338aa849fd67e51998e242be32a0fabeb43
- Source: evals/contracts-schema.ts | sha256:0feb5a8a4da30896a32e589af92ea6313a3c5669bd9bd8754452c6793318379d
- Source: evals/pi/catalog-grading.test.ts | sha256:7c565850a6fb95f66c1d2a90dea70f3f37e62af21b92e1cfbc5b38abcf731e9d
- Source: evals/pi/child-catalog.test.ts | sha256:3cda1adadddc637db26a6b2d52088be16ce54052e47f0928aee96bd5d28d4dee
- Source: evals/pi/child-tools.test.ts | sha256:b1e05ebfceee09f678b559959adb9812f70f87b4665e858a05095e1c5f540c4a
- Source: evals/pi/child-tools.ts | sha256:f86ac53eeb28292bcb0ef17c8104fad4d801f5d0cbe2c509c39866f75fed1dc1
- Source: evals/pi/configuration.test.ts | sha256:cee7c42c985e21c540590605e2ec02c189320f1ca0c55a9af5d68934ca819662
- Source: evals/pi/contracts.live.ts | sha256:8dd9ab445f7b57be9837cfc261a696a452fb42a4c4fed2a373ff1830823e7c1b
- Source: evals/pi/fixtures/closeout/.thoth/changes/greeting/greeting.md | sha256:77fb450ce395d6ae2bdd6b2d9f16739a659f9d6525705eed54d1fbd9907ff0cc
- Source: evals/pi/fixtures/closeout/.thoth/specs/greeting/spec.md | sha256:6dd395c099cd1b3e74081f5ee4ffe05002407b0bfbaa0256ba4ea0f4192b0f5f
- Source: evals/pi/fixtures/closeout/package.json | sha256:e6395000ea2db3fa5e5a3b3f20cf2e3b6d8cdc9bee26edcbcd1096382f4de03c
- Source: evals/pi/fixtures/closeout/README.md | sha256:c90b6159ed84e7c54dfa6343098ce849da21b255943c4e2a616e6eca5f1cf27c
- Source: evals/pi/fixtures/closeout/src/greeting.js | sha256:5082519391c0b8feb0ff94100026e6bdc1be8a40da76601db61974399776bb62
- Source: evals/pi/fixtures/closeout/test/greeting.test.js | sha256:d3d0b86be58f665ac488e3b70d9f6b6604c2e1cc5ce5cbab81f3fb50a4dd2021
- Source: evals/pi/fixtures/designer/.pi/skills/fixture-ui-guidelines/SKILL.md | sha256:b785b07f373de8ac3d1e5ebcbb44c1b78cd3176e76960d9c04fe1379c168bc4a
- Source: evals/pi/fixtures/designer/index.html | sha256:8aaef4029f27aaea8499e893cb886dfe35620fc78b71acfbf75290f7bb591c8a
- Source: evals/pi/fixtures/designer/README.md | sha256:4668c2cb9da4fff4c91628ddfd2c86ccdf6a054547a0eebe59ac8e7c10fe0ff9
- Source: evals/pi/fixtures/discovery/package.json | sha256:e6395000ea2db3fa5e5a3b3f20cf2e3b6d8cdc9bee26edcbcd1096382f4de03c
- Source: evals/pi/fixtures/discovery/README.md | sha256:c90b6159ed84e7c54dfa6343098ce849da21b255943c4e2a616e6eca5f1cf27c
- Source: evals/pi/fixtures/discovery/src/greeting.js | sha256:5082519391c0b8feb0ff94100026e6bdc1be8a40da76601db61974399776bb62
- Source: evals/pi/fixtures/discovery/test/greeting.test.js | sha256:d3d0b86be58f665ac488e3b70d9f6b6604c2e1cc5ce5cbab81f3fb50a4dd2021
- Source: evals/pi/fixtures/plan-review-no-forwarded-skills/package.json | sha256:e6395000ea2db3fa5e5a3b3f20cf2e3b6d8cdc9bee26edcbcd1096382f4de03c
- Source: evals/pi/fixtures/plan-review-no-forwarded-skills/README.md | sha256:c90b6159ed84e7c54dfa6343098ce849da21b255943c4e2a616e6eca5f1cf27c
- Source: evals/pi/fixtures/plan-review-no-forwarded-skills/src/greeting.js | sha256:5082519391c0b8feb0ff94100026e6bdc1be8a40da76601db61974399776bb62
- Source: evals/pi/fixtures/plan-review-no-forwarded-skills/test/greeting.test.js | sha256:d3d0b86be58f665ac488e3b70d9f6b6604c2e1cc5ce5cbab81f3fb50a4dd2021
- Source: evals/pi/fixtures/ready/package.json | sha256:e6395000ea2db3fa5e5a3b3f20cf2e3b6d8cdc9bee26edcbcd1096382f4de03c
- Source: evals/pi/fixtures/ready/README.md | sha256:c90b6159ed84e7c54dfa6343098ce849da21b255943c4e2a616e6eca5f1cf27c
- Source: evals/pi/fixtures/ready/src/greeting.js | sha256:5082519391c0b8feb0ff94100026e6bdc1be8a40da76601db61974399776bb62
- Source: evals/pi/fixtures/ready/test/greeting.test.js | sha256:d3d0b86be58f665ac488e3b70d9f6b6604c2e1cc5ce5cbab81f3fb50a4dd2021
- Source: evals/pi/fixtures/small/README.md | sha256:a2cb6cae1fcc3b62c9aac833541cc0eb6a843c9aaf680aba81895db1b426a165
- Source: evals/pi/fixtures/workspace/README.md | sha256:687012da78c626732c5fad3245627502567189ff4405e35b8b4c130db4f4748a
- Source: evals/pi/grading.test.ts | sha256:c9dc4266c66a511b0182b661a1d16288b85565da684c040447accc3291a01fe7
- Source: evals/pi/grading.ts | sha256:cd2a4b2960c9a88509eaa63c3c29cd2b473d5e3e33a973cd899533fb12f20205
- Source: evals/pi/harness.test.ts | sha256:0f3fd82ce4d7e3a443dfdd2a480abd1019440078ba212ac8a6393518f6277294
- Source: evals/pi/harness.ts | sha256:2d83ca6d207c05302d8d23d072c2ae4f06f138ce41d90ed2546a6dbc23bbe4db
- Source: evals/pi/live-cases.ts | sha256:a46c3403ab49fda0e18680cd20806f1759c4b43cb2193aa339f7237d4211bf62
- Source: evals/pi/live-graders.test.ts | sha256:d8e56651565f60b3e652df37a7d0fc409a1da09b6c9fe291297a47533dad2a32
- Source: evals/pi/oracle-verdict.test.ts | sha256:5e876d5b122f4807878edb48a9a623129a5136873562de555f980ad8b85b7347
- Source: evals/pi/oracle-verdict.ts | sha256:2f8486fbaf8e2f81e110874e52cf3707827f18b939c6791b5f5e67ba079c5572
- Source: evals/pi/record-verdict.test.ts | sha256:af2f08982f807c993a01e4168933ee193b00c64603e2e296669f42e6c90dfb90
- Source: evals/pi/record-verdict.ts | sha256:7a1242b8ae7b5a37c553553116214c623a81672a0e5edb0aa09841a248ff4d7d
- Source: evals/pi/reporting.test.ts | sha256:64eb2a7b6a78dc155625279c85a8f4d5d98d7f57483a8637074dccf5e4b751e0
- Source: evals/pi/reporting.ts | sha256:028f81bc508ebf6f89177d977f73d6fb8708b9cbbd245c2c80a2dd83d70d6a33
- Source: evals/pi/skills.test.ts | sha256:276e88187421653cc2f86c05821ff5e83ca16631b0a7f6dcca0b69286ac1d8c6
- Source: evals/pi/specialist-results.test.ts | sha256:f2f4907e7596603acdf12e8927d58f34a1e902147d5fb90b383df726c407cba1
- Source: evals/pi/specialist-results.ts | sha256:ba081b51ece07bb8232ffe1df2db0ccd0d43746ea517d4dd156c118242b12d85
- Source: evals/pi/synthetic-provider.ts | sha256:53989fc7cfe0bb3b482a5b3084f32d8b2d7c64b571fdcb639e9ce81787eb36a7
- Source: evals/pi/test-envelope.ts | sha256:802612f6cb8399702e0ebca3c817430b95e8e697223acbefdeec1e3d91eddeca
- Source: evals/pi/v4-regressions.test.ts | sha256:afbb2fb292755f90fc53cf36775d35976c56ec8840bc8811da1e6fb42cd350be
- Source: vitest.config.ts | sha256:9dcb5ed42b1b429cb12b64c61ef7cff588f3311350406897ecda847a0b99ac01
- Source: vitest.evals.live.config.ts | sha256:b3421f2af8195fcf13237123ca87c0986c9a4a311fb1a47080e5a5ab0c7e8cfc
- Source: tsconfig.evals.json | sha256:fe502105afb630fcbe07e67e04702493f0b875c2a6740003bfd37235557e0c16
- Source: package.json | sha256:87438f93fc5d931b4d6d18f72ae05a15ce6f7d29541ef8e8ccc35cf0e001b692
- Source: docs/agent/index.md | sha256:41c8ba90bdef71127e9b406b3555113d92427643317e88736cf64a4061df36a7
- Source: docs/agent/testing.md | sha256:1856961394cc47937a0a3eeb046f5ac458df1e0aca0e3a1ede6269eaedeac579
- Source: .thoth/specs/project-tooling/spec.md | sha256:d088677154ad7a53f375d5728929a101eabcbfc04ab1b6d4c95b6528027b5bc2

Follow-ups within the accepted scope, driven by consented live findings (root-approved worker questions): specialist model pins preserved with opt-in THOTH_EVAL_SPECIALIST_MODEL; settle wait for background children; bounded PathChange.content; stricter Oracle-PASS correlation; FAIL fails / INCONCLUSIVE skips with reason; THOTH_EVAL_VERBOSE console diagnostics; per-case caps in the live block (substantial cases 30 min, USD 1); CRLF-tolerant small-case grading with core.autocrlf=false fixtures; parent sessions load package and required external skills like production (THOTH_EVAL_SKILLS_DIR), children stay lean; BLOCKED/FAIL/REJECT Oracle verdicts parsed; plan-review label match accepts canonical "Implement (Recommended)"; verification fixture completed to the thoth-sdd record contract.
Repair after final review FAIL F1 (proximity-based Oracle PASS parsing): affirmative-only verdict parsing with negation guards, non-PASS verdicts parsed, negative traces added; wall-time cap moved before SDK setup. Fresh root run: evals 53/53, typecheck, check:ci, diff-check pass.
Second repair after re-verification FAIL (suffix negation and embedded/example [PASS] tokens still affirmative): fail-closed verdict grammar (line-start [PASS] or verdict/conclusion label with PASS value, no negation/qualifier in trailing text; conflicting or absent verdicts INCONCLUSIVE); counterexample traces added.
Third repair after re-verification FAIL (fenced examples, unlisted qualifiers, contradictory lines): pure SDK-free parser evals/pi/oracle-verdict.ts; fences/quotes ignored; exactly one verdict-like line required; PASS only for exact value PASS/[PASS]; FAIL/BLOCKED/REJECT/INCONCLUSIVE non-pass; else UNKNOWN; completed Oracle with UNKNOWN verdict followed by root PASS write grades INCONCLUSIVE; FAIL kept for PASS without prior completed Oracle, before Oracle completion, or after non-pass verdict; testing.md no longer describes lean-catalog specifics.
Fourth repair after re-verification FAIL (bulleted contradictions, indented examples, emphasized root PASS writes): normalized verdict-like lines counted everywhere; any inside fences/quotes/indented code or more than one → UNKNOWN; pure approval-write detector (evals/pi/record-verdict.ts) catches all markdown variants; offline session caps set below test timeouts (root raised session timeMs to 20 s and test timeouts to 180/60 s after 5 s caps made synthetic sessions hit the wall cap); environment lease released in finally. Root runs: evals 175/175 twice; typecheck pass.
Shared working tree also holds the separate active change pi-lean-skill-catalogs (pi-packages/pi-subagents, src/*, pi/agents, schema, docs/agent/harness-packaging.md); it is excluded from this change.

U6 follow-up (D8–D11) done: grading only via the shared validator; two catalog cases; native task-attributed child reads; eval-owned settings.json with repository package; grader defects found by live v4 fixed with trace regressions (background details.tasks correlation, seeded PASS instruction false positive, missing nested session path); closeout fixture made consistent (named export). Root checks: evals 189/189, typecheck, check:ci, diff-check pass.

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
