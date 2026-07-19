# Spec: Project Identity

## Requirements

### Requirement: Establish thoth-agents as the Canonical Identity
The system MUST use `thoth-agents` as the canonical product, package, plugin,
CLI, documentation, skill, and generated-artifact identity for all active
project-owned surfaces.

#### Scenario: Active product identity is consistently renamed
- GIVEN an active source file, manifest, fixture, documentation page, skill
  artifact, test, or OpenSpec artifact describes the current project identity
- WHEN the rename is implemented
- THEN it MUST identify the project as `thoth-agents`
- AND it MUST NOT identify the current project with the pre-rename package
  identity

#### Scenario: Canonical role names remain stable
- GIVEN the agent roster includes orchestrator, explorer, librarian, oracle,
  designer, quick, and deep
- WHEN canonical project identity is updated
- THEN those role names MUST remain unchanged
- AND the rename MUST NOT introduce role-level rebranding unrelated to the
  project/package identity

### Requirement: Use thoth-agents for Install and Configuration Targets
Installers, config writers, schema references, and target resolvers MUST use
`thoth-agents` for project-owned package names, plugin IDs, managed block names,
generated config identifiers, local source directories, and installation target
paths.

#### Scenario: OpenCode install config uses the new package identity
- GIVEN a user installs or dry-runs the OpenCode target
- WHEN OpenCode config entries, package references, schema defaults, or managed
  plugin names are planned or written
- THEN those entries MUST use `thoth-agents`
- AND they MUST NOT create or preserve managed install targets named with the
  pre-rename package identity

#### Scenario: Codex install paths use the new package identity
- GIVEN a user installs or dry-runs the Codex target
- WHEN Codex plugin source paths, marketplace entries, generated role filenames,
  managed blocks, package manifests, or target resolver outputs are planned or
  written
- THEN project-owned names and paths MUST use `thoth-agents`
- AND generated Codex config names, plugin paths, and role filenames MUST NOT use
  the pre-rename package identity

### Requirement: Generate Manifests and Marketplace Entries with thoth-agents
Generated manifests, package metadata, marketplace entries, plugin descriptors,
schema-visible identifiers, and release-facing metadata MUST identify the package
or plugin as `thoth-agents`.

#### Scenario: Deterministic generated artifacts contain the new identity
- GIVEN manifest, marketplace, fixture, snapshot, schema, or package metadata is
  generated for a supported harness
- WHEN generation runs with the same inputs after the rename
- THEN the generated artifact MUST be deterministic
- AND project-owned identity fields MUST use `thoth-agents`
- AND project-owned identity fields MUST NOT use the pre-rename package identity

#### Scenario: Marketplace entries refresh the managed new-name entry
- GIVEN a marketplace or plugin registry file already contains unrelated user or
  third-party entries
- WHEN the installer refreshes the managed project entry
- THEN it MUST create or update the managed `thoth-agents` entry
- AND it MUST preserve unrelated entries
- AND it MUST NOT create a managed pre-rename package entry

### Requirement: Prevent Mixed Active Identity in Tests, Docs, and Specs
Active tests, fixtures, snapshots, documentation, generated examples, and current
OpenSpec artifacts MUST use one canonical current identity, `thoth-agents`, and
MUST NOT mix it with the pre-rename package identity except for explicitly scoped
historical, archived, third-party, or migration-risk references.

#### Scenario: Active verification surfaces reject mixed identity
- GIVEN tests, snapshots, fixtures, active docs, and current OpenSpec artifacts
  are updated for the rename
- WHEN automated checks inspect active project-owned identity references
- THEN they MUST find `thoth-agents` where the current project/package/plugin is
  named
- AND any remaining pre-rename package identity reference MUST be explicitly
  classified as historical, archived, third-party, or compatibility-sensitive
  text

#### Scenario: Historical references are scoped and non-canonical
- GIVEN an archived OpenSpec change, changelog, migration note, provenance note,
  or third-party example mentions the pre-rename package identity
- WHEN the rename is implemented
- THEN the reference MAY remain only if its context makes clear that it is not
  the current canonical identity
- AND active install, config, manifest, package, schema, or generated artifact
  behavior MUST NOT derive current names from that historical reference

### Requirement: Enforce Hard-Cutover Semantics
The system MUST perform a hard cutover to `thoth-agents` and MUST NOT provide
automatic compatibility aliases for old package names, plugin IDs, install paths,
managed config names, generated artifact names, or marketplace entries unless a
later approved artifact scopes a narrow exception with rationale.

#### Scenario: Legacy install aliases are not generated
- GIVEN an install command, target resolver, package manifest, marketplace writer,
  or config writer handles project-owned identity
- WHEN the rename is implemented
- THEN it MUST use `thoth-agents` as the only active managed identity
- AND it MUST NOT generate automatic aliases, duplicate managed entries, legacy
  install targets, or fallback config names for the pre-rename package identity

#### Scenario: No legacy old-name data is preserved or emitted
- GIVEN the ecosystem has no existing users, installations, or persisted
  pre-rename package data to preserve
- WHEN the new installer or generator runs
- THEN the system MUST use only `thoth-agents` as the active managed target
- AND it MUST NOT silently create old-name managed output

### Requirement: Verify the Rename Across Source, Generated Artifacts, and Docs
The implementation MUST include automated verification that active source,
tests, generated fixtures, package metadata, install/config paths, documentation,
and OpenSpec artifacts no longer expose the pre-rename package identity as the
current canonical identity.

#### Scenario: Repository-wide active identity audit passes
- GIVEN the rename implementation is complete
- WHEN the verification suite and identity audit run
- THEN automated checks MUST pass for type checking, lint or formatting policy,
  and tests affected by the rename
- AND the audit MUST report no active canonical pre-rename package identity
  references outside explicitly allowed historical, archived, third-party, or
  scoped exception contexts

#### Scenario: Generated artifact verification includes installer outputs
- GIVEN generated manifests, marketplace entries, fixture snapshots, and dry-run
  install plans are produced after the rename
- WHEN verification compares their project-owned identity fields and paths
- THEN those outputs MUST use `thoth-agents`
- AND they MUST NOT emit old-name package, plugin, config, role-file, or install
  target identifiers
