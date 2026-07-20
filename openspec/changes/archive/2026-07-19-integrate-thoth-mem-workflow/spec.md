# Feature Specification: Integrate thoth-mem into the thoth-agents workflow

**Change ID**: `integrate-thoth-mem-workflow`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: A complete thoth-agents installation must include the independently owned thoth-mem provider, and agents need an explicit, bounded contract for using its installed guidance without reimplementing its lifecycle.<br>
**Impact**: `npx thoth-agents install` provisions thoth-mem through its public setup CLI for OpenCode, Codex, and Claude; root and delegated prompts route memory work through the installed thoth-mem skill while `openspec/` remains the canonical SDD store.<br>
**Affected capabilities**: `cli-installation`, `memory-orchestration`, `agent-delegation`

## User stories

### US1 - Complete harness installation (Priority: P1)

As a thoth-agents user, I can run one harness installation command so that thoth-agents, its mandatory external skills, and thoth-mem are all configured through their respective owners.

**Independent test**: Exercise the provider setup helper and each harness installation path with controlled command results, then verify the exact public thoth-mem command and final status.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** any supported harness, **When** its thoth-agents installation reaches provider setup, **Then** it invokes the official global thoth-mem setup command after thoth-agents-owned setup and required skills.
2. **Given** dry-run installation, **When** provider setup is planned, **Then** the thoth-mem command includes `--plan` and performs no provider mutation.
3. **Given** thoth-mem reports `partial`, `failed`, `requires_user_action`, malformed output, or contradictory exit evidence, **When** thoth-agents finishes the command, **Then** it preserves bounded diagnostics, manual actions, and receipt evidence and does not claim complete installation.

### US2 - Bounded agent memory usage (Priority: P1)

As the adaptive root, I can route persistent-memory work through installed thoth-mem guidance and give delegates an explicit scope so that memory remains useful without granting unrelated authority.

**Independent test**: Render root and child prompts plus an SDD dispatch envelope and verify provider triggers, stable identity fields, authorization levels, root lifecycle ownership, and workspace-permission separation.

**Covers**: FR-004, FR-005, FR-006, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a resume request or durable decision, root cause, convention, discovery, compaction, or semantic completion boundary, **When** the root needs persistent memory, **Then** it loads and follows the installed thoth-mem skill rather than prescribing provider calls itself.
2. **Given** a child dispatch, **When** memory is relevant, **Then** the envelope carries provider, project, stable root session identity or an explicit unavailable state, authorization, and bounded context.
3. **Given** a read-only workspace role such as explorer or oracle, **When** the parent explicitly grants `observe`, **Then** the role may persist a durable provider observation without gaining workspace mutation or root lifecycle authority.
4. **Given** an SDD phase artifact, **When** memory is used, **Then** `openspec/` remains canonical and thoth-mem is not used as a mirror of `spec.md`, `plan.md`, `tasks.md`, or reports.

### US3 - Accurate installation and limitation guidance (Priority: P2)

As an operator, I can understand the combined installation flow and ownership boundary so that I know which command is mandatory and how partial provider setup is recovered.

**Independent test**: Validate public documentation and provider-boundary tests for all three harness commands, ownership wording, dry-run behavior, and manual-action handling.

**Covers**: FR-007, SC-006

**Acceptance scenarios**:

1. **Given** the README or installation documentation, **When** a user follows a harness path, **Then** it states that the thoth-agents CLI invokes thoth-mem setup while thoth-mem retains ownership of its hooks, MCP, skill, lifecycle, receipts, and recovery.

## Edge cases

- `npx` cannot launch, times out, or returns no valid JSON.
- Provider JSON is structurally incomplete or its status contradicts the process exit code.
- Provider setup is idempotent and reports `complete` with no changes.
- Claude setup still requires native-manager actions before or during provider-owned setup.
- The stable root session ID is unavailable; prompts must not invent a substitute or claim session continuity.
- Provider memory is degraded while implementation and verification can otherwise continue.

## Functional requirements

- **FR-001 — Mandatory provider setup**: `[ADDED cli-installation]` The installer MUST invoke `npx -y thoth-mem@latest setup <opencode|codex|claude> --scope global --json` for every supported harness after thoth-agents-owned setup and mandatory external skills, adding `--plan` only for dry-run.
- **FR-002 — Truthful provider outcome**: `[ADDED cli-installation]` The installer MUST parse the documented thoth-mem JSON result, accept only internally consistent `complete` evidence as success, and surface diagnostics, manual actions, and receipt information without claiming completion for any other state.
- **FR-003 — Provider ownership boundary**: `[INTERNAL]` thoth-agents MUST NOT copy, generate, edit, remove, force, roll back, or reimplement thoth-mem hooks, MCP configuration, skill, lifecycle, persistence protocol, receipts, or recovery behavior.
- **FR-004 — Root memory routing**: `[ADDED memory-orchestration]` The adaptive root MUST route recall, durable lessons, verified compaction, and meaningful semantic completion through the installed thoth-mem skill while retaining root-only lifecycle and real-user-intent ownership.
- **FR-005 — Delegated memory authorization**: `[ADDED agent-delegation]` Every canonical dispatch MUST support `none`, `recall`, or `observe` authorization with bounded project, stable root session identity or `unavailable`, and context; that authorization MUST be independent of workspace mutation mode and MUST never delegate root lifecycle.
- **FR-006 — Single SDD source of truth**: `[INTERNAL]` `openspec/` MUST remain the canonical SDD artifact surface, and thoth-agents MUST prohibit routine mirroring of phase artifacts into thoth-mem while allowing durable decisions, root causes, conventions, discoveries, and continuity summaries under installed provider guidance.
- **FR-007 — Public operator guidance**: `[ADDED cli-installation]` README and routed documentation MUST describe mandatory provider setup, all harness mappings, dry-run planning, non-complete outcomes, and the independent ownership boundary.

## Success criteria

- **SC-001** `[buildable]`: Tests pass for the exact thoth-mem command on all three harnesses, including `--plan` only during dry-run and no implicit `--force`.
- **SC-002** `[buildable]`: Tests cover all four documented provider statuses, malformed output, and exit/status mismatch without false success.
- **SC-003** `[buildable]`: Every supported `install` branch reaches the shared mandatory provider setup and returns nonzero unless provider status is `complete`.
- **SC-004** `[buildable]`: All rendered root and child prompts name the installed thoth-mem skill, its bounded triggers, root lifecycle boundary, degradation behavior, and OpenSpec canonicality without embedding `mem_*` call sequences.
- **SC-005** `[buildable]`: Every canonical dispatch form contains a MEMORY block with provider, project, root session identity, authorization, and bounded context; tests demonstrate `observe` for a read-only workspace role does not grant workspace writes.
- **SC-006** `[buildable]`: All named public guides agree on the combined installation flow and ownership limitations.

## Assumptions

- The documented thoth-mem 0.3 setup JSON and exit-code contract remains its public administrative API.
- Global provider setup is the intended companion to the user-level thoth-agents installation for all supported harnesses.
- A failed memory capability does not invalidate unrelated product implementation or verification, but it does make the combined installation incomplete.

## Dependencies

- Published `thoth-mem@latest` package and its `setup` command.
- `npx` availability during installation only.
- Installed thoth-mem skill and MCP surfaces during agent runtime.

## Out of scope

- Reimplementing thoth-mem setup, status, rollback, hooks, MCP, storage, or lifecycle.
- Removing thoth-mem during thoth-agents reset, update, sync, or uninstall.
- Copying thoth-mem assets into the shared thoth-agents plugin bundle.
- Making SDD phase execution invoke the thoth-agents or thoth-mem CLI.
