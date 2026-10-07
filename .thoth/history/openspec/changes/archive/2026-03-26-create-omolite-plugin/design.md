# Design: Create oh-my-opencode-lite Plugin

## Context

`omolite` already has the core plugin bootstrap in place: `src/index.ts` wires
agents, tools, hooks, and MCPs; `src/background/background-manager.ts` owns
volatile background task state; `src/mcp/*.ts` exposes MCP definitions as
simple config objects; `src/config/*.ts` provides Zod-backed config loading; and
`src/cli/custom-skills.ts` installs bundled skills by copying directories from
`src/skills/`.

The repository still reflects the older six-agent model (`fixer`), keeps
delegation results only in memory, has no thoth-mem integration, and ships only
the `cartography` bundled skill. This change adds a delegate-first orchestration
model, disk-persisted delegations, memory-aware lifecycle hooks, and SDD skill
assets without changing the overall plugin bootstrap shape.

## Goals

- Replace the current six-agent roster with the seven-role omolite roster.
- Persist completed delegations to disk so `background_output` survives
  compaction and in-memory loss.
- Register thoth-mem as a built-in local MCP and add lifecycle hooks that use
  it consistently.
- Bundle SDD skills and shared conventions using the repository's existing
  `src/skills/` packaging pattern.
- Extend config and generated defaults with minimal churn to existing loading,
  build, and install flows.

## Non-Goals

- Replacing OpenSpec with a separate CLI or external npm dependency.
- Rewriting tmux lifecycle management beyond the persistence integration points.
- Adding brand new user-facing tools beyond enhancing the current background
  tools.
- Reworking cartography or unrelated hooks.

## Architecture Decisions

### Decision 1: Replace `fixer` with `quick` and `deep`, but keep the current one-file-per-agent pattern

**Choice**

- Keep the current file layout where each agent lives in its own file under
  `src/agents/`.
- Delete `src/agents/fixer.ts`.
- Add `src/agents/quick.ts` and `src/agents/deep.ts`.
- Keep `src/agents/index.ts` as the single roster builder and preserve the
  current custom-prompt loading path through `loadAgentPrompt()`.
- Add a small shared helper (`src/agents/prompt-utils.ts`) so prompt override
  composition is not duplicated across seven agent files.

**Role model**

| Agent | Execution mode | Mutation | Default responsibility |
|------|----------------|----------|------------------------|
| `orchestrator` | primary/root | none | planning, sequencing, delegation, memory |
| `explorer` | background-only | read-only | local codebase discovery |
| `librarian` | background-only | read-only | external docs/examples |
| `oracle` | synchronous | read-only | review, diagnosis, architecture |
| `designer` | synchronous | write-capable | UX/UI and user-facing implementation |
| `quick` | synchronous | write-capable | narrow, well-bounded implementation |
| `deep` | synchronous | write-capable | thorough implementation and verification |

**Tool restriction policy**

- `orchestrator`: deny workspace tools (`Read`, `Edit`, `Write`, `Bash`, LSP,
  AST-grep) and external research MCPs; allow delegation tools and `thoth_mem`.
- `explorer`: allow local read/search tools only; deny mutation, MCPs,
  delegation, and memory writes.
- `librarian`: allow research MCPs (`websearch`, `context7`, `grep_app`) plus
  local read/search; deny mutation, delegation, and memory writes.
- `oracle`: allow local read/analysis tools; deny mutation, MCPs, and
  background delegation.
- `designer`, `quick`, `deep`: allow local implementation tools; deny
  background delegation and external MCPs by default.

These restrictions are applied as default `SDKAgentConfig.permission` rules in
`src/agents/index.ts`, using constants from `src/config/constants.ts`, instead
of relying only on prompt wording.

**Alternatives considered**

- Keep `fixer` and only rewrite its prompt.
- Collapse `quick` and `deep` into a single implementation agent with a
  temperature switch.
- Move prompts into markdown files in the repo.

**Rationale**

The current codebase already treats agent files as the natural unit of prompt
ownership, and `src/agents/index.ts` already centralizes roster construction.
Keeping that shape minimizes bootstrap churn while making the role split
explicit. Enforcing capability restrictions in agent config, not just prose,
also makes the delegate-first architecture materially safer than the current
prompt-only model.

### Decision 2: Introduce `DelegationManager` as a separate persistence service composed into `BackgroundTaskManager`

**Choice**

