# Change: root-owned-planning

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

Root prompt blocks (`<role>`, `<implementation-ownership>`, `<routing>`, `<sdd-workflow>`, `<artifacts>`) are authored once and shared by every harness. `src/agents/prompt-sections.ts:153-159,193-195,208-210,216-228,247` renders them from the policy in `src/harness/core/agent-pack.ts:269-305` (role identity `:273-274`, consultation allowance `:285`, minimal-edit exception `:288`, Worker selection `:253`). `src/agents/prompt-dialects.ts` only swaps tool names and role references for OpenCode, Codex, Claude and Pi.

The gap: `<artifacts>` says "Root owns the record", but nothing exempts record authorship from specialist-default execution. Record writing and plan-review repair fall outside the direct-work exceptions, and Worker routing ("Known bounded nonvisual implementation is ready, regardless of complexity") takes over. `<sdd-workflow>` (`prompt-sections.ts:220`) has no REJECT loop. `prompt-sections.ts:219` lets small work be delegated "without planning artifacts" and requires no in-session plan.

`src/harness/core/sdd.ts`:
- Plan review at `:367-383` and a blocking finding at `:384` do not name a repair owner or a repeat loop.
- Small flow at `:491,611-618,643-647` has no in-session plan.
- `agent-pack.ts:149` says the orchestrator owns the record, and `:377` says persistence does not decide implementation ownership.

`skills/plan-reviewer/SKILL.md:57-59` already says "Root repairs same-intent blockers in the same record, revalidates affected gates, and uses a fresh Oracle for each round". Elsewhere in `skills/thoth-sdd` (SKILL.md, phases plan/tasks/checklist/converge, `templates/change.md:56` "Owner: root or selected role") no writer is named.

Worker and Designer contracts (`agent-pack.ts:238-240,259-261`; `prompt-sections.ts:310-313`) can edit any assigned surface with no exclusion for planning records. Explorer and Librarian are read-only.

Committed mirrors are produced by `pnpm run integration:sync` (`src/harness/generate-integration-packages.ts`):
- `plugin/agents/*.md`
- `plugin/codex-hooks/payloads/*.md`
- `pi/agents/thoth-*.md`
- `plugin/skills/**`

Tests that pin the wording or size:
- `src/agents/prompt-rendering.test.ts` checks ownership phrases (`:147-163`), the review offer (`:259`), the specialist cap of 5,000 characters (`:711-716`), and root caps of OpenCode <13,300, Codex <14,800, Claude <14,200, Pi <16,700 (`:969-976`), plus the shipped Codex payload ≤14,800 (`:1065`).
- `src/harness/core/agent-pack.test.ts:56,183-187`
- `src/harness/core/agent-routing.test.ts:217,230`
- `src/harness/core/sdd.test.ts:120-151`
- `src/harness/core/sdd-protocol.test.ts:43,59,90`
- `bundled-skills.test.ts:196,302-395,471` (generated assets are byte-identical)

Relevant specs:
- `.thoth/specs/adaptive-sdd/spec.md:94` ("Same-intent review blockers require correction and a fresh review", with no owner)
- `.thoth/specs/agent-delegation/spec.md:37-45` (root coordinates, specialists execute)

Convergence round 1 exploration:
- Final-verification FAIL handling is only implicit. `skills/thoth-sdd/references/phases/converge.md` has root record the remaining work and then "repeat implementation and independent verification" without naming the repairer. `verify.md` routes FAIL findings to convergence. The root prompt only says "converge failures" (`src/agents/prompt-sections.ts:226`). `src/harness/core/sdd.ts` holds the converge protocol at `:209,440-451,666`.
- `evals/contracts.test.ts` with `evals/contracts.json` pins literal root-prompt patterns on every harness. It was missing from the original focused check set.

Constitution `.thoth/constitution.md:26-28,60-62` gives root coordination and acceptance and gives Worker bounded implementation. It does not conflict with root authoring the record. Docs: `docs/agent/agents-and-delegation.md`, `docs/agent/sdd-and-skills.md`, `docs/sdd-pipeline.md`.

## Intent

Root always plans and is the only author of planning artifacts.
- Substantial work: root creates, edits, validates and corrects the single change record for the whole change.
- When a selected plan review returns REJECT, root repairs the record itself, reruns the affected gates and sends it to a fresh Oracle. This repeats until OKAY or until a blocker the human must decide stops the round.
- Small work: before delegating or implementing, root states a brief in-session plan (scope, owner, focused verification). No record is created.
- During planning, root may use any specialist within its full role scope to gather context, but never assigns a specialist to create, modify or correct SDD files.
- Implementation writers (Worker, Designer) start only after authorization.
- The two Oracle gates are explicitly distinct:
  - Plan review (OKAY/REJECT) judges the record. Root repairs a REJECT.
  - Final verification (PASS/FAIL) judges the implementation. FAIL findings are fixed by the Worker or Designer that owns each affected surface (code, tests, docs, UI), and independent verification is then repeated. Root records the remaining acceptance-linked work (in the substantial record when one exists; otherwise in the brief in-session small plan) and coordinates. It does not repair or reroute the implementation to itself unless the user explicitly instructs direct work. Even with that instruction, root never self-approves, and it reports when independent review is unavailable.
  - When a FAIL shows that intent, scope or risk changed materially, planning reopens and the record work is root's again.

## Non-goals

