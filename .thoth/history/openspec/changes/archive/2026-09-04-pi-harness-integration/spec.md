# Feature Specification: Pi Harness Integration

**Change ID**: `pi-harness-integration`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Operators should be able to install and run the canonical thoth-agents
root and specialist roster in Pi using Pi-native packages, resources, and
delegation instead of an instruction-only compatibility shim.<br>
**Impact**: Pi becomes a fourth first-class harness; the CLI gains Pi install,
update, sync, status, and diagnostic behavior; the package and CI runtime floor
rises to Node.js `>=22.19`; existing OpenCode, Codex, and Claude behavior remains
otherwise unchanged.<br>
**Affected capabilities**: `multi-harness-agent-pack`, `cli-installation`, `external-required-skills`, `project-tooling`

## User stories

### US1 - Install the complete Pi agent pack (Priority: P1)

As a Pi user, I can select Pi in the thoth-agents CLI and receive the root
instructions, six specialists, workflow skills, delegation runtime, and memory
provider setup needed for a complete installation.

**Independent test**: From an isolated Pi home with no packages installed, run
the Pi installation dry-run and applied flow, then inspect native Pi package,
resource, skill, provider, and thoth-agents ledger state.

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-009, FR-010, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, SC-001, SC-002, SC-003, SC-005, SC-006, SC-009

**Acceptance scenarios**:

1. **Given** Pi `0.84.4` or a compatible evidenced release, Node.js `>=22.19`,
   and an empty isolated Pi home, **When** `thoth-agents install --agent=pi` is
   applied, **Then** the native Pi delegation and research packages, managed
   grep.app MCP configuration, root instructions, six canonical specialist
   definitions, owned skills, required external skills, provider setup, and Pi
   ledger record are completed in order.
2. **Given** the same environment, **When** the installation is run with
   `--dry-run`, **Then** every intended command and managed target is reported and
   no Pi package, file, skill, provider, or ledger state is changed.
3. **Given** any mandatory Pi-owned, thoth-agents-owned, external-skill, or
   provider step fails, **When** installation finishes, **Then** it reports
   bounded partial-state diagnostics and does not record complete installation.

### US2 - Delegate through Pi-native subagents (Priority: P1)

As the Pi root, I can route fresh and continuing bounded work to the canonical
specialists through `pi-subagents-j0k3r` while preserving thoth-agents ownership,
memory, and verification rules.

**Independent test**: Load the generated Pi root and specialist resources with
the pinned delegation extension and exercise fresh task, background task,
status/result, bounded steering, continuation-disabled, and cancellation cases.

**Covers**: FR-002, FR-004, FR-005, FR-006, FR-007, FR-008, FR-020, SC-003, SC-004, SC-008, SC-009

**Acceptance scenarios**:

1. **Given** a fresh bounded assignment and an explicit canonical specialist,
   **When** the Pi root delegates, **Then** it invokes `subagent_run` with one
   canonical `agent`, task, and bounded context and receives either the terminal
   task result or a background task identifier.
2. **Given** a running background assignment owned by the current parent
   session, **When** the root needs progress, correction, result, or cancellation,
   **Then** it uses the package's status, send-message, result, list, or cancel
   surface without treating collection as permission to reuse the specialist.
3. **Given** a completed assignment and continuation is disabled, **When** the
   root reaches a new work boundary, **Then** it creates a fresh task rather than
   claiming continuation support.
4. **Given** live steering is unavailable, a queued message is not confirmed as
   delivered, or a task is nonterminal, **When** fan-in is evaluated, **Then** the
   root keeps the barrier closed and reports the actual capability state.

### US3 - Operate and diagnose Pi safely (Priority: P2)

As an operator, I can preview, apply, update, synchronize, and inspect the Pi
integration without silent fallthrough to another harness or false capability
claims.

**Independent test**: Exercise CLI and TUI parsing/dispatch against healthy,
missing, stale, custom-directory, conflicting-resource, and partially installed
Pi fixtures.

**Covers**: FR-007, FR-008, FR-009, FR-011, FR-012, FR-013, FR-014, FR-017, FR-019, SC-001, SC-002, SC-004, SC-005, SC-007

**Acceptance scenarios**:

1. **Given** a healthy complete Pi installation, **When** status is requested,
   **Then** it reports Pi, Node, delegation package, root/agent resources, skills,
   provider evidence, and the CLI-managed version without consulting another
   harness adapter.
