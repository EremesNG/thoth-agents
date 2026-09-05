# Spec: Project Tooling

## Requirements

### Requirement: Use pnpm as the Authoritative Package Manager
The system MUST treat pnpm as the authoritative package manager for active
development, CI, release, and generated workflow guidance. The committed
`pnpm-lock.yaml` MUST be the source-of-truth lockfile, and Bun lockfiles MUST
NOT be used as authoritative dependency state for active workflows.

#### Scenario: Fresh install uses pnpm lockfile state
- GIVEN a fresh checkout of the repository
- WHEN dependencies are installed for development or CI
- THEN the install command MUST use pnpm
- AND the install MUST resolve from the committed `pnpm-lock.yaml`
- AND Bun lockfiles MUST NOT be required to install or verify the project

#### Scenario: Bun lockfiles are not active source of truth
- GIVEN a Bun lockfile is present in historical, archived, or migration context
- WHEN active dependency state is evaluated
- THEN the system MUST prefer `pnpm-lock.yaml`
- AND active documentation, scripts, and CI MUST NOT instruct contributors to
  treat a Bun lockfile as current dependency truth

### Requirement: Pin or Document Corepack Package Manager Behavior

Active package metadata, CI, release, bundled-skill compatibility declarations, generated guidance, and user documentation MUST require Node.js `>=22.19` consistently while preserving pnpm `11.2.2` as the authoritative package manager.

#### Scenario: US1 - Install the complete Pi agent pack 1

- **GIVEN** Pi `0.84.4` or a compatible evidenced release, Node.js `>=22.19`, and an empty isolated Pi home
- **WHEN** `thoth-agents install --agent=pi` is applied
- **THEN** the native Pi delegation and research packages, managed grep.app MCP configuration, root instructions, six canonical specialist definitions, owned skills, required external skills, provider setup, and Pi ledger record are completed in order

#### Scenario: US1 - Install the complete Pi agent pack 2

- **GIVEN** the same environment
- **WHEN** the installation is run with `--dry-run`
- **THEN** every intended command and managed target is reported and no Pi package, file, skill, provider, or ledger state is changed

#### Scenario: US1 - Install the complete Pi agent pack 3

- **GIVEN** any mandatory Pi-owned, thoth-agents-owned, external-skill, or provider step fails
- **WHEN** installation finishes
- **THEN** it reports bounded partial-state diagnostics and does not record complete installation

#### Scenario: US4 - Preserve existing harnesses while raising the runtime floor 1

- **GIVEN** an existing OpenCode, Codex, or Claude workflow
- **WHEN** the Pi integration is present
- **THEN** its existing adapter, installation, delegation, provider, and generated-package behavior is unchanged

#### Scenario: US4 - Preserve existing harnesses while raising the runtime floor 2

- **GIVEN** active package, CI, skill, and documentation surfaces
- **WHEN** runtime requirements are evaluated
- **THEN** they consistently require Node.js `>=22.19`

### Requirement: Run CI with pnpm Semantics
Continuous integration MUST install dependencies and execute project checks with
pnpm semantics, including frozen lockfile behavior for reproducible dependency
resolution.

#### Scenario: CI installs with frozen pnpm lockfile
- GIVEN CI runs on a clean checkout
- WHEN dependency installation begins
- THEN CI MUST use pnpm install semantics
- AND CI MUST require the committed lockfile to be current
- AND CI MUST fail rather than silently updating dependency state

#### Scenario: CI executes pnpm project scripts
- GIVEN CI has installed dependencies
- WHEN build, typecheck, lint, check, or tests run
- THEN CI MUST invoke those workflows through pnpm-compatible script commands
- AND CI MUST NOT require Bun to execute the default verification path

### Requirement: Expose Build and Verification Scripts Through pnpm
The project MUST provide package scripts for build, typecheck, lint, format or
check, and tests that are executable through pnpm without relying on Bun as the
script runner.

#### Scenario: Standard project checks run through pnpm
- GIVEN dependencies have been installed with pnpm
- WHEN a contributor runs the documented verification commands
- THEN `pnpm run build`, `pnpm run typecheck`, `pnpm run lint`, and the
  documented Biome check command MUST execute successfully when the project is
  healthy
- AND those scripts MUST NOT require `bun run`

#### Scenario: Tests run through pnpm
- GIVEN dependencies have been installed with pnpm
- WHEN a contributor runs the documented test command
- THEN the test suite MUST run through pnpm
- AND the default test command MUST NOT depend on the Bun test runner

### Requirement: Remove or Isolate Bun Runtime-Specific Contracts
Active runtime, test, and type contracts MUST be Node-compatible after the
migration. Any retained Bun-specific contract, including `bun:test`,
`bun-types`, Bun shebangs, or `globalThis.Bun?.env`, MUST be explicitly isolated
as a documented fallback, compatibility shim, or historical reference.

