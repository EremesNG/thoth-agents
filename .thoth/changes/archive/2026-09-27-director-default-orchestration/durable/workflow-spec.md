# Workflow Specification

## Purpose

Durable behavioral contract for AI-first repository work, from human agreement
through execution, recovery, independent verification, and closeout.

## Requirements

### Requirement: Select direct or persisted work without ceremony

The root MUST classify questions, research, and requested changes with bounded
inspection of scope, uncertainty, risk, coordination, and recovery needs. A
consultation MUST NOT be treated as authorization to mutate. Clear, bounded,
low-risk work MUST remain eligible for focused inspection, implementation and
proportional verification without planning artifacts, including useful specialist
delegation. Delegation or unit count alone MUST NOT require persistence. Root
MUST use `.thoth/changes/<id>/work.yaml` for nontrivial or risky changes,
coordination needing a durable agreement, and resumable work. Newly discovered
material uncertainty, broader scope, or risk MUST trigger reclassification before
implementation expands, preserving useful work and resolving new bounds. It MUST reuse authorization already
given, subject to the two bounded planning choices below. Other questions MUST
be limited to material human-owned decisions, missing secrets, or destructive or
security-sensitive actions outside that authorization. The fallback MUST NOT
resolve those other questions or override explicit user decisions.

#### Scenario: Reuse an accepted agreement

- **GIVEN** the user authorized an objective and its material bounds
- **WHEN** implementation needs routine technical replanning inside those bounds
- **THEN** work continues without another route question or repeating already resolved planning choices

#### Scenario: Delegate a small direct change

- **GIVEN** a clear, bounded, low-risk authorized change
- **WHEN** implementation is sufficiently delimited
- **THEN** root delegates to the fitting writer by default without creating planning files, retaining one writer per surface and proportional verification; only the bounded direct exception permits root implementation

#### Scenario: Direct work exposes a material unknown

- **GIVEN** work was classified as direct
- **WHEN** inspection exposes uncertainty that changes acceptance, approach or authorization
- **THEN** root preserves useful work and reclassifies before expanding implementation

### Requirement: Establish semantic readiness before planning and persistence

Root MUST establish current behavior, relevant contracts, tests, interfaces and
constraints through delegated discovery when sources or behavior are unknown,
then specify desired observable behavior, scope/exclusions,
measurable acceptance and autonomy, and clarify material uncertainty before
technical planning and persistence. Root MUST distinguish facts, assumptions and
human-owned decisions, investigate repository facts rather than asking the user
to discover them, and reuse settled answers. Architectural grilling remains
conditional under the material-decision rule below, never a mandatory interview.

These reasoning stages MAY iterate. Material uncertainty affecting intent,
acceptance, approach or authorization MUST block readiness. Bounded remaining
technical uncertainty MUST have an explicit resolution strategy and stop/replan
condition; it MUST NOT disguise an unresolved human-owned decision. Only after
these conditions hold may root shape outputs, dependencies, read/write ownership,
shared resources and checks, and persist the agreed plan. Existing contract
fields and optional useful context MUST carry needed findings without requiring
separate discovery or specification documents. Structural validation MUST NOT be
represented as proof of semantic readiness or actual model compliance. Selected
Oracle plan review MUST independently assess these pre-plan guarantees.

#### Scenario: Clarification requires more evidence

- **GIVEN** a material question about existing behavior can be answered from repository evidence
- **WHEN** planning reaches clarification
- **THEN** root investigates that evidence before asking the user and revisits specification if the findings change it

#### Scenario: A structurally valid plan still has an unresolved product decision

- **GIVEN** work.yaml passes ready validation but acceptance depends on an unanswered human-owned decision
- **WHEN** root or Oracle assesses readiness
- **THEN** the plan remains semantically blocked until that decision is resolved

### Requirement: Preserve user choice before implementation

After a persisted plan is ready, root MUST summarize it and offer `Review plan
with Oracle (Recommended)` or `Implement directly`, unless this choice was
already resolved explicitly or by bounded fallback for the same plan. Root MUST NOT skip the choice on
its own assessment of risk. Selecting direct implementation skips only plan
review; final Oracle verification remains mandatory for persisted work.

Selected review MUST use a fresh read-only Oracle through plan-reviewer and
return `[OKAY]` or `[REJECT]` with at most three actionable blockers. Root MUST
repair same-intent blockers and obtain a fresh judgment. After `[OKAY]`, root
MUST summarize the approved plan and ask `Implement (Recommended)` or `Stop with
approved plan` before implementation, even if the overall objective was already
authorized. Oracle approval alone MUST NOT authorize execution. An explicit stop
MUST remain stopped until the user resumes it.

For each of these two questions separately, root MUST make at most three total
native attempts if the harness returns the question without a usable answer.
The third confirmed unanswered return selects that question's recommended
option: review first, implement after approval. Explicit answers always win.
An open or pending question, elapsed wall time, missing tool, unavailable UI,
transport failure, or unrelated task timeout MUST NOT count as an unanswered
return. Where a harness forbids retries or has no supported question surface,
root MUST report the limitation and retain the unresolved choice; it MUST NOT
fabricate attempts. This bounded policy MUST NOT choose a pipeline or settle
secrets, destructive/security-sensitive actions or material product decisions.