- Add a new `src/delegation/` module instead of embedding persistence logic
  directly into `src/background/background-manager.ts`.
- Instantiate `DelegationManager` in `src/index.ts` and inject it into both
  `BackgroundTaskManager` and `createBackgroundTools(...)`.
- Keep `BackgroundTaskManager` responsible for session lifecycle, in-memory task
  tracking, notification, and tmux coordination.
- Make `DelegationManager` responsible for project identity, path resolution,
  record serialization, disk reads, and injection summaries.

**Storage path strategy**

- Default base directory:
  `${XDG_DATA_HOME:-~/.local/share}/opencode/delegations`
- Effective task path:
  `.../<projectId>/<rootSessionId>/<taskId>.md`
- Config override:
  `config.delegation.storageDir`

**Project ID strategy**

- Resolve repo root with `git rev-parse --show-toplevel`.
- Resolve the stable root commit with `git rev-list --max-parents=0 HEAD`.
- Format `projectId` as `<repo-name>-<first12RootCommitHash>`.
- If git metadata cannot be resolved, persistence is disabled for that session,
  but the live in-memory task result remains available.

**Task ID strategy**

- Replace the current opaque random ID generator with a human-readable ID based
  on `unique-names-generator`, for example:
  `bg_silver-orchid_a1b2`.
- Collision checks happen against both active in-memory tasks and existing disk
  files under the same root session before the ID is finalized.

**Persisted markdown contract**

```md
---
task_id: bg_silver-orchid_a1b2
title: Explore hook registration
summary: Mapped hook registration in src/index.ts and src/hooks
agent: explorer
status: completed
project_id: omolite-a1b2c3d4e5f6
root_session_id: sess_root_123
session_id: sess_child_456
description: Find hook registration pattern
started_at: 2026-03-24T18:20:00.000Z
completed_at: 2026-03-24T18:20:09.000Z
persisted_at: 2026-03-24T18:20:09.500Z
---

# Result

...full task output...
```

**Alternatives considered**

- Add persistence methods directly to `BackgroundTaskManager`.
- Store JSON instead of markdown.
- Use the current random `bg_<8 chars>` ID format.

**Rationale**

`BackgroundTaskManager` is already large and stateful. Composition keeps disk
concerns isolated and makes reuse possible from `background_output` and the
thoth hook without giving those modules access to background session internals.
Markdown with frontmatter preserves human readability, aligns with the SDD
artifact style already used in `openspec/`, and keeps compaction summaries easy
to derive.

### Decision 3: Add thoth-mem as both a built-in local MCP and a hook-backed runtime service

**Choice**

- Add `src/mcp/thoth.ts` with a local MCP definition keyed as `thoth_mem`.
- Keep `src/mcp/index.ts` as the single MCP registry and add `thoth_mem` to the
  built-in map beside `websearch`, `context7`, and `grep_app`.
- Add a runtime client wrapper under `src/thoth/` so hooks can call thoth-mem
  tools directly over stdio instead of trying to route through the agent.
- Add a dedicated hook module under `src/hooks/thoth-mem/` and export it from
  `src/hooks/index.ts`.

**MCP config pattern**

The OpenCode-facing MCP definition follows the existing `src/mcp/*.ts` pattern:

```ts
export const thoth_mem: LocalMcpConfig = {
  type: 'local',
  command: ['npx', '-y', 'thoth-mem@latest'],
  environment: { ...optionalEnv },
};
```

If `thoth.dataDir` is set, the command is extended with a deterministic data-dir
argument so both the agent-facing MCP and the internal client point at the same
store.

**Hook design**

`src/hooks/thoth-mem/index.ts` owns three seams:

1. `event`
   - Track root sessions on `session.created`.
   - Ignore child/background sessions with `parentID`.
   - Save user prompts on `message.updated` for tracked root sessions.
2. `experimental.chat.messages.transform`
   - Inject the Memory Protocol block into root-session turns.
   - Inject a FIRST ACTION recovery instruction on resumed/compacted turns.
   - Append delegation digest text derived from `DelegationManager`.
3. `tool.execute.after`
   - Passive-capture learnings from Task output when it contains a recognized
     `## Key Learnings:` block.

**System prompt injection content**

The protocol text is centralized in `src/hooks/thoth-mem/protocol.ts` and
prepended in the hidden message transform path rather than duplicated into all
seven agent prompts.

Injected content includes:

- when to use `thoth_mem_mem_context`, `thoth_mem_mem_search`, and
  `thoth_mem_mem_save`
