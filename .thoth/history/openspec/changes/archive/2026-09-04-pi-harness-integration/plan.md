# Implementation Plan: Pi Harness Integration

## Technical context

thoth-agents currently has exhaustive OpenCode, Codex, and Claude harness unions,
adapters, installation branches, operation adapters, ledger records, and TUI/CLI
selectors. Pi is installed locally as `@earendil-works/pi-coding-agent` `0.84.4`
and raises the common runtime floor from Node.js `>=22.13` to `>=22.19`.

Pi supplies native package/resource discovery but intentionally leaves MCP and
delegation to extensions. The integration therefore composes four pinned Pi
packages: `pi-subagents-j0k3r@1.5.9`, `@upstash/context7-pi@0.1.2`,
`@feniix/pi-exa@5.1.1`, and `pi-mcp-adapter@2.32.1`. Only grep.app uses the MCP
adapter. thoth-mem remains external and will own `thoth-mem setup pi`.

The implementation must safely update two shared user files—Pi's
`APPEND_SYSTEM.md` and the global MCP JSON—plus six owned agent definitions and
five owned skills. It must preserve user content, discover shadowing/conflicts
before mutation, make dry-run exact, and keep the CLI ledger unchanged after any
required failure. Native package-manager mutations cannot be transactionally
rolled back, so partial state must be diagnosed rather than hidden.

## Constitution Check (pre-design)

- **Adaptive-root orchestration**: PASS — Pi keeps the ambient root and delegates bounded work through the selected native subagent package; no orchestrator child or thoth-owned scheduler is introduced.
- **Explicit role boundaries**: PASS — the design materializes only the six canonical specialist contracts, uses exact role selection, one mutable owner, terminal fan-in evidence, and fresh tasks at work boundaries.
- **Proportional Spec Kit-compatible SDD**: PASS — this Full route has validated specification evidence, explicit research, planned requirement mapping, ready/task gates, independent plan review choice, and mandatory final Oracle verification.
- **Truthful multi-harness contracts**: PASS — Pi is modeled as an exhaustive fourth adapter with its native packages, conditional capabilities, trust boundary, MCP gap, and unsupported operations stated explicitly.
- **Independent provider ownership**: PASS — thoth-mem setup and evidence remain provider-owned; the CLI invokes the public setup contract and does not copy hooks, persistence, receipts, or memory lifecycle.
- **Evidence-led completion**: PASS — the plan requires isolated dry-run/apply fixtures, focused contract tests, full repository checks, generated-output verification, and a real Windows Pi smoke test with residual blockers recorded.

## Design

### Adapter and rendered contracts

- Extend `HarnessId` and every exhaustive registry/selector with `pi`, preserving
  OpenCode as the default and keeping unsupported identifiers fail-closed.
- Add `src/harness/adapters/pi.ts` with an explicit capability matrix and
  diagnostics for conditional steering/continuation, adapter-backed MCP,
  instruction-only memory governance, absence of an OS sandbox, and root-model
  ownership.
- Add `src/harness/writers/pi-agent.ts` to render one managed root block and six
  agent Markdown documents from the canonical prompts and Pi prompt dialect.
  Specialist files use thoth-owned filenames under `agents/`, canonical
  frontmatter names, Pi model/tool metadata, and ownership markers. The root is
  never rendered as a child.
- Extend `src/agents/prompt-dialects.ts` so Pi instructions use the public
  `subagent_*` tools, distinguish fresh work from same-assignment collection,
  and keep nonterminal/queued results behind the fan-in barrier.

### Managed paths, preflight, and installation

- Add `src/cli/pi-paths.ts` for deterministic global paths. The supported root
  is `~/.pi/agent`; a non-default `PI_CODING_AGENT_DIR` is diagnosed before
  mutation because the required external-skill CLI would target a different
  root. The MCP target honors `XDG_CONFIG_HOME`, otherwise
  `~/.config/mcp/mcp.json`.
- Add `src/cli/pi-install.ts` with pure build/format/apply seams and injected
  command/filesystem boundaries. `PI_PACKAGE_SPECS` stores the four exact npm
  sources and expected roles. Preflight validates Node, the official Pi package
  and compatible version, all shared-file ownership, both Pi agent-definition
  directories, project shadowing, skill destination compatibility, and the
  existing MCP entry before any package command runs.
