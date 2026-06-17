# Tasks: Codify the SDD Verify Phase as an Autonomous Verify-Loop

## Open Questions (resolve before or during apply)

> **OQ-1 — Warnings-as-own-gate confirmation**: The design keeps `pass with
> warnings` as a sub-branch of `iterative-verify` in orchestrator prose (no new
> gate value). Confirm this is the accepted resolution before implementing the
> `sdd.ts` gate union, as it directly constrains the set of values added.
>
> **OQ-2 — Harness without a blocking primitive (deferral)**: The design handles
> this with a prose fallback (report unsupported-capability). Confirm no typed
> `HarnessCapabilities` member is needed now; flag the follow-up item in the
> change notes so it is not silently dropped.

---

## Phase 1: Contract & Type Layer (`src/harness/core/sdd.ts`)

- [x] 1.1 Export the canonical round-bound constant — `src/harness/core/sdd.ts`
  Add `export const SDD_VERIFY_MAX_ROUNDS = 3;` near the top of the module's
  exports (before `SDD_PHASES`). This is the single source of truth referenced
  by the phase literal, the orchestrator prose, and the tests.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: No TypeScript errors; `SDD_VERIFY_MAX_ROUNDS` is importable from
    the module without error.

- [x] 1.2 Widen the `gate` union type — `src/harness/core/sdd.ts` (~L25)
  Change `gate?: 'oracle-review' | 'user-confirmation'` to
  `gate?: 'oracle-review' | 'user-confirmation' | 'iterative-verify'`.
  This is additive; no existing phase literal writes this value yet.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Compiler accepts the widened union with no exhaustiveness errors
    anywhere in `src/` (design audit confirms no `switch(phase.gate)`
    exhaustion).

- [x] 1.3 Add `maxRounds?: number` to `SddPhaseContract` — `src/harness/core/sdd.ts` (~L19-40)
  Insert `maxRounds?: number;` as an optional field on the `SddPhaseContract`
  interface. Placement: immediately after `gate?` for readability. Absence
  means "not an iterative phase" for all non-verify phases.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Interface compiles; all existing phase literals that omit
    `maxRounds` are accepted without error (optional field).

- [x] 1.4 Set `gate` and `maxRounds` on the `verify` phase literal — `src/harness/core/sdd.ts` (~L190-201)
  Add `gate: 'iterative-verify',` and `maxRounds: SDD_VERIFY_MAX_ROUNDS,` to
  the `verify` entry in `SDD_PHASES`. The `getSddWorkflowContract` clone fn
  requires no change — primitives are already copied by the `...phase` spread
  (confirmed by design audit at L242-259).
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: `as const satisfies readonly SddPhaseContract[]` assertion on
    `SDD_PHASES` still compiles; no type error on the `verify` literal.

- [x] 1.5 Add a `verificationRules` entry for the bounded verify-loop —
  `src/harness/core/sdd.ts` (`SDD_WORKFLOW_CONTRACT.verificationRules`, ~L235-239)
  Append: `"Verify runs as a bounded iterative gate of at most
  SDD_VERIFY_MAX_ROUNDS rounds; on exhausted failure escalate to the user."`
  This keeps the rule set in sync with the new gate semantics (design:
  "optional, recommended").
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: No compile error; the string is present in the built contract.

---

## Phase 2: Orchestrator Wording (`src/agents/prompt-sections.ts`)

- [x] 2.1 Replace the linear post-execution line with the three-branch
  verify-loop narrative — `src/agents/prompt-sections.ts` (~L377)
  Remove `Post-execution: delegate sdd-verify, then sdd-archive when
  verification passes.` and replace with the exact multi-line block from the
  design's File Changes section (covering: iterative gate dispatch at round 1;
  clean `pass` → existing user gate → `sdd-archive`; `fail` with rounds
  remaining → targeted `sdd-apply` scoped by Critical Issue anchors →
  re-verify; `fail` at round 3 → `{{userQuestionTool}}` escalation +
  unsupported-capability fallback; `pass with warnings` → `{{userQuestionTool}}`
  advance-vs-iterate choice → targeted fix if re-iterate, subject to the
  3-round bound).
  The literal "3 rounds" in the prose MUST agree with `SDD_VERIFY_MAX_ROUNDS`.
  The clean-pass branch MUST explicitly route through the existing pre-archive
  user gate (lines 375-376) without restating or altering it.
  No other `.gate` reads exist in this file (confirmed by design audit).
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: File compiles; no broken template-literal or string continuations.
  - Run: `pnpm run lint src/agents/prompt-sections.ts`
  - Expected: No lint errors in the modified file.

