# Codex Install

Codex is an explicit thoth-agents harness. OpenCode remains the default.

Installation has two required surfaces: the repository marketplace delivers the
Codex plugin, while the thoth-agents CLI materializes the ambient root, custom
subagents, feature configuration, model state, and mandatory external skills.
Neither layer replaces the other.

## 1. Register and install the native plugin

Run this from an interactive Codex terminal:

```bash
codex plugin marketplace add EremesNG/thoth-agents
```

Restart Codex, open `/plugins`, and install or enable `thoth-agents`. The catalog
is versioned at `.agents/plugins/marketplace.json` and points to
`./integrations/codex`; it is not synthesized into a personal marketplace. The
plugin contributes the packaged thoth-agents research MCP configuration.

## 2. Materialize the CLI-owned orchestration surfaces

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI prints the native marketplace command but does not copy files into
`~/.codex/plugins` or merge `~/.agents/plugins/marketplace.json`. Codex owns its
marketplace snapshots, installed-plugin cache, enablement, and trust decisions.

The CLI step is mandatory even when `/plugins` already reports a healthy native
plugin. Codex plugins do not materialize the global root contract, standalone
custom-agent TOMLs, managed feature configuration, or external global skills
used by thoth-agents.

## CLI-managed targets

User-scope installation manages:

- `~/.codex/AGENTS.md`: one bounded root-instruction block; unrelated text is
  preserved.
- `~/.codex/agents/thoth-agents-{role}.toml`: nine custom agents:
  `explorer`, `librarian`, `oracle`, `sdd-specify`, `sdd-plan`, `sdd-tasks`,
  `designer`, `quick`, and `deep`.
- `~/.codex/agents/.thoth-agents-managed-models.json`: model ownership state.
- `~/.codex/config.toml`: a backed-up merge that enables
  `features.default_mode_request_user_input`.
- `~/.codex/skills/{simplify,tdd,progressive-context-router,architectural-grilling}/`:
  required global skills.

The ambient Codex session is the adaptive root, so no orchestrator child TOML is
generated.

## 3. Restart and verify

Restart Codex after the CLI applies user configuration, then inspect:

```text
/plugins
/hooks
```

Run a complete drift check from the terminal:

```bash
npx thoth-agents@latest status --harness=codex
```

## Delegation and SDD

Root instructions use Codex collaboration tools directly. The collaboration
surface does not provide a hard installed-role selector, so thoth-agents carries
the role in a prefixed task name and self-contained message; the generated TOMLs
remain available as native custom-agent definitions. Children never delegate.

The root selects direct, accelerated, or full SDD. The three phase roles are
custom agents, not plugin-bundled phase skills:

- `sdd-specify` owns requirements artifacts under `openspec/`;
- `sdd-plan` owns the technical plan and optional support artifacts; and
- `sdd-tasks` owns dependency-ordered tasks.

The accelerated route remains available for bounded multi-file or moderate-risk
work. See [SDD Pipeline](sdd-pipeline.md).

## Mandatory skills

The installer runs the skills CLI with `--agent codex --global --yes` for
`simplify`, `tdd`, `progressive-context-router`, and `architectural-grilling`.
Codex plugin marketplace sources do not provide a reliable package lifecycle for
this dependency contract, so plugin installation alone is incomplete until the
CLI confirms all four skills.

## Trust review and limitations

Registration never bypasses plugin/hook trust. Higher-precedence project,
profile, CLI, system, or admin configuration may override user configuration.
`request_user_input` is expected in Default mode when
`features.default_mode_request_user_input = true`; every thoth-agents call omits
`autoResolutionMs`.

Additional constraints:

- The ambient session is the root; there is no `orchestrator` child TOML.
- Global `~/.codex/AGENTS.md` guidance loads automatically, but a more specific
  repository or subtree `AGENTS.md` can take precedence.
- Custom-agent TOMLs are native configuration layers. The collaboration runtime
  does not expose a hard installed-role selector, so role matching remains
  partly instruction-level.
- Project-scoped `.codex/` configuration and hooks load only for trusted
  projects. User, system, and managed policy remain separate.
- The CLI enables only the managed feature needed for Default-mode user input;
  it does not claim broad feature or enforcement parity with OpenCode.
- Plugin installation does not include thoth-mem or project QA executables.

## Dry-run and reset

`--dry-run` prints root, role, config, marketplace guidance, and required-skill
actions without writing or installing anything.

`--reset` repairs only CLI-managed blocks, TOMLs, model state, and configuration
keys. It does not delete or rewrite Codex marketplace snapshots, plugin caches,
unrelated skills, or provider configuration.

## Provider boundary

thoth-mem is independent. Its plugin owns memory hooks, MCP, lifecycle,
persistence, and recovery. Codex packaging here reports only provider-neutral,
evidence-based capability outcomes.

## Upstream references

- [Codex plugins](https://learn.chatgpt.com/docs/plugins)
- [Codex plugin marketplace commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-plugin-marketplace)
- [Codex `AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
