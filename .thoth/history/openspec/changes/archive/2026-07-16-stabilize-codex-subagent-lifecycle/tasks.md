# Tasks: Stabilize Codex Subagent Lifecycle

## Planning Basis

- Pipeline: accelerated; the approved proposal is the acceptance reference and no delta spec or design artifact is implied.
- Persistence: OpenSpec only. The canonical topic key is `sdd/stabilize-codex-subagent-lifecycle/tasks`, but it is not persisted to thoth-mem in this mode.
- Traceability: every `Spec:` tag below names an exact requirement heading from an existing governing main spec.
- Task controls: `rules.tasks.tdd` is `false`, so the focused red-test tasks are practical sequencing choices rather than a TDD gate. `rules.tasks.parallel_markers` is `false`, so no parallel markers are emitted.
- Boundaries: preserve OpenCode behavior, the seven-role roster and permissions, thoth-mem ownership, SDD phase and gate semantics, artifact names, and topic keys. `src/harness/core/agent-pack.ts` is an inspection-only role-boundary reference and is not an implementation target.

## Validation Gaps

| Target | Checks performed | Impact / task disposition | Next action |
| --- | --- | --- | --- |
| Exact terminal labels, payload fields, error variants, default wait behavior, and polling semantics exposed by an active Codex host | Reviewed the approved proposal and handoff, the typed dialect surface in `src/agents/prompt-dialects.ts`, the generated root guidance in `src/harness/adapters/codex.ts`, and the unsupported programmatic lifecycle record in `src/harness/adapters/codex-surfaces.ts`; no universal documented or observed payload contract is established in the approved scope | Not an execution blocker for instruction-level policy. Tasks 1.3-2.4 must use semantic terminal/nonterminal categories, must not encode invented fields or labels, and must not add numeric deadlines, polling intervals, or implicit timeouts | During implementation, consume a binding only if it is documented or observed in the active host; otherwise retain explicit instruction-only or unsupported disclosure and keep host-specific optimization deferred |

## Phase 1: Canonical Lifecycle and Routing Contracts

- [x] 1.1 Add a focused failing SDD routing contract for complexity-only task fallback — `src/harness/core/sdd.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Define Harness-Agnostic Agent-Pack Contracts`
  **Independent Test:** Run only the SDD contract test and confirm the new assertion distinguishes quick-by-default routing from deep eligibility based on task-plan complexity.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts`
  - Expected: Existing assertions remain green and the new assertion is red before task 1.2 because the tasks phase does not yet expose the complexity condition directly.

- [x] 1.2 Encode the task-plan complexity condition in the canonical SDD phase contract — `src/harness/core/sdd.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Define Harness-Agnostic Agent-Pack Contracts`
  **Independent Test:** Run the SDD contract test and inspect the tasks phase in isolation: quick remains the default, deep remains the only alternate, and deep is eligible only when the task plan is complex.
  **Verification**:
  - Run: `pnpm test -- src/harness/core/sdd.test.ts`
  - Expected: The focused file passes with an explicit complexity condition while all existing phase owners, prerequisites, gates, and verification-loop rules remain unchanged.

- [x] 1.3 Add failing dialect assertions for portable wait/status concepts and Codex capability disclosure — `src/agents/prompt-dialects.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Derive Harness-Specific Wording from Typed Dialects and Capabilities`
  **Independent Test:** Run only the dialect tests and confirm the new assertions require typed terminal-state and same-session probe terminology without assuming a universal host payload.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-dialects.test.ts`
  - Expected: Existing OpenCode and Codex nomenclature assertions remain green and the new lifecycle terminology assertions are red before task 1.4.

- [x] 1.4 Extend typed prompt dialects with lifecycle status and probe terminology — `src/agents/prompt-dialects.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Derive Harness-Specific Wording from Typed Dialects and Capabilities`
  **Independent Test:** Run the dialect tests alone and verify OpenCode retains its native `task_status` binding, Codex retains `multi_agent_v1.wait_agent`, and unavailable lifecycle enforcement remains instruction-only or unknown.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-dialects.test.ts`
  - Expected: The focused file passes without adding host-specific payload fields, terminal labels, numeric waits, or Codex terminology to the OpenCode dialect.

- [x] 1.5 Add failing shared-prompt assertions for terminal guards, shared quality retry, capacity isolation, and the OpenCode baseline — `src/agents/prompt-rendering.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Verify OpenCode and Codex Prompt Contracts with Focused Tests`
  **Independent Test:** Run only shared prompt rendering tests and confirm new assertions separately cover quiet/nonterminal progress, same-session probing, allowed stop conditions, one shared result-quality retry, nonterminal zero-retry probing, same-role capacity recovery, complexity-only quick-to-deep routing, and absence of Codex lifecycle wording in OpenCode output.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts`
  - Expected: Existing prompt and seven-role assertions remain green while the new lifecycle-chain assertions are red before task 1.6.