- the root-session-only memory ownership rule
- the FIRST ACTION recovery step for resumed/compacted work
- the requirement to save SDD artifacts under
  `topic_key: sdd/<change-name>/<artifact>`

**Compaction survival strategy**

There is no dedicated compaction hook in the current plugin surface, so the
transform hook is the reliable seam. Every root-session turn receives:

1. a short Memory Protocol block,
2. a FIRST ACTION recovery instruction, and
3. a capped delegation digest (`last 5` completed records, summary-only).

This keeps the context alive after compaction without requiring the plugin to
detect compaction explicitly.

**Alternatives considered**

- Append memory protocol text to each agent prompt.
- Keep thoth-mem agent-visible only and avoid hook automation.
- Fold thoth behavior into `phase-reminder`.

**Rationale**

The repository already separates MCP declaration (`src/mcp/`) from hook
behavior (`src/hooks/`). Reusing that split keeps the feature understandable.
Using a dedicated runtime thoth client is also the only reliable way for hooks
to call memory tools automatically, because hooks currently do not route through
the agent tool layer.

### Decision 4: Package SDD assets as bundled custom skills under `src/skills/`, with shared conventions in `_shared`

**Choice**

- Add phase skills as directories under `src/skills/sdd-*/SKILL.md`.
- Add shared convention markdown files under `src/skills/_shared/`.
- Keep the existing bundled-skill distribution model in
  `src/cli/custom-skills.ts`.
- Extend the installer so `_shared/` is copied once in addition to individual
  skill directories.

**Planned skill asset layout**

```text
src/skills/
  _shared/
    openspec-convention.md
    persistence-contract.md
    thoth-mem-convention.md
  sdd-propose/
    SKILL.md
  sdd-spec/
    SKILL.md
  sdd-design/
    SKILL.md
  sdd-tasks/
    SKILL.md
  sdd-apply/
    SKILL.md
  sdd-verify/
    SKILL.md
  sdd-archive/
    SKILL.md
```

**How skills reference thoth-mem**

- Shared topic-key conventions live in
  `src/skills/_shared/thoth-mem-convention.md`.
- Each skill refers to the same topic-key family:
  `sdd/{change-name}/proposal`, `.../spec`, `.../design`, `.../tasks`, etc.
- Skills use explicit `thoth_mem_*` tool names, matching the MCP server key and
  current tool naming convention (`grep_app_*` already establishes this style).

**Bundled-skill permissions**

- Default SDD skill access remains orchestrator-only.
- This aligns with current `getSkillPermissionsForAgent()` behavior, because the
  orchestrator already gets `'*'` unless the user overrides skills explicitly.
- `deep` can be granted SDD skills later by config override without changing the
  default policy.

**Alternatives considered**

- Store SDD guidance outside `src/skills/` and document a manual install step.
- Put shared conventions inside each skill directory.
- Invent unnamed extra skills to make the proposal's numeric count literal.

**Rationale**

`src/cli/custom-skills.ts` already copies bundled skills from `src/skills/`, so
the lowest-risk design is to expand that existing packaging mechanism. Keeping
shared conventions in `_shared/` avoids repeating persistence and topic-key
rules across every SDD file.

### Decision 5: Extend config with focused `thoth` and `delegation` sections, and keep defaults in schema rather than installer output

**Choice**

- Add `ThothConfigSchema` and `DelegationConfigSchema` in
  `src/config/schema.ts`.
- Deep-merge both sections in `src/config/loader.ts`, just like `tmux` and
  `fallback` are merged now.
- Extend `McpNameSchema`, `DEFAULT_AGENT_MCPS`, agent constants, and default
  provider presets for the new roster.
- Regenerate `oh-my-opencode-lite.schema.json` from the updated Zod schema.

**Interface contracts**

```ts
export interface ThothConfig {
  enabled: boolean;
  command: string[];
  dataDir?: string;
  environment?: Record<string, string>;
  timeoutMs: number;
}

export interface DelegationConfig {
  storageDir?: string;
  timeoutMs: number;
}
```

**Default values**

- `thoth.enabled = true`
- `thoth.command = ['npx', '-y', 'thoth-mem@latest']`
- `thoth.timeoutMs = 15000`
- `delegation.storageDir = undefined` (runtime default resolves to
  `${XDG_DATA_HOME:-~/.local/share}/opencode/delegations`)
- `delegation.timeoutMs = 5000`

