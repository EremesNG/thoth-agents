# Quick Reference Guide

Fast reference for thoth-agents concepts, harness bindings, configuration,
skills, and MCP integration.

## Table of Contents

- [Harness Support](#harness-support)
- [Agent Roster](#agent-roster)
- [Presets](#presets)
- [Bundled Skills](#bundled-skills)
- [Recommended External Skills](#recommended-external-skills)
- [SDD Pipeline](#sdd-pipeline)
- [Artifact Store Policy](#artifact-store-policy)
- [MCP Servers](#mcp-servers)
- [Task Delegation](#task-delegation)
- [Tmux Integration](#tmux-integration)
- [Prompt Overriding](#prompt-overriding)
- [Key Configuration Fields](#key-configuration-fields)

---

## Harness Support

| Harness | Binding | Caveat |
| --- | --- | --- |
| OpenCode | Native plugin config, native `task`, optional tmux panes, OpenCode skills directory | Stable default baseline. |
| Codex | Ambient root guidance, six role TOMLs, Personal plugin source, plugin-bundled skills | Some governance and delegation behavior is instruction-level unless Codex exposes hard runtime controls. |
| Claude Code | One `.claude-plugin/` package: six auto-discovered subagents, `.mcp.json`, bundled skills, SessionStart root-injection hook | First-class: role permissions enforced by subagent `tools`, hooks harness-run, native `Task(subagent_type: ...)` delegation. |

Entry point: `npx thoth-agents@latest` opens the interactive multi-harness TUI in an interactive terminal and falls back to the OpenCode install path in CI, redirected shells, or `TERM=dumb`.

Shared concepts come first: the seven roles, requirements interview, SDD,
thoth-mem, and specialist workflow. Harness details describe how those concepts
are delivered in OpenCode, Codex, or Claude Code.

## Agent Roster

| Agent | Role | Mode | Shared behavior |
| --- | --- | --- | --- |
| `orchestrator` | Root coordinator and memory owner | primary, non-mutating | Owns decisions, sequencing, requirements routing, memory, and progress. |
| `explorer` | Local repository discovery | read-only | Finds files, symbols, references, constraints, and verification targets. |
| `librarian` | External docs and example lookup | read-only | Verifies version-sensitive APIs and public examples. |
| `oracle` | Diagnosis, review, architecture, plan review | read-only | Reviews risk, plans, bugs, and correctness-sensitive decisions. |
| `designer` | UX/UI implementation and visual verification | write-capable | Owns user-facing UI and visual QA. |
| `quick` | Narrow implementation work | write-capable | Handles clear, bounded, low-risk edits. |
| `deep` | Thorough implementation and verification | write-capable | Handles correctness-critical, multi-file, or edge-case-heavy work. |

The project is delegate-first, but the `orchestrator` remains the decision
engine. Read-only specialists gather facts; the orchestrator turns those facts
into a concrete internal handoff before assigning implementation.

## Presets

OpenCode presets map models and variants to agents. The installer generates an
OpenAI preset by default:

```json
{
  "preset": "openai",
  "presets": {
    "openai": {
      "orchestrator": { "model": "openai/gpt-5.4" },
      "oracle": { "model": "openai/gpt-5.4", "variant": "high" },
      "librarian": { "model": "openai/gpt-5.4-mini", "variant": "low" },
      "explorer": { "model": "openai/gpt-5.4-mini", "variant": "low" },
      "designer": { "model": "openai/gpt-5.4-mini", "variant": "medium" },
      "quick": { "model": "openai/gpt-5.4-mini", "variant": "low" },
      "deep": { "model": "openai/gpt-5.4", "variant": "high" }
    }
  }
}
```

Switch OpenCode presets with either:

- the `preset` field in config
- `THOTH_AGENTS_PRESET` in the environment

For OpenCode provider examples, see
[Provider Configurations](provider-configurations.md). For Codex role model
customization, see [Codex Model Customization](codex-model-customization.md).

### Fallback / Failover

Runtime failover is configured separately from presets in OpenCode config:

```jsonc
{
  "fallback": {
    "enabled": true,
    "timeoutMs": 15000,
    "retryDelayMs": 500,
    "chains": {
      "orchestrator": [
        "openai/gpt-5.4",
        "anthropic/claude-sonnet-4-6",
        "google/gemini-3.1-pro"
      ],
      "deep": [
        "openai/gpt-5.4",
        "github-copilot/claude-opus-4.6"
      ]
    }
  }
}
```

Available chain keys are `orchestrator`, `oracle`, `designer`, `explorer`,
`librarian`, `quick`, and `deep`.

## Bundled Skills

Bundled skills are shared thoth-agents content. OpenCode copies them into the
OpenCode skills directory when `--skills=yes`. Codex packages them as
plugin-bundled skills for the Personal plugin source.

### Requirements Interview

`requirements-interview` is step 0 in the orchestrator prompt. It clarifies
ambiguous work before implementation through a six-phase discovery interview:

1. Context gathering
2. Interview
3. Scope assessment
4. Approach proposal
5. User approval
6. Handoff

Use it when the work is open-ended, spans multiple parts of the system, or needs
scope calibration before coding.

### SDD Pipeline Skills

| Skill | Purpose |
| --- | --- |
| `sdd-init` | Bootstrap OpenSpec structure and SDD context |
| `sdd-propose` | Create or update `proposal.md` |
| `sdd-spec` | Write OpenSpec delta specs with RFC 2119 requirements |
| `sdd-design` | Produce `design.md` with technical decisions |
| `sdd-tasks` | Generate phased `tasks.md` checklists |
| `sdd-apply` | Execute assigned checklist items and report progress |
| `sdd-verify` | Build verification and compliance reports |
| `sdd-archive` | Merge verified deltas into main specs and archive the change |

### Plan Reviewer

`plan-reviewer` is used after `sdd-tasks` to validate whether a task plan is
actually executable.

- Returns `[OKAY]` when the plan is executable
- Returns `[REJECT]` only for real blockers
- Limits rejections to at most 3 blocking issues
- After `[OKAY]`, the orchestrator asks the user before starting `sdd-apply`

### Executing-Plans

`executing-plans` owns progress tracking during task execution. The coordinator
updates task state; execution sub-agents report structured results but do not
edit checkboxes themselves.

Recognized task states:

- `- [ ]` pending
- `- [~]` in progress
- `- [x]` completed
- `- [-]` skipped with reason

## Recommended External Skills

These are not bundled in `src/skills/`, but they pair well with the workflow.

| Skill | Status | Typical use |
| --- | --- | --- |
| `simplify` | Installed by `--skills=yes` in OpenCode setup | Keep implementations lean |
| `playwright-cli` | Installed by `--skills=yes` in OpenCode setup | Browser automation for `designer` |
| `test-driven-development` | Optional companion | Useful before `deep` implements fixes or features |
| `systematic-debugging` | Optional companion | Useful for `oracle` and `deep` bug diagnosis |

## SDD Pipeline

Primary flow:

```text
sdd-init (if needed) -> sdd-explore -> propose -> spec -> clarify -> design -> tasks -> apply -> verify -> archive
```

Routing is based on complexity dimensions, not file count:

- low complexity: direct implementation
- moderate complexity: accelerated SDD, usually `propose -> tasks`
- high complexity: full SDD pipeline

Plan review happens after `sdd-tasks` and before execution. Progress tracking is
handled through `executing-plans`.

See [SDD Pipeline](sdd-pipeline.md) for the full workflow.

## Artifact Store Policy

Use `artifactStore.mode` to control where SDD artifacts persist.

| Mode | Writes to | Token cost | Best for |
| --- | --- | --- | --- |
| `thoth-mem` | thoth memory only | Low | Fast planning with no repo artifact files |
| `openspec` | `openspec/` only | Medium | Reviewable spec files in the repository |
| `hybrid` | both | High | Maximum durability and recovery |
| `none` | Neither | Lowest | Ephemeral iterations, no persistence |

```json
{
  "artifactStore": {
    "mode": "hybrid"
  }
}
```

Default mode is `hybrid`.

Recall funnel for thoth-mem:

1. `mem_recall(mode="compact")` — scan candidate IDs/titles with topic-key or
   query filters.
2. `mem_recall(mode="context")` — expand strongest hits into retrieved context.
3. `mem_get(id=..., include_timeline=true)` — fetch full content and timeline
   context when chronology matters.

Use HyDE/fused hybrid recall (sentence + chunk vectors, FTS, KG enrichment) for
semantic or ambiguous searches; set `mem_recall` `limit` from 1 to 20; narrow
with `topic_key`, `type`, `time_from`, `time_to`, `scope`, `project`, and
`session_id` filters. Use `mem_get` with `kind="observation"|"prompt"`,
`include_timeline=true` plus `before`/`after`, and `offset`/`max_length` for
large content. Use bounded `mem_context(recall_query=...)` or
`mem_project(action="graph"|"topics"|"topic")` for supplemental project
context; `mem_project(action="graph")` relations are `HAS_TYPE`, `IN_PROJECT`,
`HAS_TOPIC_KEY`, `HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, and `HAS_LEARNED`.

## MCP Servers

Built-in MCPs:

| MCP | Purpose | Auth / runtime |
| --- | --- | --- |
| `exa` | Exa-backed web search | Optional `EXA_API_KEY` |
| `context7` | Official library documentation lookup | Optional `CONTEXT7_API_KEY` |
| `grep_app` | Public GitHub code search | No auth required |
| `thoth_mem` | Local persistent memory and SDD artifact storage | Local `npx thoth-mem@latest` |

Disable any built-in MCP globally with `disabled_mcps` where the generated
harness config supports it:

```json
{
  "disabled_mcps": ["exa"]
}
```

## Task Delegation

The workflow is shared; the runtime binding differs.

| Concept | OpenCode | Codex |
| --- | --- | --- |
| Specialist dispatch | Native `task` tool creates child sessions. | Installed role subagents plus prompt/plugin guidance. |
| Parallel discovery | Multiple independent `task` calls can be launched together and awaited. | Depends on the active Codex workflow; no OpenCode `task` parity is claimed. |
| Background work | Experimental `task(background=true)` only for `explorer` and `librarian` when enabled. | Not claimed. |
| Blocking choices | OpenCode `question` tool. | `request_user_input` when enabled and available in Default mode. |

Delegation should reduce repeated investigation:

- Write every sub-agent prompt in English, even when replying to the user in
  another language.
- Send `explorer` and `librarian` narrow fact-finding prompts.
- Prefer 2-3 independent probes when questions can be answered separately.
- Pass a synthesized handoff to write-capable agents.
- Retry failed or incomplete delegations once with a sharper prompt.

## Tmux Integration

Tmux integration is OpenCode-scoped. It watches OpenCode child `task` sessions
and opens panes for live monitoring when enabled:

```json
{
  "tmux": {
    "enabled": true,
    "layout": "main-vertical",
    "main_pane_size": 60
  }
}
```

Run OpenCode with a matching port:

```bash
tmux
export OPENCODE_PORT=4096
opencode --port 4096
```

This does not imply Codex tmux support. See
[Tmux Integration](tmux-integration.md).

## Prompt Overriding

OpenCode prompt overrides live in:

```text
~/.config/opencode/thoth-agents/
```

Supported files:

| File | Effect |
| --- | --- |
| `{agent}.md` | Replace the default prompt |
| `{agent}_append.md` | Append to the default prompt |

If `preset` is set, the loader checks the preset subdirectory first:

```text
~/.config/opencode/thoth-agents/{preset}/
```

Codex prompt and role customization is handled through generated Codex agent
TOML files and plugin-bundled guidance. See
[Codex Install](codex-install.md).

## Key Configuration Fields

| Field | Type | Default | Harness | Notes |
| --- | --- | --- | --- | --- |
| `preset` | string | unset | OpenCode | Selects a preset under `presets` |
| `presets` | object | unset | OpenCode | Named agent model maps |
| `presets.<name>.<agent>.model` | string or array | unset | OpenCode | Model ID or priority model array |
| `presets.<name>.<agent>.variant` | string | unset | OpenCode | Reasoning effort hint |
| `tmux.enabled` | boolean | `false` | OpenCode | Enables pane spawning |
| `tmux.layout` | string | `main-vertical` | OpenCode | Tmux layout |
| `fallback.enabled` | boolean | `true` | OpenCode | Runtime model failover |
| `thoth.command` | string[] | `['pnpm', 'dlx', 'thoth-mem@latest']` | OpenCode config / shared concept | Local thoth MCP command |
| `artifactStore.mode` | string | `hybrid` | Shared concept | SDD artifact persistence target |
| `disabled_mcps` | string[] | `[]` | Generated harness config | Globally disable built-in MCPs where supported |

## Related Docs

- [Installation Guide](installation.md)
- [Provider Configurations](provider-configurations.md)
- [SDD Pipeline](sdd-pipeline.md)
- [Skills and MCPs](skills-and-mcps.md)
- [Codex Install](codex-install.md)
