# Tasks: Create oh-my-opencode-lite Plugin

## Phase 0: Foundation

- [x] 0.1 Update `src/config/schema.ts`
  **Files:** Modify: `src/config/schema.ts`
  **Description:** Add `ThothConfigSchema` and `DelegationConfigSchema`, extend `McpNameSchema` with `thoth_mem`, and replace `fixer` with `quick`/`deep` in the agent, manual-plan, and fallback schema unions so config validation matches the new roster.
  **Verification:**
  - Run: `grep -n "ThothConfigSchema" src/config/schema.ts && grep -n "DelegationConfigSchema" src/config/schema.ts`
  - Expected: Both schema names are present in `src/config/schema.ts`.

- [x] 0.2 Update `src/config/constants.ts`
  **Files:** Modify: `src/config/constants.ts`
  **Description:** Define the seven-agent roster, remove `fixer`, add `quick`/`deep`, and set the default delegation rules, model defaults, and shared constants that later phases consume.
  **Verification:**
  - Run: `grep -n "quick" src/config/constants.ts && grep -n "deep" src/config/constants.ts`
  - Expected: `src/config/constants.ts` contains `quick` and `deep` in the default roster/constants.

- [x] 0.3 Update `src/config/agent-mcps.ts`
  **Files:** Modify: `src/config/agent-mcps.ts`
  **Description:** Make `orchestrator` default to `thoth_mem`, keep `librarian` on research MCPs, and leave the remaining agents with no default MCPs unless user config overrides them.
  **Verification:**
  - Run: `grep -n "thoth_mem" src/config/agent-mcps.ts`
  - Expected: The file contains the `thoth_mem` default MCP mapping.

- [x] 0.4 Update `src/config/loader.ts`
  **Files:** Modify: `src/config/loader.ts`
  **Description:** Deep-merge `thoth` and `delegation` sections alongside `agents`, `tmux`, and `fallback` so user and project config layering works for the new settings.
  **Verification:**
  - Run: `grep -n "delegation" src/config/loader.ts && grep -n "thoth" src/config/loader.ts`
  - Expected: The loader merges both `delegation` and `thoth` config sections.

- [x] 0.5 Update `src/config/index.ts`
  **Files:** Modify: `src/config/index.ts`
  **Description:** Re-export the new thoth/delegation config types and keep downstream imports stable for agents, MCPs, hooks, and background modules.
  **Verification:**
  - Run: `grep -n "ThothConfig" src/config/index.ts && grep -n "DelegationConfig" src/config/index.ts`
  - Expected: `src/config/index.ts` re-exports both thoth and delegation config types.

## Phase 1: Infrastructure

- [x] 1.1 Create `src/delegation/types.ts`
  **Files:** Create: `src/delegation/types.ts`
  **Description:** Add the persisted delegation header/body contracts, status union, and any task-shape helpers needed by background tools and hooks.
  **Verification:**
  - Run: `test -f src/delegation/types.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 1.2 Create `src/delegation/paths.ts`
  **Files:** Create: `src/delegation/paths.ts`
  **Description:** Resolve the effective delegation storage directory from `config.delegation.storageDir` or the XDG fallback and build `<projectId>/<rootSessionId>/<taskId>.md` paths.
  **Verification:**
  - Run: `test -f src/delegation/paths.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 1.3 Create `src/delegation/project-id.ts`
  **Files:** Create: `src/delegation/project-id.ts`
  **Description:** Derive a stable `projectId` from `git rev-parse --show-toplevel` plus the repository root commit hash and return `null` when git metadata cannot be resolved.
  **Verification:**
  - Run: `test -f src/delegation/project-id.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 1.4 Create `src/delegation/delegation-manager.ts`
  **Files:** Create: `src/delegation/delegation-manager.ts`
  **Description:** Generate human-readable task IDs, enforce per-root-session collision checks, serialize markdown frontmatter records, read persisted records back, and summarize completed delegations for prompt injection.
  **Verification:**
  - Run: `test -f src/delegation/delegation-manager.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 1.5 Create `src/delegation/index.ts`
  **Files:** Create: `src/delegation/index.ts`
  **Description:** Export the delegation manager, path helpers, project-id resolver, and shared types from a single import surface.
  **Verification:**
  - Run: `grep -n "DelegationManager" src/delegation/index.ts`
  - Expected: `src/delegation/index.ts` exports `DelegationManager`.

