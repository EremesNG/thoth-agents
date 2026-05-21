# Skills Specification

## Purpose

Define the required SDD skill set, shared conventions, persistence contract, and
artifact expectations for OpenSpec-based workflows.

## Requirements

### Requirement: Core SDD skills are present and loadable

The system MUST provide the following loadable SDD skills:

- `sdd-propose`
- `sdd-spec`
- `sdd-design`
- `sdd-tasks`
- `sdd-apply`
- `sdd-verify`
- `sdd-archive`

The system MAY provide additional SDD support skills, but the core set SHALL
always be present.

#### Scenario: Each core SDD skill loads successfully

- GIVEN the plugin's skill catalog is available
- WHEN a user requests any of the core SDD skills by name
- THEN that skill SHALL resolve as available and loadable

#### Scenario: Missing core skill fails validation

- GIVEN the plugin package is inspected for required SDD skills
- WHEN any one of the core skill names is absent
- THEN the create-omolite-plugin change SHALL be considered incomplete

### Requirement: Shared SDD conventions are included

The system MUST include shared convention artifacts named
`thoth-mem-convention`, `persistence-contract`, and `openspec-convention` for
reuse across SDD workflows.

#### Scenario: Shared conventions are discoverable

- GIVEN the shared SDD convention artifacts are enumerated
- WHEN the plugin's skill assets are inspected
- THEN thoth-mem-convention, persistence-contract, and openspec-convention
  SHALL all be present

#### Scenario: SDD skill can rely on shared conventions

- GIVEN an SDD skill that depends on shared workflow conventions is loaded
- WHEN the skill references shared conventions
- THEN the referenced shared convention artifacts SHALL be available to it

### Requirement: SDD skills use thoth-mem for persistence

SDD skills MUST use thoth-mem for persistence and MUST NOT depend on engram for
proposal, specification, design, task, verification, or archive workflow state.

#### Scenario: Skill persistence instructions target thoth-mem

- GIVEN an SDD skill that persists workflow state is inspected
- WHEN its persistence instructions are read
- THEN those instructions SHALL target thoth-mem operations

#### Scenario: Engram persistence is absent

- GIVEN the SDD skill set is inspected for persistence references
- WHEN persistence backends are identified
- THEN engram SHALL NOT be required or referenced as the persistence backend

### Requirement: SDD skills follow the OpenSpec artifact contract

Skills that create or update SDD artifacts MUST produce outputs compatible with
the OpenSpec artifact structure, including `proposal.md`, domain specs under
`specs/`, `design.md`, and `tasks.md`.

#### Scenario: Proposal skill targets proposal.md

- GIVEN a user runs the proposal phase skill for a change
- WHEN the skill describes its output artifact
- THEN it SHALL target `proposal.md` for that change

#### Scenario: Spec skill targets domain specs under specs/

- GIVEN a user runs the specification phase skill for a change
- WHEN the skill describes its output artifacts
- THEN it SHALL target one or more domain spec files under `specs/`

#### Scenario: Design skill targets design.md

- GIVEN a user runs the design phase skill for a change
- WHEN the skill describes its output artifact
- THEN it SHALL target `design.md` for that change

#### Scenario: Tasks skill targets tasks.md

- GIVEN a user runs the tasks phase skill for a change
- WHEN the skill describes its output artifact
- THEN it SHALL target `tasks.md` for that change

#### Scenario: Existing change artifacts keep canonical names

- GIVEN a user updates an existing OpenSpec change
- WHEN an SDD skill writes or rewrites an artifact
- THEN it SHALL keep the canonical OpenSpec artifact names and locations
- AND it SHALL NOT invent alternate filenames for those artifacts
