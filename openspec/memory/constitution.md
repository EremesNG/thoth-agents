<!--
Sync Impact Report
- Version change: 3.0.0 -> 4.0.0
- Modified principles: Proportional Spec Kit-compatible SDD (transactional archive semantics defined); Evidence-led completion (durable closeout sync added)
- Added sections: Governance
- Removed sections: Semver policy (absorbed into Governance)
- Templates: ✅ skills/thoth-sdd/templates; ✅ skills/thoth-archive; ✅ agent and SDD instructions; ✅ user documentation
- Follow-up TODOs: None
-->
# thoth-agents Project Constitution

**Version**: 4.0.0<br>
**Ratified**: 2026-06-16<br>
**Last amended**: 2026-07-19

This constitution governs active thoth-agents behavior. Spec Kit supplies SDD
artifact semantics; thoth-agents stores them under `openspec/` and adds its
adaptive route policy.

## Principles

### 1. Adaptive-root orchestration

The root may inspect and edit clear bounded work directly. It delegates only
when specialization, context isolation, independent review, or safe parallelism
creates a net gain, except that `analyze` and every `verify` phase are always
delegated to `oracle`. Delegation depth is one and each mutable surface has one
writer.

### 2. Explicit role boundaries

The active pack contains exactly seven roles: `orchestrator`, `explorer`,
`librarian`, `oracle`, `designer`, `quick`, and `deep`. Root/orchestrator owns
sequential coordination and governed artifacts under `openspec/`; it loads phase
contracts only when required. Read-only roles (`explorer`, `librarian`,
`oracle`) never mutate. Root and implementation writers (`designer`, `quick`,
`deep`) own only their explicitly bounded product surfaces.

### 3. Proportional Spec Kit-compatible SDD

The root selects direct, accelerated, or full SDD from intent, scope, clarity,
contract risk, and failure cost. Accelerated SDD is a first-class route.
Clarification, checklists, optional artifacts, and convergence activate on
artifact-backed routes only when their risk signal exists. Ceremony without
decision or risk value is prohibited.
`architectural-grilling` is a conditional pre-specification gate only for an
explicit request or unresolved material human-owned product/architecture
branches; Full SDD alone never requires it.
Every phase has a shared typed protocol and a canonical dispatch envelope.
Artifact-backed routes persist a verification verdict and close through a dated
archive. After oracle PASS, archive MUST transactionally synchronize only explicitly
declared durable `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED` deltas into
`openspec/specs/`; `[INTERNAL]` requirements never alter permanent
specifications. Handled failures MUST roll back within the active process, but
forced process or operating-system termination is not crash-atomic.

### 4. Truthful multi-harness contracts

OpenCode, Codex, and Claude Code derive behavior from shared role and SDD
contracts, while adapters disclose enforcement gaps. OpenCode is the default and
ships only the built-in OpenAI preset. `simplify`, `tdd`,
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

Every route includes verification proportional to changed behavior and risk
before completion. Completion reports identify changed surfaces and executed
evidence. Oracle independently verifies every route; Full SDD also adds
oracle-owned pre-implementation analysis. Artifact-backed failures append
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
