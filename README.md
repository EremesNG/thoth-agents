<div align="center">
  <img src="img/team.png" alt="thoth-agents agents" width="420">
  <p><i>Seven specialized agents, one orchestrator — delegate any task to the right specialist and ship faster.</i></p>
  <p><b>thoth-agents</b> · Delegate-first orchestration · Thoth-mem persistence · Bundled SDD pipeline</p>
</div>

---

Delegate-first OpenCode plugin with a seven-agent roster, root-session
`thoth_mem` persistence, native task delegation, bundled
requirements-interview, and a full SDD workflow.

thoth-agents keeps the `orchestrator` lean, pushes discovery into
specialists, persists important context, and ships the planning skills needed
to move from ambiguous requests to verified implementation.

## 📦 Installation

### Quick start

```bash
bunx thoth-agents@latest install
bunx thoth-agents@latest install --agent=opencode
opencode auth login
opencode
```

Then ask OpenCode to verify the roster:

```text
ping all agents
```

### Non-interactive install

```bash
bunx thoth-agents@latest install --no-tui --tmux=no --skills=yes
```

### Codex agent-pack setup

Codex support is explicit and separate from the native OpenCode plugin install:

```bash
bunx thoth-agents@latest install --agent=codex --dry-run
bunx thoth-agents@latest install --agent=codex
```

The Codex installer composes ambient/root guidance into `~/.codex/AGENTS.md`,
materializes six role subagents, refreshes the Personal plugin source under
`~/.codex/plugins/thoth-agents/`, and asks you to review plugin and hook
trust with `/plugins` and `/hooks`. It does not install a
selectable Codex orchestrator agent or bypass Codex trust review.

### Reset an existing generated config

```bash
bunx thoth-agents@latest install --reset
```

When skills are enabled, the installer adds the recommended external skills and
copies the bundled requirements-interview, plan-reviewer, executing-plans, and
SDD skills into your OpenCode skills directory.

### For LLM agents

Use the installer directly:

```bash
bunx thoth-agents@latest install --no-tui --tmux=no --skills=yes
```

Or hand another coding agent this README:

```text
Install and configure thoth-agents by following:
https://raw.githubusercontent.com/EremesNG/thoth-agents/refs/heads/master/README.md
```

### JSON Schema

The package ships `thoth-agents.schema.json` for editor autocomplete and
validation:

```jsonc
{
  "$schema": "https://unpkg.com/thoth-agents@latest/thoth-agents.schema.json"
}
```

See [docs/installation.md](docs/installation.md) and
[docs/provider-configurations.md](docs/provider-configurations.md) for the full
OpenCode setup flow. See [docs/codex-install.md](docs/codex-install.md) for
Codex install targets, backups, dry-run behavior, and limitations.

## 🏛️ Seven-Agent Roster

The delegate-first philosophy is simple: the `orchestrator` coordinates while
specialists execute. Independent specialists can be launched in parallel, but
native OpenCode `task` calls are awaited before orchestration continues.
Advisory and write-capable work stays bounded so review, undo safety, and
verification remain straightforward.

For blocking user decisions, the `orchestrator` uses a `question` tool —
agents do not ask those questions in plain text. Independent work can be
launched together when parallel dispatch is safe, and failed delegations are
retried once before being reported back to the user.

### 🔑 Primary Agent

<table width="100%">
  <tr>
    <td width="100%" valign="top">
      <img src="img/orchestrator.png" width="100%" alt="Orchestrator">
      <br>
      <b>Orchestrator</b>
      <br>
      <i>Root coordinator and sole primary agent.</i>
      <br><br>
      <b>Role:</b> The root coordinator. Handles delegation, sequencing, memory ownership, and SDD progress tracking. Does not read or modify source files directly.
      <br>
      <b>Mode:</b> primary, non-mutating
      <br>
      <b>Dispatch:</b> sync coordinator
      <br>
      <b>Recommended:</b>
      <br>
      <code>anthropic/claude-opus-4-6</code> · <code>openai/gpt-5.4</code> · <code>kimi-for-coding/k2p5</code>
      <br>
      <b>Personality:</b> Autonomous deep coordinator — multi-agent reasoning, works through delegation
    </td>
  </tr>
</table>

### 🛠️ Specialist Subagents

