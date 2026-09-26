# Proposal: Multi-Harness Skill Instructions

## Intent

Make `src/skills/` operational instructions multi-harness-ready by removing
OpenCode-centric assumptions from shared skill contracts while preserving
OpenCode as the baseline behavior and Codex as the first additional supported
harness.

## Scope

### In Scope

- Audit and update shared skill contracts, especially persistence, SDD phase,
  requirements-interview, executing-plans, plan-reviewer, thoth-mem-agents, and
  cartography instructions.
- Separate harness-neutral responsibilities from harness-specific interaction
  primitives such as delegation, user questions, tool names, artifact paths, and
  review/verification surfaces.
- Preserve `thoth-agents` identity, seven role names, SDD phase ordering,
  thoth-mem governance, and OpenSpec persistence semantics.
- Ensure Codex guidance prefers plugin-bundled `skills/<skill>/` delivery and
  describes instruction-level limitations where Codex lacks hard runtime
  enforcement.

### Out of Scope

- Implementing new harnesses beyond existing OpenCode behavior and Codex-ready
  instructions.
- Changing agent roster, role responsibilities, or thoth-mem as the memory
  backend.
- Editing runtime adapters, installers, package writers, or generated artifacts
  unless later design proves a skill instruction contract requires it.

## Approach

Treat skills as portable operating contracts. Shared sections will describe
semantic behavior, artifact contracts, persistence modes, safety rules, and
verification expectations without assuming OpenCode-only tool names or paths.
Harness-specific wording will be explicit and localized so OpenCode instructions
remain accurate and Codex instructions can map to Codex terminology, plugin
skill packaging, and documented capability gaps.

## Affected Areas

- `src/skills/_shared/persistence-contract.md`
- `src/skills/requirements-interview/`
- `src/skills/executing-plans/`
- `src/skills/plan-reviewer/`
- `src/skills/thoth-mem-agents/`
- `src/skills/cartography/`
- `src/skills/sdd-*`
- Related tests or fixtures that validate bundled skill content

## Risks

- Over-normalizing instructions could weaken OpenCode's current precise
  operational behavior.
- Codex wording could overpromise runtime enforcement for permissions, hooks,
  memory governance, or delegation.
- Persistence naming and SDD artifact rules could drift between OpenSpec,
  thoth-mem, and harness packaging surfaces.

## Rollback Plan

Revert the skill-instruction changes while keeping existing OpenCode skill
content intact. If Codex-specific wording proves unsafe, disable or remove only
the Codex-facing skill packaging references and retain the harness-neutral
cleanup that is verified not to alter OpenCode behavior.

## Success Criteria

- Shared skill instructions no longer rely on OpenCode-only wording where the
  behavior is intended to be harness-neutral.
- OpenCode baseline SDD, memory, delegation, and verification instructions remain
  semantically unchanged.
- Codex-facing instructions are accurate for plugin-bundled skills and disclose
  instruction-only governance limits.
- Automated checks or focused content tests cover the affected skill contracts.
