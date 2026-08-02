# Research: Existing Install and Update Semantics

## Confirmed findings

| Harness | Explicit `install --agent=...` | Current applied Update | Confirmed gap |
| --- | --- | --- | --- |
| OpenCode | Configures the plugin and default agents, writes managed config, synchronizes packaged thoth-owned skills, installs required external skills, and invokes thoth-mem setup. | Rewrites only the OpenCode plugin entry to `thoth-agents@latest`. | Managed config, owned skills, external skills, and provider setup are omitted. |
| Codex | Uses the native plugin manager first, then writes the global root/agent pack, installs required external skills, and invokes thoth-mem setup. | Refreshes the global agent-pack setup and required external skills. | Native plugin-manager setup and provider setup are omitted. |
| Claude Code | Uses the native marketplace/plugin manager, installs required external skills, and invokes thoth-mem setup. | Refreshes the native marketplace/plugin and required external skills. | Provider setup is omitted. |

The interactive TUI and the public `update --apply` command share the operation-plan apply functions. Neither path currently delegates to the explicit installer. Existing tests verify individual plan behavior but do not assert complete install/update parity.

## Ownership constraints

- Codex and Claude Code native managers own marketplace discovery, plugin cache, enablement, trust, and their normal marketplace update behavior.
- Codex's plugin manifest cannot install the six global specialist agent TOMLs or the orchestrator block in `~/.codex/AGENTS.md`; the CLI must refresh those surfaces.
- OpenCode's npm plugin loading does not expose package-relative native skill roots; the CLI must refresh the packaged thoth-owned skills globally.
- Required external skills remain CLI-installed from canonical repositories for every harness.
- thoth-mem remains independently owned; thoth-agents may only invoke and validate its public setup result.

## Design consequence

Native marketplace versions cannot prove that the CLI-managed supplemental surfaces match the same release. The CLI therefore needs a separate per-harness record of the last package version that completed the entire CLI-owned plus provider setup sequence. Native marketplace updates remain valid and do not mutate that record.

## Inspected seams

- `src/cli/install.ts`: explicit harness installation and provider finalization.
- `src/cli/operations/opencode.ts`: OpenCode status, install/update/sync plans, and apply behavior.
- `src/cli/operations/codex.ts`: Codex operation plans and global agent-pack apply behavior.
- `src/cli/operations/claude-code.ts`: Claude native operation plans and apply behavior.
- `src/cli/commands.ts`: public operation preview/apply dispatch.
- `src/cli/tui/operations.ts` and `src/cli/tui/App.tsx`: interactive operation dispatch and confirmation.
- `src/hooks/auto-update-checker/`: current background config rewrite, cache invalidation, and package installation.

## Rejected interpretations

- Treating a newer Codex or Claude marketplace plugin as proof of a complete thoth-agents CLI refresh: rejected because separately installed agents, skills, and provider setup may remain stale.
- Continuing OpenCode runtime self-installation after exact version pinning: rejected by user decision; the runtime becomes notification-only.
- Using `thoth-agents@latest` as a fallback when package metadata cannot be resolved: rejected because it defeats deterministic installation.