<table width="100%">
  <tr>
    <td width="33%" valign="top">
      <img src="img/explorer.png" width="100%" alt="Explorer">
      <br>
      <b>Explorer</b>
      <br>
      <i>Speed runner — fast parallel grep, codebase search.</i>
      <br><br>
      <b>Role:</b> Local codebase discovery and navigation. Fast parallel search, file reading, symbol lookup.
      <br>
      <b>Mode:</b> read-only
      <br>
      <b>Dispatch:</b> <code>task</code>
      <br>
      <b>Recommended:</b>
      <br>
      <code>Grok Code Fast</code> · <code>openai/gpt-5.4-nano</code> · <code>anthropic/claude-haiku-4-5</code>
    </td>
    <td width="33%" valign="top">
      <img src="img/librarian.png" width="100%" alt="Librarian">
      <br>
      <b>Librarian</b>
      <br>
      <i>All-rounder — large context + decent speed for research.</i>
      <br><br>
      <b>Role:</b> External docs and API research. Fetches documentation, finds public examples, validates version-specific behavior.
      <br>
      <b>Mode:</b> read-only
      <br>
      <b>Dispatch:</b> <code>task</code>
      <br>
      <b>Recommended:</b>
      <br>
      <code>openai/gpt-5.4</code> · <code>anthropic/claude-sonnet-4-6</code> · <code>google/gemini-3.1-pro-preview</code>
    </td>
    <td width="33%" valign="top">
      <img src="img/oracle.png" width="100%" alt="Oracle">
      <br>
      <b>Oracle</b>
      <br>
      <i>Deep reasoner — maximum strategic thinking capability.</i>
      <br><br>
      <b>Role:</b> Strategic advisor for debugging, architecture review, code review, and SDD plan review.
      <br>
      <b>Mode:</b> read-only
      <br>
      <b>Dispatch:</b> sync via <code>task</code>
      <br>
      <b>Recommended:</b>
      <br>
      <code>openai/gpt-5.4</code> · <code>anthropic/claude-opus-4-6</code> · <code>opencode-go/glm-5</code>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <img src="img/designer.png" width="100%" alt="Designer">
      <br>
      <b>Designer</b>
      <br>
      <i>Visual/multimodal — UI/UX reasoning, frontend engineering.</i>
      <br><br>
      <b>Role:</b> UI/UX implementation with visual verification. Owns approach, execution, and browser-based quality checks.
      <br>
      <b>Mode:</b> write-capable
      <br>
      <b>Dispatch:</b> sync via <code>task</code>
      <br>
      <b>Recommended:</b>
      <br>
      <code>google/gemini-3.1-pro-preview</code> · <code>opencode-go/glm-5</code> · <code>kimi-for-coding/k2p5</code>
    </td>
    <td width="33%" valign="top">
      <img src="img/quick.png" width="100%" alt="Quick">
      <br>
      <b>Quick</b>
      <br>
      <i>Speed runner — well-defined tasks, fast turnaround.</i>
      <br><br>
      <b>Role:</b> Fast implementation for well-defined, bounded tasks. Optimized for speed over thoroughness.
      <br>
      <b>Mode:</b> write-capable
      <br>
      <b>Dispatch:</b> sync via <code>task</code>
      <br>
      <b>Recommended:</b>
      <br>
      <code>openai/gpt-5.4-mini</code> · <code>anthropic/claude-haiku-4-5</code> · <code>google/gemini-3-flash-preview</code>
    </td>
    <td width="33%" valign="top">
      <img src="img/deep.png" width="100%" alt="Deep">
      <br>
      <b>Deep</b>
      <br>
      <i>Deep specialist — maximum coding capability for complex tasks.</i>
      <br><br>
      <b>Role:</b> Thorough implementation and verification. Handles correctness-critical, multi-file, edge-case-heavy work.
      <br>
      <b>Mode:</b> write-capable
      <br>
      <b>Dispatch:</b> sync via <code>task</code>
      <br>
      <b>Recommended:</b>
      <br>
      <code>openai/gpt-5.4</code> · <code>anthropic/claude-opus-4-6</code> · <code>google/gemini-3.1-pro-preview</code>
    </td>
  </tr>
</table>

## 🧩 What thoth-agents Adds

- Delegate-first orchestration with context isolation across specialists
- `thoth_mem` persistence for root-session memory workflows
- Bundled SDD pipeline: `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`,
  `sdd-apply`, `sdd-verify`, `sdd-archive`
- Requirements-interview skill for clarifying ambiguous work before implementation
- `plan-reviewer` for oracle review loops on task plans
- `executing-plans` for task-state ownership and progress tracking
- Tmux integration for real-time agent monitoring
- Configurable presets, fallback chains, prompt overriding, and artifact-store
  modes

## SDD Pipeline

The bundled SDD workflow follows this path:

```text
propose -> [spec || design] -> tasks -> apply -> verify -> archive
```

For medium work, the requirements interview can route into an accelerated path that starts at
`propose -> tasks`. For complex work, the full path is used.

Artifacts can be persisted in four modes:

| Mode | Writes to | Cost | Use when |
| --- | --- | --- | --- |
| `thoth-mem` | Memory only | Low | Fast iteration without repo planning files |
| `openspec` | `openspec/` files only | Medium | Reviewable planning artifacts in the repo |
| `hybrid` | Both | High | Maximum durability; default |
| `none` | Neither | Lowest | Ephemeral iterations, no persistence |

After `sdd-tasks`, the orchestrator can run an oracle review loop with
`plan-reviewer`:

1. Generate `tasks.md`
2. Dispatch oracle with `plan-reviewer`
3. If result is `[REJECT]`, fix only the blocking issues
4. Repeat until `[OKAY]`
5. Continue into execution

