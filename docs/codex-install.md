# Codex Install

Codex is an explicit thoth-agents harness. OpenCode remains the default.

Installation has two native surfaces: the repository marketplace delivers the
Codex plugin, while the thoth-agents CLI materializes the ambient root, custom
subagents, feature gate, and mandatory external skills.

## Register the repository marketplace

Run this from an interactive Codex terminal:

```bash
codex plugin marketplace add EremesNG/thoth-agents
```

Restart Codex, open `/plugins`, and install or enable `thoth-agents`. The catalog
is versioned at `.agents/plugins/marketplace.json` and points to
`./integrations/codex`; it is not synthesized into a personal marketplace.

## Materialize the Codex orchestration surfaces

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI prints the native marketplace command but does not copy files into
`~/.codex/plugins` or merge `~/.agents/plugins/marketplace.json`. Codex owns its
marketplace snapshots, installed-plugin cache, enablement, and trust decisions.

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

## Trust review

After both installation surfaces are complete, restart Codex and inspect:

```text
/plugins
/hooks
```

Registration never bypasses plugin/hook trust. Higher-precedence project,
profile, CLI, system, or admin configuration may override user configuration.
`request_user_input` is expected in Default mode when
`features.default_mode_request_user_input = true`; every thoth-agents call omits
`autoResolutionMs`.

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
