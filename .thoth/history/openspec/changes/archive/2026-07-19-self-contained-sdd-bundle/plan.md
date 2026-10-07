# Implementation Plan: Runtime-autonomous SDD bundle

## Technical context

The current implementation renders ten roles and embeds phase protocol text in
agent prompts. Codex generation discards non-plugin project artifacts, Claude
does not package skills, OpenCode has no native init command, and mandatory
skills are installed by the CLI. This change keeps detailed SDD contracts in one
canonical, versioned owned bundle while preserving canonical upstream
repositories for external skills.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — Direct remains lightweight while root
  delegates analyze and every verify gate to oracle.
- **Explicit role boundaries**: PASS — the design exposes exactly seven roles,
  keeps discovery/review read-only, and assigns one writer per mutable surface.
- **Proportional Spec Kit-compatible SDD**: PASS — Accelerated and Full retain
  governed artifacts while conditional gates activate only on a risk signal.
- **Truthful multi-harness contracts**: PASS — each adapter declares its native
  plugin surface and its required CLI installation responsibilities.
- **Independent provider ownership**: PASS — memory installation, hooks, MCP,
  lifecycle, and persistence remain outside this plugin.
- **Evidence-led completion**: PASS — tests, structural validation, oracle review,
  and governed archive are explicit completion gates.

## Design

### 1. Canonical runtime contracts

Keep route and ownership metadata in TypeScript for deterministic orchestration.
Store detailed phase instructions, templates, and executable validation under a
canonical `skills/` source tree. Root prompts name the contract to load; they do
not inline every contract.

### 2. Seven-role pack

Delete phase-only factories and configuration keys. Root owns sequential
coordination. Explorer remains optional discovery, librarian external research,
oracle independent analysis/verification, designer UI/UX, quick narrow edits,
and deep correctness-heavy implementation.

### 3. Oracle gate

The route contract maps `analyze` and `verify` exclusively to oracle. The prompt
contract makes review read-only and identifies the implementation agent so a
self-review dispatch can be rejected. A failed verdict returns to root for an
append-only convergence task before a separate implementation dispatch.

### 4. Bundle and init

Package only owned SDD/init/archive/constitution skills. Install simplify, TDD,
progressive-context-router, and architectural-grilling from their canonical
repositories through `npx skills add` during setup. `thoth-init` copies only
missing project-owned governance and owned workflow skills. Claude discovers
bundled agents/skills; OpenCode injects a native command and can materialize
local owned skills. Codex keeps global agent TOMLs, orchestrator instructions,
and config in the mandatory CLI layer because its plugin manifest cannot install
them.

### 5. Validation

An offline, phase-aware validator checks canonical specification, plan, task,
checklist, verification, and archive structures without demanding future
artifacts at an earlier gate. Diagnostics identify the artifact, rule, and
remediation. Structural validation is mandatory for artifact-backed routes;
semantic review stays with oracle.

## Project structure changes

- `src/agents/`: remove the three phase-only factories and slim root/oracle
  contracts.
- `src/harness/core/`: update role/phase ownership and lazy contract metadata.
- `skills/`: add canonical owned skills, references, templates, and scripts;
  external skill sources remain outside this repository.
- `src/harness/generate-integration-packages.ts`: copy the canonical bundle and
  harness init assets into Codex and Claude packages.
- `src/index.ts`: register OpenCode `/thoth-init` from the canonical contract.
- `src/cli/`: install mandatory external skills through exact `npx skills add`
  commands for each harness and keep Codex global setup mandatory.
- `docs/`, `README.md`, `AGENTS.md`, schema, and active specs: describe the new
  seven-role bundled behavior and Codex's mandatory CLI limitation.

## Verification strategy

1. Contract tests for roster and phase ownership.
2. Prompt/adaptor tests for lazy contracts and oracle-only review.
3. Generator tests for complete Codex/Claude bundles.
4. Init tests for offline idempotency and preservation.
5. Validator fixtures for Spec Kit parity rules.
6. Focused tests, then check:ci, typecheck, build, and full suite.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — route metadata keeps coordination local
  and dispatches analyze/verify exclusively to oracle.
- **Explicit role boundaries**: PASS — generated packs contain the same seven
  roles and no phase-only agent definitions.
- **Proportional Spec Kit-compatible SDD**: PASS — phase-aware gates validate only
  artifacts produced so far and archive closes artifact-backed routes.
- **Truthful multi-harness contracts**: PASS — owned skills ship in plugins,
  external skills come from canonical repositories through the installer, and
  Codex global setup remains CLI-managed.
- **Independent provider ownership**: PASS — no provider-owned memory surface is
  copied, installed, or claimed by thoth-agents.
- **Evidence-led completion**: PASS — focused contracts, full project checks,
  independent oracle review, and archive evidence are all required.

## Risks

- External skill availability depends on network access during installation;
  their canonical repositories remain the single source of truth.
- Codex cannot install custom agents or global `AGENTS.md` from a plugin
  manifest, so its CLI layer remains mandatory.
- Removing configuration keys is intentionally breaking and requires schema and
  documentation updates in the same change.
