# Proposal: Create oh-my-opencode-lite Plugin

## Intent

Transform the oh-my-opencode-slim fork into a purpose-built plugin that integrates SDD methodology, persistent memory, and disk-persisted delegations — creating a cohesive delegate-first agent orchestration system for OpenCode.

## Scope

### In Scope
- **7 role-based agents** with rewritten system prompts optimized for SDD + delegation
- **DelegationManager** — disk persistence for background task results (`~/.local/share/opencode/delegations/`)
- **Thoth-mem MCP** — local stdio MCP integration + lifecycle hooks (system prompt injection, compaction survival, passive capture, session management)
- **9 SDD skills** — propose, spec, design, tasks, apply, verify, archive + shared conventions (adapted from agent-teams-lite, engram→thoth-mem)
- **AGENTS.md** — rewritten with SDD pipeline, delegation rules, token economics
- **Config schema** — extended for thoth-mem and delegation settings
- **CLI** — adapted install command for omolite

### Out of Scope
- OpenSpec as npm dependency (methodology inlined, not CLI tool)
- New tools beyond extending existing background tools with persistence
- Cartography skill rewrite (keep Python script as-is)
- New hook types beyond thoth-mem-hook

## Approach

1. **Clean agents** — Replace fixer with quick+deep, rewrite all 7 agent prompts
2. **Add delegation layer** — New `src/delegation/` module with DelegationManager, integrated into BackgroundTaskManager
3. **Add thoth-mem** — New MCP config (`src/mcp/thoth.ts`) + lifecycle hook (`src/hooks/thoth-mem-hook.ts`)
4. **Add SDD skills** — Port 9 phase skills + 3 shared conventions to `src/skills/sdd-*/`
5. **Update config** — Extend Zod schema for thoth + delegation settings
6. **Update AGENTS.md** — Full rewrite with new architecture
7. **Update CLI** — omolite-specific install flow
8. **Update package.json** — name, description, add `unique-names-generator` dep

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/agents/` | Modified | All 7 agents rewritten, fixer→quick+deep |
| `src/delegation/` | New | DelegationManager, project-id, MD persistence |
| `src/hooks/thoth-mem-hook.ts` | New | Memory lifecycle hooks |
| `src/mcp/thoth.ts` | New | Thoth-mem stdio MCP config |
| `src/skills/sdd-*/` | New | 9 SDD phase skills + shared conventions |
| `src/config/schema.ts` | Modified | Add thoth + delegation config |
| `src/config/constants.ts` | Modified | Update defaults |
| `src/background/background-manager.ts` | Modified | Integrate DelegationManager |
| `src/cli/index.ts` | Modified | Adapt install flow |
| `src/tools/background.ts` | Modified | Persist results, read from disk fallback |
| `src/index.ts` | Modified | Register new hook, MCP, updated agents |
| `AGENTS.md` | Modified | Full rewrite |
| `package.json` | Modified | Name, deps, metadata |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing BackgroundTaskManager | Medium | DelegationManager as separate module, injected — not modifying core logic |
| Thoth-mem binary not installed on user machine | Medium | `npx -y thoth-mem@latest` auto-installs; CLI warns if missing |
| SDD skills too verbose for context window | Low | Skills loaded on-demand, not all at once |
| Disk persistence race conditions | Low | One delegation per file, atomic writes via Bun.write |

## Rollback Plan

- Git revert to pre-change commit
- Each phase is independently revertable (agents, delegation, thoth, skills are decoupled)
- Existing tests must pass at each phase boundary

## Dependencies

- `thoth-mem` binary available via npx
- `unique-names-generator` npm package for delegation IDs
- Existing fork dependencies unchanged

## Success Criteria

- [ ] All 7 agents defined with role-appropriate system prompts
- [ ] `background_task` results persist to disk and survive compaction
- [ ] `background_output` reads from disk when result not in memory
- [ ] Thoth-mem MCP registered and configurable
- [ ] Thoth-mem hook injects memory protocol, handles compaction, captures passively
- [ ] All 9 SDD skills present and loadable
- [ ] AGENTS.md documents complete SDD workflow + delegation rules
- [ ] `bun run typecheck` passes
- [ ] `bun run check:ci` passes
- [ ] `bun test` passes (existing tests, no regressions)
- [ ] `bun run build` succeeds
