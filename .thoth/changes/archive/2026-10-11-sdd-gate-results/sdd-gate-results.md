# Change: sdd-gate-results

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- Phase A (13de34e) made every specialist end with a strict `thoth-result` JSON
  envelope validated by `skills/thoth-sdd/scripts/validate-result.mjs` before
  acceptance (`src/agents/prompt-sections.ts` root delegation block ~263–267;
  contract `src/harness/core/result-contract.ts`; generated
  `skills/thoth-sdd/scripts/result-contract.json`; `AGENT_RETURN_CONTRACT`
  derived from it in `src/harness/core/agent-pack.ts`).
- Problems found afterwards: the root rule ("Specialist finals… Validate every
  full unchanged native terminal result…; No skill/validator… accept nothing")
  does not distinguish Thoth specialists from user-defined pi-subagents agents,
  so custom agents' results could be rejected; and validating every delegation
  (e.g. an Explorer answering a user question) adds cost without any decision
  depending on structure.
- The original defect (five free-text verdict formats) concerns only Oracle
  verdicts that gate SDD transitions: plan review (`skills/plan-reviewer/SKILL.md`)
  and final verification (`skills/thoth-sdd/references/phases/verify.md`).
- Pi task results now contain only the final assistant answer (abccae1), so a
  fenced Oracle envelope is no longer polluted by narration.
- Evals (1d2b57a) grade specialist envelopes through
  `evals/pi/specialist-results.ts`; the designer and memory cases currently
  expect valid envelopes from non-Oracle roles.

## Intent

Keep structured, validated results only where an SDD gate depends on them: the
Oracle's plan-review and final-verification verdicts. All other specialist
returns go back to compact markdown fields judged by root, and user-defined
agents stay free and are never treated as approvals.

## Non-goals

- No change to Pi lean catalogs, model presets or the final-answer-only Pi
  result fix.
- No SDD record binding of the Oracle envelope (phase C).
- No runtime `submit_result` tool.

## Acceptance

- AC-1: The result contract and validator cover only the Oracle gate envelope:
  role `oracle`, review kind `plan-review` (OKAY|REJECT) or
  `final-verification` (PASS|FAIL|BLOCKED with reviewed record path and prefix
  SHA-256), with the existing strictness (single fenced block as whole message,
  duplicate keys, verdict/status consistency, digest binding); non-gate roles
  and review kinds are removed from the contract, generated JSON, validator and
  tests.
- AC-2: Specialist prompts in all four harnesses return compact markdown fields
  per role (explorer/librarian: conclusion, evidence, verification, risks,
  openQuestions; worker/designer/oracle add nextAction; worker/designer list
  changed files); only the Oracle, when assigned a plan review or final
  verification, ends with the gate envelope.
- AC-3: Root guidance in all four harnesses validates only Oracle gate results
  with the validator before recording plan-review OKAY or final PASS; other
  results (including user-defined agents and Oracle diagnosis/advice) are
  judged on content, never count as approvals, and are never rejected for
  format; a missing validator blocks only recording a gate approval. Root caps
  hold.
- AC-4: `plan-reviewer`, the thoth-sdd skill procedure and the verify phase
  describe the gate-only envelope; docs updated (`docs/agent/agents-and-delegation.md`,
  `docs/agent/testing.md`); evals grade the Oracle gate envelope via the
  validator and stop requiring envelopes from other roles (designer case keeps
  task-attributed read evidence; memory case keeps MEMORY scope checks).
- AC-5: Local closeout passes (focused tests, evals offline suite, pi-subagents
  untouched, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`).

## Clarifications

- Resolved by user: structure and validation only at SDD gates (Oracle
  plan-review and final-verification); other specialists back to compact
  markdown fields without validator; user-defined agents stay free and never
  approve.

## Decisions

- D1: Delete non-gate envelope support rather than keeping it dormant (no
  backward compatibility required).
- D2: Oracle diagnosis/advice assignments return markdown fields like other
  specialists and cannot authorize anything.
- D3: Validator absence blocks only gate approvals; ordinary delegations
  proceed.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Structured specialist results** — Only Oracle results that gate SDD transitions (plan review and final verification) MUST end with exactly one fenced `thoth-result` JSON envelope conforming to the gate contract, and root MUST validate it with the bundled validator before recording plan-review OKAY or final-verification PASS, treat a missing or malformed envelope as no approval, allow at most one format-only repair, and still judge the content; other Thoth specialist results use compact fields judged by root, user-defined agent results keep their own free format, and neither is rejected for format nor counts as an approval.
  - GIVEN an Explorer answering a user question and an Oracle final verification without a valid envelope; WHEN root evaluates both; THEN the Explorer result is judged on content without validation and the Oracle result records no approval .

## Plan

Test-first. U1 narrows contract, generated JSON, validator and tests to the
Oracle gate envelope. U2 restores compact markdown fields for non-gate returns
and scopes root guidance in the four harnesses. U3 updates skills, docs and
evals and runs the single final build. Root runs closeout and a fresh Oracle
verifies.

## Tasks

- [x] AC-1: U1 — Gate-only contract, generated JSON and validator.
  - Outcome: contract and validator cover only Oracle plan-review/final-verification
  - Known entrypoints and skill paths: src/harness/core/result-contract.ts; src/harness/core/agent-pack.ts; scripts/generate-result-contract.ts; skills/thoth-sdd/scripts/{validate-result.mjs,validate-result.d.mts,result-contract.json}; src/harness/core/{result-contract,validate-result}.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md; C:/Users/EremesNG/.pi/agent/skills/simplify/SKILL.md
  - Inputs: this record (AC-1, D1, D2)
  - Dependencies: none
  - Output: narrowed code and tests
  - Owner: thoth-worker
  - Writes: listed files
  - Interface boundaries: no prompt edits
  - Focused check and PASS evidence: pure canonical contract/validator tests red then green; plugin-copy parity and installed-CLI checks deferred to U3 after generation
  - Return milestone: remaining contract shape
  - Stop / reassessment: a consumer outside prompts/evals depends on removed roles
- [x] AC-2: U2 — Compact markdown returns for non-gate results.
  - Outcome: specialist prompts per AC-2
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts; src/harness/core/agent-pack.ts (AGENT_RETURN_CONTRACT, renderAgentRoutingDescription); tests prompt-rendering, agent-pack, agent-routing, index
  - Inputs: accepted U1
  - Dependencies: U1 accepted
  - Output: code and tests
  - Owner: thoth-worker
  - Writes: listed src files and tests
  - Interface boundaries: caps held by replacing or compacting root wording, never appending; no build (U3)
  - Focused check and PASS evidence: rendering tests per role and harness; caps
  - Return milestone: rendered excerpts and sizes
  - Stop / reassessment: caps cannot hold
- [x] AC-3: U2 — Root guidance scoped to Oracle gates (same unit).
  - Outcome: AC-3 wording in four harnesses
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts
  - Inputs: accepted U1
  - Dependencies: U1 accepted
  - Output: covered by U2
  - Owner: thoth-worker
  - Writes: covered by U2
  - Interface boundaries: caps held
  - Focused check and PASS evidence: tests asserting gate-only validation, custom agents never rejected for format, missing validator blocks only gate approvals
  - Return milestone: with U2
  - Stop / reassessment: as U2
- [x] AC-4: U3 — Skills, docs, evals and final build.
  - Outcome: AC-4 surfaces aligned; generated assets rebuilt
  - Known entrypoints and skill paths: skills/plan-reviewer/SKILL.md; skills/thoth-sdd/SKILL.md; skills/thoth-sdd/references/phases/verify.md; docs/agent/{agents-and-delegation,testing}.md; evals/pi/{specialist-results,live-cases}.ts and tests; evals/contracts.json; src/harness/bundled-skills.test.ts
  - Inputs: accepted U1, U2
  - Dependencies: U1, U2 accepted
  - Output: edited files; plugin/ and pi/ via single build
  - Owner: thoth-worker
  - Writes: listed files and generated assets
  - Interface boundaries: evals stay fail-closed for gate approvals
  - Focused check and PASS evidence: bundled-skills tests; evals pure tests; build regenerates assets
  - Return milestone: diff summary
  - Stop / reassessment: an eval case cannot be graded without non-Oracle envelopes
- [x] AC-5: U4 — Closeout.
  - Outcome: closeout evidence
  - Known entrypoints and skill paths: this record
  - Inputs: accepted U1–U3
  - Dependencies: U1, U2, U3 accepted
  - Output: Verification entries
  - Owner: root
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: src/agents and src/harness suites, evals offline suite, check:ci, typecheck, build exit 0
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
User explicitly selected Oracle plan review. Fresh Oracle REJECT (delta imposed format on user-defined agents) → delta and check staging repaired; second fresh Oracle plan-review OKAY envelope (nonblocking: U1 must handle agent-pack initialization when removing non-gate roles).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 3e1aa4ef46349ee305b04443209a2af77baf9ac2e60854b50add3a46524dbc36

- AC-1: PASS | result-contract/validate-result/drift tests; post-build parity and installed CLI | contract and validator Oracle-gate-only (plan-review, final-verification with required record binding); non-gate roles and kinds removed
- AC-2: PASS | prompt-rendering per role and harness | compact markdown fields for all specialists; Oracle gate envelope only for plan-review/final-verification; diagnosis/advice cannot approve
- AC-3: PASS | prompt-rendering root tests; caps | root validates only Oracle gate results; non-gate and user-defined results never rejected for format nor approvals; missing validator blocks only gate approvals; OpenCode 13,495 < 13,500, Codex 14,781, Claude 14,248
- AC-4: PASS | bundled-skills tests; evals offline 191/191; live v6 (openai-codex/gpt-6.1-sol) plan-review-choice PASS (plan-review OKAY envelope), verification-fresh-oracle PASS (final-verification PASS envelope), designer-project-skill PASS (markdown result, task-attributed skill read) | skills, docs and evals gate-only
- AC-5: PASS | src/agents+src/harness 526/527 (only the pre-existing timing-flaky release-workflow hung-npm test failed); typecheck, check:ci, build exit 0 | pi-subagents untouched
- Source: docs/agent/agents-and-delegation.md | sha256:b06d1f01e9fb4164d85397d8d88a529de6354a032783afcbc28a0016eaaed320
- Source: docs/agent/testing.md | sha256:b842baa5137ff3e0107c9d54f7fe312c773f8320e9e791595638f480c8d2fd2c
- Source: evals/contracts.json | sha256:a669a10296c3ce790dc756a0d1f85592a914c51f5846af90c3c75d02fef32706
- Source: evals/pi/catalog-grading.test.ts | sha256:4224dcfa987501c314e7ec77d55b35d5446323064c2b2e42af7744e635fbdde5
- Source: evals/pi/child-catalog.test.ts | sha256:758f44eb3bd6027c05ecbcf24b549aaa9e98b6f1e97974e50c482fb42f44876e
- Source: evals/pi/live-cases.ts | sha256:58b9fb9c96ecd3eedf697330f7c0b0b41ebe154634dfd945e0f795358296413f
- Source: evals/pi/live-graders.test.ts | sha256:97e9b8e1cb42bb621aa916e75559901a1685d1d0a6139557b4594a68f75d4542
- Source: evals/pi/oracle-verdict.test.ts | sha256:7eaf4d13cda68d6c0af67e246f102818c3f4e1041fa475acd0ad0b9777509ae4
- Source: evals/pi/reporting.test.ts | sha256:890e19ce09277f43f95fbb48db38adc792be75e9490e0e080e6a6eb9e0fff85e
- Source: evals/pi/reporting.ts | sha256:12a98d685e0b745f6e7a9cca36ca9dfae65eab665dd6688ce2de47fd0a12ce49
- Source: evals/pi/specialist-results.test.ts | sha256:9e8ec852417aee0440b0cc6825cdc9d7d0996eb6e6db0451fdf5e3d9f6a98621
- Source: evals/pi/specialist-results.ts | sha256:3bbbe8e843afa749f3f8eb2d8fbf30ae34613ed1e7367090748ffc479b85e31c
- Source: evals/pi/test-envelope.ts | sha256:7c056bb90acd638dcab3fecd601e743f60279395538b42de26c08afa2c06bcea
- Source: evals/pi/v4-regressions.test.ts | sha256:4c77065cdd3bff3acd7299a7a9ee673ca950ad970922b92ad0cc335731b29a7a
- Source: pi/.thoth-agents-assets.json | sha256:4cc5bcb5ba5f9ef05f6f3379adac4ba0d4ceb0645e20783de8d9d6a49d042a9c
- Source: pi/agents/thoth-designer.md | sha256:b6b02f573626033cdd4c27fdefff47286faea7c55b43cb27392a85e5fe52f17e
- Source: pi/agents/thoth-explorer.md | sha256:fd94ae3d9bfa38688bc350082dff65c214888b52724f655b42bed461d5971133
- Source: pi/agents/thoth-librarian.md | sha256:afa857f02cc559c089bc23965538367590343be29e31b3bb8e6dd3759848e2c8
- Source: pi/agents/thoth-oracle.md | sha256:9ae84fa041b4d8e1e6449c893a5103feac5776c7fed918044aa82f8e9b3989b5
- Source: pi/agents/thoth-worker.md | sha256:714a7cfc4df55ac93645d337fe64a078154ecf72afec95b58fbe84d4f5ca3e00
- Source: plugin/.claude-plugin/.thoth-agents-plugin-assets.json | sha256:d3662ff44b29fa7f4cf497d41a74747f2c493f80bcd03bff2a5882648333dc43
- Source: plugin/agents/designer.md | sha256:13ecad6b0cf835202873bc4fa97a53128fcea53e43309dd20e8dd5f5ca0469ab
- Source: plugin/agents/explorer.md | sha256:fa750e5f5683bc1b9d20b2a4b9102adabf8b88d8f48373d386a35eaa109976e2
- Source: plugin/agents/librarian.md | sha256:eabab8223055b6680fe53799bb538e014c44db29b668022c58cbb67268b6f974
- Source: plugin/agents/oracle.md | sha256:31a73a5da99108bc0c964a33cff7a0298d9819eb96d95697020bd4a0917f0fed
- Source: plugin/agents/orchestrator.md | sha256:5271058795b0e891b11d2ab9db1d6b99d6b6b66d4aec0035b7e778fb498158bc
- Source: plugin/agents/worker.md | sha256:58109282238f712d4139d642f142ab44bc109210e07070d4c46b683a1544e337
- Source: plugin/skills/plan-reviewer/SKILL.md | sha256:4b15eb8e0120c2c1ea5b88c00b010026be203f9e715fd5f1609369d1432e3a6a
- Source: plugin/skills/thoth-sdd/references/phases/verify.md | sha256:93a70413eb22e7fc7a1ce08c6b30d0a21d7fff21be6e621a4525b45e007242a7
- Source: plugin/skills/thoth-sdd/scripts/result-contract.json | sha256:7f7697f38a4852ccf5974e7500b8c8c9210c9506b9af6359ea2ac937489e68db
- Source: plugin/skills/thoth-sdd/scripts/validate-result.d.mts | sha256:c6c13011c348ed7468cef3723444e83697e7d830e41639dd2b4387bdd4de6924
- Source: plugin/skills/thoth-sdd/scripts/validate-result.mjs | sha256:d7c240d4ad22a5ade4a99340e361c743c00ac6a71e5cf81bd6c9d814bb4a331e
- Source: plugin/skills/thoth-sdd/SKILL.md | sha256:d876f3197fb9c8bb4bc90f1df440b354ac4f2a1114cad49e60603e81c28886ca
- Source: scripts/generate-result-contract.ts | sha256:56099bec97d1fa4eeddf502c52800f5bf9d924a86f1851e65145a0f237137ce2
- Source: skills/plan-reviewer/SKILL.md | sha256:4b15eb8e0120c2c1ea5b88c00b010026be203f9e715fd5f1609369d1432e3a6a
- Source: skills/thoth-sdd/references/phases/verify.md | sha256:93a70413eb22e7fc7a1ce08c6b30d0a21d7fff21be6e621a4525b45e007242a7
- Source: skills/thoth-sdd/scripts/result-contract.json | sha256:7f7697f38a4852ccf5974e7500b8c8c9210c9506b9af6359ea2ac937489e68db
- Source: skills/thoth-sdd/scripts/validate-result.d.mts | sha256:c6c13011c348ed7468cef3723444e83697e7d830e41639dd2b4387bdd4de6924
- Source: skills/thoth-sdd/scripts/validate-result.mjs | sha256:d7c240d4ad22a5ade4a99340e361c743c00ac6a71e5cf81bd6c9d814bb4a331e
- Source: skills/thoth-sdd/SKILL.md | sha256:d876f3197fb9c8bb4bc90f1df440b354ac4f2a1114cad49e60603e81c28886ca
- Source: src/agents/prompt-rendering.test.ts | sha256:64c85a972631fa23f93a396cbfaa2e2cb738a3bda033cfd5d5f7043b968e7c7f
- Source: src/agents/prompt-sections.ts | sha256:795df639b39335c4499fe109b3637d3fba84cae11aa197582d54af9ef371ddcf
- Source: src/harness/bundled-skills.test.ts | sha256:11f4b467c9256ee35d4b9a73d191ca16ce0537db29900161026f1b17955049e2
- Source: src/harness/core/agent-pack.test.ts | sha256:712e9aa96ea91a5cbcac2896e46dd0787484031fcbdf16fd617b78d2c919e77e
- Source: src/harness/core/agent-pack.ts | sha256:936417d1dab1623f6ba11e2beafbb3c15115ca376e3a1244f87ec4add43409f8
- Source: src/harness/core/agent-routing.test.ts | sha256:f2aa3d4af5485467df9c66487a358a903c66ddb1ed537f764a74dd60c1285db5
- Source: src/harness/core/result-contract.test.ts | sha256:136e39d9d0e84c266c296a4cb227d4721d866c69b347207144dbd435bc1069b2
- Source: src/harness/core/result-contract.ts | sha256:d92b9b2e1574c6ce84ae827579151970df746820fb27bed703d1a5cd746f0b1a
- Source: src/harness/core/validate-result.test.ts | sha256:2884d397c9c6e8241834acf0f45e12f210e3538a4b61bcc74099c87c3c227b1a
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:192b862f4b7f71e3dd44dc4289d6f4702a07fa22859cb9bd5dddc15f603e60cd

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