- Plan review stays optional. The Review/Proceed offer, its provenance and the separate Implement/Stop authorization are unchanged.
- Specialist role scopes are not enumerated or narrowed. Context sources are described generically.
- No change to the final verification, closeout or archive gates, the validator CLI, or the envelope contract.
- No constitution amendment, no root prompt cap increases, no package version bumps.

## Acceptance

- AC-1: On every harness, the rendered root prompt states that root is the only author of the substantial change record (create, edit, validate, correct). It states that this authorship is root work outside specialist-default execution and outside the direct-work allowances. It states that specialists only supply context during planning, within their role scope, and are never assigned to write SDD files.
- AC-2: On every harness, the rendered root prompt states the plan-review REJECT loop: root repairs the record, reruns the affected gates and sends it to a fresh Oracle until OKAY, or stops on a human-owned blocker.
- AC-3: On every harness, the rendered root prompt states that root writes a brief in-session plan for small work (scope, owner, focused verification) before delegating or implementing, with no record.
- AC-4: The `src/harness/core/sdd.ts` protocol encodes root as record author and REJECT repairer with the fresh-Oracle loop, and the small-work in-session plan.
- AC-5: `skills/thoth-sdd` (SKILL.md, the relevant phases, `templates/change.md`) and `skills/plan-reviewer/SKILL.md` state these rules consistently, with no wording that implies a specialist writes the record.
- AC-6: Worker and Designer prompts exclude `.thoth/changes/` records from their assignable write surfaces.
- AC-7: The generated mirrors under `plugin/` and `pi/` are regenerated and byte-identical to their sources. `docs/agent/agents-and-delegation.md`, `docs/agent/sdd-and-skills.md` and `docs/sdd-pipeline.md` describe the rules.
- AC-8: The root and specialist character caps stay unchanged and pass. `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, the focused tests and `evals/contracts.test.ts` pass. Compression of existing wording preserves the meaning of every prior rule. In particular, the three-return budget still applies only to choices with a meaningful safe recommendation, and escalating a small patch to substantial still depends on its risk.
- AC-9: On every harness, the rendered root prompt, the `sdd.ts` converge/verify protocol, `converge.md`/`verify.md` and the docs contrast the two gates. A plan-review REJECT is repaired by root in the record. A final-verification FAIL is repaired by the Worker or Designer that owns the affected surface, and independent verification is then repeated. Root records the remaining work (in the record when one exists, otherwise in the small in-session plan) and coordinates. Only an explicit user direct-work instruction lets root apply the repairs, and even then without self-approval. A FAIL that reveals a material change in intent, scope or risk reopens planning. Focused checks cover both boundaries: a recordless small FAIL and the explicit direct-work exception.

## Clarifications

- Plan review stays optional (user answer: "Sigue opcional"). The REJECT loop applies only when review is selected.
- "Root always plans" covers small work as a brief in-session plan without a record (user answer: "Sí, plan breve sin registro").
- The user's mentions of Librarian, Explorer and Designer were examples only. Specialists may supply context within their full role scope (Librarian analyzes external libraries and GitHub repos; Explorer may inspect folders outside the repo on the machine). The rule must not enumerate or narrow them.

## Decisions

- Root is the only writer of the change record at every stage, not only during planning. This matches the existing "Root owns the record", converge (root records the remaining work) and closeout (root pastes the envelope). Implementation writers never touch `.thoth/changes/`.
- Record authorship is coordination work. It does not consume the root direct-consultation allowance, and it does not license root source discovery or substantive implementation. Any missing evidence still comes from specialists.
- Size budget: keep every existing root and specialist character cap. When new text exceeds a cap, compress existing wording in the same blocks without changing its meaning. Raising a cap requires returning to root. Measured headroom before the change (plan review): OpenCode 13285/<13300, Codex 14790/<14800, Claude 14192/<14200, Pi 16656/<16700, so every root addition needs equivalent compression. Worker and Designer prompts have at least 940 characters free.
- Generated-payload ordering: T1 changes the rendered Codex root, but only T3 regenerates `plugin/codex-hooks/payloads/root.md`. T1's milestone therefore excludes only the shipped-payload parity test (`src/agents/prompt-rendering.test.ts:1049-1065`). T3 runs it unfiltered after `pnpm run integration:sync`.
- Specs: add new requirements instead of rewriting the long existing ones.
- Convergence round 1, after a fresh Oracle returned final-verification FAIL on record SHA-256 e303e65ef40b64f680815142dbc7be49cd53da5d5f079e1d8a677a6b8a316d06:
  - Repair the two compression drifts in `src/agents/prompt-sections.ts`: the choice-budget guard (:221) and the risk-qualified small-patch rule (:218).
  - Update only the stale literal patterns in `evals/contracts.json`, keeping their coverage.
  - Fold in AC-9, the REJECT/FAIL contrast, which the user asked to include in this change.
  - One Worker owns the whole round because the surfaces overlap (prompt-sections, skills, docs).
- The REJECT/FAIL contrast follows the existing rules: an explicit user direct-work instruction still wins; otherwise root's direct-work exceptions do not cover FAIL repairs to the implementation.

## Durable deltas

- `ADDED adaptive-sdd` **Root authors the change record** — Root MUST be the sole author of the substantial change record through every stage: it creates, edits, validates and corrects it. During planning root MAY obtain context from any specialist within that specialist's role scope but MUST NOT assign a specialist to create, modify or correct SDD files. When a selected plan review returns REJECT, root MUST repair the same record, rerun the affected gates and request a fresh Oracle review, repeating until OKAY or until a human-owned material blocker stops the round. Implementation writers MUST start only after implementation authorization.
  - GIVEN a selected plan review that returns REJECT with same-intent blockers; WHEN root processes the result; THEN root edits the record itself, reruns the affected gates and dispatches a fresh Oracle, and no Worker or Designer is assigned to change the record .
- `ADDED adaptive-sdd` **Plan small work in session** — Before delegating or implementing small work, root MUST state a brief in-session plan naming scope, owner and focused verification, without creating a persistent record.
  - GIVEN work classified as small; WHEN root prepares to delegate or implement it; THEN root first states the in-session scope, owner and focused verification and creates no `.thoth/changes/` record .
- `ADDED agent-delegation` **Planning authorship stays with root on every harness** — Shipped root instructions on every harness MUST present change-record authorship and plan-review repair as root work outside specialist-default execution and direct-work allowances, MUST present specialists during planning only as context sources within their role scope, and write-capable specialist instructions MUST exclude `.thoth/changes/` records from assignable surfaces.
  - GIVEN a root prompt rendered for any supported harness and a plan review that returned REJECT; WHEN root needs the record corrected; THEN the prompt directs root to edit the record itself and Worker or Designer instructions refuse `.thoth/changes/` writes .
- `ADDED adaptive-sdd` **Route final-verification failures to implementation owners** — Plan review and final verification MUST remain distinct gates. When final verification fails, root MUST record the remaining acceptance-linked work (in the substantial record when one exists, otherwise in the brief in-session small plan) and, unless the user explicitly instructs direct work, MUST route repairs to the Worker or Designer owning each affected surface and MUST NOT repair the implementation itself; independent verification MUST then be repeated as the change's verification level requires. Under an explicit direct-work instruction root MAY apply the repairs but MUST NOT self-approve and MUST report unavailable independent review. When a failure reveals a material change in intent, scope or risk, root MUST reopen understanding and planning before further implementation.
  - GIVEN final verification of a substantial change returns FAIL with implementation findings and no direct-work instruction; WHEN root processes the result; THEN root records the remaining work in the record, assigns the repairs to the owning Worker or Designer and requests a fresh Oracle final verification, without editing the implementation itself .

## Plan

Make three sequential write units, then final verification. T1 and T2 can run in parallel because their write surfaces do not overlap. T3 waits until root has accepted both.

1. **Canonical prompt and protocol policy (T1, Worker, test-first).**
   - In `agent-pack.ts`, add a root-planning ownership statement to the implementation-ownership policy and the `<role>` identity: root authors the record and repairs plan reviews; specialists supply context within their role; this is not a direct-work allowance.
   - In `agent-pack.ts`, add a `.thoth/changes/` exclusion to the Worker and Designer contracts, or to the shared write-capable child rule in `prompt-sections.ts:310-313`, whichever is canonical.
   - In `prompt-sections.ts`, extend `<sdd-workflow>` with the REJECT loop and the small-work in-session plan.
   - In `sdd.ts`, encode the repair owner and loop next to `:367-384` and the small in-session plan next to `:491,611-618`.
   - First update or add assertions in `prompt-rendering.test.ts`, `agent-pack.test.ts`, `agent-routing.test.ts` and `sdd-protocol.test.ts`.
   - Measure each harness's root length against its cap, and compress existing wording if needed.
2. **Skills (T2, Worker, test-first).**
   - In `skills/thoth-sdd/SKILL.md`, state that root is the only record author and that the REJECT loop and small in-session plan apply.
   - In `references/phases/plan.md`, `tasks.md`, `checklist.md`, `converge.md` and `implement.md`, name root as the writer where a writer is implied.
   - In `templates/change.md:56`, make clear that the task Owner is the executing role and that the record writer is always root.
   - Align `skills/plan-reviewer/SKILL.md` wording.
   - Update `src/harness/core/sdd.test.ts` and `bundled-skills.test.ts` assertions first.
3. **Mirrors and docs (T3, Worker).**
   - Run `pnpm run integration:sync`.
   - Update `docs/agent/agents-and-delegation.md`, `docs/agent/sdd-and-skills.md` and `docs/sdd-pipeline.md`.
   - Run the closeout gate: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` (required because shipped prompt and runtime assets change), and the focused tests unfiltered, including the shipped-payload parity test in `prompt-rendering.test.ts`, `generate-integration-packages.test.ts` and `bundled-skills.test.ts`.
