# Requirements Quality Checklist

## Domain: multi-harness-agent-pack

### Requirement coverage

- [x] MH-1 Establish Exclusive Provider Ownership is normative and covers
  MH-1.1 three-harness ownership, MH-1.2 omitted provider assets, and MH-1.3
  unsupported harness scope.
- [x] MH-2 Report Provider-Dependent Capability Truthfully is normative and
  covers MH-2.1 absence, MH-2.2 degraded capability, MH-2.3 unrelated usable
  orchestration, and MH-2.4 installed provider guidance.
- [x] MH-3 Preserve Neutral Orchestration and SDD Contracts is normative and
  covers MH-3.1 governance, MH-3.2 persistence modes, and MH-3.3 canonical SDD
  identities without provider operations.
- [x] MH-4 Preserve Handoff and Completion Continuity as Outcomes is normative
  and covers MH-4.1 handoff context, MH-4.2 summary/checkpoint continuation,
  and MH-4.3 unavailable continuity without fabrication.
- [x] MH-5 Keep Stage and Rollback Boundaries Explicit is normative and covers
  MH-5.1 downstream stage 2 and MH-5.2 provider-safe rollback.
- [x] Modified Enforce thoth-mem Governance Across Harnesses covers separated
  consumer/provider governance.
- [x] Modified Preserve SDD Skills Portability covers portable phase semantics
  with truthful provider dependencies.
- [x] Modified Limit Rollout Scope Safely covers exact harness scope without
  capability-equality assumptions.
- [x] Removed legacy tool-surface rendering and consumer bootstrap requirements
  identify why their provider-owned semantics no longer belong in this domain
  and include GWT removal scenarios.

### Quality dimensions

- [x] Completeness: Every normative requirement has at least one complete
  GIVEN/WHEN/THEN scenario and proposal success criteria map to MH-1 through
  MH-5 or a named modified requirement.
- [x] Clarity: Provider evidence, supported harness scope, provider-dependent
  behavior, summary/checkpoint continuity, and consumer-owned SDD identities
  are defined without an exhaustive provider protocol.
- [x] Measurability: Generated assets, harness target, capability classification,
  canonical identities, false-success behavior, and forbidden closure/fallback
  outcomes are observable.
- [x] Testability: Absence, degradation, unsupported harness, installed provider
  guidance, all three supported harnesses, handoff continuity, completion
  continuity, provider-independent modes, stage boundary, and rollback each
  have independently testable scenarios.

## Domain: skill-instructions

### Requirement coverage

- [x] SI-1 Remove Bundled Provider Guidance is normative and covers SI-1.1
  removal of `src/skills/thoth-mem-agents`, SI-1.2 installed provider guidance,
  and SI-1.3 absent guidance without replacement.
- [x] SI-2 Prohibit Consumer Copies of Provider Protocol is normative and covers
  SI-2.1 no lifecycle prescriptions, SI-2.2 no exhaustive callable vocabulary,
  and SI-2.3 no fallback guidance.
- [x] SI-3 Preserve Neutral Orchestration and SDD Guidance is normative and
  covers SI-3.1 roles/gates, SI-3.2 canonical identities, and SI-3.3 valid
  provider-independent modes.
- [x] SI-4 Preserve Handoff and Completion Continuity Without Provider Calls is
  normative and covers SI-4.1 context outcomes, SI-4.2 summary/checkpoint
  continuation, and SI-4.3 degraded continuity without false success.
- [x] SI-5 Scope Harness Guidance and Capability Claims is normative and covers
  SI-5.1 OpenCode/Codex/Claude Code guidance and SI-5.2 unsupported behavior.
- [x] Modified Express Shared Skill Semantics in Harness-Neutral Language covers
  consumer outcomes separated from provider operations.
- [x] Modified Fail Explicitly for Unsupported Harness Behavior covers truthful
  capability gaps while preserving unrelated valid orchestration.
- [x] Modified Preserve thoth-mem Topic-Key Discipline covers canonical identity
  without storage or recovery prescriptions.
- [x] Removed exact callable-surface, consumer lifecycle, and retrieval-decision
  requirements identify why installed provider guidance now owns them and
  include GWT removal scenarios.

### Quality dimensions

- [x] Completeness: Every normative requirement has at least one complete
  GIVEN/WHEN/THEN scenario and covers source skills, shared support, prompts,
  fixtures, generated packages, and exactly three supported harnesses.
- [x] Clarity: Installed provider guidance, neutral orchestration guidance,
  outcome-level continuity, provider-independent behavior, and forbidden
  consumer protocol copies are distinguished explicitly.
- [x] Measurability: The bundled skill path, generated skill inventory,
  canonical topic-key pattern, capability labels, harness scope, lifecycle
  prescriptions, exhaustive vocabulary, and closure/fallback language can be
  inspected directly.
- [x] Testability: Removal, absence, degradation, installed guidance, handoff,
  completion, provider-independent persistence, unsupported binding, and all
  three harness renderings have independently testable scenarios.

## handoffHints

- Design must trace MH-1 through MH-5 and SI-1 through SI-5 plus each named
  modified requirement to files and verification; removed requirements must not
  reappear under renamed consumer guidance.
- Design must preserve canonical OpenSpec and `sdd/{change}/{artifact}`
  identities without copying provider operational vocabulary.
- Design must treat all prior design, tasks, and plan-review evidence as stale
  downstream artifacts requiring regeneration and fresh review.
