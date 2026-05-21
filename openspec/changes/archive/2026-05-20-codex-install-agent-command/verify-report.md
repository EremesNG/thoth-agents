# Verification Report: Codex Install Agent Command

## Completeness

- Tasks artifact is fully checked off for tasks 1.1 through 5.3.
- Implementation adds `install --agent=opencode|codex` with OpenCode as the
  default and a separate Codex setup-plan/apply path.
- Verification found no blocking gaps against the approved proposal, spec, and
  design.

## Build and Test Evidence

- `bun run check:ci` — passed.
- `bun run typecheck` — passed.
- `bun test src/cli src/harness/adapters/codex.test.ts src/harness/adapters/codex-surfaces.test.ts src/harness/writers/codex-plugin-package.test.ts` — passed, 120 tests.
- `bun test` — passed, 511 tests.
- Static inspection covered `src/cli/index.ts`, `src/cli/install.ts`,
  `src/cli/codex-install.ts`, `src/cli/codex-paths.ts`,
  `src/cli/codex-config-io.ts`, `src/harness/adapters/codex.ts`,
  `src/harness/writers/codex-plugin-package.ts`, `docs/codex-install.md`, and
  `docs/codex-plugin-packaging.md`.

## Compliance Matrix

| Spec scenario | Verdict | Evidence |
| --- | --- | --- |
| Bare install remains OpenCode-compatible | Compliant | `parseCliArgs([])` defaults to `{ agent: 'opencode' }`; `install()` dispatches non-Codex agents to existing `runInstall`; full tests pass. |
| Explicit OpenCode agent preserves behavior | Compliant | `parseCliArgs(['install', '--agent=opencode'])`; `createInstallConfig` still preserves existing OpenCode options; Codex branch is only selected for `agent === 'codex'`. |
| Explicit Codex agent does not mutate OpenCode config | Compliant | `install()` Codex branch builds/applies `buildCodexSetupPlan` only; it does not call OpenCode config-manager mutation functions. |
| Explicit Codex agent routes to Codex installer | Compliant | CLI parser accepts `--agent=codex`, rejects unsupported values with supported-agent diagnostic, and `install()` dispatches to Codex setup. |
| Codex install prepares the plugin package | Compliant | `buildCodexSetupPlan` consumes `codexAdapter.render()` `.codex-plugin/` artifacts; `applyCodexSetup` writes deterministic package artifacts; tests assert `plugin.json` output. |
| Undocumented plugin cache writes are avoided | Compliant | Codex package targets are under configured `.codex-plugin`; docs and diagnostics direct users to `/plugins`; no cache target path is generated. |
| Docs-backed plugin config entries are gated | Compliant | `mergeCodexManagedConfig` writes `[plugins."..."]` only when `pluginId` is supplied; otherwise emits `/plugins` guidance. |
| Plugin manifest excludes custom agents | Compliant | `CODEX_PLUGIN_MANIFEST_FIELDS` is limited to documented fields; writer orders/skips only those fields; Codex install test asserts no `customAgents` or `orchestrator`. |
| Root orchestrator guidance targets the ambient Codex session | Compliant | `renderRootInstructions()` writes Codex-specific ambient/root instructions into `~/.codex/AGENTS.md` managed block and rejects selectable orchestrator TOML UX. |
| Target resolver maps Codex surfaces by scope | Compliant | `resolveCodexTargets()` maps user/project role paths, skills dir, config, root instructions, and package root; tests cover user and project scope. |
| Root instruction destination is explicit and managed | Compliant | `rootInstructionsPath` is `codexHome/AGENTS.md`; managed markers are `oh-my-opencode-lite:codex-root:start/end`; tests assert backup and unrelated content preservation. |
| Role specialists are installed as subagents where supported | Compliant | `CODEX_ROLE_NAMES` contains exactly explorer/librarian/oracle/designer/quick/deep; role artifacts filter out orchestrator; tests assert no orchestrator TOML. |
| Codex UX avoids command-model overclaiming | Compliant | CLI/docs describe ambient/root usage and role guidance; docs avoid `$deep-interview` command UX and direct `@plugin_name` primary UX. |
| Dry-run renders a complete setup plan without writes | Compliant | `applyCodexSetup` returns before writes when `plan.dryRun`; test asserts `.codex-plugin` is not created. |
| Apply uses managed merges and backups | Compliant | Root instructions use managed-block merge and backup; config IO creates `.bak` and temp+rename; tests assert backup and preservation. |
| Future doctor and repair commands can reuse setup state | Compliant | `CodexSetupPlan` carries target/action/diagnostic metadata; reset is modeled as managed-only repair without unmanaged deletion. |
| Feature gates are set explicitly for Codex install | Compliant | Codex branch only runs on `--agent=codex`; `mergeCodexManagedConfig` ensures `features.hooks` and `features.plugin_hooks`. |
| Dry-run reports config changes without writes | Compliant | Dry-run prints plan and `applyCodexSetup` performs no writes; config merge exposes diff summaries used by apply diagnostics. |
| Codex reset semantics are managed-only | Compliant | No `force` type/field exists; diagnostics state no broad destructive `--force`; code only writes managed targets from the setup plan. |
| Existing TOML profiles are preserved | Compliant | TOML parser/renderer preserves unknown nested tables semantically; config IO tests cover profiles, MCP, plugins, and unknown tables. |
| Comment preservation is handled transparently | Compliant | Config merge warning discloses comment/formatting rewrite risk; apply creates backups before existing config rewrite. |
| Codex config path resolves across platforms | Compliant | `getCodexHome` supports `CODEX_HOME` or `os.homedir()/.codex`; tests cover custom Codex home and home fallback. |
| Post-install instructions include trust review | Compliant | Codex diagnostics/docs include `/plugins`, `/hooks`, and `features.plugin_hooks` trust-review limitation. |
| Config precedence diagnostics are visible | Compliant | Codex diagnostics warn project/profile/CLI/system/admin config may override user feature flags. |
| Role permission limitations are explicit | Compliant | Codex adapter capabilities mark role permissions as instruction-only; diagnostics and install output disclose this limitation. |
| Memory governance limitations are explicit | Compliant | Root instructions and adapter diagnostics preserve root-owned session tool/subagent memory rules as instruction-level governance. |
| Provider-per-agent is not overpromised | Compliant | Diagnostics/docs state provider-per-agent settings are user-managed/instruction-level unless documented controls exist. |
| Hook presets require trust review | Compliant | Hook diagnostics and docs state plugin/project hooks require feature gates plus `/hooks` trust review and are not hard enforcement. |
| Plugin package remains separate from automatic trust | Compliant | Package writer creates `.codex-plugin` artifacts only; docs and diagnostics require plugin enablement and hook review. |

## Design Coherence

- The code follows the design split: OpenCode remains the default branch and Codex
  uses `buildCodexSetupPlan -> applyCodexSetup`.
- Codex target resolution is centralized in `codex-paths.ts`, with root
  instructions always targeting `~/.codex/AGENTS.md`/Codex-home equivalent and
  role TOML generated separately from plugin package artifacts.
- TOML mutation is narrow, backed up, and atomic for config-like files; package
  generation is deterministic and excludes undocumented manifest fields.

## Issues Found

None blocking.

## Verdict

Pass. The change is compliant with the approved OpenSpec artifacts and is ready
for `sdd-archive`.
