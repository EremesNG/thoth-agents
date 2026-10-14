# Change: structured-specialist-results

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: high

## Exploration

- Return contract today is prompt-only field lists: `src/harness/core/agent-pack.ts:388–408`
  (explorer/librarian `conclusion, evidence, verification, risks, openQuestions`;
  oracle/designer/worker add `nextAction`), rendered by
  `src/agents/prompt-sections.ts:369–379` ("Return a compact result with these
  fields:") and published to root at `:196–205`; routing descriptions at
  `agent-pack.ts:441–454`. No types, enums, verdict position or missing-field
  handling. Role rules in `ROLE_SPECIFIC_RULES` (`prompt-sections.ts:280–306`).
- Root acceptance is instruction-only (`prompt-sections.ts:181`,
  `agent-pack.ts:379`); Pi adapter separates termination from acceptance
  (`src/harness/adapters/pi.ts:49`).
- Approval vocabularies: `skills/plan-reviewer/SKILL.md:36` `[OKAY]`/`[REJECT]`
  without position; final verification PASS per
  `skills/thoth-sdd/references/phases/verify.md`; `skills/thoth-sdd/scripts/validate.mjs:538–550`
  checks root-written record fields, not the child output.
- Transport: Pi `SubagentTask.result` is a string; `subagent_result` returns text
  plus `details.task` and `details.full_result` (string); non-Pi engines'
  structured payloads are not established by the repository.
- Live evidence (pi-behavioral-evals): Oracles returned verdicts in at least five
  free-text formats; five independent verification rounds failed on free-text
  verdict parsing.
- Constraints: tests pin field arrays (`agent-pack.test.ts:227–241`,
  `prompt-rendering.test.ts:635–737`, `agent-routing.test.ts:357–363`); non-Pi
  prompt SHA snapshots (`prompt-rendering.test.ts:800+`); root caps OpenCode
  < 13,500, Codex/Claude < 15,000 (`:789–796`). Skills ship to every harness
  (`package.json` `files` includes `skills`; plugin copies via build).
- External patterns (2026-10-10): schema-validated outputs with bounded repair
  (Claude Agent SDK `output_format`, OpenCode `StructuredOutput`, CrewAI),
  submit-tool termination (Codex CSV `report_agent_job_result`,
  nicobailon/pi-subagents `structured_output`), fail-closed typed gates;
  schema validity never implies factual correctness.
- Oracle design review (2026-10-10) recommended one role-discriminated contract,
  one shared validator, structural validity separate from acceptance, single
  fenced `thoth-result` final message, one shared format-only repair, and
  phased rollout (A contract/validator/prompts; B Pi runtime enforcement; C SDD
  record binding).

## Intent

Every specialist (explorer, librarian, oracle, designer, worker) returns its
final result as exactly one fenced `thoth-result` JSON envelope that follows a
typed, role-discriminated contract defined once as data. A shared,
dependency-free validator decides structural validity; root accepts a result
only after validation passes and its own semantic judgment, with one bounded
format-only repair. This change is phase A: contract, validator, prompts and
skills across all four harnesses.

## Non-goals

- No Pi runtime enforcement (`submit_result` tool) — phase B.
- No SDD record/validator/archive binding to the Oracle envelope — phase C.
- No change to `evals/` (owned by the open `pi-behavioral-evals` change, which
  adopts the validator afterwards).
- No claim that Claude, Codex or OpenCode enforce the contract natively.
- No backward compatibility with free-text returns.

## Acceptance

- AC-1: `agent-pack.ts` defines the result contract as data: common fields
  (`schemaVersion`, `role`, `status` complete|partial|blocked|failed,
  `conclusion`, `evidence[]` {id, kind, locator, claim, basis observed|inferred,
  uncertainty}, `verification[]` {check, method, outcome pass|fail|not-run,
  evidenceIds, reason}, `risks[]` {description, severity, blocking,
  evidenceIds}, `openQuestions[]` {question, owner, options, facts}); worker and
  designer add `changedFiles[]` and nullable `nextAction`; oracle adds nullable
  `nextAction` and `review` {kind plan-review|final-verification|diagnosis|advice,
  verdict OKAY|REJECT / PASS|FAIL|BLOCKED / null, reviewedRecord?,
  reviewedRecordSha256?}; explorer and librarian have no `nextAction`, verdict or
  recommendation fields; undeclared keys rejected; arrays required.
- AC-2: One dependency-free validator in `skills/thoth-sdd/scripts/` validates a
  specialist final message: exactly one fenced `thoth-result` block forming the
  whole message (surrounding whitespace only), strict JSON with duplicate-key
  rejection, contract conformance, expected role and review kind, reference
  integrity, verdict/status consistency (positive verdict requires complete
  status and no blocking risks), and optional expected record digest; it returns
  `{valid, envelope?, issues[]}` with stable codes and paths and has a CLI
  (stdin, `--role`, `--review-kind`, `--record-sha256`, JSON output). A
  generated contract data file keeps the validator in sync with `agent-pack.ts`
  (drift test).
- AC-3: Specialist prompts in all four harnesses instruct the single-envelope
  final message per role compactly; root prompts state the acceptance protocol
  (validate the full native terminal result with the installed validator; not
  accepted when invalid; at most one format-only repair request that must not
  change findings or verdict; structural validity never implies acceptance;
  root still judges scope, evidence, checks, freshness and provenance) and
  present results to the user in readable prose. Root size caps hold; snapshots
  updated intentionally.
- AC-4: `plan-reviewer` and the `thoth-sdd` verify phase require the Oracle
  envelope (`plan-review` with OKAY|REJECT; `final-verification` with
  PASS|FAIL|BLOCKED and reviewed record path and prefix SHA-256) and tell root
  to record approvals only from a valid envelope.
- AC-5: Docs (`docs/agent/agents-and-delegation.md` description of the
  contract; no product policy in `AGENTS.md`), durable spec delta, local
  closeout (focused tests, `pnpm run check:ci`, `pnpm run typecheck`,
  `pnpm run build`).

## Clarifications

- Resolved by user: structure applies to all specialist returns and to root
  verification, not only Oracle.
- Resolved by user: adopt the proposed design and the three phases.
- Resolved by user: specialist final message is only one `thoth-result` JSON
  block; root presents it readably.
- Resolved by user: contract rolls out to all four harnesses together; Pi
  runtime enforcement follows in phase B.

## Decisions

- D1: Source of truth is contract data in `src/harness/core/agent-pack.ts`; the
  build generates `skills/thoth-sdd/scripts/result-contract.json`; the validator
  `skills/thoth-sdd/scripts/validate-result.mjs` is plain dependency-free ESM
  driven by that data and is imported by TypeScript consumers through a typed
  declaration, so one implementation serves root guidance, tests and later
  phases. A drift test asserts the generated file equals the source data.
- D2: The repair budget is one format-only request per assignment, shared by
  any later runtime layer; exhaustion is a contract failure reported truthfully,
  never converted into an Oracle `BLOCKED` judgment.
- D3: Oracle `diagnosis` and `advice` reviews carry `verdict: null` and never
  authorize implementation or closeout.
- D4: Root validation command is rendered per harness with the installed skill
  path placeholder already used for `thoth-sdd` scripts; root runs it on every
  specialist terminal result before acceptance.
- D5: Free-text field lists in prompts and routing descriptions are replaced by
  the envelope contract; tests pinning the old arrays are updated, not kept.
- D6: Generation and shipping: a `generate:result-contract` step writes
  `skills/thoth-sdd/scripts/result-contract.json` and runs in `build` BEFORE
  `integration:sync` copies skills into plugin assets. U1 owns that build-script
  edit. `package.json` is also modified by the open `pi-behavioral-evals` change
  (`eval:pi`, `typecheck` lines); U1 edits only build-related script lines and
  each change commits only its own hunks. Tests prove the canonical and plugin
  copies of `validate-result.mjs` and `result-contract.json` are byte-identical
  and that the CLI runs from the plugin copy outside the source tree.
- D7: Validator resolution: root resolves `<skill-dir>` from the installed
  `thoth-sdd` skill location exactly as the skill's existing
  `scripts/validate.mjs` usage does, and runs
  `node "<skill-dir>/scripts/validate-result.mjs" --role <role>
  [--review-kind <kind>] [--record-sha256 <hex>]` with the unchanged native
  terminal result on stdin (an `--input <path>` option exists for shells where
  piping is impractical; no persisted evidence files). The full procedure lives
  in the thoth-sdd skill; root prompts carry only a compact pointer. If the skill
  or validator is unavailable, root reports installation drift and accepts no
  specialist result of any role (fail-closed) until the validator is available.
- D8: Root prompt caps are kept by replacing the existing free-text return
  field lists with the compact envelope pointer (OpenCode headroom is about 38
  characters); no cap is raised.
- D9: U3 runs after U2 and is the only unit that runs the final `pnpm run build`
  for plugin assets, so generated assets have one writer at a time.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Structured specialist results** — Every specialist MUST end with exactly one fenced `thoth-result` JSON envelope that conforms to the role-discriminated contract defined in the agent pack, and root MUST validate it with the bundled validator before accepting it, treat missing or malformed envelopes as not accepted, allow at most one format-only repair, and still judge the content; Oracle verdicts MUST come only from the envelope review field.
  - GIVEN an Oracle final message without a valid envelope; WHEN root evaluates the terminal result; THEN the result is not accepted, at most one format-only repair is requested, and no approval is recorded .

## Plan

Test-first. U1 defines contract data, generated contract file, validator and
CLI with exhaustive fixtures. U2 renders specialist and root prompts across
harnesses. U3 updates plan-reviewer and thoth-sdd verify guidance. U4 updates
docs. Root runs closeout and a fresh Oracle verifies.

## Tasks

- [x] AC-1: U1 — Contract data, generated contract file and drift test.
  - Outcome: typed role-discriminated contract as data plus generated JSON
  - Known entrypoints and skill paths: src/harness/core/agent-pack.ts; scripts/generate-schema.ts (generation pattern); package.json build scripts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: this record (AC-1, D1, D3, D5)
  - Dependencies: none
  - Output: contract data, types, generated skills/thoth-sdd/scripts/result-contract.json, drift test
  - Owner: thoth-worker
  - Writes: src/harness/core/agent-pack.ts (+ new contract module if cleaner), its tests, generation script, skills/thoth-sdd/scripts/result-contract.json, package.json build-related script lines only (D6)
  - Interface boundaries: prompts untouched in this unit
  - Focused check and PASS evidence: contract and drift tests red then green
  - Return milestone: contract shape summary
  - Stop / reassessment: a field cannot be expressed declaratively
- [x] AC-2: U1 — Validator and CLI (same unit).
  - Outcome: validator meeting AC-2 with stable issue codes
  - Known entrypoints and skill paths: skills/thoth-sdd/scripts/validate.mjs (style); skills/thoth-sdd/scripts/*.d.mts pattern if present
  - Inputs: contract data
  - Dependencies: none
  - Output: skills/thoth-sdd/scripts/validate-result.mjs, typed declaration, fixtures for every role
  - Owner: thoth-worker
  - Writes: covered by U1 plus src tests for the validator
  - Interface boundaries: dependency-free; works from installed skill copies
  - Focused check and PASS evidence: positive/negative fixtures per role, duplicate (including nested and escape-equivalent) keys, missing/truncated envelopes, wrong role/kind, contradictory verdict/status, broken references, digest mismatch, CLI exit codes for stdin and --input; canonical/plugin copy equality and CLI run from the plugin copy (D6)
  - Return milestone: with U1
  - Stop / reassessment: strict duplicate-key JSON parsing not feasible without dependencies
- [x] AC-3: U2 — Specialist and root prompts across four harnesses.
  - Outcome: compact envelope instructions per role and root acceptance protocol
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts (childSections, createOrchestratorPromptSections, ROLE_SPECIFIC_RULES); src/agents/prompt-dialects.ts; src/harness/core/agent-pack.ts renderAgentRoutingDescription; src/harness/adapters/*; tests prompt-rendering, agent-pack, agent-routing; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted U1 contract and validator path
  - Dependencies: U1 accepted
  - Output: code, regenerated plugin/pi assets via build, updated tests/snapshots
  - Owner: thoth-worker
  - Writes: listed src files and tests, generated assets via build
  - Interface boundaries: root size caps hold (D8); validator command per D7; no product policy in AGENTS.md; does not run the final asset build (D9)
  - Focused check and PASS evidence: rendering tests for every harness and role; caps pass
  - Return milestone: rendered excerpt sizes and changed files
  - Stop / reassessment: caps cannot hold without moving procedure into skills
- [x] AC-4: U3 — Plan-reviewer and thoth-sdd verify guidance.
  - Outcome: Oracle review guidance uses the envelope
  - Known entrypoints and skill paths: skills/plan-reviewer/SKILL.md; skills/thoth-sdd/SKILL.md; skills/thoth-sdd/references/phases/verify.md; src/harness/bundled-skills.test.ts
  - Inputs: accepted U1 contract and accepted U2 prompts
  - Dependencies: U1, U2 accepted (D9)
  - Output: edited skills including the D7 validation procedure in thoth-sdd, regenerated plugin assets via the single final build
  - Owner: thoth-worker
  - Writes: listed skill files, plugin/skills via build, related tests
  - Interface boundaries: skill descriptions keep activation boundaries
  - Focused check and PASS evidence: bundled-skills tests pass; wording states envelope verdicts and root recording rule
  - Return milestone: diff summary
  - Stop / reassessment: conflict with record validator expectations
- [x] AC-5: U4 — Docs and closeout.
  - Outcome: docs updated; closeout evidence
  - Known entrypoints and skill paths: docs/agent/agents-and-delegation.md; C:/Users/EremesNG/.pi/agent/skills/progressive-context-router/SKILL.md
  - Inputs: accepted U1–U3
  - Dependencies: U1, U2, U3 accepted
  - Output: edited docs; Verification entries
  - Owner: thoth-worker for docs; root for closeout
  - Writes: docs/agent/agents-and-delegation.md; this record (root)
  - Interface boundaries: developer documentation only
  - Focused check and PASS evidence: agent-routing and provider-boundary tests; check:ci, typecheck, build exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: failures attributable to this change

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

User explicitly selected Implement after review on 2026-10-11.
User explicitly selected Oracle plan review (after confirming strict JSON over structured markdown). Fresh Oracle reviews: [REJECT] (generation/shipping and validator-resolution seams) → repaired D6–D9; [REJECT] (D7 manual-acceptance exception) → D7 fail-closed; third fresh Oracle [OKAY].

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: abeb0839e31eb1e25693b5d0c18dfe2d1afc9bd8f1d5d0b580bb0072289c2da2

- AC-1: PASS | result-contract.test.ts, agent-pack.test.ts, drift test | role-discriminated contract as data incl. changedFiles {path, change, previousPath?} with rename rule; generated result-contract.json equals source
- AC-2: PASS | validate-result.test.ts (fixtures per role, duplicate/nested/escaped keys, missing/truncated/multiple blocks, wrong role/kind, verdict/status, references, digest, CLI stdin/--input exits) + plugin copy parity and CLI from plugin copy | pass
- AC-3: PASS | prompt-rendering, agent-routing, index tests | envelope instructions per role in four harnesses, root acceptance pointer, caps held (OpenCode root 13,488 < 13,500; specialists max 4,924 < 5,000)
- AC-4: PASS | bundled-skills.test.ts | thoth-sdd result validation procedure, plan-reviewer OKAY only from validated envelope, verify phase PASS only from validated digest-matched envelope; activation descriptions unchanged
- AC-5: PASS | pnpm vitest run src/agents src/harness: 552/553 (one pre-existing timing-flaky release-workflow hung-npm test, unrelated, passes intermittently in isolation); check:ci, typecheck, build exit 0 | docs/agent/agents-and-delegation.md updated; Oracle 228/228 focused tests and 53/53 validator probes
package.json is shared with the open pi-behavioral-evals change; this change owns only the build and generate:result-contract lines (its eval:pi and typecheck lines belong to the other change) and commits only its own hunks.
- Source: docs/agent/agents-and-delegation.md | sha256:bcff46cffe319be035df8135bf9bd29d5f4ec7d7037f30cb5c713cd9f038efb6
- Source: package.json | sha256:87438f93fc5d931b4d6d18f72ae05a15ce6f7d29541ef8e8ccc35cf0e001b692
- Source: pi/.thoth-agents-assets.json | sha256:003334b465e36d4c50475d8e865855378d3396123a8dd48d6b75688c6bb7e959
- Source: pi/agents/thoth-designer.md | sha256:5bddc35293f56b2b1143baaa2def4958ff19ecf3c9da1c0f075bbbbefc8279e8
- Source: pi/agents/thoth-explorer.md | sha256:423a76d51b092d306c9b0b7f386d8f786428766fbdf56a99281b9e07211e667c
- Source: pi/agents/thoth-librarian.md | sha256:af62e6298c30c40681e815a7ab3b8d54a0288d0773a9e876f9c1c9fb53b7c18f
- Source: pi/agents/thoth-oracle.md | sha256:b45aac1258949cb393c75c3563d017f35c89c40180affc6b9c3592357889a934
- Source: pi/agents/thoth-worker.md | sha256:c7c9630eabb7780fc03b76c8c9d8ede307d97efdc4207048c5002b3573a7aad7
- Source: plugin/.claude-plugin/.thoth-agents-plugin-assets.json | sha256:5aceb40f45f83451558d211c289b8312511fd2d679e4ef4ba56295c2c1404606
- Source: plugin/agents/designer.md | sha256:cbee4a275a6a06acc4867943627a4cb4d9636b7db007615942ce2e7f00131af4
- Source: plugin/agents/explorer.md | sha256:98796d2182ebe57e29c9b40c4c72e344b1e2ad64eb7501d607afbf31d61f79a5
- Source: plugin/agents/librarian.md | sha256:f6f696193530e3d893b8dd2dbb37ba4f03e2404a7df8b1286f04dba6f9410a38
- Source: plugin/agents/oracle.md | sha256:82c27a055d8a9520b5a13899a5107ed2165eb07e729f19b78d821380aee253ac
- Source: plugin/agents/orchestrator.md | sha256:fd96fad73a0d88726422445444464b0c034ad2961a90a8840e17c40b58f8b836
- Source: plugin/agents/worker.md | sha256:38dcf5620a208b6a1644c99e226dfddaf27f3873be8fb51e6b1079e6f21f70b5
- Source: plugin/skills/plan-reviewer/SKILL.md | sha256:094b67167a996bc81c48ece0c0c0b0bc4772270730693c463ae8d9a301c94c19
- Source: plugin/skills/thoth-sdd/references/phases/verify.md | sha256:bb03405adbbab8614e8d24505c83c62f009cee6a169c193d4a6be97836985566
- Source: plugin/skills/thoth-sdd/scripts/result-contract.json | sha256:89c93fc1ff1ae8de7e885bd343d91b5a40b7949ca8b4cfa2c6e0fb5ce2742339
- Source: plugin/skills/thoth-sdd/scripts/validate-result.d.mts | sha256:f780fc26c25dbc99cb7e18f0ed6709fe5ae9b4926a646658a3fadbc051216a15
- Source: plugin/skills/thoth-sdd/scripts/validate-result.mjs | sha256:174dfc11bf6d640561eba367ad5a36d31c39774900121f37764875705a586092
- Source: plugin/skills/thoth-sdd/SKILL.md | sha256:d974982b64777b228b6d847f62125a3d3e2ebc065771403b60d29afdc056df9a
- Source: scripts/generate-result-contract.ts | sha256:eab38d386b2495e029ecf6c6374070c33ec85d713e4c063ba9074408a4a4c905
- Source: skills/plan-reviewer/SKILL.md | sha256:094b67167a996bc81c48ece0c0c0b0bc4772270730693c463ae8d9a301c94c19
- Source: skills/thoth-sdd/references/phases/verify.md | sha256:bb03405adbbab8614e8d24505c83c62f009cee6a169c193d4a6be97836985566
- Source: skills/thoth-sdd/scripts/result-contract.json | sha256:89c93fc1ff1ae8de7e885bd343d91b5a40b7949ca8b4cfa2c6e0fb5ce2742339
- Source: skills/thoth-sdd/scripts/validate-result.d.mts | sha256:f780fc26c25dbc99cb7e18f0ed6709fe5ae9b4926a646658a3fadbc051216a15
- Source: skills/thoth-sdd/scripts/validate-result.mjs | sha256:174dfc11bf6d640561eba367ad5a36d31c39774900121f37764875705a586092
- Source: skills/thoth-sdd/SKILL.md | sha256:d974982b64777b228b6d847f62125a3d3e2ebc065771403b60d29afdc056df9a
- Source: src/agents/prompt-rendering.test.ts | sha256:13a42ee33402194918040e9124bdceeba19a132348235ba742bba302fc967e9d
- Source: src/agents/prompt-sections.ts | sha256:a7e69307de2083cdd7eb78ce19b721836abaaa88e67322c16bfcf7fb20ba389b
- Source: src/harness/bundled-skills.test.ts | sha256:ac4c0ddf05ddb4586ec40dc7069e686eb2915cb56fe08157caeace460ebefec9
- Source: src/harness/core/agent-pack.test.ts | sha256:5ebe9111f4096e02c076f51a65dd8b2b4673af6e821451676a94e9238bfe7640
- Source: src/harness/core/agent-pack.ts | sha256:44d7a9cd6bb9b3ab6cb290c4abf920b79a7b16c7de263d9d1f6de16fb900fa1c
- Source: src/harness/core/agent-routing.test.ts | sha256:fb6af1bcdf6119406b1b4fceae4411994b45c0174f33e8a6ebb51d47da91602f
- Source: src/harness/core/result-contract.test.ts | sha256:971193bbee4f46fd13c454126e8d9196a65ec2e537e3b87fd9615da020128320
- Source: src/harness/core/result-contract.ts | sha256:ba54715e14cb54a442a38cbe6d98b67c2d60452ee801696314bfccdcf87661d4
- Source: src/harness/core/validate-result.test.ts | sha256:90d37d71ef695f34d5ae114104ea87d03ec934a071e33c8333445e13100fbe99
- Source: src/harness/integration-lifecycle.test.ts | sha256:a7894144e3450816fe863468bc0a1c4eb7ad1460f5f667dc724da2ca3bf84acf
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:c39adf85302ef0bc6f55406fe7dffab1823bae32009a3cfb703ea53bdb54744d

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
