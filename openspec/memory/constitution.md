<!--
Sync Impact Report
- Version change: 7.0.0 -> 7.1.0
- Modified principles: Truthful multi-harness contracts (Pi becomes a fourth first-class harness with native package/resource ownership and explicit capability limits)
- Added sections: None
- Removed sections: None
- Templates: ✅ no template semantic changes required; ✅ AGENTS.md; ✅ openspec/config.yaml; ✅ README.md; ✅ docs/installation.md; ✅ docs/skills-and-mcps.md; ✅ docs/agent/architecture.md; ✅ docs/agent/index.md
- Follow-up TODOs: None
-->
# thoth-agents Project Constitution

**Version**: 7.1.0<br>
**Ratified**: 2026-06-16<br>
**Last amended**: 2026-09-03

This constitution governs active thoth-agents behavior. Spec Kit supplies SDD
artifact semantics; thoth-agents stores them under `openspec/` and adds its
adaptive route policy.

## Principles

### 1. Adaptive-root orchestration

The root may inspect and edit clear bounded work directly. Before asking for Direct, Accelerated, or Full, Root MUST summarize the relevant context, assessed scope, clarity, risk, and recommendation. Any explicit route answer wins. When the native route question returns answerless, Root MUST make at most three total attempts and MUST treat the recommended route as selected after the third answerless result. Before delegation, Root MUST shape bounded work into explicit information dependencies and mutable ownership, distinguish ready lanes from blocked synthesis, consider every specialist semantically, and dispatch valuable conflict-free ready lanes through the active harness's native primitives before waiting. Delegation depth is one and each mutable surface has one writer. An explicitly or bounded-default selected plan review, materially risky Direct final judgment, and every Accelerated or Full final verify use a fresh read-only `oracle`; trivial deterministic Direct work may remain Root-verified when the implementer is not self-approving.

### 2. Explicit role boundaries

The active pack contains exactly seven roles: `orchestrator`, `explorer`,
`librarian`, `oracle`, `designer`, `quick`, and `deep`. Root/orchestrator owns
sequential coordination and governed artifacts under `openspec/`; it loads phase
contracts only when required. Read-only roles (`explorer`, `librarian`,
`oracle`) never mutate. Root and implementation writers (`designer`, `quick`,
`deep`) own only their explicitly bounded product surfaces.

### 3. Proportional Spec Kit-compatible SDD

The root assesses intent, scope, clarity, contract risk, and failure cost to
recommend direct, accelerated, or full SDD. Explicit user answers own the
selection; after three total answerless attempts, the displayed recommendation
counts as the selection. Accelerated SDD is a first-class route.
Clarification, checklists, optional artifacts, and convergence activate on
artifact-backed routes only when their risk signal exists. Ceremony without
decision or risk value is prohibited.
`architectural-grilling` is a conditional pre-specification gate only for an
explicit request or unresolved material human-owned product/architecture
branches; Full SDD alone never requires it.
Every phase has a shared typed protocol and a canonical dispatch envelope.
Pre-implementation plan review remains an offered choice. After the `ready`
gate on Accelerated or Full, Root recommends Oracle review and asks whether to
review or proceed without it. Any explicit answer wins. After three total
answerless attempts, `Review plan with Oracle (Recommended)` counts as selected.
Actionable same-intent `[REJECT]` findings MUST be repaired and affected gates
revalidated before a fresh Oracle approval round; this repeats until `[OKAY]`
or a material human-owned blocker. After `[OKAY]`, Root MUST summarize the
approved plan before asking `Implement (Recommended)` or `Stop`; any explicit
answer wins, while the third answerless result selects implementation.
Artifact-backed routes persist a verification verdict and close through a dated
archive. After oracle PASS, archive MUST transactionally synchronize only explicitly
declared durable `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED` deltas into
`openspec/specs/`; `[INTERNAL]` requirements never alter permanent
specifications. Handled failures MUST roll back within the active process, but
forced process or operating-system termination is not crash-atomic.

### 4. Truthful multi-harness contracts

OpenCode, Codex, Claude Code, and Pi derive behavior from shared role and SDD
contracts, while adapters disclose enforcement gaps. OpenCode is the default and
ships only the built-in OpenAI preset. Pi MUST use its native package, resource,
skill, and extension surfaces plus the selected external delegation runtime;
thoth-agents MUST NOT duplicate Pi execution, scheduling, task/history storage,
or lifecycle, and MUST disclose conditional capabilities, project trust, and the
absence of an OS security sandbox. `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling` are mandatory external
skills installed by the CLI from their canonical repositories for every
harness; they are never vendored into this repository. Plugin bundles contain
only thoth-owned workflow skills. Installation may invoke the CLI and network,
but an SDD phase never invokes the CLI, `npx skills add`, or a network fetch.
Codex additionally requires the CLI to manage global agents, features, and the
orchestrator block in `~/.codex/AGENTS.md`. Browser and QA executables remain
project-owned.

