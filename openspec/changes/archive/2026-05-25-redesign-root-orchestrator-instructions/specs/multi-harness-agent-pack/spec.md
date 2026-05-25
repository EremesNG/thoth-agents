# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Calibrate Root Inspection and Delegation
The system MUST render root/orchestrator instructions that allow small bounded local inspection when it is cheaper, faster, or clearer than delegation, while preserving delegation for broad, risky, or specialist work.

#### Scenario: Root performs bounded direct checks
- GIVEN a user request can be clarified by a small local check such as reading a known file, confirming a script name, or inspecting a narrow artifact
- WHEN the root/orchestrator prompt describes coordination behavior
- THEN it MUST permit the root to perform that bounded check directly
- AND it MUST require the root to keep the check narrow and evidence-led
- AND it MUST NOT permit the root to become the default implementation or broad discovery worker

#### Scenario: Root delegates broad or risky work
- GIVEN work requires broad search, multi-file implementation, risky verification, UI visual QA, independent review, or correctness-heavy debugging
- WHEN the root/orchestrator prompt describes delegation behavior
- THEN it MUST require delegation to the appropriate explorer, librarian, oracle, designer, quick, or deep role
- AND it MUST keep validation and final synthesis accountable to the root
- AND it MUST require delegation only when it provides a net quality, speed, cost, or reliability gain

### Requirement: Enforce Epistemic Rigor in Root Decisions
The system MUST render root/orchestrator instructions that require technical and user claims to be verified before being treated as true when the claim affects implementation, architecture, verification, or user guidance.

#### Scenario: Root verifies claims before acting
- GIVEN the user asserts a technical fact, file state, API behavior, or project constraint
- WHEN the claim materially affects the next action
- THEN the root/orchestrator prompt MUST require verification through local evidence, delegated discovery, or authoritative documentation before relying on it
- AND it MUST allow reasonable low-risk assumptions only when stated briefly and not correctness-critical

#### Scenario: Root corrects mistaken assumptions with evidence
- GIVEN verification shows that the user or the agent's earlier assumption is wrong
- WHEN the root responds or chooses the next step
- THEN it MUST explain the correction with evidence and relevant tradeoffs
- AND it MUST propose viable alternatives when the original path is risky, unsupported, or inefficient
- AND it MUST remain warm, direct, and concise

### Requirement: Optimize Root Workflow by Quality, Speed, Cost, and Reliability
The system MUST render root/orchestrator instructions that evaluate direct action, delegation, parallelization, and review against quality, speed, cost, and reliability.

#### Scenario: Root chooses between direct action and delegation
- GIVEN a task can be handled either directly by the root or by a subagent
- WHEN the root/orchestrator prompt describes path selection
- THEN it MUST require choosing the path with the best net quality, speed, cost, and reliability profile
- AND it MUST discourage delegation when delegation overhead is greater than doing a bounded check directly

#### Scenario: Root parallelizes independent work only
- GIVEN multiple investigations or implementation branches are independent
- WHEN the root/orchestrator prompt describes dispatch
- THEN it MUST encourage launching independent delegations together
- AND it MUST require dependent steps to be reconciled after relevant evidence returns
- AND it MUST preserve current same-role retry and capability-gap disclosure rules

## MODIFIED Requirements

### Requirement: Define Root Coordinator Prompt Contract
The system MUST render the orchestrator/root coordinator prompt as the delegate-first decision and sequencing contract for the ambient root session, with calibrated direct-inspection authority, evidence-led decision making, root-owned validation, SDD governance, and memory ownership.

#### Scenario: Root prompt owns coordination boundaries
- GIVEN OpenCode or Codex root instructions are rendered
- WHEN the orchestrator prompt is composed
- THEN it MUST identify the role as the root coordinator, orchestrator, or ambient root decision engine
- AND it MUST assign user-facing synthesis, task sequencing, blocking user input, progress ownership, root-session memory, final outcome reporting, and validation accountability to the root role
- AND it MUST permit bounded direct local checks when they are cheaper than delegation
- AND it MUST NOT present the orchestrator as an optional specialist that the user must invoke instead of the active root session

#### Scenario: Root prompt delegates bounded work
- GIVEN the root prompt describes delegate-first operation
- WHEN it explains how work is assigned
- THEN it MUST preserve the current roster of explorer, librarian, oracle, designer, quick, and deep subagents
- AND it MUST describe subagents as evidence, review, implementation, or verification owners for bounded assignments
- AND it MUST prohibit requesting raw file dumps from subagents when findings, anchors, diffs, verification evidence, or blockers are sufficient
- AND it MUST require delegation for broad search, multi-file edits, risky verification, UI visual QA, and independent review

### Requirement: Preserve Reference-Inspired Style Without Importing Roles
The system MUST allow prompt structure and tone to be inspired by external reference repositories only when the canonical thoth-agents roster, multi-harness behavior, memory governance, SDD gates, and verification contracts remain unchanged.

#### Scenario: Reference repos do not expand the roster
- GIVEN Gentle-AI or oh-my-opencode-slim is used as prompt inspiration
- WHEN prompts, tests, or docs are updated
- THEN the system MUST preserve only orchestrator, explorer, librarian, oracle, designer, quick, and deep as thoth-agents roles
- AND it MUST NOT add, rename, or expose reference-repo roles, command models, memory protocols, or permission assumptions as thoth-agents behavior

#### Scenario: Inspired prose remains behavior-compatible
- GIVEN reference style influences prompt organization
- WHEN generated prompts are compared against thoth-agents contracts
- THEN the prompts MUST preserve delegate-first orchestration, bounded direct inspection, read-only versus write-capable role boundaries, SDD gates, memory governance, epistemic rigor, and verification expectations
- AND differences from reference repositories MUST be adapted into current thoth-agents terminology instead of copied verbatim when semantics differ

## REMOVED Requirements

No requirements are removed.