2. **Given** a stale or incomplete Pi installation, **When** Update is applied,
   **Then** it performs the same complete ordered refresh as installation and
   advances the Pi ledger only after every required step succeeds.
3. **Given** Pi cannot safely support a requested model, continuation, steering,
   permission, or custom-directory operation, **When** the operation is planned
   or executed, **Then** it reports unsupported, conditional, or degraded status
   and a safe manual action instead of claiming parity.

### US4 - Preserve existing harnesses while raising the runtime floor (Priority: P1)

As an existing OpenCode, Codex, or Claude operator, I retain the current harness
behavior after Pi is introduced, under the newly selected Node.js runtime floor.

**Independent test**: Run all existing adapter, CLI, generated-package, SDD,
memory-governance, build, and full-suite checks on Node.js `>=22.19`.

**Covers**: FR-001, FR-017, FR-018, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** an existing OpenCode, Codex, or Claude workflow, **When** the Pi
   integration is present, **Then** its existing adapter, installation,
   delegation, provider, and generated-package behavior is unchanged.
2. **Given** active package, CI, skill, and documentation surfaces, **When**
   runtime requirements are evaluated, **Then** they consistently require
   Node.js `>=22.19`.

## Edge cases

- `pi` is absent, is older than the supported baseline, resolves to a different
  package, or is running on Node.js below `22.19`.
- `pi-subagents-j0k3r` catalog/release metadata says `1.5.9` while its tagged
  package manifest still reports `1.0.0`; status must not trust that manifest
  field as the sole version proof.
- A canonical specialist name conflicts with a user-owned Pi definition, or a
  managed file is corrupt, stale, partially written, or no longer attributable
  to thoth-agents.
- `PI_CODING_AGENT_DIR` redirects Pi away from `~/.pi/agent` while the external
  `skills` CLI still targets the default directory.
- Project-local Pi resources are untrusted and therefore undiscoverable.
- Continuation is disabled by default, live steering is unavailable on an old or
  unknown Pi SDK, or send-message queue acceptance is mistaken for delivery.
- A background task times out, stalls, is cancelled, or returns malformed or
  nonterminal evidence.
- Tool allowlists prevent ordinary child tool calls but do not provide an OS,
  filesystem, process, network, credential, or extension-code sandbox.
- Native Pi package installation succeeds but a later owned-surface, skill,
  research-tool configuration, or provider step fails; partial external state
  must remain visible and the ledger must not advance.
- A Context7, Exa, or grep.app package/endpoint changes its public tool schema,
  is unreachable, or requires credentials that are absent; status must identify
  the affected tool without presenting the remaining research stack as failed.
- The shared MCP configuration already contains user-owned servers or a
  conflicting `grep` entry; the installer must preserve unrelated entries
  and fail closed rather than overwrite an unowned conflict.
- A native Pi extension can read process credentials and execute with the user's
  system permissions even when its exposed research tool is read-only.

## Functional requirements