4. **Final verification:** a fresh Oracle reviews the diff, the checks and the record.
5. **Archive:** root syncs the deltas to `.thoth/specs/` at archive.

6. **Convergence round 1 (T4, Worker, test-first).**
   - Repair the two compression drifts.
   - Add the REJECT/FAIL contrast to the root `<sdd-workflow>`, the `sdd.ts` converge/verify protocol, `converge.md`/`verify.md`, and the three docs. Compress elsewhere so the caps still pass.
   - Update the stale `evals/contracts.json` patterns and add contract coverage for the contrast.
   - Update the stale literals in `src/agents/index.test.ts` and `src/harness/adapters/{opencode,codex,claude-code,pi}.test.ts`, keeping their meaning (plan review round 3 finding).
  - Regenerate the mirrors and run the full closeout gate, including `evals/contracts.test.ts`, the index and adapter tests, and a full `pnpm test` sweep.
   - Then a fresh final Oracle verifies.

Verification seams: `evals/contracts.test.ts`, the prompt-rendering tests for every harness (ownership phrases and caps), the sdd-protocol tests, the skill text tests, the bundled byte-identity test, and the generated-package tests.

## Tasks

- [x] AC-1: Root prompt and policy state root-only record authorship, specialists as context only, and that this sits outside the direct-work allowances
  - Outcome: rendered root prompts for all four harnesses carry the authorship rule within their caps
  - Known entrypoints and skill paths: src/harness/core/agent-pack.ts:149,253,269-305,377; src/agents/prompt-sections.ts:153-159,193-195,216-228,247; src/agents/prompt-dialects.ts; tdd and simplify skills
  - Inputs: this record's Intent, Decisions and AC-1..AC-4, AC-6
  - Dependencies: none
  - Output: source and test changes, plus a per-harness root length report before and after
  - Owner: thoth-worker (T1)
  - Writes: src/harness/core/agent-pack.ts, src/agents/prompt-sections.ts, src/agents/prompt-dialects.ts (only if needed), src/harness/core/sdd.ts, src/agents/prompt-rendering.test.ts, src/harness/core/agent-pack.test.ts, src/harness/core/agent-routing.test.ts, src/harness/core/sdd-protocol.test.ts
  - Interface boundaries: rendered prompt contract for every harness; no changes to skills/, plugin/, pi/, docs/ or .thoth/
  - Focused check and PASS evidence: `pnpm vitest run src/agents/prompt-rendering.test.ts src/harness/core/agent-pack.test.ts src/harness/core/agent-routing.test.ts src/harness/core/sdd-protocol.test.ts` passes, except only the shipped Codex payload parity test (`prompt-rendering.test.ts:1049-1065`). That test may fail solely because the payload has not been regenerated yet; it is deferred to T3. New assertions failed before the edit, and the caps are unchanged.
  - Return milestone: all T1 tests green, with lengths reported
  - Stop / reassessment: a cap cannot be met without changing meaning, or an existing assertion conflicts with the rule