- [x] 1.6 Render terminal-state guards, same-session probing, shared quality retry, and complexity-only fallback in the root policy — `src/agents/prompt-sections.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Render Agent Prompts from Harness-Neutral Semantic Policies`
  **Independent Test:** Render the root prompt through the focused tests and verify that quiet/nonterminal outcomes stay in progress; probes stay on the same session and consume no retry; close, cancellation, retry, or reroute requires terminal evidence, an explicit user deadline, user cancellation, or a superseding request; generic quality and required-artifact checks share at most one sharpened retry; capacity retains its separate same-role allowance of up to three attempts; and deep appears for sdd-tasks only when the plan is complex.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/prompt-dialects.test.ts src/harness/core/sdd.test.ts`
  - Expected: All three focused files pass, no automatic numeric duration or polling interval is rendered, and OpenCode keeps its native terminology and behavior.

## Phase 2: Codex Binding and Capability Disclosure

- [x] 2.1 Add failing Codex root-instruction assertions for wait-and-probe and lifecycle stop guards — `src/harness/adapters/codex.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Verify OpenCode and Codex Prompt Contracts with Focused Tests`
  **Independent Test:** Render only Codex root instructions and assert same-session `multi_agent_v1.wait_agent` probing, terminal/nonterminal classification, explicit allowed stop conditions, the shared quality-retry budget, close-after-terminal guidance, and capability-gap disclosure without numeric waits.
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts`
  - Expected: Existing Codex packaging and handoff assertions remain green while the new lifecycle assertions are red before task 2.2.

- [x] 2.2 Bind the shared lifecycle contract into generated Codex root guidance — `src/harness/adapters/codex.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Define Root Coordinator Prompt Contract`
  **Independent Test:** Render Codex root instructions in isolation and verify the root waits or probes the same subagent session before acting, closes completed sessions only after consuming the result, preserves user cancellation/deadline/superseding escape paths, and discloses when terminal status cannot be established reliably.
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex.test.ts`
  - Expected: The focused file passes with portable `multi_agent_v1` guidance and without claims of hard runtime enforcement, invented host payload fields, fixed polling intervals, or implicit timeouts.

- [x] 2.3 Add failing Codex surface assertions for unsupported lifecycle enforcement — `src/harness/adapters/codex-surfaces.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Disclose Codex Capability and Governance Limits`
  **Independent Test:** Run only the Codex surface tests and require the programmatic delegation record to expose terminal-status, retry-accounting, and automatic-close limitations while retaining unsupported status and instruction-only fallback.
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex-surfaces.test.ts`
  - Expected: Existing surface diagnostics remain green and the new lifecycle capability assertions are red before task 2.4.

- [x] 2.4 Expand the Codex programmatic-delegation surface record without claiming runtime support — `src/harness/adapters/codex-surfaces.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Disclose Codex Capability and Governance Limits`
  **Independent Test:** Inspect the programmatic delegation record through its focused test and confirm terminal-state detection, retry accounting, status probing, and automatic session close remain explicitly unsupported or instruction-only until a documented binding exists.
  **Verification**:
  - Run: `pnpm test -- src/harness/adapters/codex-surfaces.test.ts`
  - Expected: The focused file passes; the record remains `unsupported` with `instruction-only` fallback and contains no fabricated payload schema or mechanical enforcement claim.

- [x] 2.5 Verify the complete shared-to-Codex lifecycle rendering chain — shared prompt, dialect, SDD, adapter, and surface tests
  **[USN-2]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Verify OpenCode and Codex Prompt Contracts with Focused Tests`
  **Independent Test:** Run the five lifecycle-focused files together and confirm their combined assertions cover semantic policy, typed binding, complexity routing, generated Codex instructions, instruction-only disclosure, and the unchanged OpenCode baseline.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/prompt-dialects.test.ts src/harness/core/sdd.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/codex-surfaces.test.ts`
  - Expected: All five focused files pass with no stacked quality retries, silence-triggered lifecycle action, capacity-driven role substitution, unconditional quick-to-deep fallback, or Codex lifecycle wording in OpenCode output.

## Phase 3: Bounded sdd-tasks Validation

