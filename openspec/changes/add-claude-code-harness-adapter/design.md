# Design: Add Claude Code Harness Adapter

## Technical Approach

Add Claude Code as a first-class harness adapter that consumes the existing
harness-neutral agent-pack core and renders a single distributable Claude Code
plugin package. The work reuses every shared contract introduced by the Codex
change (`src/harness/core/agent-pack.ts`, `core/memory-governance.ts`,
`core/skills.ts`, and the `src/agents/prompt-sections.ts` pipeline) and adds only
a Claude Code dialect plus Claude-Code-specific writers and an install layer.

Claude Code is structurally closest to Codex's `.codex-plugin/` package but with
two decisive simplifications: (1) plugins auto-discover subagents, so there is no
`.codex/` + `.codex-plugin/` split — everything lives under one `.claude-plugin/`
root; (2) capabilities are all first-class (`supported`), so the entire
`codex-surfaces.ts` validation gate is intentionally **not** ported.

## Architecture Decisions

### Decision: Implement Claude Code as a first-class adapter, not configuration-first

**Choice**: Mark all `HarnessCapabilities` as `supported` and skip the surface
validation gate and capability-gap diagnostics.

**Alternatives considered**: Mirror the Codex configuration-first posture with a
`claude-code-surfaces.ts` validation gate.

**Rationale**: Claude Code documents and enforces every primitive the agent pack
needs — subagents (`agents/*.md`, auto-discovered), per-agent tool restriction
(frontmatter `tools`), harness-run hooks (`hooks/hooks.json`), MCP (`.mcp.json`),
and skills. There is no unvalidated surface to gate, so a gate would only add dead
code. An optional **pure descriptor** (no validators) may be added for docs/status
symmetry.

### Decision: Plugin-only packaging under a single `.claude-plugin/` root

**Choice**: Render one plugin package containing `plugin.json`, `agents/<role>.md`
(six specialists), `skills/<skill>/…`, `.mcp.json`, and `hooks/hooks.json`.

**Alternatives considered**: Dual `.claude-plugin/` package + project `.claude/`
artifacts, mirroring Codex.

**Rationale**: Codex needed both because Codex plugins cannot carry subagents.
Claude Code plugins auto-discover subagents in `agents/`, so a single package is
sufficient and is the native distribution unit.

### Decision: Inject the root coordinator via a SessionStart hook

**Choice**: The orchestrator/root-coordinator is the Claude Code **main session**,
not a generated subagent. Deliver its instructions through a `SessionStart` hook
that emits `additionalContext`. The rendered instruction text comes from
`renderClaudeCodeRootInstructions(config)` and is delivered by a bundled standalone
script referenced with `${CLAUDE_PLUGIN_ROOT}`.

**Alternatives considered**: A plugin-level `CLAUDE.md` (not loaded as context); a
generated "orchestrator" subagent (would replace user intent); static
`additionalContext` baked into `hooks.json` (acceptable but large/opaque).

**Rationale**: A plugin cannot edit the user's `CLAUDE.md`. SessionStart
`additionalContext` is the documented mechanism to add instructions to the main
session without overriding the user's own context. An optional
`commands/thoth-orchestrate.md` re-entry command guards against context compaction.

### Decision: Enforce role permissions through subagent frontmatter `tools`

**Choice**: Read-only roles (explorer, librarian, oracle) get a restricted
`tools` list (`Read, Grep, Glob`, plus research MCP for librarian) with no
`Write`/`Edit`/`Bash`; write-capable roles (designer, quick, deep) get the full
mutation tool set. This is the concrete realization of `rolePermissions: supported`.

**Rationale**: Claude Code enforces the subagent `tools` allowlist at runtime, so
role permissions are machine-enforced rather than instruction-only as in Codex.

### Decision: Reuse shared contracts; write fresh thin writers

**Choice**: Reuse `getAgentPackContract`, `renderMemoryGovernanceInstructions`,
`memoryGovernanceDiagnostics`, `getSkillRegistry`, and the prompt-section
pipeline. Write new `claude-code-subagent.ts`, `claude-code-plugin-package.ts`,
and `claude-code-skill-layout.ts` writers rather than reusing the Codex writers.

**Rationale**: The Codex writers and `skill-layout.ts` are hard-wired to
`validateCodexPluginPackageSurface` / `assertCodexSurfaceCanGenerate` and emit
`harness: 'codex'` literals and `codex.*` diagnostic codes. Reusing them would
drag the Codex gate into the first-class path. Truly generic helpers
(`readRootPackageVersion`, `collectFiles`, `sha256`, `writeTextWithBackup`, the
builtin MCP set) are extracted into shared modules.

### Decision: Dispatch via polymorphic operation-adapter methods

**Choice**: Extend `HarnessOperationAdapter` with method hooks (`getStatus`,
`buildPlan`, `buildModelPlan`, `applyPlan`, `defaultModelRoles`) so `commands.ts`
dispatches through the registry instead of `opencode`-vs-`codex` ternaries.

**Alternatives considered**: Add an explicit third branch to each of the five
dispatch functions (lower risk, leaves the structural smell).

