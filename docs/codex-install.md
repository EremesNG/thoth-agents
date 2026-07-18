# Codex Install

Codex is an explicit thoth-agents harness. OpenCode remains the default.

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

The CLI is the supported install path because the Codex plugin source alone
cannot install the mandatory external skills.

## Managed targets

User-scope installation manages:

- `~/.codex/AGENTS.md`: a bounded root-instruction block. Existing text outside
  the block is preserved.
- `~/.codex/agents/thoth-agents-{role}.toml`: nine custom agents:
  `explorer`, `librarian`, `oracle`, `sdd-specify`, `sdd-plan`, `sdd-tasks`,
  `designer`, `quick`, and `deep`.
- `~/.codex/agents/.thoth-agents-managed-models.json`: thoth-agents model
  ownership state.
- `~/.codex/plugins/thoth-agents/`: deterministic Personal plugin source.
- `~/.agents/plugins/marketplace.json`: one managed local source entry while
  preserving unrelated marketplaces.
- `~/.codex/config.toml`: a backed-up merge that enables
  `features.default_mode_request_user_input`.
- `~/.codex/skills/{simplify,tdd,progressive-context-router,architectural-grilling}/`:
  required global skills.

The ambient Codex session is the adaptive root, so no orchestrator child TOML is
generated.

## Delegation binding

Root instructions use the current direct collaboration tools:

- `collaboration.spawn_agent`
- `collaboration.wait_agent`
- `collaboration.list_agents`
- `collaboration.send_message`
- `collaboration.followup_task`
- `collaboration.interrupt_agent`

The collaboration surface does not provide a hard installed-role selector.
thoth-agents carries the role in a prefixed task name and a self-contained
message, while the generated custom-agent TOMLs remain available as Codex agent
definitions. Collaboration tools are direct tools and must not be invoked from
inside `functions.exec`.

Children never delegate. The root maintains one writer per mutable surface and
parallelizes only independent work.

## SDD in Codex

The root selects direct, accelerated, or full SDD. The three phase roles are real
Codex custom agents, not plugin-bundled phase skills:

- `sdd-specify` writes requirements artifacts under `openspec/`;
- `sdd-plan` writes the technical plan and optional support artifacts; and
- `sdd-tasks` writes dependency-ordered tasks.

The accelerated route remains available for bounded multi-file or moderate-risk
work. See [SDD Pipeline](sdd-pipeline.md).

## Mandatory skills

The installer runs the skills CLI with `--agent codex --global --yes` for
`simplify`, `tdd`, `progressive-context-router`, and `architectural-grilling`.
Codex plugin marketplace npm sources do not execute npm lifecycle scripts, so a
plugin `postinstall` cannot enforce this dependency contract. Browser and QA
executables remain project-owned.

Missing skills make Codex status drift and block a successful install/update/sync
result.

## Plugin and trust review

After installation, restart Codex and inspect:

```text
/plugins
/hooks
```

The installer registers a Personal marketplace source but does not guess a
plugin identifier or silently bypass plugin/hook trust. Higher-precedence project,
profile, CLI, system, or admin configuration may override user configuration.

`request_user_input` is expected in Default mode when
`features.default_mode_request_user_input = true`; other modes may expose a
different surface. Every thoth-agents call omits `autoResolutionMs`.

## Dry-run and reset

`--dry-run` prints root, role, package, marketplace, config, and required-skill
actions without writing files or running skill installation.

`--reset` repairs only thoth-agents-managed blocks, TOML files, model state,
plugin assets, marketplace entry, and configuration keys. It does not delete
unrelated Codex files, plugins, skills, or provider configuration.

## Provider boundary

thoth-mem is independent. Its plugin owns memory hooks, MCP, lifecycle,
persistence, and recovery. Codex packaging here reports only provider-neutral,
evidence-based capability outcomes.