**Agent/MCP defaults**

- `DEFAULT_AGENT_MCPS.orchestrator = ['thoth_mem']`
- `DEFAULT_AGENT_MCPS.librarian = ['websearch', 'context7', 'grep_app']`
- all other specialists default to no MCPs

**Alternatives considered**

- Put thoth/delegation settings at the top level as loose fields.
- Emit explicit thoth/delegation blocks in every generated install config.
- Keep orchestrator's current `websearch` default.

**Rationale**

The current configuration system already uses nested Zod objects and deep merge
for complex sections. Matching that pattern keeps validation, loader behavior,
and schema generation predictable. Keeping defaults in schema instead of always
writing them into generated config avoids noisy config files and preserves the
current installer style.

### Decision 6: Keep the implementation additive where possible, and limit destructive changes to the obsolete `fixer` files

**Choice**

- Prefer new modules (`src/delegation/`, `src/thoth/`, `src/skills/sdd-*`) over
  widening already-large files.
- Limit deletions to `src/agents/fixer.ts`.
- Update the existing bootstrap files (`src/index.ts`, `src/agents/index.ts`,
  `src/mcp/index.ts`, `src/hooks/index.ts`) rather than introducing a second
  plugin entrypoint.

**Alternatives considered**

- Rebuild the plugin bootstrap around new root modules.
- Rewrite background, MCP, and hooks into a new package structure.

**Rationale**

`src/index.ts` is already the authoritative composition root. Reusing it keeps
the change reviewable and reduces regression risk. Additive modules also make
rollback cleaner: agents, delegation, thoth, and skill packaging can each be
reverted independently.

### Decision 7: Use root-session-based data flow for both disk fallback and compaction recovery

**Choice**

- Add `rootSessionId` as first-class background-task state.
- Resolve `rootSessionId` at launch time:
  - if `parentSessionId` already belongs to a tracked task, inherit that task's
    root session
  - otherwise treat `parentSessionId` as the root session
- Expose a small lookup surface from `BackgroundTaskManager` so
  `background_output` and the thoth hook can ask for the root session context.
- Only completed delegation records are included in compaction digests.

**Alternatives considered**

- Scan every project folder on disk for a matching task ID.
- Make compaction recovery rely only on thoth-mem and ignore delegation files.
- Key delegation storage only by task ID without session partitioning.

**Rationale**

The spec explicitly scopes uniqueness to a root session, not the entire
repository. Root-session ownership makes disk fallback deterministic, prevents
cross-session leakage, and gives the compaction hook a bounded record set to
inject.

## Data Flow

### Delegation persistence flow

```text
background_task
  -> src/tools/background.ts
  -> BackgroundTaskManager.launch()
  -> session.create + session.prompt
  -> session.status(idle)
  -> BackgroundTaskManager.extractAndCompleteTask()
  -> DelegationManager.persist(task)
  -> ~/.local/share/opencode/delegations/<projectId>/<rootSessionId>/<taskId>.md
```

### Retrieval flow with disk fallback

```text
background_output
  -> BackgroundTaskManager.getResult(taskId)
     -> hit: format in-memory task
     -> miss:
        -> resolve current rootSessionId from toolContext.sessionID
        -> DelegationManager.read(taskId, rootSessionId)
           -> hit: return persisted record body + metadata
           -> miss: "Task unavailable"
```

### Compaction / resumed-turn flow

```text
root user turn
  -> thoth hook message transform
  -> ThothClient.mem_context(...) / mem_search(...)
  -> DelegationManager.summarizeForInjection(rootSessionId)
  -> inject:
       1. Memory Protocol
       2. FIRST ACTION recovery instruction
       3. Delegation digest (completed items only)
  -> model resumes with durable context
```

### Hook composition order in `src/index.ts`

Because the plugin surface only exposes one handler per hook key, `src/index.ts`
must fan out in-process:

- `experimental.chat.messages.transform`
  1. thoth memory injection
  2. existing phase reminder
- `tool.execute.after`
  1. delegate-task retry guidance
  2. json error recovery
  3. thoth passive capture
  4. post-read nudge

This order preserves the raw Task output for passive capture and ensures memory
recovery instructions are prepended before generic workflow reminders.

## File Changes

### Create