## Phase 2: Thoth-mem Integration

- [x] 2.1 Create `src/mcp/thoth.ts`
  **Files:** Create: `src/mcp/thoth.ts`
  **Description:** Build the local `thoth_mem` MCP definition from `config.thoth`, including command, optional data-dir wiring, environment, and timeout-compatible defaults.
  **Verification:**
  - Run: `test -f src/mcp/thoth.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 2.2 Update `src/mcp/index.ts`
  **Files:** Modify: `src/mcp/index.ts`
  **Description:** Include built-in `thoth_mem` MCP registration by default and omit it only when the MCP is explicitly disabled.
  **Verification:**
  - Run: `grep -n "thoth_mem" src/mcp/index.ts`
  - Expected: The built-in MCP registration includes `thoth_mem` logic.

- [x] 2.3 Create `src/thoth/client.ts`
  **Files:** Create: `src/thoth/client.ts`
  **Description:** Provide the hook-side stdio client wrapper that uses the same thoth command/config contract as the MCP definition and surfaces startup/timeout failures as unavailable memory operations.
  **Verification:**
  - Run: `test -f src/thoth/client.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 2.4 Create `src/thoth/index.ts`
  **Files:** Create: `src/thoth/index.ts`
  **Description:** Add the barrel export for the runtime thoth client API used by hooks and the plugin bootstrap.
  **Verification:**
  - Run: `grep -n "client" src/thoth/index.ts`
  - Expected: `src/thoth/index.ts` exports the thoth client module.

- [x] 2.5 Create `src/hooks/thoth-mem/protocol.ts`
  **Files:** Create: `src/hooks/thoth-mem/protocol.ts`
  **Description:** Centralize the injected Memory Protocol text, FIRST ACTION recovery instructions, and SDD topic-key conventions.
  **Verification:**
  - Run: `test -f src/hooks/thoth-mem/protocol.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 2.6 Create `src/hooks/thoth-mem/index.ts`
  **Files:** Create: `src/hooks/thoth-mem/index.ts`
  **Description:** Track root sessions, capture user prompts from `message.updated`, inject memory/delegation recovery content in `experimental.chat.messages.transform`, and passive-capture learnings from recognized task output.
  **Verification:**
  - Run: `test -f src/hooks/thoth-mem/index.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 2.7 Update `src/hooks/index.ts`
  **Files:** Modify: `src/hooks/index.ts`
  **Description:** Export the thoth-mem hook alongside the existing hook factories.
  **Verification:**
  - Run: `grep -n "thoth-mem" src/hooks/index.ts`
  - Expected: `src/hooks/index.ts` exports the thoth-mem hook.

## Phase 3: Agents