Root MUST persist each choice, its native question references and confirmed
unanswered count, whether resolution was explicit or by bounded fallback, and
the reviewed plan identity in compact root-owned planning evidence. Resume MUST
reuse settled choices and remaining attempt budgets, preserve stop decisions,
and query a still-open native question instead of counting interruption as an
answerless return. Missing evidence MUST remain unknown. Material changes to a
reviewed plan invalidate its judgment; a selected review MUST run again, followed
by the implementation choice for that new approval. Expected implementation
edits MUST NOT themselves reopen completed planning choices.

#### Scenario: Exhaust only the review question

- **GIVEN** two native review questions returned unanswered
- **WHEN** the third native review question also returns without an answer
- **THEN** root selects Oracle review, records the bounded fallback and waits for its judgment

#### Scenario: Keep a reviewed plan without implementing

- **GIVEN** Oracle returned `[OKAY]`
- **WHEN** the user chooses to stop with the approved plan
- **THEN** root persists that choice and performs no implementation or automatic fallback

### Requirement: Persist one compact work agreement

Persisted work MUST record the approved goal, bounds, autonomy, acceptance,
decisions, explicit durable updates, and executable units in `work.yaml`.
Context documents, external unit definitions, and evidence files MUST remain
optional and MUST be loaded only by units that reference them. A unit MUST exist
inline or externally, never both. Root MUST own the agreement, unit graph, and
accepted results.

#### Scenario: Keep supporting artifacts selective

- **GIVEN** the agreement and units fit coherently in `work.yaml`
- **WHEN** the contract is persisted
- **THEN** no mandatory plan, task, checklist, or prose report is created

### Requirement: Shape executable dependency units

Each executable unit MUST declare a concrete output, dependencies, read inputs,
owned writes, shared resources, an eligible owner, documentary checks,
acceptance coverage, and a captured baseline before execution. Root MAY refine
future units as evidence becomes available when the refinement remains within
the accepted agreement. One writer MUST own each mutable surface.

#### Scenario: Block only concrete unmet dependencies

- **GIVEN** a unit depends on an upstream output
- **WHEN** that output is absent, stale, or not root-accepted
- **THEN** only that unit and its consumers remain blocked

### Requirement: Coordinate through native lifecycle authority

The root MUST dispatch all admitted independent work that fits current native
capacity before waiting, refill released capacity before another wait, and
release each consumer when its own upstream outputs are accepted and fresh.
List order MUST NOT imply dependency and the workflow MUST NOT impose a global
wave barrier. Native harness tools MUST remain authoritative for dispatch,
status, waiting, steering, cancellation, terminal results, and capacity; a
missing primitive MUST produce a truthful bounded fallback rather than an
invented scheduler or lifecycle state.

#### Scenario: Release a consumer independently

- **GIVEN** two consumers have different upstream dependencies
- **WHEN** one consumer's prerequisites become accepted while the other's remain pending
- **THEN** the ready consumer may run without waiting for the unrelated dependency chain

### Requirement: Recover from bounded evidence

Before dispatch, the workflow MUST capture relevant input and owned-workspace
baselines, including preexisting edits. If that prior evidence is unavailable,
it MUST remain explicitly unknown; later captures MUST NOT manufacture a prior
baseline. Checkpoints MUST record
writer identity, observed progress, checks, current input/output fingerprints,
remaining work, and the next bounded action. A checkpoint, timeout, silence, or
malformed native result MUST NOT establish native completion, acceptance, or
safe replacement. Resume MUST query native lifecycle and MUST block only
conflicting writes or resources while liveness is unknown, preserving useful
partial work and unrelated edits.

Resume MUST load only the selected unit, its required dependency closure and
relevant context. It MUST expose upstream acceptance and content freshness.
Checkpoint identity MUST bind the requested change, unit and current definitions.
Accepted results MUST bind the definition they verified; final verification MUST
bind the current agreement and technical plan as well as content and evidence.

#### Scenario: Continue nonconflicting work during uncertain liveness

- **GIVEN** a previous writer may still be active on one surface
- **WHEN** another unit has disjoint writes and resources
- **THEN** the independent unit may continue while the conflict is reconciled

### Requirement: Apply implementation skills proportionally

Behavior changes MUST use the installed TDD skill at a public seam, and changed
code MUST use the installed simplify skill before final verification without
changing behavior. Documentation or mechanical work MUST use focused integrity
checks without artificial tests. QA executables MUST remain project-owned.

### Requirement: Require independent semantic closeout

Every change MUST receive verification proportional to risk. Persisted work and
materially risky direct work MUST receive a fresh read-only Oracle judgment
against the accepted agreement, actual diff, and evidence. A writer MUST NOT
approve its own result. Plan review is optional for the user but offering the
choice is mandatory for a ready persisted plan. It MUST NOT grant execution
permission by itself, repeat a resolved choice for the same approval, or replace
final verification. Closeout MUST require
fresh accepted unit and acceptance evidence plus Oracle PASS for persisted work.