- Install packages in this exact order: delegation, Context7, Exa, MCP adapter.
  Each command is `pi install npm:<package>@<pin>` and is verified through Pi's
  public package listing plus the planned source; the contradictory subagent
  manifest version is never the sole proof.
- Merge only `mcpServers.grep` into global MCP JSON with URL
  `https://mcp.grep.app`, `protocolVersion: "legacy"`, and `lifecycle: "lazy"`.
  Omit `directTools`. Preserve all unrelated keys and imports, accept the same
  entry idempotently, and block a different unowned `grep` entry. Write through
  a sibling temporary file, retain a bounded backup when replacing an existing
  file, and never add credentials.
- Replace only a marked block in `APPEND_SYSTEM.md`. Create/update the six owned
  agent files atomically; block any unowned definition whose frontmatter claims
  a canonical specialist name in either global discovery folder. Report
  project-local shadowing without modifying the project.
- Synchronize the five thoth-owned skills, install the four external skills with
  `npx skills add ... --agent pi --global --yes --copy`, invoke provider-owned
  `thoth-mem setup pi --scope global --json`, then record the Pi ledger. The
  ledger remains schema version 1 with a new allowed harness key.
- Dry-run builds and prints the identical ordered plan but never launches Pi,
  npx, or thoth-mem and never creates files, backups, or ledger state.

### Operations and state model

- Add `src/cli/operations/pi.ts` and register it across CLI and TUI operation
  dispatch. `Install` builds/applies the same complete pipeline as the CLI
  installer. `Status` reads Node/Pi identity, pinned package sources, owned
  root/agent/skill hashes, MCP configuration/precedence, provider evidence, and
  the authoritative ledger independently.
- Research providers have separate managed and runtime state. Installed native
  packages plus matching owned configuration are managed-ready; missing
  `EXA_API_KEY` is `credential-required`, not install failure; live network
  probes may report unreachable/schema drift but cannot rewrite the ledger.
  grep.app remains proxy-only through the adapter `mcp` tool.
- Applied `Install` and `Update` run the complete install-equivalent flow.
  `Sync` rewrites
  only attributable root, agent, owned-skill, and grep configuration surfaces
  after the same conflict checks; it does not silently mutate packages,
  external skills, provider state, or the ledger.
- Pi `Model` reads/writes model and effort only in owned specialist frontmatter.
  The ambient root model, provider credentials, trust decisions, continuation
  enablement, and unavailable actions remain Pi-owned and return explicit
  unsupported/conditional diagnostics.

### Runtime floor and public guidance

- Change active package metadata, CI and release workflows, canonical skill
  compatibility declarations, generated plugin skill copies, README badge/text,
  AGENTS guidance, and routed testing/installation/harness/research docs to
  Node.js `>=22.19`; archived change records remain immutable.
- Document package pins and ownership, global-only scope, exact dry-run/update
  semantics, custom-directory limitation, credential/network states, project
  trust/shadowing, extension permissions, recovery from partial installation,
  the Ben Vargas Exa fallback, and provider-owned memory setup.

### Verification strategy

- Develop behavioral changes test-first with injected command executors and
  isolated temporary homes. Unit tests cover renderer determinism, tool/model
  frontmatter, managed-block replacement, JSON merge/backup/conflicts,
  path/precedence resolution, package verification, custom-directory refusal,
  partial failures, dry-run non-mutation, provider evidence, ledger gating, and
  the top-level install orchestrator, and all CLI/TUI dispatch paths including
  Pi Install.
- Regression tests assert OpenCode, Codex, and Claude rendered outputs and
  operation semantics remain unchanged apart from intentional four-harness and
  Node-floor text, and update the known exhaustive provider-boundary and bundled
  Node-runtime assertions to the four-harness/22.19 contract.
- Run focused Pi and ledger tests first, then `pnpm run check:ci`,
  `pnpm run typecheck`, `pnpm run build`, `pnpm test`, and the existing generated
  integration verification. Use a temporary `PI_CODING_AGENT_DIR`/home for the
  Windows Pi smoke so the user's actual Pi installation is not mutated.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add `pi` to exhaustive harness, CLI, operation, and TUI unions while retaining OpenCode default/fail-closed resolution | `src/harness/types.ts`, `src/harness/registry.ts`, `src/cli/types.ts`, `src/cli/parser.ts`, `src/cli/operations/index.ts`, `src/cli/tui/App.tsx` | Registry/parser/operation/TUI exhaustive tests and unknown-harness cases |