- [x] 3.1 Create `src/agents/prompt-utils.ts`
  **Files:** Create: `src/agents/prompt-utils.ts`
  **Description:** Share prompt replacement/append composition logic across the seven agent definition files.
  **Verification:**
  - Run: `test -f src/agents/prompt-utils.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 3.2 Rewrite `src/agents/orchestrator.ts`
  **Files:** Modify: `src/agents/orchestrator.ts`
  **Description:** Make the orchestrator delegate-first for planning, memory ownership, and no-inline repository work when read/write delegation is required.
  **Verification:**
  - Run: `grep -n "delegate-first" src/agents/orchestrator.ts`
  - Expected: The orchestrator prompt includes delegate-first guidance.

- [x] 3.3 Rewrite `src/agents/explorer.ts`
  **Files:** Modify: `src/agents/explorer.ts`
  **Description:** Make explorer background-only for local read/search investigation with no mutation or memory writes.
  **Verification:**
  - Run: `grep -n "background-only" src/agents/explorer.ts`
  - Expected: The explorer prompt states it is background-only.

- [x] 3.4 Rewrite `src/agents/librarian.ts`
  **Files:** Modify: `src/agents/librarian.ts`
  **Description:** Make librarian background-only for research work with local read/search plus external MCP usage and no mutation or memory writes.
  **Verification:**
  - Run: `grep -n "background-only" src/agents/librarian.ts`
  - Expected: The librarian prompt states it is background-only.

- [x] 3.5 Rewrite `src/agents/oracle.ts`
  **Files:** Modify: `src/agents/oracle.ts`
  **Description:** Make oracle synchronous and read-only for review, diagnosis, and architecture guidance with no workspace mutation or background delegation.
  **Verification:**
  - Run: `grep -n "read-only" src/agents/oracle.ts`
  - Expected: The oracle prompt includes read-only guidance.

- [x] 3.6 Rewrite `src/agents/designer.ts`
  **Files:** Modify: `src/agents/designer.ts`
  **Description:** Make designer synchronous and write-capable for UX/UI implementation while keeping background delegation and external MCPs disabled by default.
  **Verification:**
  - Run: `grep -n "write-capable" src/agents/designer.ts`
  - Expected: The designer prompt includes write-capable guidance.

- [x] 3.7 Create `src/agents/quick.ts`
  **Files:** Create: `src/agents/quick.ts`
  **Description:** Add narrow, write-capable synchronous implementation work that favors bounded changes and fast completion.
  **Verification:**
  - Run: `test -f src/agents/quick.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 3.8 Create `src/agents/deep.ts`
  **Files:** Create: `src/agents/deep.ts`
  **Description:** Add thorough, write-capable synchronous implementation with broader context gathering and explicit verification expectations.
  **Verification:**
  - Run: `test -f src/agents/deep.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 3.9 Update `src/agents/index.ts`
  **Files:** Modify: `src/agents/index.ts`
  **Description:** Build the seven-agent roster, remove all `fixer` references, wire `quick`/`deep`, apply the new tool/MCP permission defaults, and preserve preset/custom prompt loading.
  **Verification:**
  - Run: `grep -n "quick" src/agents/index.ts && grep -n "deep" src/agents/index.ts`
  - Expected: `src/agents/index.ts` wires both `quick` and `deep`.

- [x] 3.10 Delete `src/agents/fixer.ts`
  **Files:** Delete: `src/agents/fixer.ts`
  **Description:** Remove `src/agents/fixer.ts` after the roster and all imports no longer reference it.
  **Verification:**
  - Run: `test ! -f src/agents/fixer.ts && echo OK`
  - Expected: `OK` is printed.

## Phase 4: Background Integration

- [x] 4.1 Update `src/background/background-manager.ts`
  **Files:** Modify: `src/background/background-manager.ts`
  **Description:** Update launch/start logic to derive and store `rootSessionId`, issue human-readable unique task IDs, and reject agents whose execution mode is incompatible with background delegation.
  **Verification:**
  - Run: `grep -n "rootSessionId" src/background/background-manager.ts`
  - Expected: The background manager persists `rootSessionId` handling.

- [x] 4.2 Update `src/background/background-manager.ts`
  **Files:** Modify: `src/background/background-manager.ts`
  **Description:** Update completion/retrieval logic to persist completed tasks through `DelegationManager`, keep live in-memory results when persistence fails, and expose the lookup/summarization helpers needed by `background_output` and thoth recovery.
  **Verification:**
  - Run: `grep -n "DelegationManager" src/background/background-manager.ts`
  - Expected: The background manager references `DelegationManager` persistence.

- [x] 4.3 Update `src/background/index.ts`
  **Files:** Modify: `src/background/index.ts`
  **Description:** Export the extended background task types and any new manager interfaces required by the plugin root and tools.
  **Verification:**
  - Run: `grep -n "rootSessionId" src/background/index.ts`
  - Expected: `src/background/index.ts` exports the extended background task shape.

- [x] 4.4 Update `src/tools/background.ts`
  **Files:** Modify: `src/tools/background.ts`
  **Description:** Make `background_task` accept only background-capable agents, let `background_output` fall back to persisted delegation records using the caller's root session, and report unavailable tasks as a clean miss instead of a false success.
  **Verification:**
  - Run: `grep -n "DelegationManager" src/tools/background.ts`
  - Expected: `src/tools/background.ts` uses delegation persistence for task lookup.

- [x] 4.5 Update `src/index.ts`
  **Files:** Modify: `src/index.ts`
  **Description:** Instantiate `DelegationManager` and the thoth client, pass them into `BackgroundTaskManager` and `createBackgroundTools(...)`, register `thoth_mem`, and compose hook fan-out in the documented order.
  **Verification:**
  - Run: `grep -n "thoth_mem" src/index.ts && grep -n "DelegationManager" src/index.ts`
  - Expected: `src/index.ts` wires both `thoth_mem` and `DelegationManager`.

## Phase 5: SDD Skills

- [x] 5.1 Create `src/skills/_shared/openspec-convention.md`
  **Files:** Create: `src/skills/_shared/openspec-convention.md`
  **Description:** Add the canonical OpenSpec change/artifact structure used by every SDD workflow.
  **Verification:**
  - Run: `test -f src/skills/_shared/openspec-convention.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.2 Create `src/skills/_shared/persistence-contract.md`
  **Files:** Create: `src/skills/_shared/persistence-contract.md`
  **Description:** Add the hybrid openspec + thoth-mem persistence rules, including when artifacts must be written to disk versus memory.
  **Verification:**
  - Run: `test -f src/skills/_shared/persistence-contract.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.3 Create `src/skills/_shared/thoth-mem-convention.md`
  **Files:** Create: `src/skills/_shared/thoth-mem-convention.md`
  **Description:** Add the `sdd/<change-name>/<artifact>` topic-key rules and the required `thoth_mem_*` tool naming guidance.
  **Verification:**
  - Run: `test -f src/skills/_shared/thoth-mem-convention.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.4 Create `src/skills/sdd-propose/SKILL.md`
  **Files:** Create: `src/skills/sdd-propose/SKILL.md`
  **Description:** Make proposal generation target `openspec/changes/<change-name>/proposal.md` and persist proposal state via thoth-mem instead of engram.
  **Verification:**
  - Run: `test -f src/skills/sdd-propose/SKILL.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.5 Create `src/skills/sdd-spec/SKILL.md`
  **Files:** Create: `src/skills/sdd-spec/SKILL.md`
  **Description:** Make specification work emit domain specs under `openspec/changes/<change-name>/specs/` and follow the shared persistence conventions.
  **Verification:**
  - Run: `test -f src/skills/sdd-spec/SKILL.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.6 Create `src/skills/sdd-design/SKILL.md`
  **Files:** Create: `src/skills/sdd-design/SKILL.md`
  **Description:** Make design work target `openspec/changes/<change-name>/design.md`, reference the approved specs, and persist the design artifact via thoth-mem.
  **Verification:**
  - Run: `test -f src/skills/sdd-design/SKILL.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.7 Create `src/skills/sdd-tasks/SKILL.md`
  **Files:** Create: `src/skills/sdd-tasks/SKILL.md`
  **Description:** Make task planning target `openspec/changes/<change-name>/tasks.md`, read full proposal/spec/design context, and write phased, dependency-ordered checklists.
  **Verification:**
  - Run: `test -f src/skills/sdd-tasks/SKILL.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.8 Create `src/skills/sdd-apply/SKILL.md`
  **Files:** Create: `src/skills/sdd-apply/SKILL.md`
  **Description:** Make implementation execution work from `tasks.md`, update checkboxes in order, and preserve progress through thoth-mem.
  **Verification:**
  - Run: `test -f src/skills/sdd-apply/SKILL.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.9 Create `src/skills/sdd-verify/SKILL.md`
  **Files:** Create: `src/skills/sdd-verify/SKILL.md`
  **Description:** Make verification map Given/When/Then scenarios to concrete test/build evidence instead of generic completion claims.
  **Verification:**
  - Run: `test -f src/skills/sdd-verify/SKILL.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.10 Create `src/skills/sdd-archive/SKILL.md`
  **Files:** Create: `src/skills/sdd-archive/SKILL.md`
  **Description:** Make closeout merge finalized deltas into main specs, record lessons learned, and archive the change with thoth-mem persistence.
  **Verification:**
  - Run: `test -f src/skills/sdd-archive/SKILL.md && echo OK`
  - Expected: `OK` is printed.

