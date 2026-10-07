# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Codify the SDD Verify Phase as a Bounded Verify-Loop
The unified SDD pipeline semantics MUST define the post-apply verify phase as an
autonomous, bounded verify-loop rather than a single-shot linear handoff. After
`sdd-apply`, the orchestrator MUST dispatch `sdd-verify` and then branch on the
returned verdict (`fail`, `pass with warnings`, or clean `pass`). The verify
phase MUST be expressed as a unified control-flow narrative in the orchestrator
SDD wording so that every supported harness inherits the same loop with no
per-harness verify-loop variant. The loop MUST be bounded to at most 3 rounds
total (the initial apply→verify plus up to 2 fix→re-verify rounds) and MUST NOT
loop indefinitely.

#### Scenario: Verify is dispatched as an iterative gate after apply
- GIVEN an SDD pipeline that has completed `sdd-apply`
- WHEN the orchestrator enters the post-apply phase
- THEN the orchestrator MUST dispatch `sdd-verify` as an iterative gate rather
  than treating verification as a single-shot step
- AND the orchestrator MUST select the next action from the returned verdict
  (`fail`, `pass with warnings`, or clean `pass`)
- AND the orchestrator MUST NOT auto-advance to `sdd-archive` solely because a
  verify report was produced

#### Scenario: Verify-loop wording is unified across harnesses
- GIVEN the SDD verify-loop is defined in the unified orchestrator SDD wording
- WHEN the agent pack is rendered for any supported harness
- THEN the rendered artifacts MUST preserve the same three-verdict branching, the
  3-round bound, and the escalation behavior
- AND no harness-specific verify-loop variant MUST be introduced

### Requirement: Re-dispatch a Targeted Fix on Verify Failure Within the Bound
WHEN `sdd-verify` returns a `fail` verdict and rounds remain within the 3-round
bound, the orchestrator MUST dispatch a targeted fix that re-runs `sdd-apply`
scoped by the verify report's Critical Issues and remediation anchors, then MUST
re-dispatch `sdd-verify`. The fix MUST be scoped by the actionable remediation
targets rather than a full unscoped re-apply.

#### Scenario: Fail with rounds remaining triggers a scoped fix then re-verify
- GIVEN `sdd-verify` returned `fail`
- AND the current round count is below the 3-round bound
- WHEN the orchestrator processes the verdict
- THEN it MUST dispatch a targeted `sdd-apply` re-run scoped by the verify
  report's Critical Issues and remediation anchors
- AND it MUST re-dispatch `sdd-verify` after the scoped fix completes
- AND it MUST NOT advance to `sdd-archive` while the verdict remains `fail`

#### Scenario: Targeted fix is scoped by remediation anchors
- GIVEN a `fail` verdict whose report includes file and/or scenario remediation
  anchors
- WHEN the orchestrator dispatches the fix
- THEN the dispatch scope MUST reference those remediation anchors
- AND the fix MUST NOT silently expand into an unscoped full re-apply when
  actionable anchors are available

### Requirement: Escalate to the User When the Verify-Loop Bound Is Exhausted
WHEN the verify-loop reaches the 3-round bound and `sdd-verify` still returns
`fail`, the orchestrator MUST escalate to the user through the harness blocking
input surface. The orchestrator MUST NOT silently give up and MUST NOT continue
looping beyond the bound.

#### Scenario: Bound reached with persistent failure escalates to the user
- GIVEN the verify-loop has executed the maximum 3 rounds
- AND `sdd-verify` still returns `fail`
- WHEN the orchestrator processes the final verdict
- THEN it MUST escalate the unresolved failure to the user via the harness
  blocking input surface
- AND it MUST NOT dispatch a further `sdd-apply` or `sdd-verify` round
- AND it MUST NOT silently abandon the change or auto-advance to `sdd-archive`

#### Scenario: Blocking input surface is unavailable in a harness
- GIVEN a harness that lacks a blocking user input primitive
- WHEN the verify-loop bound is exhausted on a `fail` verdict
- THEN the orchestrator MUST report the escalation as an unsupported-capability
  limitation rather than auto-advancing or looping indefinitely

### Requirement: Escalate an Advance-vs-Iterate Decision on Pass With Warnings
WHEN `sdd-verify` returns `pass with warnings`, the orchestrator MUST escalate a
decision to the user through the harness blocking input surface, offering a
choice between advancing to `sdd-archive` and re-iterating to clear the warnings.
The orchestrator MUST NOT auto-advance to archive and MUST NOT auto-loop on a
`pass with warnings` verdict.

#### Scenario: Pass with warnings presents an advance-vs-iterate choice
- GIVEN `sdd-verify` returned `pass with warnings`
- WHEN the orchestrator processes the verdict
- THEN it MUST present the user, via the blocking input surface, a choice between
  advancing to `sdd-archive` and re-iterating to clear the warnings
- AND it MUST NOT auto-advance to `sdd-archive`
- AND it MUST NOT auto-dispatch another fix/re-verify round without the user's
  decision

#### Scenario: User chooses to re-iterate on warnings
- GIVEN the orchestrator presented an advance-vs-iterate choice for
  `pass with warnings`
- WHEN the user chooses to re-iterate
- THEN the orchestrator MUST dispatch a targeted fix scoped by the warning
  remediation anchors and re-dispatch `sdd-verify`, subject to the 3-round bound

### Requirement: Advance to Archive Only on a Clean Pass Through the Existing User Gate
WHEN `sdd-verify` returns a clean `pass`, the orchestrator MUST proceed through
the existing pre-archive user gate and then dispatch `sdd-archive`. This change
MUST NOT alter the clean-pass user gate that already precedes archive, and MUST
NOT alter `sdd-archive`'s refusal to archive on unresolved critical failures.

