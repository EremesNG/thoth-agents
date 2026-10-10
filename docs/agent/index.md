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
| adapters, writers, generated artifacts, Pi/Codex/Claude/OpenCode surfaces, release, versioning, npm publishing of root and Pi packages | [`harness-packaging.md`](harness-packaging.md) | `src/harness/`, `skills/`, `scripts/release-pi.mjs`, `.github/workflows/release.yml` | `src/harness/**/*.test.ts` | CLI installation |
| Pi sidebar, fullscreen/regular layout, resize, settings/cost overlays, panel summaries/order, absorption, shared session cost | [`harness-packaging.md#pi-sidebar-and-ui-coordination`](harness-packaging.md#pi-sidebar-and-ui-coordination) | `pi-packages/pi-sidebar/src/`, pi-core UI-preferences/decorative-overlay/session-cost, pi-thoth-theme status line | sidebar layout/control/panel tests, core focus/absorption and theme golden tests | architecture, verification |
| Pi provider limits, Claude quota, subscription cost, child rate-limit warnings | [`harness-packaging.md#pi-provider-status-and-subscription-cost`](harness-packaging.md#pi-provider-status-and-subscription-cost) | `pi-packages/pi-core/src/provider-limits.ts`, pi-claude-bridge, pi-antigravity-bridge, pi-subagents UI, pi-thoth-theme | package provider-limit, quota, pricing and warning tests | architecture, verification |
| Pi work panel, provider discovery/summaries, keyed metrics/stable heights, data-only rows, mixed-version ownership | [`harness-packaging.md#pi-work-panel-registry-v2`](harness-packaging.md#pi-work-panel-registry-v2) | `pi-packages/pi-core/src/work-panel*.ts`, pi-subagents/pi-background-tasks/pi-todo providers | package work-panel, retention, lifecycle and focus tests | architecture, verification |
| Pi question dock, Ctrl+] collapse/expand, editor-slot composition, panel focus | [`harness-packaging.md#pi-question-dock-and-editor-slot`](harness-packaging.md#pi-question-dock-and-editor-slot) | `pi-packages/pi-core/src/`, `pi-packages/pi-questions-user/src/` | `pi-packages/pi-core/test/`, `pi-packages/pi-questions-user/test/`, `pi-packages/pi-subagents/test/ui/` | architecture, verification |
| OpenCode runtime, hooks, MCP, LSP, ast-grep, tmux, fallback | [`runtime-integrations.md`](runtime-integrations.md) | `src/index.ts`, `src/hooks/`, `src/mcp/`, `src/tools/` | colocated tests and `src/plugin-node-runtime.test.ts` | memory boundary |
| parser, TUI, install, update, sync, status, required skills, provider setup invocation | [`cli-installation.md`](cli-installation.md) | `src/cli/` | `src/cli/**/*.test.ts`, `src/cli/**/*.test.tsx` | harness packaging |
| Proportional SDD understanding/classification, one ID-named record, authorization, durable deltas and closeout | [`sdd-and-skills.md`](sdd-and-skills.md) | `src/harness/core/sdd.ts`, `skills/` | SDD classification/protocol, prompt, skill and archive tests | memory boundary |
| external provider ownership, memory authorization, continuity outcomes, truthful capability state | [`memory-governance.md`](memory-governance.md) | `src/harness/core/memory-governance.ts`, adapters | memory-governance/provider-boundary tests | work workflow |

## Cross-cutting overlays

| Concern | Load when | Evidence |
| --- | --- | --- |
| Architecture | A change crosses two routes or plugin composition | [`architecture.md`](architecture.md) |
| Verification | Selecting proportional local-closeout checks, release-tooling triggers, or CI/build/test scope | [`testing.md`](testing.md) |
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

## Prompt size checks

Rendered product prompt size caps are asserted in
[`src/agents/prompt-rendering.test.ts`](../../src/agents/prompt-rendering.test.ts).
Use those assertions rather than historical size snapshots.