- [x] 5.11 Update `src/cli/custom-skills.ts`
  **Files:** Modify: `src/cli/custom-skills.ts`
  **Description:** Register the bundled SDD skill directories and copy `src/skills/_shared/` into the installed skill tree exactly once.
  **Verification:**
  - Run: `grep -n "_shared" src/cli/custom-skills.ts`
  - Expected: `src/cli/custom-skills.ts` references the shared skill asset copy logic.

- [x] 5.12 Update `src/cli/skills.ts`
  **Files:** Modify: `src/cli/skills.ts`
  **Description:** Make bundled SDD skills auto-allowed for `orchestrator` by default while non-orchestrator agents remain denied unless the user explicitly overrides skill permissions.
  **Verification:**
  - Run: `grep -n "orchestrator" src/cli/skills.ts`
  - Expected: The default skill-permission logic explicitly references `orchestrator`.

## Phase 6: AGENTS.md

- [x] 6.1 Rewrite `AGENTS.md`
  **Files:** Modify: `AGENTS.md`
  **Description:** Document the SDD pipeline, root-session memory ownership, delegation rules, background vs synchronous agent modes, token economics, and the required verification/review workflow for omolite.
  **Verification:**
  - Run: `grep -n "root-session" AGENTS.md && grep -n "verification" AGENTS.md`
  - Expected: `AGENTS.md` documents root-session ownership and verification workflow guidance.