- [x] 3.1 Add failing packaged-skill assertions for bounded validation and structured gaps — `src/harness/writers/skill-layout.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Preserve SDD Skills Portability`
  **Independent Test:** Render the packaged `sdd-tasks` skill alone and require anchors for reusing approved exploration/handoff evidence, validating only accepted affected areas and authoritative commands plus referenced files and neighboring tests, and reporting unresolved references with target, checks performed, impact or disposition, and next action.
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: Existing packaging and SDD semantic anchors remain green while the new bounded-validation and Validation Gaps assertions are red before task 3.2.

- [x] 3.2 Replace broad sdd-tasks rediscovery with bounded validation and structured Validation Gaps — `src/skills/sdd-tasks/SKILL.md`
  **[USN-3]** | Priority: P1
  **Spec:** `skill-instructions/Express Shared Skill Semantics in Harness-Neutral Language`
  **Independent Test:** Render the skill through the package writer and verify it reuses settled proposal, design, exploration, and handoff evidence first; limits validation to accepted affected areas, the authoritative command source, task-referenced existing files, and neighboring relevant tests; never presents an unverified path or command as confirmed; and emits one structured gap entry per unresolved reference with escalation or complexity-based routing guidance.
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: The focused file passes and the skill still preserves persistence modes, canonical task formatting, traceability, per-task Verification blocks, plan-review handoff, and OpenCode-compatible semantics without mandating repository-wide discovery.

- [x] 3.3 Verify bounded sdd-tasks semantics survive packaging without weakening the OpenCode baseline — `src/harness/writers/skill-layout.test.ts`
  **[USN-3]** | Priority: P2
  **Spec:** `skill-instructions/Preserve OpenCode Baseline Skill Behavior`
  **Independent Test:** Run only the skill-layout suite and inspect its semantic anchors for both the new bounded workflow and the existing artifact, persistence, scope-preservation, verification, and plan-review responsibilities.
  **Verification**:
  - Run: `pnpm test -- src/harness/writers/skill-layout.test.ts`
  - Expected: All skill-layout tests pass, plugin-bundled content contains the bounded validation and gap contract, and no existing OpenCode SDD behavior or gate requirement is removed.

## Phase 4: Cross-Harness Regression and CI Evidence

- [x] 4.1 Run the six-file focused contract suite against the complete change — all focused verification targets
  **[USN-4]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Verify OpenCode and Codex Prompt Contracts with Focused Tests`
  **Independent Test:** Execute the six proposal-listed test files together and inspect failures by boundary: shared prompt, dialect, SDD route, Codex root, Codex surface, or packaged skill.
  **Verification**:
  - Run: `pnpm test -- src/agents/prompt-rendering.test.ts src/agents/prompt-dialects.test.ts src/harness/core/sdd.test.ts src/harness/adapters/codex.test.ts src/harness/adapters/codex-surfaces.test.ts src/harness/writers/skill-layout.test.ts`
  - Expected: All six focused files and every contained test pass, covering the full quiet-to-probe-to-terminal-to-quality-validation chain, complexity-only routing, bounded skill validation, instruction-only disclosure, and OpenCode preservation.

- [x] 4.2 Run repository formatting, lint, and type-safety gates for the scoped implementation — affected TypeScript, tests, and skill content
  **[USN-4]** | Priority: P2
  **Spec:** `multi-harness-agent-pack/Keep Harness-Agnostic Prompt Work Within Approved Scope`
  **Independent Test:** Run the non-mutating repository checks and attribute any failure only after confirming whether it is caused by an in-scope changed file or by preserved unrelated work.
  **Verification**:
  - Run: `pnpm run check:ci`
  - Expected: Biome reports no formatting or lint errors and applies no fixes.
  - Run: `pnpm run typecheck`
  - Expected: TypeScript completes with no errors and emits no files.

- [x] 4.3 Run the build and full regression suite while preserving all declared invariants — repository
  **[USN-4]** | Priority: P1
  **Spec:** `multi-harness-agent-pack/Preserve OpenCode Baseline Behavior`
  **Independent Test:** Build the package and run the complete test suite, then confirm no change was required in `src/harness/core/agent-pack.ts`, OpenCode runtime wiring, thoth-mem ownership, SDD gates, artifact names, or topic keys.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: The package, declarations, and generated schema build successfully using the existing pipeline.
  - Run: `pnpm test`
  - Expected: The full Vitest suite passes with the seven-role roster, OpenCode runtime behavior, lifecycle capability disclosures, SDD semantics, and skill packaging contracts intact.