#### Scenario: Clean pass proceeds through the existing user gate to archive
- GIVEN `sdd-verify` returned a clean `pass`
- WHEN the orchestrator processes the verdict
- THEN it MUST proceed through the existing pre-archive user gate
- AND it MUST dispatch `sdd-archive` only after that gate is satisfied
- AND the clean-pass user gate behavior MUST remain unchanged from prior behavior

### Requirement: Represent the Verify-Loop and Round Bound in the Phase Contract
The machine-readable SDD phase contract MUST represent the `verify` phase as an
iterative-verify gate and MUST represent the loop's round bound as a
machine-readable invariant rather than prose only. This representation MUST be
additive: extending the gate semantics and the round-bound representation MUST
NOT break existing consumers of the phase contract's gate field, and the prior
gate semantics for non-verify phases (independent plan review and user
confirmation) MUST continue to behave correctly. The round bound represented in
the contract MUST agree with the 3-round bound stated in the orchestrator SDD
wording.

#### Scenario: Verify phase carries iterative-verify gate semantics
- GIVEN the SDD phase contract defines the `verify` phase
- WHEN the contract is read
- THEN the `verify` phase MUST carry iterative-verify gate semantics distinct
  from the plan-review and user-confirmation gate semantics
- AND the contract MUST represent the verify-loop round bound as a
  machine-readable invariant

#### Scenario: Existing gate consumers continue to behave correctly
- GIVEN existing consumers that read the phase contract's gate field for the
  plan-review and implementation-confirmation phases
- WHEN the verify phase is extended with iterative-verify gate semantics and a
  round-bound representation
- THEN those existing consumers MUST continue to behave correctly without
  regression
- AND the extension MUST be additive rather than redefining or removing the prior
  gate semantics

#### Scenario: Contract round bound agrees with orchestrator wording
- GIVEN the round bound is represented in both the phase contract and the
  orchestrator SDD wording
- WHEN both are read
- THEN they MUST state the same canonical bound of 3 rounds
- AND a single canonical bound value MUST be the source of truth referenced by
  both

### Requirement: Emit Actionable Remediation Targets From sdd-verify
The `sdd-verify` skill MUST emit actionable remediation targets — file and/or
scenario anchors — for each Critical Issue, not prose-only bullets, so that a
targeted fix dispatch can be scoped precisely. The verify report MUST carry an
explicit `round N` marker, and the round number recorded in that marker MUST be
the source of truth for the verify-loop round counter across iterations.

#### Scenario: Critical Issues include file or scenario anchors
- GIVEN `sdd-verify` produces a report containing one or more Critical Issues
- WHEN the report is written
- THEN each Critical Issue MUST include actionable remediation targets such as a
  file anchor and/or a spec scenario anchor
- AND the report MUST NOT present Critical Issues as prose-only bullets without
  remediation anchors

#### Scenario: Round marker is the source of truth for the round counter
- GIVEN the verify-loop runs across multiple iterations
- WHEN each `sdd-verify` report is produced
- THEN the report MUST carry an explicit `round N` marker
- AND the orchestrator MUST treat that `round N` marker as the source of truth
  for the round counter when enforcing the 3-round bound
- AND the round counter MUST be visible in the verify report and surfaced in
  progress tracking

## MODIFIED Requirements

### Requirement: Define Harness-Agnostic Agent-Pack Contracts
The system MUST define harness-agnostic contracts for the seven-agent roster
intent, delegate-first operating rules, SDD pipeline semantics, thoth-mem
governance, and verification protocol. The SDD pipeline semantics MUST include
the bounded verify-loop control flow: after `sdd-apply`, the verify phase branches
on `fail` (targeted fix and re-verify within a 3-round bound), `pass with
warnings` (escalate an advance-vs-iterate decision to the user), and clean `pass`
(proceed through the existing user gate to `sdd-archive`), escalating to the user
on round-bound exhaustion. These semantics MUST be derived from the shared
contracts and MUST remain unified across all supported harnesses.

#### Scenario: Shared contracts describe agent intent independent of harness
- GIVEN the agent pack contains orchestrator, explorer, librarian, oracle,
  designer, quick, and deep roles
- WHEN an adapter renders those roles for a supported harness
- THEN the adapter MUST derive role responsibilities, mutation permissions,
  dispatch expectations, and tool-governance language from shared contracts
- AND the adapter MAY translate that intent into harness-specific syntax or
  configuration files

#### Scenario: Delegate-first rules remain portable
- GIVEN a harness supports some form of subagent, task, or delegated execution
- WHEN the agent pack is rendered for that harness
- THEN the rendered artifacts MUST preserve the orchestrator-as-coordinator model
  and the read-only versus write-capable specialist split
- AND the rendered artifacts MUST describe any harness capability gaps rather
  than claiming unsupported delegation parity

#### Scenario: Verification protocol remains shared
- GIVEN a write-capable agent completes implementation work in any supported
  harness
- WHEN it reports completion
- THEN it MUST report verification evidence tied to the changed files,
  diagnostics, tests, or documented checks
- AND it MUST NOT claim completion for behavior changes without the smallest
  sufficient automated or explicitly documented verification

#### Scenario: SDD pipeline semantics include the bounded verify-loop
- GIVEN the shared SDD pipeline semantics are rendered for a supported harness
- WHEN the post-apply verify phase is described
- THEN the rendered SDD semantics MUST describe the bounded verify-loop with the
  `fail`, `pass with warnings`, and clean `pass` branches and the 3-round bound
- AND the rendered SDD semantics MUST NOT describe the verify phase as a
  single-shot linear handoff to `sdd-archive`