- **FR-001 — Support exactly four harnesses**: `[RENAMED multi-harness-agent-pack FROM Support exactly three harnesses]` The system MUST support OpenCode, Codex, Claude Code, and Pi; OpenCode MUST remain the default when no harness is selected, and unsupported harnesses MUST fail explicitly without fallback artifacts or dispatch.
- **FR-002 — Preserve the seven-role contract**: `[MODIFIED multi-harness-agent-pack]` Every Pi installation MUST derive one ambient `orchestrator` root and the six `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` specialists from the canonical role contracts, MUST NOT create an orchestrator child definition, and MUST preserve role prompts, model/effort metadata where Pi supports them, memory envelopes, ownership, and return contracts.
- **FR-003 — Distribute runtime-autonomous assets with explicit bootstrap**: `[MODIFIED multi-harness-agent-pack]` The Pi adapter and installer MUST materialize a bounded managed section in Pi's native appended-system-instruction surface plus six canonical Markdown agent definitions in a location discovered by `pi-subagents-j0k3r`, MUST synchronize the five packaged thoth-owned workflow skills, MUST preserve unrelated operator content, MUST update attributable managed state idempotently, and MUST fail closed on conflicting unowned canonical definitions.
- **FR-004 — Preserve native plugin-manager ownership**: `[MODIFIED multi-harness-agent-pack]` The Pi integration MUST install and verify the selected compatible `pi-subagents-j0k3r` release through `pi install`, MUST use its public single-agent tools and nested Pi sessions for delegation, and MUST NOT vendor, patch, copy its managed package internals, or reimplement its executor, concurrency limiter, task/history store, or lifecycle.
- **FR-005 — Native lifecycle translation**: `[MODIFIED multi-harness-agent-pack]` Pi root guidance MUST translate fresh work to a new single-agent `subagent_run`, same-assignment collection to status/result/list, running-task correction to `subagent_send_message` only when supported, cancellation to `subagent_cancel`, and completed-task continuation to `subagent_continue` only when explicitly enabled; new objectives, phases, mutable surfaces, and independent judgments MUST receive fresh tasks.
- **FR-006 — Use the strongest truthful native role selector**: `[MODIFIED multi-harness-agent-pack]` The Pi adapter MUST require the public `agent` field with one exact canonical specialist name for delegation and MUST NOT use deprecated batch input, implicit role inference, or a different harness's selector as evidence of native support.
- **FR-007 — Distinguish capability gaps from generation failure**: `[MODIFIED multi-harness-agent-pack]` Pi capability reporting MUST identify native agent definitions, skills, single-agent task/background delegation, task waiting, per-working-directory concurrency, status/result/list/cancel, bounded context, tool allowlists, native Context7 and Exa tools, and adapter-backed grep.app access as supported only when evidenced; MUST identify live steering, continuation, external credentials, and remote research availability as conditional; MUST identify OS sandboxing, remote/global scheduling, generic native MCP support, and any unavailable permission enforcement as unsupported or degraded; and MUST fail when a required outcome has no safe fallback.
- **FR-008 — Keep role permissions explicit**: `[MODIFIED multi-harness-agent-pack]` Pi definitions MUST apply native child tool allowlists for role-scoped execution, while generated guidance and diagnostics MUST state that Pi extensions execute with the invoking user's system permissions, can access process credentials and the network, tool allowlists are not security sandboxes, project-local resources require Pi trust, and thoth-agents does not own provider memory, Pi extension lifecycle, research-provider availability, or delegation history.
- **FR-009 — Preserve complete per-harness setup**: `[MODIFIED cli-installation]` `install --agent=pi` MUST preflight the selected global Node.js floor and compatible Pi executable; install and verify the selected delegation, native research, and MCP-adapter packages; merge only the attributable grep.app server entry; write only attributable thoth-agents root/agent/owned-skill surfaces; install mandatory external skills; invoke provider-owned setup; and atomically record the Pi ledger in that order. Dry-run MUST plan every step without mutation, any required failure MUST prevent a complete claim, and the existing OpenCode, Codex, and Claude setup contracts MUST remain unchanged.
- **FR-010 — Mandatory provider setup**: `[MODIFIED cli-installation]` The installer MUST invoke `npx -y thoth-mem@latest setup <opencode|codex|claude|pi> --scope global --json` after thoth-agents-owned setup and mandatory external skills, adding `--plan` only for dry-run and accepting only internally consistent `complete` evidence.
- **FR-011 — Make applied Update installation-equivalent**: `[MODIFIED cli-installation]` Applying Update for Pi MUST execute the same complete, ordered, fail-closed Pi refresh as `install --agent=pi`; previews MUST show every Pi-owned, thoth-agents-owned, external-skill, provider, and ledger step without mutation.
- **FR-012 — Record the last complete CLI-managed version**: `[MODIFIED cli-installation]` The CLI MUST maintain an independent Pi ledger entry alongside OpenCode, Codex, and Claude and MUST advance it only after every Pi installation or update step succeeds.
- **FR-013 — Treat the CLI ledger as authoritative for managed setup**: `[MODIFIED cli-installation]` Pi status and update decisions MUST use the last complete Pi ledger record as the official CLI-managed version, MUST report executing, recorded, delegation/research-package, managed-MCP-entry, and managed-surface drift, and MUST NOT infer or advance completion from `pi list`, package metadata, remote endpoint reachability, or native resources alone.
- **FR-014 — Expose truthful Pi operations**: `[ADDED cli-installation]` CLI and TUI parsing, selection, status, install, update, and sync MUST dispatch to a Pi operation adapter; supported specialist model/effort state MAY be read from or written to attributable Pi agent definitions, while Pi root-session model configuration and any unavailable action MUST remain Pi-owned and be reported explicitly rather than falling through to Codex, Claude, or OpenCode behavior.
- **FR-015 — Require the same four execution skills everywhere**: `[MODIFIED external-required-skills]` Pi installations MUST provide `simplify`, `tdd`, `progressive-context-router`, and `architectural-grilling` from the same canonical repositories required by OpenCode, Codex, and Claude.
- **FR-016 — Install through the skills CLI**: `[MODIFIED external-required-skills]` For Pi, the installer MUST invoke the canonical `skills` CLI with the concrete `pi` selector, global scope, explicit skill name, noninteractive confirmation, and copied materialization into Pi's native global skill root; failure or a detected `PI_CODING_AGENT_DIR` destination mismatch MUST fail or return an explicit manual action rather than claim discovery.
- **FR-017 — Preserve harness-native discovery**: `[MODIFIED external-required-skills]` The Pi installation MUST synchronize the five packaged thoth-owned workflow skills into Pi's native global skill root, MUST install the four external skills through their canonical repositories, MUST keep SDD execution independent of the CLI and network after installation, and MUST NOT depend on project initialization to make either class discoverable.
- **FR-018 — Pin or Document Corepack Package Manager Behavior**: `[MODIFIED project-tooling]` Active package metadata, CI, release, bundled-skill compatibility declarations, generated guidance, and user documentation MUST require Node.js `>=22.19` consistently while preserving pnpm `11.2.2` as the authoritative package manager.
- **FR-019 — Public operator guidance**: `[MODIFIED cli-installation]` README, CLI help/status, and routed installation documentation MUST describe Pi prerequisites, native package and resource ownership, the hybrid Context7/Exa/grep.app research stack, credential and network behavior, global scope, dry-run/update behavior, conditional continuation/steering, security limitations, custom-directory limitation, provider-owned `thoth-mem setup pi`, and safe recovery from partial installation.
- **FR-020 — Provide a bounded hybrid research stack**: `[ADDED cli-installation]` A complete Pi installation MUST install and verify `@upstash/context7-pi@0.1.2` and `@feniix/pi-exa@5.1.1` as Pi-native extensions, MUST install and verify `pi-mcp-adapter@2.32.1` solely to expose a managed global `mcpServers.grep` entry with URL `https://mcp.grep.app`, `protocolVersion: "legacy"`, and `lifecycle: "lazy"`, and MUST NOT route Context7 or Exa through that adapter. The grep.app server MUST remain proxy-only unless a future explicit contract selects direct tools. The installer MUST pin all three package versions, preserve unrelated top-level and server entries, treat a different unowned `grep` definition as a blocking conflict, never add grep.app credentials or copy or solicit an Exa credential, and report each research provider independently as ready, credential-required, unreachable, drifted, or failed.

