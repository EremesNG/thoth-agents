# Proposal: Stabilize Codex Subagent Lifecycle

## Intent

Codex root guidance can currently treat a quiet or nonterminal subagent wait as
an empty result. That classification can cascade through three independent
paths: a generic invalid-result retry, an SDD missing-artifact retry, and a
rendered quick-to-deep fallback that no longer carries the source contract's
complexity condition. A healthy agent doing legitimate validation work can
therefore be cancelled, retried, or rerouted before it has reached a terminal
state.

This change will stabilize the instruction-level Codex lifecycle contract and
align the sdd-tasks workload with the quick role's bounded scope. It will
preserve OpenCode behavior, avoid claims of hard Codex runtime enforcement, and
make uncertainty visible when the active Codex host cannot expose the status
needed to apply the guidance.

## Scope

### In Scope

- Preserve the user-approved two-front scope:
  1. make root dispatch, waiting, retry, close, and fallback guidance
     terminal-state aware; and
  2. bound sdd-tasks validation so quick does not repeat broad discovery.
- Treat quiet periods and nonterminal wait/status responses as expected
  in-progress states, not empty or failed results.
- Use a same-session wait-and-probe path before considering retry,
  cancellation, close, or role fallback.
- Give generic result validation and required SDD artifact validation one
  shared retry eligibility decision and budget.
- Preserve the existing same-role capacity policy: retry the named role for up
  to three attempts, never substitute default, worker, or another role, and
  report a capacity blocker when same-role recovery is exhausted.
- Restore the source SDD contract's condition that sdd-tasks may move from
  quick to deep only when the task plan is complex.
- Replace mandatory broad sdd-tasks rediscovery with a bounded validation pass
  and structured validation gaps for unresolved paths, commands, or test
  references.
- Add focused contract tests for shared prompt semantics, Codex wording and
  capability disclosure, SDD routing, bundled skill content, and the unchanged
  OpenCode baseline.

### Deferred / Needs Discovery

- Exact payload fields, terminal labels, error variants, default wait
  behavior, and polling semantics exposed by each active Codex host. The
  implementation must consume only documented or observed bindings and must
  not invent a universal host payload.
- Whether a future documented Codex runtime surface can enforce lifecycle
  guards, retry accounting, or automatic session close mechanically. Until
  then, these controls remain instruction-level with explicit capability-gap
  disclosure.
- Any host-specific optimization for status polling beyond the portable
  wait-and-probe responsibility. Such optimization can be added only after its
  runtime contract is validated.

### Out of Scope

- Implementing or modifying the Codex host runtime, multi-agent service,
  lifecycle hooks, scheduler, or status payloads.
- Adding automatic numeric deadlines, fixed polling intervals, or implicit
  timeouts. An explicit user-supplied deadline remains a valid stop condition.
- Changing OpenCode delegation runtime behavior, native task lifecycle, or
  OpenCode-specific tool bindings.
- Changing the seven-role roster, read/write role boundaries, thoth-mem
  ownership, SDD artifact names or topic keys, phase ordering, plan-review
  gates, verify-loop rules, or implementation confirmation gates.
- Changing foreground model fallback chains or treating model fallback as a
  substitute for subagent lifecycle handling.
- Adding a new SDD phase, a new persistence surface, or a new harness
  implementation.

## Approach

### 1. Guard lifecycle actions with terminal-state evidence

- **From:** A quiet wait or lack of an immediate response can be interpreted as
  an empty result, allowing cancellation, retry, close, or fallback before the
  delegated agent is done.
- **To:** Classify quiet and nonterminal wait/status outcomes as in progress.
  Probe the same session again when the result is still needed. Permit
  cancellation, close, retry, or reroute only after a terminal completion or
  failure, an explicit user-supplied deadline, user cancellation, or a
  superseding request.
- **Reason:** Leaf agents generally return their useful envelope only at
  completion, and sdd-tasks can be legitimately quiet while validating paths,
  commands, and tests.
- **Impact:** Healthy work remains attached to its original session and role.
  Hosts without a reliable terminal-status binding must expose the limitation
  instead of treating silence as failure.

### 2. Share result-quality retry eligibility and budget

- **From:** The generic empty, contradictory, or low-confidence result rule and
  the SDD missing-artifact rule can each trigger their own retry for the same
  delegated outcome.