During execution, `executing-plans` owns task-state tracking. Progress has two
mandatory layers: `todowrite` for the visual task list, plus a persistent SDD
artifact via `tasks.md` checkboxes and/or `thoth_mem`.

- `- [ ]` pending
- `- [~]` in progress
- `- [x]` completed
- `- [-]` skipped with reason

## Requirements Interview

The bundled `requirements-interview` skill is the front door for ambiguous or substantial
work. It is step-0 in the orchestrator prompt and runs before implementation when the
request is open-ended, spans multiple parts of the system, or needs scope calibration.

Its workflow is six phases:

1. Context gathering
2. Interview
3. Scope assessment
4. Approach proposal
5. User approval
6. Handoff

After clarification, the skill routes the work into direct implementation, accelerated
SDD, or full SDD based on complexity assessment.

## 🧩 Skills & MCP Servers

### Bundled skills

| Skill | Category | Purpose |
| --- | --- | --- |
| `requirements-interview` | Clarification | Clarify intent, assess scope, and choose direct work vs accelerated or full SDD |
| `plan-reviewer` | Review | Validate `tasks.md` for real execution blockers and return `[OKAY]` or `[REJECT]` |
| `sdd-init` | SDD | Bootstrap OpenSpec structure and SDD context for a project |
| `sdd-propose` | SDD | Create or update `proposal.md` |
| `sdd-spec` | SDD | Write OpenSpec delta specs with RFC 2119 requirements and scenarios |
| `sdd-design` | SDD | Produce `design.md` with technical decisions and file changes |
| `sdd-tasks` | SDD | Generate phased `tasks.md` checklists |
| `sdd-apply` | SDD | Execute assigned SDD tasks and report structured results |
| `executing-plans` | Execution | Run task lists with durable progress tracking and verification checkpoints |
| `sdd-verify` | Verification | Create compliance-oriented verification reports |
| `sdd-archive` | Archive | Merge verified deltas into main specs and archive the change |

### Recommended external skills

| Skill | Status | Typical use |
| --- | --- | --- |
| `simplify` | Installed by `--skills=yes` | Keep solutions lean and reduce unnecessary complexity |
| `playwright-cli` | Installed by `--skills=yes` | Browser automation for `designer` visual checks |
| `test-driven-development` | Optional companion | Useful before implementing bug fixes or features with `deep` |
| `systematic-debugging` | Optional companion | Useful for `oracle` and `deep` when failures need disciplined diagnosis |

### Built-in MCP servers

| MCP | Purpose | Auth / runtime |
| --- | --- | --- |
| `exa` | Exa-backed web search | Optional `EXA_API_KEY` via env |
| `context7` | Official library and framework docs | Optional `CONTEXT7_API_KEY` via env |
| `grep_app` | Public GitHub code search | No auth required |
| `thoth_mem` | Local persistent memory and artifact storage | Local command, default `npx -y thoth-mem@latest` |

> **🧠 [Thoth-Mem](https://github.com/EremesNG/thoth-mem)** is a persistent
> memory MCP server purpose-built for cross-session context. The orchestrator
> uses it to save architectural decisions, bug-fix learnings, SDD artifacts,
> and session summaries so the next session picks up where the last one left
> off — even after context-window compaction. It is included by default and
> runs locally via `npx`.

For targeted retrieval, Thoth-Mem uses a 3-layer recall protocol:

1. `mem_search` — scan the compact index of IDs and titles
2. `mem_timeline` — inspect chronological context around candidates
3. `mem_get_observation` — read full content for selected records

After task completion, an automatic save nudge reminds the orchestrator to
persist important observations. Session start also degrades gracefully if
`thoth_mem` is unavailable, so memory errors do not block the main plugin flow.

Skill and MCP access in this project is prompt-driven. The generated plugin
config focuses on model presets and runtime options rather than per-agent
permission matrices.

## 📚 Documentation

- [docs/installation.md](docs/installation.md)
- [docs/provider-configurations.md](docs/provider-configurations.md)
- [docs/tmux-integration.md](docs/tmux-integration.md)
- [docs/quick-reference.md](docs/quick-reference.md)
- [docs/sdd-pipeline.md](docs/sdd-pipeline.md)
- [docs/skills-and-mcps.md](docs/skills-and-mcps.md)
- [AGENTS.md](AGENTS.md)

## Development

The project targets `@opencode-ai/plugin` and `@opencode-ai/sdk` v1.3.3.

| Command | Purpose |
| --- | --- |
| `bun run build` | Build TypeScript into `dist/` |
| `bun run typecheck` | Run TypeScript type checking without emit |
| `bun test` | Run the Bun test suite |
| `bun run lint` | Run Biome linter |
| `bun run format` | Run Biome formatter |
| `bun run check` | Run Biome check with auto-fix |
| `bun run check:ci` | Run Biome check without writes |
| `bun run dev` | Build and launch the plugin in local dev mode |

## 📄 License

MIT