## Success criteria

- **SC-001** `[buildable]`: `pi` resolves through every exhaustive harness registry, parser, CLI/TUI selector, adapter lookup, and operation dispatch path, while an unknown harness still produces the existing explicit unsupported result.
- **SC-002** `[buildable]`: From an isolated empty Pi home, dry-run reports 100% of the ordered installation/update targets, including all research packages and the grep.app MCP entry, with zero filesystem, package, provider, or ledger mutations; applied fixture tests prove each injected failure prevents ledger advancement.
- **SC-003** `[buildable]`: Pi rendering and installation tests prove `1` managed root contract and exactly `6` discoverable canonical specialist definitions, with no orchestrator child, no phase-only role, stable model/effort/tool metadata, preserved unrelated content, and deterministic repeat output.
- **SC-004** `[buildable]`: Contract tests cover all v1.5.9 public single-agent run fields, task and background outcomes, default concurrency `5`, status/result/list/cancel, continuation-disabled behavior, Pi SDK steering gate, nonterminal fan-in, and truthful security/capability diagnostics.
- **SC-005** `[buildable]`: Pi install/update tests assert the exact pinned `pi install` sources for delegation, Context7, Exa, and the MCP adapter; the attributable grep.app MCP merge; `npx skills add ... --agent pi --global --yes --copy` commands for all four external skills; owned-skill synchronization; `thoth-mem setup pi --scope global --json`; dry-run `--plan`; and fail-closed sequencing.
- **SC-006** `[buildable]`: No active package, CI, release, bundled-skill, README, or routed documentation surface retains Node.js `22.13` as the supported floor; package installation and all checks execute on Node.js `>=22.19`.
- **SC-007** `[buildable]`: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, the full `pnpm test` suite, generated integration verification, and focused Pi adapter/CLI/operation tests pass without changing existing OpenCode, Codex, or Claude outputs except for intentional four-harness and Node-floor statements.
- **SC-008** `[outcome]`: A Windows smoke run against Pi `0.84.4` and `pi-subagents-j0k3r` `1.5.9` from an isolated Pi home demonstrates package/resource discovery plus at least one fresh specialist task and one background lifecycle operation, or records the exact external credential/runtime blocker as residual risk without substituting mocked success.
- **SC-009** `[outcome]`: An isolated Pi smoke run discovers 100% of the expected research registrations—exactly `2` native Context7 tools, at least `1` native Exa tool, and exactly `1` adapter-backed grep.app `searchGitHub` tool—while status distinguishes package/configuration health from credential or remote-service availability and `0` Context7 or Exa requests are routed through `pi-mcp-adapter`.