- [x] AC-2: Root prompt and the sdd.ts protocol state the plan-review REJECT repair loop owned by root with a fresh Oracle each round
  - Outcome: REJECT loop rendered on every harness and encoded in the protocol
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts:220; src/harness/core/sdd.ts:367-384
  - Inputs: AC-2 and the Decisions
  - Dependencies: none (same T1 assignment)
  - Output: source and test changes
  - Owner: thoth-worker (T1)
  - Writes: same as the AC-1 row
  - Interface boundaries: optional review and separate Implement/Stop stay unchanged
  - Focused check and PASS evidence: same T1 test command passes, with assertions for the REJECT loop on every harness
  - Return milestone: with the T1 return
  - Stop / reassessment: wording that would make review mandatory
- [x] AC-3: Root prompt and the sdd.ts protocol state the small-work in-session plan
  - Outcome: small-work plan rule rendered and encoded without a record
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts:219; src/harness/core/sdd.ts:491,611-618,643-647
  - Inputs: AC-3 and AC-4
  - Dependencies: none (same T1 assignment)
  - Output: source and test changes
  - Owner: thoth-worker (T1)
  - Writes: same as the AC-1 row
  - Interface boundaries: small work stays artifact-free and still cannot enter planning phases
  - Focused check and PASS evidence: same T1 test command passes, with assertions for the small in-session plan
  - Return milestone: with the T1 return
  - Stop / reassessment: conflict with the small-phase ordering tests