## Phase 7: CLI & Package

- [x] 7.1 Update `src/cli/providers.ts`
  **Files:** Modify: `src/cli/providers.ts`
  **Description:** Make generated presets use `quick` and `deep` instead of `fixer`, keep the seven-agent roster in sync with defaults, and emit the correct MCP defaults for orchestrator/librarian.
  **Verification:**
  - Run: `grep -n "quick" src/cli/providers.ts && grep -n "deep" src/cli/providers.ts`
  - Expected: The generated provider presets reference both `quick` and `deep`.

- [x] 7.2 Update `src/cli/index.ts`
  **Files:** Modify: `src/cli/index.ts`
  **Description:** Update help text so the install command, usage examples, and branding all match the omolite plugin workflow.
  **Verification:**
  - Run: `grep -n "omolite" src/cli/index.ts`
  - Expected: The CLI help text includes omolite branding.

- [x] 7.3 Update `src/cli/install.ts`
  **Files:** Modify: `src/cli/install.ts`
  **Description:** Reflect the new omolite install/update copy, mention the bundled SDD skills/custom skills behavior, and keep the generated configuration summary aligned with the new feature set.
  **Verification:**
  - Run: `grep -n "SDD skills" src/cli/install.ts`
  - Expected: The install copy mentions bundled SDD skills.

- [x] 7.4 Update `package.json`
  **Files:** Modify: `package.json`
  **Description:** Add `unique-names-generator`, keep the published skill assets/schema files included, and align package metadata with the omolite positioning.
  **Verification:**
  - Run: `grep -n '"unique-names-generator"' package.json`
  - Expected: `package.json` includes `unique-names-generator`.

- [x] 7.5 Refresh `bun.lock`
  **Files:** Modify: `bun.lock`
  **Description:** Refresh the lockfile after the package dependency changes so installs are reproducible.
  **Verification:**
  - Run: `grep -n "unique-names-generator" bun.lock`
  - Expected: `bun.lock` contains the resolved `unique-names-generator` entry.

