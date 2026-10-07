# Delta for sdd-spec-authoring

Clarification discipline for spec authoring: `[NEEDS CLARIFICATION: ...]`
markers capped at 3 per spec file, an informed-guess-first policy with a
recorded Assumptions section, and cap enforcement by `plan-reviewer`. Gated by
a dedicated `config.yaml rules:` section.

## MODIFIED Requirements

### Requirement: Clarification Markers Capped Per Spec File

Spec authoring (`sdd-spec`) MUST support `[NEEDS CLARIFICATION: ...]` markers to
flag genuine unresolved decision forks within a spec file. Each spec file MUST
contain at most 3 such markers. The marker text MUST state the specific
question being escalated.

#### Scenario: Markers within the cap are accepted

- GIVEN a spec file containing 2 `[NEEDS CLARIFICATION: ...]` markers
- WHEN the spec file is authored
- THEN the spec file is accepted as within the clarification cap

#### Scenario: Marker text states a concrete question

- GIVEN a `[NEEDS CLARIFICATION: ...]` marker in a spec file
- WHEN the marker is read
- THEN it names the specific unresolved decision rather than a vague placeholder

### Requirement: Informed-Guess-First Assumptions Policy

Spec authoring MUST follow an informed-guess-first policy: for an ambiguity with
a reasonable default, the author MUST fill the default and record it in an
`Assumptions` section of the spec rather than emitting a clarification marker.
A `[NEEDS CLARIFICATION: ...]` marker MUST be reserved for genuine decision
forks where no single default is defensible.

#### Scenario: Reasonable default recorded as an assumption

- GIVEN an ambiguity that has a defensible default value
- WHEN the author resolves it
- THEN the default is applied in the spec
- AND the default is recorded in the spec's `Assumptions` section
- AND no clarification marker is emitted for it

#### Scenario: Genuine fork escalated as a marker

- GIVEN an ambiguity with two materially different outcomes and no defensible default
- WHEN the author encounters it
- THEN a `[NEEDS CLARIFICATION: ...]` marker is emitted naming the fork
- AND it is not silently defaulted

### Requirement: Clarification Cap Enforced by Plan-Reviewer

`plan-reviewer` MUST flag any spec file that exceeds 3 `[NEEDS CLARIFICATION:
...]` markers. Exceeding the cap MUST be reported as a finding indicating the
spec carries too much unresolved ambiguity to proceed cleanly.

#### Scenario: Over-cap spec is flagged

- GIVEN a spec file containing 4 `[NEEDS CLARIFICATION: ...]` markers
- WHEN `plan-reviewer` runs
- THEN it flags the spec file for exceeding the clarification cap

#### Scenario: At-cap spec is not flagged for the cap

- GIVEN a spec file containing exactly 3 `[NEEDS CLARIFICATION: ...]` markers
- WHEN `plan-reviewer` runs
- THEN it does not flag the spec file for exceeding the clarification cap

### Requirement: Harness-Agnostic Clarification Discipline

The clarification marker syntax, the cap, the informed-guess-first policy, and
the Assumptions section requirement MUST be defined once in shared conventions
and behave identically across OpenCode, Claude Code, and Codex, with per-harness
prose limited to declared capability gaps reported as unsupported-capability
limitations.

#### Scenario: Identical clarification behavior across harnesses

- GIVEN the clarification discipline definition in shared conventions
- WHEN spec authoring runs under OpenCode, Claude Code, or Codex
- THEN the marker syntax, cap, and Assumptions policy are identical across all three harnesses

### Requirement: Clarification Config Section

`openspec/config.yaml` MUST expose a dedicated `rules:` section that gates the
clarification mechanism, including the per-file marker cap value. When the
section is present, the configured cap MUST be the value enforced by
`plan-reviewer`.

#### Scenario: Configured cap drives enforcement

- GIVEN a `config.yaml rules:` clarification section setting the cap to 3
- WHEN a spec file contains 4 markers
- THEN `plan-reviewer` flags the spec file against the configured cap of 3
