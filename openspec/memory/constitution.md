# thoth-agents Project Constitution

Version: 2.2.0
Ratified: 2026-06-16
Last-Amended: 2026-07-18

This constitution governs active thoth-agents behavior. Spec Kit supplies SDD
artifact semantics; thoth-agents stores them under `openspec/` and adds its
adaptive route policy.

## Semver policy

- MAJOR: remove or redefine a principle.
- MINOR: add a principle or materially expand governance.
- PATCH: clarify wording without behavior change.

## Principles

### 1. Adaptive-root orchestration

The root may inspect, edit, and verify clear bounded work directly. It delegates
only when specialization, context isolation, independent review, or safe
parallelism creates a net gain. Delegation depth is one and each mutable surface
has one writer.

### 2. Explicit role boundaries

Read-only roles (`explorer`, `librarian`, `oracle`) never mutate. Coordination
roles (`sdd-specify`, `sdd-plan`, `sdd-tasks`) write only governed artifacts
under `openspec/`. Implementation writers (`designer`, `quick`, `deep`) own their
assigned product surfaces.

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
archive without implicitly merging into permanent specifications.

### 4. Truthful multi-harness contracts

OpenCode, Codex, and Claude Code derive behavior from shared role and SDD
contracts, while adapters disclose enforcement gaps. OpenCode is the default and
ships only the built-in OpenAI preset. `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling` are mandatory external
skills installed by the CLI for every harness. Browser and QA executables remain
project-owned.

### 5. Independent provider ownership

thoth-mem owns its installation, hooks, MCP, lifecycle, persistence, and
recovery. thoth-agents does not copy provider protocol or claim provider effects
without evidence. Install/reset operations preserve independently managed
provider assets.

### 6. Evidence-led completion

Every route includes verification proportional to changed behavior and risk
before completion. Completion reports identify changed surfaces and executed
evidence. Full SDD adds independent analysis and verification. Artifact-backed
failures append traceable convergence tasks before the implementation/re-check
loop; Direct failures return straight to implementation. Accelerated and Full
archive only after a passing verdict and no unresolved critical finding.

## Sync-impact report

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