- [x] 7.6 Update `README.md`
  **Files:** Modify: `README.md`
  **Description:** Describe the seven-agent roster, thoth-mem persistence, delegation storage behavior, SDD skills, and the current install flow.
  **Verification:**
  - Run: `grep -n "thoth-mem" README.md && grep -n "seven-agent" README.md`
  - Expected: `README.md` documents thoth-mem and the seven-agent roster.

- [x] 7.7 Regenerate `oh-my-opencode-lite.schema.json`
  **Files:** Modify: `oh-my-opencode-lite.schema.json`
  **Description:** Regenerate the schema from the updated Zod schema so editor validation reflects the thoth/delegation settings and the new agent roster.
  **Verification:**
  - Run: `grep -n '"thoth"' oh-my-opencode-lite.schema.json && grep -n '"delegation"' oh-my-opencode-lite.schema.json`
  - Expected: The generated schema includes both `thoth` and `delegation` sections.

## Phase 8: Verification

- [x] 8.1 Update `src/config/loader.test.ts`
  **Files:** Modify: `src/config/loader.test.ts`
  **Description:** Cover Config spec scenarios `Valid thoth configuration is accepted`, `Invalid thoth configuration is rejected`, `Valid delegation configuration is accepted`, `Invalid delegation configuration is rejected`, and `thoth-mem disable flag suppresses memory MCP only`.
  **Verification:**
  - Run: `grep -n "Valid thoth configuration is accepted" src/config/loader.test.ts`
  - Expected: The test file contains the new thoth/delegation scenario coverage.

- [x] 8.2 Update `src/mcp/index.test.ts`
  **Files:** Modify: `src/mcp/index.test.ts`
  **Description:** Cover Memory spec scenarios `Default thoth-mem MCP is registered` and `Disabled thoth-mem MCP is omitted`.
  **Verification:**
  - Run: `grep -n "Default thoth-mem MCP is registered" src/mcp/index.test.ts`
  - Expected: The memory MCP registration scenario is present in the test file.

- [x] 8.3 Update `src/agents/index.test.ts`
  **Files:** Modify: `src/agents/index.test.ts`
  **Description:** Cover Agents spec scenarios `Default agent roster is available`, `Legacy fixer requests are rejected`, `Explorer and librarian are background-only read agents`, `Quick, deep, and designer are synchronous write-capable agents`, and `Oracle is a synchronous read-only agent`.
  **Verification:**
  - Run: `grep -n "Legacy fixer requests are rejected" src/agents/index.test.ts`
  - Expected: The agent roster test file contains the legacy fixer rejection scenario.