**Rationale**: The ternary `else` currently routes any non-`opencode` harness to
Codex; a third harness is exactly the point where the pattern breaks. The
polymorphic refactor makes exhaustiveness registry-guaranteed.

## Data Flow

```text
Harness selection (generate/install --harness=claude)
  -> HarnessRegistry resolves claudeCodeAdapter
  -> AgentPackCore supplies shared role contracts + skills + memory governance
  -> CLAUDE_CODE_PROMPT_DIALECT supplies tool nomenclature + first-class profile
  -> claudeCodeAdapter.render(context)
     -> per role: renderRolePrompt + memory governance -> renderClaudeCodeSubagent
        (frontmatter name/description/model/tools + body) -> agents/<role>.md
     -> .mcp.json (http for url servers), hooks/hooks.json (SessionStart root
        injection), skills layout, plugin.json manifest
  -> install layer plans + applies the .claude-plugin/ package idempotently
```

OpenCode and Codex flows are untouched.

## File Changes

New:
- `src/harness/adapters/claude-code.ts` — adapter + `renderClaudeCodeRootInstructions`.
- `src/harness/writers/claude-code-subagent.ts` — subagent markdown+frontmatter.
- `src/harness/writers/claude-code-plugin-package.ts` — plugin.json + layout.
- `src/harness/writers/claude-code-skill-layout.ts` — skills under plugin root.
- `src/harness/writers/fs-skill-collect.ts` — shared file collection/hash helpers.
- `src/harness/core/package-version.ts` — shared root package.json version lookup.
- `src/harness/adapters/claude-code-surfaces.ts` — optional pure descriptor.
- `src/cli/operations/claude-code.ts` — operation adapter.
- `src/cli/claude-code-paths.ts`, `claude-code-config-io.ts`, `claude-code-install.ts`.
- Colocated `*.test.ts` for each new module.

Modified:
- `src/harness/types.ts` (`HarnessId`), `src/harness/registry.ts`,
  `src/cli/operations/index.ts`, `src/cli/operations/types.ts`,
  `src/cli/types.ts`, `src/cli/parser.ts`, `src/cli/commands.ts`,
  `src/agents/prompt-dialects.ts`, `src/config/schema.ts`,
  `src/harness/registry.test.ts`, `src/cli/operations/index.test.ts`.

## Interfaces / Contracts

```ts
export type HarnessId = 'opencode' | 'codex' | 'claude';

export const CLAUDE_CODE_PROMPT_DIALECT: HarnessPromptDialect = {
  harness: 'claude',
  tools: {
    delegationTool: 'Task',
    backgroundDelegationTool: 'Task',
    userQuestionTool: 'AskUserQuestion',
    progressTool: 'TodoWrite',
    roleReference: (role) => `Task(subagent_type: ${role})`,
  },
  capabilities: supportedCapabilityProfile(CLAUDE_CODE_PROMPT_CAPABILITIES),
  /* dispatchLabel, renderRoleInvocation */
};

renderClaudeCodeSubagent(input: {
  name: string; description: string;
  tools: string;            // comma-separated allowlist = role permission
  model: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  instructions: string;     // rendered role prompt + governance
}): string;                 // YAML frontmatter + markdown body
```

Subagent model defaults: `oracle` and `deep` → `opus`; `explorer`, `librarian`,
`designer`, `quick` → `sonnet`. The main-session orchestrator inherits the
session model (frontmatter `model` does not apply to it).

## Testing Strategy

- Dialect tests: tool names, `getPromptDialect('claude')`, no Codex
  disclosure text leaking.
- Adapter tests: six subagents emitted; read-only roles lack write tools; opus on
  oracle/deep; `.mcp.json` uses `type: "http"` for url servers; `hooks.json`
  contains a SessionStart entry with the root marker; manifest version matches
  root `package.json`; diagnostics empty.
- Install tests: dry-run plan, apply with backups, skip-if-identical, frontmatter
  `model:` override restricted to `{sonnet,opus,haiku,inherit}`.
- Registry/operations tests updated for the three-harness world.
- Verification set: `pnpm run lint`, `typecheck`, `test`, `build`, `check:ci`.

## Migration / Rollout

1. Widen `HarnessId`; register stub adapters so the tree compiles and strict TS
   enumerates remaining gaps.
2. Add the dialect and its tests.
3. Implement writers + adapter render + root instructions; verify with
   `generate --harness=claude --dry-run`.
4. Update registry/operations tests.
5. Refactor `commands.ts` dispatch and wire generate/install/help.
6. Implement the install/paths/config-io layer + operation adapter.
7. Add the SessionStart injector (+ optional re-entry command).
8. Model defaults, optional surface descriptor, schema config + regenerate schema.
9. Docs.

Rollback: remove the `'claude'` registry entries and new modules; OpenCode
and Codex remain intact.

## Non-Goals

- No change to OpenCode/Codex behavior, capabilities, or artifact paths.
- No thoth-mem replacement.
- No port of `src/hooks/*` OpenCode runtime callbacks to Claude Code command hooks.
- No additional harness beyond Claude Code.
- No hosted marketplace publishing in this change.