| File | Description |
|------|-------------|
| `openspec/changes/create-omolite-plugin/design.md` | Technical design artifact for this change |
| `src/agents/deep.ts` | New deep implementation agent prompt/definition |
| `src/agents/quick.ts` | New quick implementation agent prompt/definition |
| `src/agents/prompt-utils.ts` | Shared prompt override/append helper |
| `src/delegation/index.ts` | Delegation module barrel |
| `src/delegation/delegation-manager.ts` | Disk persistence service for background tasks |
| `src/delegation/paths.ts` | Delegation storage path resolution helpers |
| `src/delegation/project-id.ts` | Git-root and root-commit based project ID resolver |
| `src/delegation/types.ts` | Delegation record/header contracts |
| `src/delegation/delegation-manager.test.ts` | Unit tests for persistence, lookup, and summaries |
| `src/mcp/thoth.ts` | Built-in local MCP definition for thoth-mem |
| `src/thoth/index.ts` | Runtime thoth client barrel |
| `src/thoth/client.ts` | Thin stdio MCP client used by hooks |
| `src/thoth/client.test.ts` | Unit tests for thoth client invocation/timeout handling |
| `src/hooks/thoth-mem/index.ts` | Memory lifecycle hook implementation |
| `src/hooks/thoth-mem/protocol.ts` | Centralized Memory Protocol injection text |
| `src/hooks/thoth-mem/index.test.ts` | Hook tests for root-session filtering, injection, and passive capture |
| `src/tools/background.test.ts` | Tests for `background_output` disk fallback and background-only validation |
| `src/skills/_shared/openspec-convention.md` | Shared OpenSpec directory/file conventions |
| `src/skills/_shared/persistence-contract.md` | Shared delegation/memory persistence rules |
| `src/skills/_shared/thoth-mem-convention.md` | Shared thoth topic-key and tool-call conventions |
| `src/skills/sdd-propose/SKILL.md` | Proposal phase skill |
| `src/skills/sdd-spec/SKILL.md` | Specification phase skill |
| `src/skills/sdd-design/SKILL.md` | Design phase skill |
| `src/skills/sdd-tasks/SKILL.md` | Task planning phase skill |
| `src/skills/sdd-apply/SKILL.md` | Implementation execution phase skill |
| `src/skills/sdd-verify/SKILL.md` | Verification phase skill |
| `src/skills/sdd-archive/SKILL.md` | Archive/closeout phase skill |

### Modify

| File | Description |
|------|-------------|
| `src/index.ts` | Compose `DelegationManager`, thoth hook, new MCP, and updated hook fan-out |
| `src/agents/index.ts` | Build seven-agent roster, apply new role permissions, remove fixer references |
| `src/agents/orchestrator.ts` | Rewrite orchestrator prompt for delegate-first sync/background split |
| `src/agents/explorer.ts` | Rewrite prompt for background-only local discovery role |
| `src/agents/librarian.ts` | Rewrite prompt for background-only research role |
| `src/agents/oracle.ts` | Rewrite prompt for synchronous read-only review role |
| `src/agents/designer.ts` | Rewrite prompt for synchronous write-capable design role |
| `src/agents/index.test.ts` | Update roster, counts, names, and permission expectations |
| `src/background/background-manager.ts` | Inject delegation service, root-session tracking, human-readable IDs, background-only validation |
| `src/background/background-manager.test.ts` | Update delegation rules, agent names, persistence integration coverage |
| `src/background/index.ts` | Export updated background types if needed by tools/bootstrap |
| `src/config/constants.ts` | New agent roster, default models, MCP defaults, delegation constants |
| `src/config/schema.ts` | Add `thoth` and `delegation` schemas; replace fixer with quick/deep |
| `src/config/loader.ts` | Deep-merge `thoth` and `delegation`; preserve prompt-loading behavior |
| `src/config/loader.test.ts` | Add schema/load/merge coverage for new config sections |
| `src/config/index.ts` | Re-export new config types |
| `src/config/agent-mcps.ts` | Default MCP matrix for thoth-enabled orchestrator and updated roster |
| `src/mcp/index.ts` | Register `thoth_mem` in built-in MCP set |
| `src/mcp/index.test.ts` | Assert thoth MCP inclusion/exclusion behavior |
| `src/hooks/index.ts` | Export thoth hook |
| `src/hooks/delegate-task-retry/index.test.ts` | Update background-agent allowlist expectations after fixer removal |
| `src/cli/custom-skills.ts` | Register SDD skill directories and copy `_shared` assets |
| `src/cli/providers.ts` | Generate presets for quick/deep instead of fixer |
| `src/cli/providers.test.ts` | Update generated-config expectations for the new roster |
| `package.json` | Add `unique-names-generator`; ensure packaged skill assets include new directories |
| `bun.lock` | Lockfile update for dependency changes |
| `AGENTS.md` | Rewrite repo guidance for SDD, delegation, and memory conventions |
| `README.md` | Update public docs for the new agent roster and persistence/memory features |
| `oh-my-opencode-lite.schema.json` | Regenerated JSON Schema from updated Zod config |