#### Scenario: Reject structural success without semantic approval

- **GIVEN** a persisted contract passes its offline validator and automated checks
- **WHEN** no fresh independent Oracle PASS exists
- **THEN** closeout remains blocked

### Requirement: Apply declared durable updates transactionally

Durable updates MUST explicitly add, replace, remove, or rename capability files
under `.thoth/specs/<capability>/spec.md`. Replacement, removal, and rename MUST
match the current raw SHA-256; source content MUST match its declared digest;
replacement content MUST preserve unaffected requirements. Archive MUST require
native writers to be terminated, acquire the single atomic
`.thoth/.archive-transaction/` directory, validate current closeout evidence and
plan updates under the lock, move existing durable files to backup
before verifying captured content, install new versions exclusively, and retain
backups when a race is detected. It MUST NOT claim protection from arbitrary
concurrent changes to surrounding directory topology. Forced process or
operating-system termination MUST be reported as non-atomic and require
inspection of `.thoth/.archive-transaction/recovery.json` before retry.

### Requirement: Keep project governance bounded

`thoth-init` MUST initialize only minimum `.thoth/` work governance, preserving
existing project-owned constitution and specifications. Routine work MUST read
`.thoth/constitution.md` as project principles without changing governance
metadata. An explicit constitution amendment MUST use the constitution skill's
versioned lifecycle. Historical OpenSpec records MUST remain outside active
execution context under `.thoth/history/openspec/`.

### Requirement: Direct work through specialists by default

Root MUST retain intent, constraints, decisions, ownership, coordination, semantic
acceptance and synthesis. Specialists MUST perform discovery, external research
and implementation by default. Root MUST decide who obtains evidence before
obtaining it. Unknown local source, flow or responsibility MUST trigger Explorer
before root searches or follows dependencies. A discovery assignment MAY name an
unknown location and MUST state its question, read-only bounds and sufficient
return evidence; root MUST NOT discover the answer to prepare that assignment.

Root MAY consult a known source for a specific bounded question or perform a
minimal authorized low-risk change only when source, scope and verification are
already known and no discovery or independent judgment is needed. Encountering
another search or dependency MUST end that direct exception. File count,
accumulated context and coordination overhead MUST NOT extend it. Applicable
instructions and coordination artifacts remain root responsibilities, not a
loophole for source or log dumps. No fixed code-line budget or model assignment
is imposed by this policy.

Root MUST select designer for material user-facing experience, quick for exact
narrow low-risk work, and deep for coupled or high-risk implementation. Known,
sufficiently bounded implementation MUST go directly to its writer without a
mandatory Explorer stage. Librarian obtains necessary external evidence; Oracle
provides independent judgment under the existing verification requirements.
Explorer, librarian and Oracle MUST remain read-only. A new objective, mutable
surface or independent judgment MUST receive a fresh specialist; continuation is
limited to the same bounded assignment. Roles MUST NOT be invoked mechanically.

Root MUST request conclusions, relevant paths/symbols, supporting evidence,
uncertainties and next actions rather than full files or logs. Root MUST NOT
repeat discovery before, during or after delegated work. Missing support MUST
trigger a targeted evidence request or bounded inspection of identified evidence,
not wholesale rediscovery. Independent verification MUST remain intact.
Delegation failure MUST be reported and MUST NOT silently authorize unrestricted
root execution. CodeGraph failure MAY use the applicable discovery fallback in
the assigned specialist. Native lifecycle, recovery, planning choices and
single-writer constraints remain unchanged. This is behavioral instruction, not
a portable runtime restriction or proof of cost savings.

#### Scenario: Unknown location triggers discovery before searching

- **GIVEN** the requested behavior has no identified source or effective flow
- **WHEN** root assigns evidence gathering
- **THEN** Explorer receives a bounded discovery question before root searches the repository

#### Scenario: A bounded consultation opens a dependency

- **GIVEN** root consults a known source for a specific question
- **WHEN** answering requires another search or following a dependency
- **THEN** root stops the direct traversal and delegates the unresolved question

#### Scenario: Known implementation needs no discovery relay

- **GIVEN** scope, inputs, ownership and verification are sufficiently known
- **WHEN** implementation is authorized
- **THEN** root assigns the fitting writer without a compulsory Explorer stage

#### Scenario: Evidence is incomplete

- **GIVEN** a specialist returns a conclusion without sufficient support
- **WHEN** root evaluates acceptance
- **THEN** root requests the missing evidence specifically without accepting blindly or repeating the full discovery

### Requirement: Gate architectural grilling on a material decision

The architectural-grilling skill MUST run only when explicitly requested or
when a material human-owned product or architecture decision cannot be resolved
from evidence or a safe in-scope assumption. Persisted work by itself MUST NOT
activate grilling.