---

## Phase 3: Skill Contracts

- [x] 3.1 Upgrade `## Issues Found` to structured remediation shape —
  `src/skills/sdd-verify/SKILL.md` (~L81-99)
  Replace the prose `## Issues Found` block in the report template with the
  structured Critical/Warnings layout from the design: `### Critical` and
  `### Warnings` sub-sections, each item carrying a stable id (`C1`, `C2`, …` /
  `W1`, `W2`, …`), at least one `file:` and/or `scenario:`/`criterion:` anchor,
  and a `fix:` imperative instruction. A Critical Issue with no anchor is
  explicitly invalid per the design.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Skill `.md` is packaged without error (it is included in the
    `files` array in `package.json`).

- [x] 3.2 Add `## Round` field to the `sdd-verify` report template —
  `src/skills/sdd-verify/SKILL.md`
  Insert a `## Round` field carrying the `round N` marker into the report
  template. This field is the source of truth for the round counter across
  iterations.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds; the `## Round` heading is present in the packaged
    skill file.

- [x] 3.3 Update the Output Format / return envelope in `sdd-verify` —
  `src/skills/sdd-verify/SKILL.md`
  Change `Critical Issues` return field from "bullets or `None`" to the
  anchored compact format (`id — file:line — scenario/criterion — fix`); add a
  `Round` return field (`round N`). Mirror the structured shape so the
  orchestrator can consume it programmatically.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds with no packaging error.

- [x] 3.4 Update Prerequisites/Workflow in `sdd-verify` to accept round from
  dispatch — `src/skills/sdd-verify/SKILL.md`
  Document that the dispatch envelope carries an expected `round N`; `sdd-verify`
  MUST stamp that number into the `## Round` field and the `Round` return field.
  Document that the round number is the loop's source of truth for bound
  enforcement.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds.

- [x] 3.5 Add rules for anchor requirement and round stamping in `sdd-verify` —
  `src/skills/sdd-verify/SKILL.md`
  Append to the Rules section: (a) "Every Critical Issue MUST carry at least
  one remediation anchor (file: and/or scenario:/criterion:); prose-only
  Critical Issues are invalid output." and (b) "Stamp the `round N` marker from
  the dispatch envelope into `## Round`."
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds.

- [x] 3.6 Replace single-shot verify handoff with verify-loop wording in
  `executing-plans` Phase 5 — `src/skills/executing-plans/SKILL.md` (~L183-191)
  Replace the single "suggest `sdd-verify` as the next step" line (~L191) with
  verify-loop wording: after final implementation, hand off to the bounded
  verify-loop (dispatch `sdd-verify` as an iterative gate; branch on
  `fail`/`pass with warnings`/clean `pass`; targeted fix scoped by remediation
  anchors; "the 3-round bound in the orchestrator SDD wording" — do NOT repeat
  the literal number here to avoid drift).
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds; no broken Markdown structure.

---

## Phase 4: Tests

- [x] 4.1 Assert `verify` phase carries `iterative-verify` gate + `maxRounds: 3`
  — `src/harness/core/sdd.test.ts`
  Add a test (alongside or as a sibling of the existing gate assertions at
  ~L48-56) that calls `getSddPhase('verify')` (or reads `SDD_PHASES` directly)
  and asserts `{ gate: 'iterative-verify', maxRounds: 3 }` via `toMatchObject`.
  **Verification**:
  - Run: `pnpm test -- --reporter=verbose src/harness/core/sdd.test.ts`
  - Expected: New test passes; all pre-existing tests in this file still pass.