- [x] AC-4: sdd.ts protocol encodes root record authorship
  - Outcome: protocol data names root as record author and repairer
  - Known entrypoints and skill paths: src/harness/core/sdd.ts:237,305,367-384
  - Inputs: AC-4
  - Dependencies: none (same T1 assignment)
  - Output: source and test changes
  - Owner: thoth-worker (T1)
  - Writes: same as the AC-1 row
  - Interface boundaries: validator behavior unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/harness/core/sdd-protocol.test.ts` passes, with new assertions
  - Return milestone: with the T1 return
  - Stop / reassessment: the protocol shape would need a validator change
- [x] AC-6: Worker and Designer prompts exclude .thoth/changes records
  - Outcome: write-capable specialist prompts refuse `.thoth/changes/` writes within the 5,000-character cap
  - Known entrypoints and skill paths: src/harness/core/agent-pack.ts:238-240,259-261; src/agents/prompt-sections.ts:310-313
  - Inputs: AC-6
  - Dependencies: none (same T1 assignment)
  - Output: source and test changes
  - Owner: thoth-worker (T1)
  - Writes: same as the AC-1 row
  - Interface boundaries: Explorer, Librarian and Oracle prompts unchanged except for shared text
  - Focused check and PASS evidence: prompt-rendering specialist assertions pass and the 5,000-character cap holds
  - Return milestone: with the T1 return
  - Stop / reassessment: the cap is exceeded
- [x] AC-5: Skills and template state root-only authorship, the REJECT loop and the small in-session plan consistently
  - Outcome: thoth-sdd, its phases, the template and plan-reviewer are aligned
  - Known entrypoints and skill paths: skills/thoth-sdd/SKILL.md:24-27,35-38,51-58,74-84; skills/thoth-sdd/references/phases/{plan,tasks,checklist,converge,implement}.md; skills/thoth-sdd/templates/change.md:56; skills/plan-reviewer/SKILL.md:57-59
  - Inputs: this record's Intent, Decisions and AC-5
  - Dependencies: none (parallel with T1)
  - Output: skill text and test changes
  - Owner: thoth-worker (T2)
  - Writes: skills/thoth-sdd/**, skills/plan-reviewer/SKILL.md, src/harness/core/sdd.test.ts, src/harness/bundled-skills.test.ts (actual path as found)
  - Interface boundaries: validator scripts and result contract unchanged; template field names and accepted values unchanged
  - Focused check and PASS evidence: `pnpm vitest run src/harness/core/sdd.test.ts` plus the bundled-skills test and `sdd-validator.test.ts` pass
  - Return milestone: T2 tests green
  - Stop / reassessment: any change would alter validator-parsed template fields
- [x] AC-7: Mirrors regenerated and docs updated
  - Outcome: plugin/ and pi/ match their sources; the three docs describe the rule
  - Known entrypoints and skill paths: src/harness/generate-integration-packages.ts; package.json integration:sync; docs/agent/agents-and-delegation.md; docs/agent/sdd-and-skills.md; docs/sdd-pipeline.md
  - Inputs: accepted T1 and T2 outputs
  - Dependencies: T1 and T2 accepted by root
  - Output: regenerated mirrors and doc edits
  - Owner: thoth-worker (T3)
  - Writes: plugin/**, pi/** (generated only), the three docs files
  - Interface boundaries: no hand edits to generated files
  - Focused check and PASS evidence: `pnpm run integration:sync` is clean on rerun; generate-integration-packages and bundled-skills tests pass; the shipped Codex payload parity test in `prompt-rendering.test.ts` passes unfiltered
  - Return milestone: the mirrors are in sync and the docs are edited
  - Stop / reassessment: generation touches unrelated files
- [x] AC-8: Local closeout gate
  - Outcome: caps unchanged and the gate passes
  - Known entrypoints and skill paths: AGENTS.md closeout gate; docs/agent/testing.md
  - Inputs: T1–T3 outputs
  - Dependencies: T3 accepted
  - Output: command results
  - Owner: thoth-worker (T3)
  - Writes: normal generated outputs of `pnpm run build` only (dist/, plugin/, pi/)
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck` and `pnpm run build` exit 0, the build's normal generated outputs stay in sync, and the focused tests from T1, T2 and T3 pass unfiltered
  - Return milestone: with the T3 return
  - Stop / reassessment: an unrelated environment failure is reported, not fixed
- [x] AC-8: Convergence round 1 repairs the compression drifts and the stale contract patterns
  - Outcome: the choice-budget guard and the risk-qualified small-patch rule have their prior meaning again, and `evals/contracts.test.ts` passes with equivalent coverage
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts:218,221; src/agents/prompt-rendering.test.ts:304-307; evals/contracts.json; evals/contracts.test.ts; tdd and simplify skills
  - Inputs: final-verification FAIL findings (record SHA-256 e303e65e...); Decisions
  - Dependencies: none
  - Output: source, test and contract-pattern changes
  - Owner: thoth-worker (T4)
  - Writes: src/agents/prompt-sections.ts, src/harness/core/agent-pack.ts, src/agents/prompt-rendering.test.ts, src/agents/index.test.ts, src/harness/adapters/{opencode,codex,claude-code,pi}.test.ts, evals/contracts.json
  - Interface boundaries: caps unchanged; user-facing literals and gate tokens unchanged; only literal updates that keep their meaning in index/adapter/eval tests, with no weakening of behavioral coverage
  - Focused check and PASS evidence: `pnpm exec vitest run evals/contracts.test.ts`, the prompt-rendering tests, `src/agents/index.test.ts` and the four adapter tests pass, with the guard and the risk qualification asserted
  - Return milestone: with the T4 return
  - Stop / reassessment: caps cannot be met while keeping meaning
