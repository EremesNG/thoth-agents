# Skills and MCPs

Reference for the bundled skills shipped with thoth-agents and the built
in MCP servers it registers.

## Bundled Skills

Bundled skills are copied from `src/skills/` into the OpenCode skills directory
when skill installation is enabled.

| Skill | Category | Description | Typical agent |
| --- | --- | --- | --- |
| `requirements-interview` | Clarification | Clarify ambiguous work, assess scope, and choose the right planning path before implementation | `orchestrator` |
| `plan-reviewer` | Review | Review SDD task plans for execution blockers and valid references | `orchestrator`, `oracle` |
| `sdd-init` | SDD initialization | Bootstrap OpenSpec structure and SDD context for a project | `orchestrator` |
| `sdd-propose` | SDD planning | Create or update `proposal.md` for an OpenSpec change | `orchestrator` |
| `sdd-spec` | SDD specification | Write OpenSpec delta specifications | `orchestrator` |
| `sdd-design` | SDD design | Create `design.md` with architecture decisions and file changes | `orchestrator` |
| `sdd-tasks` | SDD planning | Generate phased `tasks.md` checklists from specs and design | `orchestrator` |
| `sdd-apply` | SDD execution | Execute assigned SDD tasks and return structured implementation results | `orchestrator` |
| `executing-plans` | Execution orchestration | Execute SDD task lists with real-time progress tracking and verification checkpoints | `orchestrator` |
| `sdd-verify` | Verification | Verify implementation against specs and persist a compliance report | `orchestrator` |
| `sdd-archive` | Archive | Merge completed deltas into main specs and archive the change | `orchestrator` |

Agent assignments are descriptive, not enforced. Any agent can use any skill; the orchestrator's delegation prompts determine which agent handles which work.

## Bundled Skill Categories

### Clarification

- `requirements-interview`

### Review and Execution Control

- `plan-reviewer`
- `executing-plans`

### Core SDD Pipeline

- `sdd-init`
- `sdd-propose`
- `sdd-spec`
- `sdd-design`
- `sdd-tasks`
- `sdd-apply`
- `sdd-verify`
- `sdd-archive`

## Recommended External Skills

These are compatible external skills that complement the workflow.

| Skill | Status | Why use it | Typical agent |
| --- | --- | --- | --- |
| `simplify` | Recommended and installed by `--skills=yes` | Encourages lean, low-complexity solutions | `orchestrator` |
| `playwright-cli` | Recommended and installed by `--skills=yes` | Browser automation for UI work and visual verification | `designer` |
| `test-driven-development` | Optional companion | Useful before implementing fixes or features with stronger verification discipline | `deep` |
| `systematic-debugging` | Optional companion | Useful for structured failure diagnosis and root-cause analysis | `oracle`, `deep` |

## MCP Servers

thoth-agents registers four built-in MCP servers.

| MCP | Type | Purpose | Auth / runtime |
| --- | --- | --- | --- |
| `exa` | remote | Exa-backed web search | Optional `EXA_API_KEY` env var |
| `context7` | remote | Official library and framework documentation lookup | Optional `CONTEXT7_API_KEY` env var |
| `grep_app` | remote | Public GitHub code search through grep.app | No auth required |
| `thoth_mem` | local | Persistent memory, artifact storage, and session summaries | Local command, default `npx -y thoth-mem@latest` |

## MCP Notes

### `exa`

- URL: `https://mcp.exa.ai/mcp?tools=web_search_exa`
- Uses the `x-api-key` header when `EXA_API_KEY` is set
- Good for current information and public web lookup

### `context7`

- URL: `https://mcp.context7.com/mcp`
- Uses the `CONTEXT7_API_KEY` header when set
- Good for library and framework documentation

### `grep_app`

- URL: `https://mcp.grep.app`
- No auth required
- Good for public GitHub code pattern lookup

### `thoth_mem`

- Local MCP, not a remote URL
- Default command: `npx -y thoth-mem@latest`
- Supports custom `command`, `data_dir`, `environment`, and `timeout`
- Used for root-session memory, SDD artifacts, and durable summaries

## Configuration Notes

- Built-in MCPs can be disabled globally with `disabled_mcps`
- SDD artifact persistence is controlled by `artifactStore.mode`
- Skill and MCP usage is prompt-driven; the generated config does not use old
  per-agent allowlist fields

## Related Docs

- [Quick Reference](quick-reference.md)
- [SDD Pipeline](sdd-pipeline.md)
- [Installation Guide](installation.md)