- **To:** Run terminal-state classification first. Once a terminal response is
  available, feed result-quality validation and required-artifact validation
  into one decision with at most one sharpened retry for that delegated phase
  outcome. Nonterminal probes consume no retry. Capacity errors retain their
  separate existing same-role allowance of up to three attempts and never
  authorize a role substitution.
- **Reason:** A missing artifact is often one symptom of the same invalid
  result, not evidence that a second independent retry cycle is warranted.
- **Impact:** The root cannot stack generic and SDD retries for one result.
  Exhausted quality validation escalates once with evidence, while capacity
  recovery remains predictable and role-stable.

### 3. Qualify quick-to-deep routing by task-plan complexity

- **From:** The typed SDD contract says deep is a fallback only when the task
  plan is complex, but the rendered delegation matrix shows an unconditional
  quick-to-deep fallback.
- **To:** Render and test the complexity condition explicitly. Silence,
  capacity, a missing artifact, or an invalid result alone must not change the
  assigned semantic role. A quick-owned plan remains with quick unless the
  plan's actual complexity makes deep the correct owner.
- **Reason:** Role routing should follow the canonical SDD contract and the
  quick/deep responsibility boundary, not use role substitution as generic
  error recovery.
- **Impact:** Simple mechanical planning stays with quick; correctness-heavy or
  complex planning can be assigned to deep without weakening same-role retry
  rules.

### 4. Bound sdd-tasks validation and surface structured gaps

- **From:** When design paths are absent, sdd-tasks mandates broad pre-write
  repository discovery even though quick is explicitly prohibited from broad
  rediscovery.
- **To:** Reuse approved exploration and handoff evidence first, then perform a
  scope-bounded validation pass over the affected areas, authoritative project
  command source, task-referenced existing files, and neighboring relevant
  tests. Do not invent an unverified command or path and do not silently expand
  into repository-wide discovery. Record every unresolved reference in a
  Validation Gaps section with its target, checks performed, impact or task
  disposition, and next action.
- **Reason:** Task plans need concrete evidence, but exhaustive rediscovery is
  incompatible with quick's role contract and increases the chance of a healthy
  planning agent appearing stalled.
- **Impact:** sdd-tasks remains accurate and reviewable while unresolved
  evidence becomes explicit input for follow-up discovery, escalation, or
  complexity-based routing.

### 5. Verify the contracts at their rendering boundaries

- **From:** Existing tests assert tool names, role presence, capability
  disclosure, and some SDD routing text, but they do not protect the complete
  quiet-to-retry-to-fallback failure chain.
- **To:** Add focused assertions for terminal guards, same-session
  wait-and-probe guidance, the shared quality-retry budget, same-role capacity
  recovery, complexity-only quick-to-deep routing, bounded sdd-tasks
  validation, structured gaps, Codex instruction-only disclosure, and absence
  of Codex lifecycle wording from OpenCode output.
- **Reason:** These behaviors span shared semantic policy, harness dialects,
  generated Codex instructions, SDD contracts, and packaged skill content.
- **Impact:** Future wording or renderer changes fail close when they re-open
  stacked retries, unconditional fallback, scope drift, or capability
  overclaims.

## Affected Areas

### Planned implementation targets

- src/agents/prompt-sections.ts — shared dispatch semantics, terminal guards,
  retry accounting, and rendered SDD delegation matrix.
- src/agents/prompt-dialects.ts — typed Codex wait/status terminology and
  lifecycle-specific rendering without leaking Codex bindings into OpenCode.
- src/harness/core/sdd.ts — canonical quick/deep complexity condition and SDD
  routing language.
- src/harness/adapters/codex.ts — generated Codex root lifecycle,
  wait-and-probe, close, and capability-gap guidance.
- src/harness/adapters/codex-surfaces.ts — retain instruction-only or
  unsupported classification for programmatic delegation lifecycle controls.
- src/skills/sdd-tasks/SKILL.md — bounded validation responsibilities and
  structured Validation Gaps output.

### Role-boundary constraint

- src/harness/core/agent-pack.ts — quick remains bounded and mechanical, deep
  remains the correctness-heavy owner, and the seven-role contract remains
  unchanged. This file is a governing contract; no roster or permission change
  is intended.

### Focused verification targets

