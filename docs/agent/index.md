# Agent context router

Select the smallest route that owns the requested behavior. Do not preload every
linked document.

## Routing procedure

1. An explicit user route or file path wins.
2. Otherwise choose the domain that owns the public behavior.
3. Search named symbols, callers, registries, and tests before broad reading.
4. Add an overlay only to answer a concrete cross-cutting question.
5. Expand context only when evidence leaves a gap.

## Primary routes

| Task signals | Read first | Code roots | Primary tests | Optional overlay |
| --- | --- | --- | --- | --- |
| roles, prompts, permissions, models, delegation, return contract | [`agents-and-delegation.md`](agents-and-delegation.md) | `src/agents/`, `src/config/`, `src/harness/core/agent-pack.ts` | agent/config and agent-pack tests | harness packaging |
| adapters, writers, generated artifacts, Codex/Claude/OpenCode surfaces | [`harness-packaging.md`](harness-packaging.md) | `src/harness/` | `src/harness/**/*.test.ts` | CLI installation |
| OpenCode runtime, hooks, MCP, LSP, ast-grep, tmux, fallback | [`runtime-integrations.md`](runtime-integrations.md) | `src/index.ts`, `src/hooks/`, `src/mcp/`, `src/tools/` | colocated tests and `src/plugin-node-runtime.test.ts` | memory boundary |
| parser, TUI, install, update, sync, status, required skills | [`cli-installation.md`](cli-installation.md) | `src/cli/` | `src/cli/**/*.test.ts`, `src/cli/**/*.test.tsx` | harness packaging |
| direct/accelerated/full routing, architectural grilling, phase ownership, Spec Kit artifacts | [`sdd-and-skills.md`](sdd-and-skills.md) | `src/harness/core/sdd.ts`, phase-agent prompts | `src/harness/core/sdd.test.ts`, prompt tests | memory boundary |
| external provider ownership, continuity outcomes, truthful capability state | [`memory-governance.md`](memory-governance.md) | `src/harness/core/memory-governance.ts`, adapters | memory-governance/provider-boundary tests | SDD |

## Cross-cutting overlays

| Concern | Load when | Evidence |
| --- | --- | --- |
| Architecture | A change crosses two routes or plugin composition | [`architecture.md`](architecture.md) |
| Verification | Selecting CI/build/test scope | [`testing.md`](testing.md) |
| Public compatibility | CLI, schema, generated package, or published docs change | README, public docs, schema, writer tests |
| Zod | A schema under `.agents/skills/zod/` changes | Its local `AGENTS.md` only |

## Fallback

Search the user-supplied names and paths, then inspect the nearest definition,
callers, tests, and manifest. Do not use uncertainty as permission to explore the
entire repository.

## Shared references

- [`architecture.md`](architecture.md)
- [`testing.md`](testing.md)
- [`task-template.md`](task-template.md)
- [`routing-cases.json`](routing-cases.json)