- [x] AC-9: The REJECT/FAIL contrast is rendered and encoded everywhere
  - Outcome: root prompts on every harness, the sdd.ts converge/verify protocol, converge.md/verify.md and the docs state REJECT → root repairs the record, and FAIL → the owning Worker or Designer repairs, then a fresh Oracle, with planning reopened on material change
  - Known entrypoints and skill paths: src/agents/prompt-sections.ts:216-228; src/harness/core/sdd.ts:209,440-451,666; skills/thoth-sdd/references/phases/{converge,verify}.md; skills/thoth-sdd/SKILL.md; docs/agent/agents-and-delegation.md; docs/agent/sdd-and-skills.md; docs/sdd-pipeline.md
  - Inputs: AC-9 and the Decisions
  - Dependencies: none (same T4 assignment)
  - Output: source, skill, doc, test and contract changes plus regenerated mirrors
  - Owner: thoth-worker (T4)
  - Writes: the T4 writes above (including src/agents/index.test.ts and the four adapter tests) plus src/harness/core/sdd.ts, src/harness/core/sdd-protocol.test.ts, src/harness/core/sdd.test.ts, src/harness/bundled-skills.test.ts, skills/thoth-sdd/**, the three docs, and generated plugin/** and pi/**
  - Interface boundaries: optional plan review and Implement/Stop unchanged; validator unchanged; no .thoth/ writes
  - Focused check and PASS evidence: all T1–T3 focused tests unfiltered, `evals/contracts.test.ts`, `src/agents/index.test.ts`, the four adapter tests, `pnpm run check:ci`, `pnpm run typecheck` and `pnpm run build` pass. The integration:sync rerun is idempotent. Full `pnpm test` also runs as a sweep for any remaining prompt-text pins: change-caused failures are fixed, and unrelated environment failures are reported with output. Assertions cover the recordless-small FAIL boundary and the explicit direct-work exception.
  - Return milestone: the T4 gate is green, with root lengths reported
  - Stop / reassessment: caps cannot be met while keeping meaning, or generation touches unrelated files
- [x] AC-8: Convergence round 2 restores the deprecated-route guard coverage
  - Outcome: the three deprecated-route guards reject "Direct is ..." route declarations again while still accepting legitimate direct-work and full-role-scope wording
  - Known entrypoints and skill paths: src/harness/core/sdd-protocol.test.ts:218-225; src/harness/core/sdd.test.ts:303-310; src/harness/bundled-skills.test.ts:578-583; the HEAD versions of those guards; tdd skill
  - Inputs: final-verification round 2 FAIL (record SHA-256 0d177174...), finding guard-regression
  - Dependencies: none
  - Output: test-only changes with regression cases
  - Owner: thoth-worker (T5)
  - Writes: the three test files above only
  - Interface boundaries: no source, skill, prompt, doc or generated changes
  - Focused check and PASS evidence: the new regression cases reject "Direct is the route for tiny changes" and accept the current product wording, and the three files pass
  - Return milestone: the three files are green
  - Stop / reassessment: product wording would itself trip the restored guard
- [x] AC-8: Convergence round 3 restores full HEAD deprecated-route coverage through exact-phrase exemptions
  - Outcome: each of the three guards uses its unchanged HEAD regex on the text after removing only the exact legitimate phrases ("direct work", "direct-work", "full role scope"), so every case HEAD rejected is rejected again
  - Known entrypoints and skill paths: src/harness/core/sdd-protocol.test.ts:221-223; src/harness/core/sdd.test.ts:306-308; src/harness/bundled-skills.test.ts:580-582; their HEAD versions; tdd skill
  - Inputs: final-verification round 3 FAIL (record SHA-256 9a748958...), finding guard-regression
  - Dependencies: none
  - Output: test-only changes with negative and positive regression cases
  - Owner: thoth-worker (T6)
  - Writes: the three test files above only
  - Interface boundaries: no source, skill, prompt, doc or generated changes
  - Focused check and PASS evidence: the guards reject bare "accelerated", `"route":"full"`, "Full routes remain available", "Full workflows remain available" and "Direct is the route for tiny changes"; the current product text passes; the three files and evals/contracts pass
  - Return milestone: the three files are green with the counterexample table
  - Stop / reassessment: product text contains an obsolete term outside the exact exempt phrases

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 (fresh Oracle) returned REJECT on record SHA-256 25bf8ea1ab819829966c04a60000af94f137cfdc2a00ab4718c00af66d3c2bb1. The blockers were the T1/T3 shipped-payload test cycle and the missing `pnpm run build`; root repaired both in the record. Round 2 (fresh Oracle) returned OKAY on record SHA-256 01fd849beaa5a1b9dae8c616f1f7e7744ce8f14da46c534d68dad60268720da6, with recordDigest match. Nonblocking caution: root prompt headroom is tight, so report lengths before and after the change.
Final verification round 1 (fresh Oracle) returned FAIL on record SHA-256 e303e65ef40b64f680815142dbc7be49cd53da5d5f079e1d8a677a6b8a316d06. Findings: the choice-budget guard broadened, the small-patch risk qualification was lost, and six evals/contracts.test.ts failures. Root reopened the record for convergence round 1 and added AC-9 at the user's request. Plan review is re-offered for the grown scope.
Plan review round 3 (fresh Oracle, EXPLICIT_REVIEW) returned REJECT on record SHA-256 fa2d628972b9e79be91f091ad7ced58b3061f3001b001554dec68bc51e3bfa0e. Findings: the index and adapter tests were missing from T4, and the new delta did not handle the recordless small and explicit direct-work boundaries. Root repaired both in the record.
Plan review round 4 (fresh Oracle) returned OKAY on record SHA-256 bee75088081fea6a662e17e16e4721e816d9c1c520d1e597b60f085e135de0ab, with recordDigest match. Implementation of convergence round 1 proceeds under the user's prior explicit authorization (no Stop given). Nonblocking caution: Claude root headroom is only 2 characters.
Final verification round 2 (fresh Oracle) returned FAIL on record SHA-256 0d1771745cc82a75e61394c8a3bd0141d95a4dd5e15627ee9b201ae6854a1efe. AC-1..AC-7, AC-9, the deltas, the mirrors, the caps and the release-workflow independence passed. The only blocker: three deprecated-route test guards no longer reject "Direct is" declarations. Root recorded convergence round 2 (test-only, within settled intent, no replanning) and routed it to a Worker.
Final verification round 3 (fresh Oracle) returned FAIL on record SHA-256 9a74895848a9319896d8c739f08da9282a675e3f8c684d386baa5af480683510. Everything passed except the guards, which still accept obsolete vocabulary that HEAD rejected. Root recorded convergence round 3, which keeps the HEAD regexes and exempts only the exact legitimate phrases, and routed it to a Worker.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 0b801247f26261de9f732e6aa295298bd879698b6828acd901eba456b448e545

The PASS came from final verification round 4, by a fresh Oracle independent of Workers T1–T6. Its thoth-gate-verdict was valid:true with recordDigest match. Rounds 1–3 returned FAIL and their findings were repaired by Workers. The not-run items, build and integration:sync, reuse T4's evidence (exit 0, idempotent); round 4 changed only tests, and the reviewer checked mirror byte parity read-only. The unrelated release-workflow Windows timeout in T4's full sweep passed on independent rerun.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The guard regression is repaired without broadening exemptions. All nine acceptance criteria and four durable deltas remain satisfied.",
  "evidence": [
    {
      "id": "record",
      "kind": "validation",
      "locator": ".thoth/changes/root-owned-planning/root-owned-planning.md",
      "claim": "The verify gate returns valid:true; tasks are complete, review is OKAY, implementation is AUTHORIZED, and both canonical spec digests match.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "prompts",
      "kind": "diff-review",
      "locator": "src/agents/prompt-sections.ts; src/harness/core/agent-pack.ts",
      "claim": "All four harnesses preserve root-only record authorship, the fresh-Oracle REJECT loop, small-work planning, specialist write exclusions, and distinct FAIL repair ownership.",
      "basis": "observed",
      "uncertainty": "These are instruction contracts, not guarantees of model compliance."
    },
    {
      "id": "protocol-guidance",
      "kind": "diff-review",
      "locator": "src/harness/core/sdd.ts; skills/thoth-sdd/; skills/plan-reviewer/SKILL.md; three changed docs",
      "claim": "Protocol, skills, template and docs consistently implement the four deltas, including recordless-small FAIL handling, explicit direct-work boundaries and reopening planning on material change.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "guards",
      "kind": "comparison",
      "locator": "src/harness/core/{sdd-protocol,sdd}.test.ts; src/harness/bundled-skills.test.ts",
      "claim": "All three regexes exactly match HEAD. Helpers remove only word-bounded, case-insensitive 'direct work', 'direct-work' and 'full role scope'; no route/workflow declarations are exempted. Independent corpus checks covered 7,605 cases with zero non-exempt regressions and 27 retained mixed-phrase route rejections.",
      "basis": "observed",
      "uncertainty": "HEAD's bundled-skill regex intentionally has narrower coverage than the other two guards."
    },
    {
      "id": "tests",
      "kind": "execution",
      "locator": "Requested focused Vitest invocation",
      "claim": "All requested suites passed: 493 tests across 15 files, including current product wording, guard counterexamples, prompt contracts, adapters, validators, generation and eval contracts.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "quality-caps",
      "kind": "execution",
      "locator": "pnpm run check:ci; pnpm run typecheck; git diff --check HEAD; prompt-rendering.test.ts",
      "claim": "All commands exited 0. Biome reported 764 warnings and 9 informational diagnostics. Caps are unchanged. Root lengths: OpenCode 13291/13300, Codex 14796/14800, Claude 14198/14200, Pi 16662/16700; specialist cap tests pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "mirrors",
      "kind": "byte-comparison",
      "locator": "plugin/agents/; plugin/codex-hooks/payloads/; pi/agents/; plugin/skills/",
      "claim": "Seventeen rendered prompt mirrors and all 25 files across five bundled skills are byte-identical to their canonical sources.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "scope-freshness",
      "kind": "diff-review",
      "locator": "Full working-tree diff versus HEAD 022c952edb854c54e639efeddf186e3e21a6b8a7",
      "claim": "All 51 tracked changes are in scope; the sole untracked file is root's record. No unrelated changes, version bumps or apparent secrets were found. The 52-file input fingerprint remained unchanged through verification.",
      "basis": "observed",
      "uncertainty": "Credential-pattern scanning supplements manual review; it is not exhaustive secret detection."
    },
    {
      "id": "prior-build",
      "kind": "inherited-evidence",
      "locator": "Assignment history: final-verification round 3",
      "claim": "Prior build evidence remains applicable because this convergence round changed only the three test guards.",
      "basis": "inferred",
      "uncertainty": "Build and integration:sync were not rerun, as explicitly instructed."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Review canonical ownership diff and all-harness rendering assertions.",
      "outcome": "pass",
      "evidenceIds": ["prompts", "tests"],
      "reason": "Root-only authorship is outside execution allowances; planning specialists supply context without SDD writes."
    },
    {
      "check": "AC-2",
      "method": "Review rendered prompts and protocol REJECT-loop assertions.",
      "outcome": "pass",
      "evidenceIds": ["prompts", "protocol-guidance", "tests"],
      "reason": "Root repairs the same record, reruns affected gates and requests fresh Oracle review until OKAY or a human-owned blocker."
    },
    {
      "check": "AC-3",
      "method": "Check small-work prompt and phase-order contracts.",
      "outcome": "pass",
      "evidenceIds": ["prompts", "protocol-guidance", "tests"],
      "reason": "Root states scope, owner and focused verification before delegation or implementation, without a record."
    },
    {
      "check": "AC-4",
      "method": "Review sdd.ts diff and execute protocol tests.",
      "outcome": "pass",
      "evidenceIds": ["protocol-guidance", "tests"],
      "reason": "Protocol encodes root authorship, REJECT repair and small-work planning."
    },
    {
      "check": "AC-5",
      "method": "Compare canonical skills, relevant phases and template.",
      "outcome": "pass",
      "evidenceIds": ["protocol-guidance", "tests"],
      "reason": "Guidance consistently reserves record writing and repair to root."
    },
    {
      "check": "AC-6",
      "method": "Execute write-capable specialist assertions across harnesses.",
      "outcome": "pass",
      "evidenceIds": ["prompts", "tests"],
      "reason": "Worker and Designer exclude .thoth/changes/ records and require authorization."
    },
    {
      "check": "AC-7",
      "method": "Compare committed mirror bytes and review all three documentation diffs.",
      "outcome": "pass",
      "evidenceIds": ["mirrors", "protocol-guidance", "tests"],
      "reason": "Mirrors match canonical sources and docs describe the accepted rules."
    },
    {
      "check": "AC-8",
      "method": "Run requested focused suites, check:ci, typecheck and diff checks; compare caps and HEAD guards.",
      "outcome": "pass",
      "evidenceIds": ["guards", "tests", "quality-caps", "prior-build"],
      "reason": "Current checks pass; caps and prior rule meanings remain intact, including recommendation-qualified return budgets and risk-qualified small-patch escalation. Prior build evidence is reused."
    },
    {
      "check": "AC-9",
      "method": "Review gate distinctions across prompts, protocol, skills and docs; execute boundary assertions.",
      "outcome": "pass",
      "evidenceIds": ["prompts", "protocol-guidance", "tests"],
      "reason": "REJECT repairs belong to root; FAIL repairs belong to surface owners, with recordless-small and explicit direct-work boundaries, repeated independent verification and material-change replanning."
    },
    {
      "check": "HEAD guard preservation and product acceptance",
      "method": "Compare exact regex literals and exemption helpers; execute corpus and product-text tests.",
      "outcome": "pass",
      "evidenceIds": ["guards", "tests"],
      "reason": "Text without an exempt phrase is unchanged before applying the identical HEAD regex. The exemption list contains only the three exact legitimate phrases; embedded route declarations remain rejected."
    },
    {
      "check": "Four durable deltas",
      "method": "Compare each normative delta and scenario with implementation and canonical baselines.",
      "outcome": "pass",
      "evidenceIds": ["record", "prompts", "protocol-guidance", "tests"],
      "reason": "All four additions are implemented consistently and extend the reviewed baselines without conflict."
    },
    {
      "check": "Scope, secrets, versions and freshness",
      "method": "Review full diff, scan added credential patterns and compare before/after input fingerprints.",
      "outcome": "pass",
      "evidenceIds": ["scope-freshness"],
      "reason": "No blocking scope or hygiene findings; reviewed inputs remained unchanged."
    },
    {
      "check": "Build and integration:sync rerun",
      "method": "Not executed.",
      "outcome": "not-run",
      "evidenceIds": ["prior-build", "mirrors"],
      "reason": "Explicitly prohibited by the assignment; prior evidence is reused and committed mirror parity was independently checked read-only."
    }
  ],
  "risks": [
    {
      "description": "Root prompt headroom remains tight, particularly Claude at 2 characters and Codex at 4; future wording changes must retain cap checks.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["quality-caps"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this result, record PASS evidence and the matching digest, then run closeout.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/root-owned-planning/root-owned-planning.md",
    "reviewedRecordSha256": "0b801247f26261de9f732e6aa295298bd879698b6828acd901eba456b448e545"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | four-harness rendering assertions in prompt-rendering/agent-routing/agent-pack tests | Oracle round 4: 493 tests across 15 files pass; root-only authorship outside the execution allowances
- AC-2: PASS | rendered REJECT-loop assertions and sdd-protocol tests | Oracle round 4: root repairs, reruns gates, fresh Oracle until OKAY or a human blocker
- AC-3: PASS | small-work prompt and phase-order tests | Oracle round 4: in-session scope/owner/verification plan, no record
- AC-4: PASS | sdd.ts diff and sdd-protocol tests | Oracle round 4: authorship, REJECT repair and small plan encoded
- AC-5: PASS | sdd.test.ts, bundled-skills and sdd-validator tests | Oracle round 4: skills, phases, template and plan-reviewer consistent
- AC-6: PASS | all-harness writer assertions | Oracle round 4: Worker/Designer refuse .thoth/changes/ writes
- AC-7: PASS | byte comparison of 17 prompt mirrors and 25 skill files, plus generate-integration-packages test | Oracle round 4: mirrors identical; three docs updated
- AC-8: PASS | focused suites, evals/contracts, check:ci, typecheck, unchanged caps, HEAD guard regexes; build exit 0 (T4) | Oracle round 4: caps OpenCode 13291, Codex 14796, Claude 14198, Pi 16662; meaning preserved
- AC-9: PASS | gate-contrast assertions on prompts, protocol, skills and docs | Oracle round 4: REJECT→root, FAIL→surface owner, recordless/direct-work boundaries
- Source: .thoth/specs/adaptive-sdd/spec.md | sha256:e87628cbf2202240d6f992a2aca8a07ea8727c3a2286dc00a7108ed5dc4649ba
- Source: .thoth/specs/agent-delegation/spec.md | sha256:65307193bcf8e602aa072955c98e19f3f06e8304d89b549b1b74ff8cb19e8175

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