- src/agents/prompt-rendering.test.ts
- src/agents/prompt-dialects.test.ts
- src/harness/core/sdd.test.ts
- src/harness/adapters/codex.test.ts
- src/harness/adapters/codex-surfaces.test.ts
- src/harness/writers/skill-layout.test.ts

### Governing main specs

- openspec/specs/multi-harness-agent-pack/spec.md — OpenCode baseline,
  harness-neutral semantic policy, typed Codex wording, same-role retry,
  capability disclosure, role boundaries, and focused prompt tests.
- openspec/specs/skill-instructions/spec.md — harness-neutral skill semantics,
  OpenCode preservation, and explicit instruction-only or unsupported
  capability disclosure.

## Risks

- Codex lifecycle handling remains instruction-level. A host that exposes no
  reliable terminal-state evidence may require manual recovery and cannot be
  presented as mechanically guarded.
- Removing silence-based cancellation without inventing a deadline can keep a
  genuinely stuck session open longer. Explicit user deadlines, cancellation,
  superseding requests, and visible capability diagnostics remain the safe
  escape paths.
- A single shared result-quality retry is stricter than two independently
  stacked retries. Poor classification could escalate too early, so tests must
  distinguish nonterminal waiting, capacity failure, terminal invalid output,
  and missing-artifact validation.
- Scope-bounded sdd-tasks validation may leave more unknowns visible. Structured
  gaps must be actionable enough that plan review can distinguish an acceptable
  follow-up from an execution blocker.
- Shared prompt edits can regress OpenCode wording or semantics. Focused
  cross-harness assertions must prove the OpenCode delegation and SDD baseline
  remains unchanged.

## Rollback Plan

- Revert the lifecycle policy, Codex adapter wording, SDD matrix rendering,
  sdd-tasks validation contract, and their focused tests as one coherent
  change.
- Restore the prior generic retry and SDD artifact-check wording and the prior
  sdd-tasks discovery workflow if the new eligibility model or gap format
  proves unusable.
- Keep rollback isolated from OpenCode runtime wiring, role definitions,
  thoth-mem data, OpenSpec history, and SDD artifacts; this change requires no
  data migration or destructive cleanup.
- If only Codex host assumptions prove invalid, remove or revise the
  Codex-specific wait/status binding while retaining the shared rule that
  unsupported lifecycle enforcement must be disclosed rather than invented.

## Success Criteria

- Generated Codex root instructions explicitly classify a quiet period or
  nonterminal wait/status result as in progress and prohibit cancellation,
  close, retry, or role fallback on silence alone.
- When the result is still required, generated Codex guidance directs the root
  to wait or probe the same session before taking a lifecycle action, and no
  automatic numeric wait duration, polling interval, or timeout is introduced.
- The allowed stop conditions are explicit and testable: terminal completion or
  failure, an explicit user-supplied deadline, user cancellation, or a
  superseding request.
- A terminal result can consume at most one shared sharpened retry across
  generic result-quality and required SDD artifact validation; a nonterminal
  probe consumes none, and the same outcome cannot trigger both retry paths.
- Capacity handling still retries the named semantic role for up to three
  attempts, never switches to default, worker, quick-to-deep, or another role
  as capacity recovery, and reports a blocker after same-role recovery is
  exhausted.
- The rendered SDD delegation matrix states that sdd-tasks uses quick by
  default and deep only when the task plan is complex; focused tests fail if
  the condition is dropped or failure recovery is presented as role fallback.
- sdd-tasks validation is limited to accepted affected areas, the authoritative
  command source, files referenced by planned tasks, and neighboring relevant
  tests, reusing prior exploration evidence rather than repeating broad
  discovery.
- Every unverified path, command, or test reference appears once in a
  Validation Gaps section with target, checks performed, impact or task
  disposition, and next action; no task presents an unverified reference as
  confirmed.
- Codex surface records and generated guidance continue to describe lifecycle
  enforcement as instruction-only or unsupported until a documented runtime
  binding exists.
- Focused tests cover shared prompt rendering, Codex dialect and adapter
  output, Codex surface disclosure, SDD fallback qualification, and packaged
  sdd-tasks semantics, while OpenCode assertions confirm no Codex lifecycle
  terminology or behavior change leaks into its rendered prompts.
- The implementation leaves the seven-role roster, role permissions, OpenCode
  runtime behavior, SDD phase/gate semantics, artifact names, and thoth-mem
  topic keys unchanged.