#### Scenario: Tests use a Node-compatible runner
- GIVEN an active project test imports a test API
- WHEN the migration is complete
- THEN the import MUST come from the selected Node-compatible test runner
- AND active tests MUST NOT import `bun:test`

#### Scenario: Runtime entrypoints are not Bun-only
- GIVEN a project CLI or runtime entrypoint is invoked through the supported
  package manager or Node-compatible command path
- WHEN the entrypoint starts
- THEN the entrypoint MUST NOT require a Bun-only shebang or Bun-only global API
  to execute
- AND any retained Bun-specific branch MUST be covered by an explicit fallback
  or compatibility rationale

#### Scenario: TypeScript ambient types stay aligned with runtime support
- GIVEN TypeScript compiles the project in strict mode
- WHEN runtime types are resolved
- THEN ambient Bun type dependencies MUST NOT be required for active
  Node-compatible source paths
- AND any retained Bun type reference MUST be scoped to isolated compatibility
  code

### Requirement: Update User-Facing Commands and Generated Guidance
Generated commands, CLI help, fixtures, documentation, README content, installer
examples, and update hooks MUST instruct users to run pnpm-compatible commands
for active workflows unless a Bun command is intentionally documented as a
fallback or historical note.

#### Scenario: Active command surfaces prefer pnpm
- GIVEN a user reads active CLI help, README setup instructions, docs, fixtures,
  or generated installer output
- WHEN the text describes installing, building, testing, developing, or running
  thoth-agents workflows
- THEN it MUST use pnpm-compatible command examples
- AND it MUST NOT use Bun commands unless the text clearly labels them as an
  intentional fallback or historical migration reference

#### Scenario: Generated artifacts remain deterministic after command updates
- GIVEN command-generating code or fixtures are updated for pnpm
- WHEN generation or snapshot verification runs with the same inputs
- THEN generated command text MUST remain deterministic
- AND fixture expectations MUST match the pnpm-compatible command contract

### Requirement: Recognize pnpm Lockfiles in Root and Cache Logic
Root-marker detection, LSP project-root detection, auto-update cache handling,
and lockfile-sensitive workflows MUST recognize `pnpm-lock.yaml` as an active
project lockfile.

#### Scenario: LSP root markers include pnpm
- GIVEN a workspace contains a `pnpm-lock.yaml`
- WHEN project-root or LSP root-marker logic determines the repository root
- THEN `pnpm-lock.yaml` MUST be sufficient evidence of an active project root
- AND Bun lockfile markers MUST NOT be the only package-manager lockfile markers
  recognized for this project

#### Scenario: Auto-update cache uses pnpm lockfile semantics
- GIVEN auto-update or cache logic needs to install or validate package state
- WHEN the migration is complete
- THEN it MUST account for `pnpm-lock.yaml`
- AND it MUST NOT require a Bun lockfile or Bun install command for the default
  update path

### Requirement: Preserve Product and Harness Semantics
The migration MUST preserve current thoth-agents product behavior, package
identity, supported harness semantics, SDD rules, memory governance, generated
role behavior, and OpenCode/Codex adapter contracts except where a surface
explicitly invokes package-manager or runtime tooling.

#### Scenario: Harness behavior is unchanged
- GIVEN a supported OpenCode, Codex, or Claude Code workflow does not depend on invoking the
  package manager or runtime test command
- WHEN the pnpm migration is applied
- THEN the workflow MUST preserve its previous behavior and generated semantic
  contracts
- AND the migration MUST NOT add, remove, rename, or weaken agent roles,
  delegation rules, memory governance, or SDD phase rules

#### Scenario: Package identity remains stable
- GIVEN package metadata, generated manifests, installer output, or docs identify
  the current product
- WHEN the package-manager migration updates command surfaces
- THEN the product and package identity MUST remain `thoth-agents`
- AND the migration MUST NOT introduce compatibility aliases or unrelated
  rebranding

### Requirement: Verify pnpm Migration Surfaces
The implementation MUST verify the migration with pnpm install, lint or
check:ci, typecheck, build, the full test suite, and focused tests for
command-generation, auto-update or lockfile handling, and fixture outputs.

#### Scenario: Full pnpm verification passes
- GIVEN the migration implementation is complete
- WHEN verification runs from a clean dependency state
- THEN `pnpm install --frozen-lockfile` MUST pass
- AND the pnpm-invoked lint or check:ci command MUST pass
- AND pnpm-invoked typecheck, build, and full tests MUST pass

#### Scenario: Focused behavioral tests cover migrated surfaces
- GIVEN command-generation, auto-update, lockfile detection, and fixture
  surfaces were changed for pnpm
- WHEN focused tests for those surfaces run
- THEN they MUST prove active outputs use pnpm-compatible commands and
  `pnpm-lock.yaml` semantics
- AND they MUST prove product and harness semantics remain unchanged except for
  package-manager or runtime invocation surfaces
