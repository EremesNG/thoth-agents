# Delta for sdd-design-authoring

Introduce optional, complexity-gated plan sub-artifacts alongside the
always-present, authoritative `design.md`. When complexity warrants and the
mechanism is enabled, `sdd-design` MAY also produce `research.md`,
`data-model.md`, a `contracts/` subdirectory, and `quickstart.md` under
`openspec/changes/{change-name}/`. Gated by `rules.design.sub_artifacts` and
`rules.design.complexity_threshold`. Fully back-compatible: absence of the
sub-artifacts is today's behavior.

## Assumptions

- `design.md` remains the sole REQUIRED design artifact and the authoritative
  source; sub-artifacts are supplementary surfaces, never a replacement.
- `rules.design.sub_artifacts` defaults to `false` and
  `rules.design.complexity_threshold` is inert while disabled, so a project on
  the old config produces only `design.md` exactly as before.
- The `contracts/` subdirectory follows the existing `checklists/` subdir layout
  precedent under `openspec/changes/{change-name}/`.
- Whether the complexity gate is computed by the `sdd-design` author or read
  from `rules.design.complexity_threshold` is deferred to the design phase
  (open question (b)); this spec requires only that emission be gated by both
  the enable toggle AND a complexity condition, without fixing which actor
  evaluates the threshold.

## ADDED Requirements

### Requirement: design.md Remains Always Required and Authoritative

`sdd-design` MUST always produce `design.md` at
`openspec/changes/{change-name}/design.md` as the authoritative design artifact,
independent of whether sub-artifacts are produced. Optional sub-artifacts MUST
NOT replace, supersede, or make optional any content that the design phase
requires in `design.md`.

#### Scenario: design.md is produced regardless of sub-artifact gating

- GIVEN any enabled or disabled state of `rules.design.sub_artifacts`
- WHEN `sdd-design` completes
- THEN `design.md` exists at the canonical change path
- AND it remains the authoritative design artifact

#### Scenario: Sub-artifacts do not weaken design.md

- GIVEN sub-artifacts are produced for a change
- WHEN the design phase output is inspected
- THEN `design.md` still contains all content the design phase requires
- AND the sub-artifacts are supplementary, not a replacement

### Requirement: Optional Complexity-Gated Plan Sub-Artifacts

When `rules.design.sub_artifacts` is enabled AND the change meets the configured
complexity condition, `sdd-design` MAY produce `research.md`, `data-model.md`, a
`contracts/` subdirectory, and `quickstart.md` under
`openspec/changes/{change-name}/`. When the mechanism is disabled or the change
does not meet the complexity condition, `sdd-design` MUST NOT produce these
sub-artifacts. Sub-artifact paths MUST follow the existing change-directory
layout, with `contracts/` as a subdirectory mirroring the `checklists/`
precedent.

#### Scenario: Complex change with mechanism enabled produces sub-artifacts

- GIVEN `rules.design.sub_artifacts` is enabled
- AND a change that meets the configured complexity condition
- WHEN `sdd-design` runs
- THEN it MAY produce `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` under the change directory
- AND `design.md` is still produced as the authoritative artifact

#### Scenario: Simple change does not force sub-artifact ceremony

- GIVEN `rules.design.sub_artifacts` is enabled
- AND a change that does NOT meet the configured complexity condition
- WHEN `sdd-design` runs
- THEN no sub-artifacts are produced
- AND only `design.md` is required

#### Scenario: Mechanism disabled produces only design.md

- GIVEN `rules.design.sub_artifacts` is disabled or absent
- WHEN `sdd-design` runs
- THEN no sub-artifacts are produced regardless of complexity
- AND behavior is identical to the pre-mechanism baseline

### Requirement: Sub-Artifact Config Toggles

`openspec/config.yaml` MUST expose `rules.design.sub_artifacts` (boolean) and
`rules.design.complexity_threshold` to gate sub-artifact production. When
`rules.design.sub_artifacts` is absent, the mechanism MUST default to disabled
so legacy projects produce only `design.md`.

#### Scenario: Toggles enable gated production

- GIVEN `rules.design.sub_artifacts` is `true` and `complexity_threshold` is set
- WHEN `sdd-design` evaluates a change against the threshold
- THEN sub-artifact production is gated by both the toggle and the threshold

#### Scenario: Absent toggle defaults to disabled

- GIVEN a `config.yaml` that does not declare `rules.design.sub_artifacts`
- WHEN `sdd-design` runs
- THEN the mechanism is treated as disabled
- AND only `design.md` is produced

### Requirement: Sub-Artifacts Tolerated as Absent by Consumers

Downstream phases and tooling that read the change directory MUST treat
`research.md`, `data-model.md`, `contracts/`, and `quickstart.md` as optional,
operating without error when they are absent. A change with no sub-artifacts
MUST remain fully consumable by `sdd-tasks`, `sdd-apply`, `sdd-verify`, and
`sdd-archive`.

#### Scenario: Absence of sub-artifacts does not break downstream phases

- GIVEN a change directory containing only `design.md` and no sub-artifacts
- WHEN downstream SDD phases consume the change
- THEN they operate without error
- AND the missing sub-artifacts are treated as optional

### Requirement: Harness-Agnostic Sub-Artifacts

The sub-artifact names, the `rules.design.sub_artifacts` and
`rules.design.complexity_threshold` toggle semantics, the gating behavior, and
the directory layout MUST be defined once in shared conventions and behave
identically across OpenCode, Claude Code, and Codex, with per-harness prose
limited to declared capability gaps reported as unsupported-capability
limitations.

#### Scenario: Identical sub-artifact behavior across harnesses

- GIVEN the sub-artifact definition in shared conventions
- WHEN `sdd-design` runs under OpenCode, Claude Code, or Codex
- THEN the sub-artifact names, gating, and layout are identical across all three harnesses