- [x] 8.4 Create `src/delegation/delegation-manager.test.ts`
  **Files:** Create: `src/delegation/delegation-manager.test.ts`
  **Description:** Cover Delegation spec scenarios `Completed result is written to delegation storage`, `Same repository reuses the same project directory`, `Different repositories are isolated`, `Stable project identity cannot be derived`, `Persisted record contains required metadata and body`, and `Large multi-paragraph output remains readable`.
  **Verification:**
  - Run: `test -f src/delegation/delegation-manager.test.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 8.5 Create `src/thoth/client.test.ts`
  **Files:** Create: `src/thoth/client.test.ts`
  **Description:** Cover Memory spec scenarios `Custom thoth-mem invocation settings are applied`, `Omitted optional settings fall back to defaults`, and `Unavailable thoth-mem command is surfaced as unavailable`.
  **Verification:**
  - Run: `test -f src/thoth/client.test.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 8.6 Create `src/hooks/thoth-mem/index.test.ts`
  **Files:** Create: `src/hooks/thoth-mem/index.test.ts`
  **Description:** Cover Memory spec scenarios `Root session receives Memory Protocol guidance`, `Disabled thoth-mem omits Memory Protocol guidance`, `Compaction injects retrieved memory context`, `FIRST ACTION survives even when no context is found`, `Recognized learnings are captured`, `Ordinary task output is ignored for passive capture`, `Root session starts memory tracking`, `Sub-agent session is filtered from root tracking`, `User prompt is captured from message update`, and `Non-user updates are ignored for prompt capture`.
  **Verification:**
  - Run: `test -f src/hooks/thoth-mem/index.test.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 8.7 Update `src/background/background-manager.test.ts`
  **Files:** Modify: `src/background/background-manager.test.ts`
  **Description:** Cover Delegation spec scenarios `Human-readable task ID is issued on launch`, `Colliding task ID is not reused`, `Persistence failure does not erase the live result`, `Compaction includes completed delegation context`, and `No delegation context is injected when none exists`.
  **Verification:**
  - Run: `grep -n "Human-readable task ID is issued on launch" src/background/background-manager.test.ts`
  - Expected: The background manager test file contains the task ID issuance scenario.

- [x] 8.8 Create `src/tools/background.test.ts`
  **Files:** Create: `src/tools/background.test.ts`
  **Description:** Cover Agents/Delegation spec scenarios `Explorer runs asynchronously with read-only scope`, `Librarian runs asynchronously with read-only scope`, `Synchronous execution is blocked for explorer and librarian`, `Background execution is blocked for synchronous write agents`, `Background execution is blocked for oracle`, `Disk-backed completed result is returned after memory loss`, and `Missing task is reported as unavailable`.
  **Verification:**
  - Run: `test -f src/tools/background.test.ts && echo OK`
  - Expected: `OK` is printed.

- [x] 8.9 Update `src/hooks/delegate-task-retry/index.test.ts`
  **Files:** Modify: `src/hooks/delegate-task-retry/index.test.ts`
  **Description:** Update background allowlist guidance so it reflects the post-`fixer` agent set and still appends retry instructions for invalid delegation attempts.
  **Verification:**
  - Run: `grep -n "quick" src/hooks/delegate-task-retry/index.test.ts && grep -n "deep" src/hooks/delegate-task-retry/index.test.ts`
  - Expected: The retry guidance test references the post-`fixer` `quick`/`deep` agent set.

- [x] 8.10 Update `src/cli/providers.test.ts` and `src/cli/skills.test.ts`
  **Files:** Modify: `src/cli/providers.test.ts`, `src/cli/skills.test.ts`
  **Description:** Verify generated install config and default skill permissions reference `quick`/`deep`, omit `fixer`, and keep SDD skills orchestrator-only by default.
  **Verification:**
  - Run: `grep -n "quick" src/cli/providers.test.ts && grep -n "orchestrator" src/cli/skills.test.ts`
  - Expected: The CLI tests cover `quick`/`deep` config generation and orchestrator-only SDD skill defaults.

- [x] 8.11 Run `bun run typecheck`
  **Files:** Verify: workspace
  **Description:** Run `bun run typecheck` to verify the new agent roster, config types, delegation interfaces, and thoth hook/client wiring compile cleanly.
  **Verification:**
  - Run: `bun run typecheck`
  - Expected: The command exits successfully with no TypeScript errors.

- [x] 8.12 Run `bun run check:ci`
  **Files:** Verify: workspace
  **Description:** Run `bun run check:ci` to verify formatting, linting, and generated assets (including the schema and skill files) are consistent.
  **Verification:**
  - Run: `bun run check:ci`
  - Expected: The command exits successfully with no lint, format, or generated-file errors.

- [x] 8.13 Run `bun test`
  **Files:** Verify: workspace
  **Description:** Run `bun test` to verify the updated unit tests and new Given/When/Then coverage pass without regressions.
  **Verification:**
  - Run: `bun test`
  - Expected: All test suites pass.

- [x] 8.14 Run `bun run build`
  **Files:** Verify: workspace
  **Description:** Run `bun run build` to verify the plugin bundle, CLI bundle, declaration output, and schema generation succeed together.
  **Verification:**
  - Run: `bun run build`
  - Expected: The build completes successfully and emits the bundled outputs.