- [x] 4.2 Assert `plan-review` and `implementation-confirmation` gate values are
  unchanged — `src/harness/core/sdd.test.ts`
  Add (or extend the same test block) to assert `plan-review` still has
  `gate: 'oracle-review'` and `implementation-confirmation` still has
  `gate: 'user-confirmation'`. This is the regression guard for the
  additive-non-breaking requirement (spec scenario: "Existing gate consumers
  continue to behave correctly").
  **Verification**:
  - Run: `pnpm test -- --reporter=verbose src/harness/core/sdd.test.ts`
  - Expected: Regression assertions pass.

- [x] 4.3 Assert `SDD_VERIFY_MAX_ROUNDS` is 3 and equals `verify.maxRounds` —
  `src/harness/core/sdd.test.ts`
  Add a test that imports `SDD_VERIFY_MAX_ROUNDS` and asserts it equals `3` and
  that the `verify` phase literal's `maxRounds` equals `SDD_VERIFY_MAX_ROUNDS`.
  This guards the prose/contract drift risk (spec: "Contract round bound agrees
  with orchestrator wording").
  **Verification**:
  - Run: `pnpm test -- --reporter=verbose src/harness/core/sdd.test.ts`
  - Expected: Constant and phase value agree; test passes.

- [x] 4.4 Assert rendered orchestrator prompt contains three verify branches and
  3-round bound — `src/agents/prompt-rendering.test.ts`
  Add assertions that the rendered `<sdd>` section contains all three verdict
  branches (strings identifying the `fail`, `pass with warnings`, and clean
  `pass` paths), the bound reference ("3 rounds" or "round 3"), and
  `{{userQuestionTool}}` escalation language. Mirror the existing "Plan gate"
  assertion style (~L274).
  **Verification**:
  - Run: `pnpm test -- --reporter=verbose src/agents/prompt-rendering.test.ts`
  - Expected: New assertions pass.

- [x] 4.5 Assert the old linear post-execution line is absent from the rendered
  prompt — `src/agents/prompt-rendering.test.ts`
  Add a negative assertion that the rendered orchestrator prompt does NOT contain
  `"then sdd-archive when verification passes"` (the removed linear line from
  ~L377). This prevents silent reintroduction of the single-shot wording.
  **Verification**:
  - Run: `pnpm test -- --reporter=verbose src/agents/prompt-rendering.test.ts`
  - Expected: Negative assertion passes (string not found in rendered output).

- [x] 4.6 Assert `{{userQuestionTool}}` substitution still resolves per harness
  in the verify-loop wording — `src/agents/prompt-rendering.test.ts`
  Extend or add an assertion that, for each supported dialect (OpenCode, Claude
  Code, Codex), the rendered prompt substitutes `{{userQuestionTool}}` with the
  dialect-specific tool name (`question`, `AskUserQuestion`, `request_user_input`
  respectively) in the verify-loop block. Mirrors existing dialect-rendering
  coverage.
  **Verification**:
  - Run: `pnpm test -- --reporter=verbose src/agents/prompt-rendering.test.ts`
  - Expected: All three dialect substitutions resolve correctly.

---

## Phase 5: Full CI Gate

- [x] 5.1 Run lint across the full codebase — all modified `src/` files
  Confirm no lint errors are introduced in any of the four modified source
  files (`sdd.ts`, `prompt-sections.ts`) or the two test files.
  **Verification**:
  - Run: `pnpm run lint`
  - Expected: Zero lint errors or warnings that weren't present before this
    change.

- [x] 5.2 Run typecheck across the full codebase
  Confirm the additive union widening (`'iterative-verify'`) and new optional
  field (`maxRounds?`) introduce no exhaustiveness or compatibility errors at
  any consumer.
  **Verification**:
  - Run: `pnpm run typecheck`
  - Expected: Zero TypeScript errors.

- [x] 5.3 Run full build
  Confirm skill `.md` files are packaged and all TypeScript compiles to `dist/`.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build completes without errors; `dist/` is populated.

- [x] 5.4 Run full test suite
  Confirm all pre-existing tests continue to pass alongside the new tests added
  in Phase 4.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All tests pass with no regressions.