### 5. Independent provider ownership

thoth-mem owns its installation, hooks, MCP, lifecycle, persistence, and
recovery. thoth-agents does not copy provider protocol or claim provider effects
without evidence. Install/reset operations preserve independently managed
provider assets.

### 6. Evidence-led completion

Every route includes mandatory verification proportional to changed behavior and
risk before completion. Completion reports identify changed surfaces and executed
evidence. Trivial deterministic Direct work MAY be verified by Root when the
decision is bounded and independent of the implementation writer; materially risky Direct work and every Accelerated or Full final verify MUST use a fresh read-only Oracle. No implementation writer may approve its own work. An explicitly or bounded-default selected pre-implementation plan review is independent, converges through fresh approval rounds, and never substitutes for final verification. Artifact-backed failures append
traceable convergence tasks before the implementation/re-check loop; Direct
failures return straight to implementation. Accelerated and Full archive only
after a passing verdict, no unresolved critical finding, and successful transactional
canonical synchronization of declared durable deltas.

## Governance

- Routine SDD planning MUST read active principles and record Constitution Check
  evidence, but MUST NOT amend or revalidate constitution lifecycle metadata.
- Amendments require explicit user direction, an updated Sync Impact Report,
  and propagation to every affected template, instruction, and durable document.
- MAJOR versions remove or redefine a principle or compatibility boundary.
- MINOR versions add a principle/section or materially expand guidance.
- PATCH versions clarify wording without semantic behavior change.

## Amendment history

- 7.1.0 | minor: add Pi as a fourth first-class harness using Pi-native package,
  resource, skill, and extension contracts; keep delegation-runtime ownership
  external and require truthful conditional-capability and security reporting |
  constitution, project instructions, SDD context, architecture and installation
  documentation.
- 7.0.0 | major: redefine the three standard SDD decision boundaries so an
  explicit answer always wins, while three total answerless native prompts
  select the displayed recommended route, Oracle review, or implementation;
  require pre-question summaries and fresh Oracle plan-review convergence to
  `[OKAY]` | constitution template, SDD contracts, generated harness prompts,
  instructions, documentation, and tests.
- 6.0.0 | major: redefine adaptive-root orchestration as explicit dependency and
  ownership shaping over native harness delegation; make final-verification
  ownership proportional so trivial deterministic Direct work may be Root-verified
  while materially risky Direct and all artifact-backed routes require a fresh
  read-only Oracle | agent contracts, generated harness roots, SDD contracts,
  governance templates, instructions, documentation, and tests.
- 5.0.0 | major: restore user ownership of Direct, Accelerated, or Full route
  selection; make pre-implementation Oracle plan review optional after `ready`;
  preserve mandatory independent final verification | SDD contracts,
  plan-reviewer skill, generated harness prompts, governance templates,
  instructions, documentation, and tests.
- 4.0.0 | major: redefine artifact-backed archive as transactional synchronization
  of explicitly declared durable deltas after oracle PASS with active-process
  rollback for handled failures; add isolated
  constitution lifecycle validation | SDD contracts, archive tooling, templates,
  instructions, documentation, and tests.
- 3.0.0 | major: replace phase-only coordination roles with a seven-role pack,
  require oracle-owned analysis and verification, distinguish CLI/network-based
  installation from runtime-autonomous SDD, and keep external skills canonical
  instead of vendored | constitution checks, SDD contracts, generated harness
  packages, CLI installation, documentation, active specs, and tests.
- 2.2.0 | minor: add typed phase protocols, the canonical dispatch envelope,
  durable verification reports, append-only convergence, and verified archive
  closeout for artifact-backed routes | SDD contracts, role prompts, active
  specs, generated harness packages, documentation, and tests.
- 2.1.0 | minor: replace the incomplete Playwright skill dependency with
  progressive context and conditional architectural decision skills while
  leaving QA tooling project-owned | SDD routing, required-skill installation,
  prompts, active specs, and documentation.
- 2.0.0 | major: replace delegate-first/phase-skill governance with adaptive
  root, ten roles, proportional Spec Kit-compatible SDD, mandatory external
  skills, and explicit provider separation | all active role, SDD, harness,
  install, documentation, and verification contracts.
- 1.1.0 | historical: externalized thoth-mem provider boundary.
- 1.0.0 | historical: initial constitution.
