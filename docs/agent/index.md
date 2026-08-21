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
| adapters, writers, generated artifacts, Codex/Claude/OpenCode surfaces | [`harness-packaging.md`](harness-packaging.md) | `src/harness/`, `skills/` | `src/harness/**/*.test.ts` | CLI installation |
| OpenCode runtime, hooks, MCP, LSP, ast-grep, tmux, fallback | [`runtime-integrations.md`](runtime-integrations.md) | `src/index.ts`, `src/hooks/`, `src/mcp/`, `src/tools/` | colocated tests and `src/plugin-node-runtime.test.ts` | memory boundary |
| parser, TUI, install, update, sync, status, required skills, provider setup invocation | [`cli-installation.md`](cli-installation.md) | `src/cli/` | `src/cli/**/*.test.ts`, `src/cli/**/*.test.tsx` | harness packaging |
| direct/accelerated/full routing, fast-forward gates, phase contracts/envelopes, Spec Kit artifacts, durable deltas, verify/converge/archive | [`sdd-and-skills.md`](sdd-and-skills.md) | `src/harness/core/sdd.ts`, `skills/` | `src/harness/core/sdd.test.ts`, `sdd-protocol.test.ts`, prompt and skill tests | memory boundary |
| external provider ownership, memory authorization, continuity outcomes, truthful capability state | [`memory-governance.md`](memory-governance.md) | `src/harness/core/memory-governance.ts`, adapters | memory-governance/provider-boundary tests | SDD |

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

## Context budget evidence

The 2026-08-21 specialist-writer refresh used the documented `characters / 4`
estimate (not billing or model token measurement). Always-loaded context remained
at 8,465 characters / ~2,117 estimated tokens before and after. Generated Claude
specialists all decreased from their Git HEAD baselines:

| Role | Before chars / estimate | After chars / estimate |
| --- | ---: | ---: |
| explorer | 5,199 / ~1,300 | 3,435 / ~859 |
| librarian | 5,238 / ~1,310 | 3,412 / ~853 |
| oracle | 5,863 / ~1,466 | 3,910 / ~978 |
| designer | 5,092 / ~1,273 | 3,417 / ~855 |
| quick | 5,090 / ~1,273 | 3,375 / ~844 |
| deep | 5,222 / ~1,306 | 3,463 / ~866 |

The progressive-context validator reported zero errors and zero warnings.

The 2026-08-21 route-independent ownership refresh also held always-loaded
context at 8,465 characters / ~2,117 estimated tokens before and after. Current
rendered root packages measure 8,499 / ~2,125 for OpenCode, 9,855 / ~2,464 for
Codex, and 9,340 / ~2,335 for Claude Code. These harness-specific roots are
routed outputs, not additional always-loaded repository files. Strict validation
again reported zero errors and zero warnings.
