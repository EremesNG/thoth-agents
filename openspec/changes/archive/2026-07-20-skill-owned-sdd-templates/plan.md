# Implementation Plan: Skill-owned SDD templates

## Technical context

The canonical workflow bundle lives under `skills/` and is copied into the
shared Codex/Claude plugin output by
`src/harness/generate-integration-packages.ts`; OpenCode receives the same owned
skill directories in its global skill root. The SDD contracts currently use
unqualified `templates/...`, `references/...`, and `scripts/...` paths, while
`thoth-init` independently copies `skills/thoth-sdd/templates/` into each
project. The structural validator is already authoritative, but its fixture
tests do not prove that a completed artifact set derived from the public
templates passes `ready`.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — The user selected Accelerated and root remains the sole writer; optional plan review and mandatory Oracle verification stay separate.
- **Explicit role boundaries**: PASS — Root owns the OpenSpec artifacts and canonical implementation surfaces; no read-only reviewer will mutate them.
- **Proportional Spec Kit-compatible SDD**: PASS — The change preserves the existing Accelerated phase graph and uses only required spec, plan, tasks, verification, and archive artifacts.
- **Truthful multi-harness contracts**: PASS — Canonical skills remain the source for OpenCode, Codex, and Claude, and generated plugin copies will be synchronized and verified rather than edited independently.
- **Independent provider ownership**: PASS — The change does not touch thoth-mem installation, protocol, hooks, lifecycle, or persisted provider assets.
- **Evidence-led completion**: PASS — Focused initializer, bundle-contract, and validator regressions precede implementation, followed by generated-package checks, repository checks, and independent Oracle verification.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 / SC-001 | Define `<skill-dir>` once in each installed workflow skill that owns actionable assets, qualify phase-contract, template, validator, and archive-script paths from those roots, and qualify sibling skill references through the installed skills root. Missing assets remain installation drift. | `skills/thoth-sdd/SKILL.md`; `skills/thoth-sdd/references/phases/specify.md`; `skills/thoth-sdd/references/phases/plan.md`; `skills/thoth-sdd/references/phases/checklist.md`; `skills/thoth-sdd/references/phases/tasks.md`; `skills/thoth-sdd/references/phases/verify.md`; `skills/plan-reviewer/SKILL.md`; `skills/thoth-constitution/SKILL.md`; `skills/thoth-archive/SKILL.md`; generated `plugin/skills/` mirrors | Bundle-contract tests inspect canonical and generated contracts, require explicit skill-root resolution for every actionable workflow asset, and reject project-local `openspec/templates/` guidance. |
| FR-002 / FR-003 / SC-002 | Remove SDD template collection, preflight, copying, and the `openspec/templates/` directory from initialization while retaining full preflight for required directories, constitution, and managed manifest. Existing legacy paths are outside the managed graph and therefore remain untouched. | `skills/thoth-init/scripts/init.mjs`; `skills/thoth-init/SKILL.md`; `src/harness/bundled-skills.test.ts`; generated `plugin/skills/thoth-init/` | Test empty and repeated initialization, byte-preservation of a legacy template tree, successful init when bundled SDD templates are absent, and collision failure before any managed write. |
| FR-004 / SC-003 | Keep validator policy unchanged, strengthen plan guidance to extract one exact active-principle name set and reuse it in both checks, and replace parser-active task examples with explicit non-task grammar plus insertion anchors so agents do not append beside duplicate sample IDs or leave validator-rejected path placeholders. Audit the remaining templates and encode their validator-relevant contract in a materialized-template `ready` fixture. | `skills/thoth-sdd/templates/plan.md`; `skills/thoth-sdd/templates/tasks.md`; `skills/thoth-sdd/templates/spec.md`; `skills/thoth-sdd/templates/checklist.md`; `skills/thoth-sdd/templates/verify-report.md`; `skills/thoth-sdd/templates/archive-report.md`; `src/harness/sdd-validator.test.ts`; `src/harness/bundled-skills.test.ts` | A completed Accelerated artifact set derived from bundled templates passes `ready`; targeted mutations emit `SDD-PLAN-CONSTITUTION-COVERAGE`, `SDD-TASK-FORMAT`, and `SDD-TASK-SEQUENCE`. Existing validator negative suites remain green. |
| Documentation | State that workflow templates are consumed in place from the installed `thoth-sdd` bundle and that init owns only governance directories, constitution, and metadata. | `README.md`; `docs/installation.md`; `docs/codex-install.md`; `docs/claude-code-install.md`; `docs/codex-surface-validation.md`; `docs/codex-plugin-packaging.md`; `docs/claude-code-plugin-packaging.md`; `docs/sdd-pipeline.md`; `docs/skills-and-mcps.md`; `docs/agent/sdd-and-skills.md` | Repository text search finds no active documentation claiming that `thoth-init` copies project SDD templates; focused documentation assertions and full checks pass. |

### Template audit criteria

The audit treats `skills/thoth-sdd/scripts/validate.mjs` as the executable
source of truth. Each bundled template will be checked for required sections,
identifier grammar, parser-active example lines, path rules, placeholder
behavior, and phase ownership. Changes are limited to discrepancies that can
cause a normally completed template to retain invalid or duplicate structural
records. The artifact schema and error-code policy do not change.

### Generated bundle strategy

Only canonical files under `skills/` are edited by hand. After focused tests,
`pnpm run integration:sync` regenerates `plugin/skills/`; generator verification
then proves the published bundle matches the canonical source. This covers all
three harnesses without hard-coding a user home directory.

## Optional support artifacts

- `research.md`: Not needed; repository contracts and validator source directly establish the behavior.
- `data-model.md`: Not needed; no persisted domain model changes.
- `contracts/`: Not needed; the existing Markdown skill contracts and validator are the public interfaces.
- `quickstart.md`: Not needed; targeted user and installation documentation updates cover the operational change.

## Risks and migrations

- Agents may still treat symbolic roots as project-relative unless the root definition and every actionable example are explicit. Mitigation: test both canonical and generated Markdown for the exact resolution contract.
- Removing parser-active task examples could make task generation less concrete. Mitigation: retain a canonical single-line grammar example in prose plus explicit section anchors and validate a materialized template fixture.
- Documentation is duplicated across harness guides. Mitigation: use bounded searches before and after edits and regenerate only the plugin bundle.
- Existing repositories may retain obsolete `openspec/templates/`. No migration or deletion is performed; those bytes remain project-owned and inert.
- Rollback is the normal Git revert of canonical skill, test, documentation, and generated bundle changes; no external or user-global state is mutated by this implementation.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — The design keeps root as the single implementation writer and reserves the post-ready review choice and final verdict for Oracle.
- **Explicit role boundaries**: PASS — Mutable canonical skills, tests, documentation, and generated output have one owner, while Oracle receives only read-only review inputs.
- **Proportional Spec Kit-compatible SDD**: PASS — The design adds no optional artifact because executable template-contract tests resolve the identified risk within the standard Accelerated artifacts.
- **Truthful multi-harness contracts**: PASS — Package-relative symbolic roots, canonical source ownership, integration synchronization, and generated-output assertions cover harness differences explicitly.
- **Independent provider ownership**: PASS — No design decision depends on or alters provider memory behavior, and OpenSpec remains the only SDD artifact surface.
- **Evidence-led completion**: PASS — Every requirement maps to a focused failing test, a concrete implementation surface, and proportional generated/full verification before Oracle judgment.