## Assumptions

- `@earendil-works/pi-coding-agent` `0.84.4` and its documented Pi package,
  extension, skill, trust, SDK, and Windows contracts are the implementation
  baseline.
- `pi-subagents-j0k3r` `1.5.9` is the selected delegation baseline; public tool
  schemas and tagged source take precedence over stale older/batch examples and
  the contradictory `1.0.0` value in its tagged package manifest.
- The canonical `skills` CLI supports `--agent pi` and targets
  `~/.pi/agent/skills`; Pi accepts the ordinary Agent Skills `SKILL.md` format.
- `thoth-mem` will provide and own `thoth-mem setup pi`; thoth-agents may depend
  on its documented result but will not implement or mirror its assets.
- `@upstash/context7-pi` and `@feniix/pi-exa` remain Pi-native extensions;
  `pi-mcp-adapter` is required only because Pi intentionally has no generic
  native MCP client and grep.app is selected as the single adapter-backed tool.
- Global installation is the initial supported thoth-agents Pi scope.

## Dependencies

- Pi package/runtime documentation and `@earendil-works/pi-coding-agent`
  `0.84.4`: <https://pi.dev/docs/latest/packages> and
  <https://github.com/earendil-works/pi>.
- `pi-subagents-j0k3r` `1.5.9` public package and source contract:
  <https://pi.dev/packages/pi-subagents-j0k3r> and
  <https://github.com/j0k3r-dev-rgl/pi-subagents-j0k3r/releases/tag/v1.5.9>.
- `skills` CLI `1.5.23` Pi selector and paths:
  <https://github.com/vercel-labs/skills/tree/v1.5.23>.
- Context7 native Pi extension `@upstash/context7-pi` `0.1.2`:
  <https://github.com/upstash/context7/tree/master/packages/pi>.
- Exa native Pi extension `@feniix/pi-exa` `5.1.1`:
  <https://github.com/feniix/pi-extensions/tree/main/packages/pi-exa>.
- Generic Pi MCP bridge `pi-mcp-adapter` `2.32.1`, scoped here only to
  grep.app: <https://github.com/nicobailon/pi-mcp-adapter>.
- Official anonymous grep.app MCP endpoint and public-repository scope:
  <https://vercel.com/blog/grep-a-million-github-repositories-via-mcp>.
- Provider-owned `thoth-mem setup pi` with consistent complete/partial/failure
  JSON evidence.

## Out of scope

- Implementing, vendoring, or governing thoth-mem's Pi extension, hooks, MCP or
  REST transport, authentication, persistence, receipts, recovery, or project
  identity.
- Implementing a thoth-agents executor, scheduler, concurrency runtime, task or
  history database, session lifecycle shadow, remote worker plane, or security
  sandbox.
- Installing `gentle-pi`, `gentle-engram`, agentmemory assets, or any Gentle
  AI/agentmemory implementation; `pi-mcp-adapter` is installed only for the
  explicitly selected grep.app integration.
- Installing `@benvargas/pi-exa-mcp` by default; it is a documented autonomous
  fallback, not part of the managed complete state while `@feniix/pi-exa`
  remains selected.
- Project-local (`pi install -l`) thoth-agents installation in the initial Pi
  integration.
- Enabling `pi-subagents-j0k3r` continuation by default, owning its history
  database, or promising delivery merely because a live message was queued.
- Managing the Pi root session's provider, authentication, model, thinking
  level, or operator trust decisions.