### Delete

| File | Description |
|------|-------------|
| `src/agents/fixer.ts` | Removed obsolete implementation agent replaced by `quick` and `deep` |

## Interfaces / Contracts

### Delegation persistence

```ts
export interface DelegationRecordHeader {
  taskId: string;
  title: string;
  summary: string;
  agent: string;
  status: 'completed' | 'failed' | 'cancelled';
  projectId: string;
  rootSessionId: string;
  sessionId?: string;
  description: string;
  startedAt: string;
  completedAt: string;
  persistedAt: string;
}

export interface PersistedDelegationRecord {
  path: string;
  header: DelegationRecordHeader;
  body: string;
}

export interface DelegationManager {
  resolveProjectId(directory: string): Promise<string | null>;
  persist(task: BackgroundTask & { rootSessionId: string }): Promise<PersistedDelegationRecord | null>;
  read(taskId: string, rootSessionId: string): Promise<PersistedDelegationRecord | null>;
  listCompleted(rootSessionId: string): Promise<PersistedDelegationRecord[]>;
  summarizeForInjection(rootSessionId: string, limit?: number): Promise<string | null>;
}
```

### thoth config

```ts
export interface ThothConfig {
  enabled: boolean;
  command: string[];
  dataDir?: string;
  environment?: Record<string, string>;
  timeoutMs: number;
}
```

### Background task state extensions

```ts
export interface BackgroundTask {
  id: string;
  sessionId?: string;
  rootSessionId: string;
  description: string;
  agent: string;
  status: 'pending' | 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  persistencePath?: string;
  persistenceError?: string;
  startedAt: Date;
  completedAt?: Date;
  prompt: string;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Agent roster, prompt selection, and permission defaults | Update `src/agents/index.test.ts` to assert quick/deep presence, fixer absence, and role restrictions |
| Unit | Delegation path resolution, project ID derivation, markdown serialization, collision handling | New `src/delegation/delegation-manager.test.ts` |
| Unit | Background task completion writes to disk and preserves live results on persistence failure | Extend `src/background/background-manager.test.ts` |
| Unit | `background_output` uses in-memory result first, then disk fallback | New `src/tools/background.test.ts` |
| Unit | MCP registry includes/excludes `thoth_mem` correctly | Extend `src/mcp/index.test.ts` |
| Unit | thoth hook filters child sessions, injects recovery instructions, captures passive learnings | New `src/hooks/thoth-mem/index.test.ts` |
| Unit | Config schema accepts/merges `thoth` and `delegation` sections | Extend `src/config/loader.test.ts` |
| Unit | Generated install config contains quick/deep and no fixer | Extend `src/cli/providers.test.ts` |
| Integration | Manual OpenCode smoke test: launch `@explorer` via `background_task`, compact, then call `background_output` | Manual verification in a real OpenCode session |
| Integration | Manual OpenCode smoke test: thoth enabled root session injects Memory Protocol and root-session prompt capture | Manual verification in a real OpenCode session |

## Risks

| Risk | Mitigation |
|------|------------|
| Hook fan-out collisions because only one handler is exposed per hook key | Keep composition centralized in `src/index.ts` and test ordering explicitly |
| thoth runtime client and OpenCode MCP command drift apart | Derive both from the same `ThothConfig` object and command builder |
| Git metadata unavailable in non-repo environments | Treat persistence as unavailable, but do not drop the live in-memory result |
| Generated config with explicit `skills` arrays can block future default skill grants | Keep SDD skills orchestrator-only by default and document config override path |
| Shared `_shared/` files not copied by the current installer | Update `src/cli/custom-skills.ts` to copy `_shared` explicitly and test it |

## Open Questions

- [ ] The proposal text says "9 SDD skills" but explicitly names seven phase skills. This design treats the named phase set as authoritative and packages shared conventions separately.
- [ ] If OpenCode later exposes a pre-execution Task hook, the synchronous/background enforcement matrix should move from prompt guidance to hard validation for the built-in `task` tool as well.