| FR-002 | Derive ambient root plus exactly six Pi specialist definitions from canonical role contracts | `src/harness/adapters/pi.ts`, `src/harness/writers/pi-agent.ts`, `src/agents/index.ts` | Adapter/writer golden assertions: one root block, six child definitions, no orchestrator child |
| FR-003 | Render marked root block, owned agent files, and owned skills with conflict-safe idempotence | `src/harness/writers/pi-agent.ts`, `src/cli/pi-install.ts`, `src/cli/owned-skills.ts` | Repeat-render/apply fixtures, ownership collision and unrelated-content tests |
| FR-004 | Pin and invoke upstream subagent package without copying or reimplementing runtime state | `src/cli/pi-install.ts`, `src/harness/adapters/pi.ts` | Exact command/source verification and absence of thoth-owned executor/task store |
| FR-005 | Translate native task lifecycle and enforce fresh-boundary semantics in Pi root prompt | `src/agents/prompt-dialects.ts`, `src/harness/adapters/pi.ts` | Prompt contract tests for run/status/result/list/message/cancel/conditional continue |
| FR-006 | Require exact public single-agent `agent` selector and reject batch/implicit alternatives | `src/agents/prompt-dialects.ts`, `src/harness/writers/pi-agent.ts` | Prompt/render tests assert canonical names and prohibit deprecated batch examples |
| FR-007 | Publish evidenced supported, conditional, degraded, and unsupported Pi capabilities | `src/harness/adapters/pi.ts`, `src/cli/operations/pi.ts` | Capability matrix and diagnostic-state tests, including research providers |
| FR-008 | Apply child tool allowlists while documenting extension/system-permission boundary | `src/harness/writers/pi-agent.ts`, `src/agents/prompt-dialects.ts`, `docs/agent/agents-and-delegation.md` | Frontmatter and generated-guidance assertions; security diagnostic snapshot |
| FR-009 | Build one complete ordered fail-closed Pi install/apply pipeline | `src/cli/pi-install.ts`, `src/cli/install.ts` | Ordered-plan table tests, injected failure at every step, dry-run zero-mutation test |
| FR-010 | Extend provider setup command/evidence parsing with selector `pi` | `src/cli/types.ts`, `src/cli/thoth-mem-install.ts`, `src/cli/install-completion.ts` | Exact command/`--plan` and contradictory-evidence tests |
| FR-011 | Route applied Pi Update through the same complete pipeline as install | `src/cli/operations/pi.ts`, `src/cli/install.ts` | Install/update plan equivalence test and ledger-after-success assertion |
| FR-012 | Add Pi to the independent schema-v1 install ledger | `src/cli/install-ledger.ts`, `src/cli/install-completion.ts` | Three existing records preserved; Pi record added only on full completion |
| FR-013 | Keep ledger authoritative while reporting package/config/surface drift separately | `src/cli/operations/pi.ts`, `src/cli/operations/types.ts` | Status fixtures for missing, healthy, stale, shadowed, partial, and invalid ledger states |
| FR-014 | Expose native Pi Install/Status/List/Update/Sync/Model behavior without cross-harness fallthrough | `src/cli/operations/pi.ts`, `src/cli/operations/index.ts`, `src/cli/commands.ts`, `src/cli/tui/operations.ts`, `src/cli/tui/model-catalog.ts` | CLI/TUI install/operation dispatch and supported/disabled-action tests |
| FR-015 | Reuse the same four external-skill definitions for Pi | `src/cli/skills.ts`, `src/cli/install.ts` | Required-skill matrix test includes Pi and retains existing harness commands |
| FR-016 | Use canonical skills CLI Pi selector/global copied materialization and block path mismatch | `src/cli/skills.ts`, `src/cli/pi-paths.ts`, `src/cli/pi-install.ts` | Exact argv tests and `PI_CODING_AGENT_DIR` mismatch fixture |
| FR-017 | Synchronize five owned skills into native global discovery independently of project init | `src/cli/owned-skills.ts`, `src/harness/core/owned-skills.ts`, `src/cli/pi-install.ts` | Exact five-skill fixture, repeat sync, missing source, and no-network runtime tests |
| FR-018 | Raise all active runtime declarations from Node 22.13 to 22.19 | `package.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `skills/*/SKILL.md`, `plugin/skills/*/SKILL.md`, `README.md`, `AGENTS.md`, `docs/agent/testing.md`, `docs/installation.md`, `docs/claude-code-install.md` | `src/plugin-node-runtime.test.ts` and repository search exclude active 22.13 declarations; CI/build/test execute on 22.19+ |
| FR-019 | Publish routed operator guidance for Pi setup, ownership, limitations, and recovery | `README.md`, `docs/installation.md`, `docs/skills-and-mcps.md`, `docs/agent/index.md`, `docs/agent/harness-packaging.md`, `docs/agent/cli-installation.md`, `docs/agent/runtime-integrations.md` | Link/path checks, CLI help snapshots, documentation review against status text |
| FR-020 | Pin two native research extensions and use the MCP adapter only for the exact global grep.app entry | `src/cli/pi-install.ts`, `src/cli/operations/pi.ts`, `docs/skills-and-mcps.md` | Exact four-package commands, JSON merge/conflict/precedence tests, provider state tests, isolated tool-discovery smoke |

## Optional support artifacts

- `research.md`: required because package ownership, version contradictions,
  MCP transport/configuration, and competing Exa implementations materially
  affect the safe implementation contract.
- `data-model.md`: not needed; the bounded state types live beside
  `PiSetupPlan`, `ManagedTarget`, and operation evidence and do not introduce a
  persistent domain model beyond the existing ledger.
- `contracts/`: not needed; upstream Pi/package/tool contracts are pinned and
  summarized in `research.md`, while public thoth-agents behavior remains in
  `spec.md` and TypeScript interfaces.
- `quickstart.md`: not needed; user-facing install, status, update, credential,
  and recovery procedures belong in the routed installation documentation.

## Risks and migrations

- **Global Node floor is a breaking environment migration**: update every active
  declaration and CI/release runtime together; rollback is a single coordinated
  revert to `>=22.13` only if Pi integration is also removed. Archived evidence
  is never rewritten.
- **Pi packages execute trusted code with user permissions**: pin exact sources,
  show them in dry-run/status, disclose credential/network access, and rely on
  explicit install intent rather than claiming sandboxing.
- **Package/source version evidence can disagree**: use requested source, Pi's
  package listing, owned ledger, and managed-surface hashes together; never
  advance completion from one manifest field.
- **Shared files can contain user state**: fully preflight markers, canonical
  role names, JSON structure, precedence, and conflicts; write atomically with
  backups and never delete or normalize unrelated content.
- **Project resources can shadow global resources**: status reports shadowing
  and manual actions but does not edit project files during global install.
- **Native package mutations are not transactionally reversible**: any later
  failure leaves visible partial package state and an unchanged ledger; safe
  recovery is to resolve the reported blocker and rerun the idempotent complete
  flow, not to remove unknown user packages.
- **External services and credentials are volatile**: absence of an Exa key or
  temporary provider outage degrades runtime availability without invalidating
  correctly installed managed state; schema/source drift is explicit.
- **Operation-surface breadth risks regressions**: use a dedicated Pi adapter and
  exhaustive unions, preserve the shared plugin generator's Codex/Claude output,
  and run all existing harness/CLI/TUI tests.

## Constitution Check (post-design)

- **Adaptive-root orchestration**: PASS — the completed design binds delegation to `pi-subagents-j0k3r`, preserves the ambient root, and gives package-owned lifecycle tools authority without adding a parallel executor.
- **Explicit role boundaries**: PASS — exact canonical selectors, conflict-scanned owned definitions, role tool allowlists, fresh-task boundaries, and terminal evidence are mapped to concrete render and test seams.
- **Proportional Spec Kit-compatible SDD**: PASS — all twenty requirements map to implementation and verification surfaces; research is retained only where upstream contracts materially shaped the plan.
- **Truthful multi-harness contracts**: PASS — the dedicated Pi adapter distinguishes native, adapter-backed, conditional, provider-dependent, instruction-only, and unsupported capabilities and cannot fall through to another harness.
- **Independent provider ownership**: PASS — the only memory integration is the public `thoth-mem setup pi` command and validated provider evidence after thoth-owned setup; no provider assets or state are mirrored.
- **Evidence-led completion**: PASS — focused TDD, failure injection, complete repository checks, deterministic generated-output checks, and isolated real-Pi smoke evidence are explicit completion gates.
