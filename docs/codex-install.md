# Codex Install

Codex installation has two required layers. The native plugin contributes
skills, MCP configuration, and trusted hooks that inject root and role prompts.
The thoth-agents CLI installs thin global agent definitions and configuration
that the plugin cannot supply. Node.js >=22.19 must be on PATH for both the CLI
and hooks, including in Codex Desktop's environment. The hook/trust contract is
verified against Codex 0.162.1; older versions are unsupported.

## 1. Run the combined installer

Preview, then apply:

```bash
npx thoth-agents@latest install --agent=codex --dry-run
npx thoth-agents@latest install --agent=codex
```

Close every Codex process before applying the installer. The CLI inspects
`codex plugin marketplace list --json` and `codex plugin list --available
--json`. When needed, it runs the native unattended commands:

```bash
codex plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json
codex plugin add thoth-agents@thoth-plugins --json
```

A same-named marketplace from another source, unreadable manager state,
command failure, or failed post-install verification stops setup before the
global files are changed. Dry-run prints the complete native and fixed-root
cleanup plan without mutation. The separate `EremesNG/thoth-plugins`
repository owns the catalog; its marketplace name is `thoth-plugins` and its
pinned entry resolves to the executing version of the shared `plugin/` bundle.

Only after that central plugin is installed, enabled, and version-exact does the
installer retire owned Codex legacy state. It removes
`thoth-agents@thoth-agents` and `thoth-agents@thoth-agents-codex` first, then
marketplaces `thoth-agents` and `thoth-agents-codex`, using official manager
commands. It may then delete only these still-orphaned roots below the resolved
`CODEX_HOME`:

- `plugins/cache/thoth-agents`
- `plugins/cache/thoth-agents-codex`
- `.tmp/marketplaces/thoth-agents`
- `.tmp/marketplaces/thoth-agents-codex`

Every existing root must be a non-link directory whose nominal and real paths
remain under `CODEX_HOME`; its manifests must identify thoth-agents and the
expected repository. The same checks run again immediately before deletion.
Sibling and unrelated state is preserved. A conflict, race, or lock keeps the
central plugin installed and returns close-Codex-and-retry guidance. No
cross-platform process-name check is claimed, and a restart activates the new
state but does not garbage-collect orphan caches.

The plugin contains the five thoth-owned workflow skills, including
`plan-reviewer`, packaged MCP configuration, and `codex-hooks/`:

- `hooks.json`: `SessionStart` injects the ambient root prompt on startup,
  resume, clear and compact; `SubagentStart` injects one of the five role prompts
  by `agent_type` (`explorer`, `librarian`, `oracle`, `designer`, `worker`).
- `context.cjs` and `payloads/`: a portable Node loader and six canonical prompt
  payloads, delivered as developer context without the default context limit.

The Codex manifest explicitly references `./codex-hooks/hooks.json`. The shared
bundle is also a Claude Code plugin, so Codex hooks stay outside Claude's
auto-discovered `hooks/hooks.json` path. External execution skills are not
vendored. Codex plugins cannot ship agent roles ([#18308](https://github.com/openai/codex/issues/18308),
[#36855](https://github.com/openai/codex/issues/36855)), so global TOMLs remain
necessary to register roles and their sandbox settings.

## 2. Mandatory global layer

User-scope setup manages:

- five thin `~/.codex/agents/thoth-agents-<role>.toml` files for `explorer`,
  `librarian`, `oracle`, `designer`, and `worker`: name, description, a pointer
  to hook-delivered instructions, model, optional effort, and sandbox mode;
- `~/.codex/agents/.thoth-agents-managed-models.json` for model/effort ownership,
  role fingerprints, prior capacity and consented trust ownership, plus the
  Codex install-ledger entry;
- a backed-up merge in `~/.codex/config.toml` setting
  `features.default_mode_request_user_input = true` and
  `agents.max_concurrent_threads_per_session = 6` (six children, plus root).
  The prior capacity value is recorded once for uninstall; later operator
  changes are preserved and reported. Capacity changes require a restart;
- optional consented thoth-agents `[hooks.state]` trust entries; and
- mandatory external skills in Codex's user skill root, `~/.agents/skills/`,
  via `npx skills add`;
- provider-owned thoth-mem setup through
  `npx -y thoth-mem@latest setup codex --json`.

The CLI no longer writes root instructions to `~/.codex/AGENTS.md`.
Install/update/sync remove a well-formed legacy `thoth-agents:codex-root` block
with a `.bak`, preserving surrounding bytes (and deleting a whitespace-only
result). Ambiguous markers are preserved and reported. Before migrating that
block or full-prompt TOMLs, the installed plugin must be enabled and contain
`codex-hooks` declarations, loader and all six payloads. Install/update perform
the plugin step first; sync does not update the plugin and fails with update
guidance if this prerequisite is missing. Trust consent is not a migration
prerequisite, so review hooks before relying on the migrated setup.

The role transition is preflighted before global writes. An edited or unattributed
role TOML is preserved and reported. Direct install/local setup proceeds for the
other managed surfaces; public update/sync block the whole operation and report
the edited role. Model-only or effort-only edits to an owned role are preserved
and its ownership digests are refreshed by update/sync. Known legacy roles may
be migrated without model-ownership state.
Obsolete Quick or Deep TOMLs are retired only when that ownership state proves
they are managed; their model and effort customizations are not copied to
Worker. Backup destinations must be absent or regular non-symlink files; unsafe
`.bak` destinations fail closed before global migration writes. Remove or relocate
the unsafe destination and retry. Local plugin directory backups require an absent
destination.

The ambient session is the orchestrator, so no orchestrator child TOML is
generated. The CLI obtains external skills from their canonical repositories;
Codex remains the owner of current marketplace snapshots and normal plugin
cache lifecycle; the fixed legacy cleanup above is the only filesystem
exception. Dry-run delegates to thoth-mem's `--plan` mode. A partial or
user-action result keeps the combined installation incomplete and prints
provider diagnostics, actions, and receipt.

## 3. Restart and initialize each repository

Restart Codex so global agents, capacity and plugin hooks load. Review:

```text
/plugins
/hooks
```

In each target repository invoke:

```text
$thoth-init
```

This final skill step is offline and idempotent. It creates only missing
`.thoth/` governance, including `.thoth/constitution.md` and `.thoth/specs/`,
preserving existing project-owned content. It refuses a legacy active OpenSpec
tree rather than creating a duplicate store. Phase references and validators
stay in the installed `thoth-sdd` plugin skill. Agent/global installation
remains CLI-owned.

## Delegation and proportional SDD

Every change completes proportional explore, specify, and clarify before
classification; no phase forces a document, agent, or interview. The root
classifies by meaningful coordination, uncertainty, and risk. File count alone
does not increase scope: clear low-risk localized mechanical work may touch
several files and stay small. Small work uses test-first implementation and
focused verification without a record. Substantial work uses one
`.thoth/changes/<id>/<id>.md` record; no alias or sidecar report is permitted.

Optional selected Oracle plan review remains separate from the post-review
Implement (Recommended) / Stop decision; review never grants authorization or
replaces final verification. Codex native collaboration owns dispatch, status,
wait, cancellation, and terminal results. Root dispatches independent ready
units before waiting, refills freed capacity, and accepts fresh upstream outputs
before consumers start. Spawn with `fork_turns: "none"` so children receive
role context from hooks, not inherited root history; bound parallel spawns by
observed free native capacity. A completed child may receive `followup_task`
only for the same role, objective and SDD phase, with the same mutable surface
(or read-only work) and no independent judgment. Every Oracle plan review and
verification uses a fresh child; never `send_message` to a completed child.
On `agent thread limit reached`, inspect `list_agents`, reconcile running and
terminal children, and report the native limit truthfully rather than looping
spawns or inventing cleanup tools. The six-child setting does not fix upstream
slot leaks or change capacity in an already-running session.

Resume reads the compact record and current owned files,
then reconciles native liveness before assigning another writer. A fresh
read-only Oracle verifies substantial or materially risky work; see [SDD](sdd-pipeline.md)
for evidence and limits.

Standalone TOMLs are native Codex configuration layers, but role selection and
some permission constraints remain instruction-level in the collaboration
runtime. An implementation writer cannot substitute for required Oracle
verification; Codex remains the sole collaboration authority.

## Trust and precedence

Untrusted plugin hooks are skipped silently: thoth's root/role orchestration
does nothing until the hooks are trusted, even when the plugin is installed.
Trusted hooks can run outside the sandbox. Consent is explicit: pass
`--trust-hooks` on install/update, answer the CLI's default-No `[y/N]` prompt,
or accept the TUI trust step. Non-interactive runs without the flag write no
trust; dry-run reports the plan without mutation. Alternatively, review and
trust in Codex via `/hooks` or the startup **Trust all and continue** option.

Trust covers normalized hook declarations only, not prompt payload contents or
plugin version. Prompt-only updates therefore do not require re-trust. The CLI's
trust hash is coupled to Codex 0.162.1; a mismatch is reported by doctor as
`modified` and should be reviewed in Codex's native hook UI.

- The CLI invokes the native manager but does not bypass marketplace trust or
  higher-precedence policy. Hook trust writes require the consent above.
- Repository and subtree instructions remain project-owned; no global root
  block is installed.
- Profile, CLI, system, managed, and organization configuration retains its
  documented precedence.
- Project `.codex/` surfaces load only in trusted repositories.
- `--reset` repairs managed blocks/files only; it does not broaden or trigger
  plugin cleanup. Only the verified install/update migration may retire the
  four fixed thoth-agents legacy roots and manager identities described above.

## Diagnose or uninstall

```bash
thoth-agents doctor --agent=codex
thoth-agents uninstall --agent=codex --dry-run
thoth-agents uninstall --agent=codex
```

Doctor is read-only. It reports plugin presence, enablement and version, hook
capability and trust (`trusted`, `untrusted`, `modified`), Node on PATH, each
role TOML's ownership/drift, the threads setting and legacy `AGENTS.md` blocks,
with actionable fixes.

Uninstall removes the plugin through the native manager, fingerprinted owned
TOMLs (including model/effort-only edits), managed/recovery state and the Codex
ledger entry, a valid legacy root block, and recorded hook trust entries whose
hashes still match. It restores the recorded prior threads value, or removes
the key if previously absent, only while the current value is still managed
(`6`). Edited/unattributed TOMLs, changed or unverifiable trust, operator-changed
capacity, unrelated config and ambiguous legacy blocks are preserved and
reported. Root/config edits are backed up to `.bak`. Dry-run only reports.

Uninstall intentionally retains `features.default_mode_request_user_input`,
provider-owned thoth-mem surfaces, external skills, and the `thoth-plugins`
marketplace registration (other consumers/registration ownership are unknown).

## Provider boundary

thoth-mem is independent and owns its hooks, MCP, installed skill, lifecycle,
persistence, receipts, and recovery. thoth-agents orchestrates only its public
setup command after the Codex layer; it never passes provider `--force`, edits
provider targets, or emulates provider mechanics.

During runtime the root follows the installed thoth-mem skill for recall,
durable lessons, compaction, and semantic completion. Delegated `none`, `recall`,
or `observe` authorization is independent from Codex workspace permissions and
never transfers root lifecycle. `.thoth/` holds active change records, durable
specs, and constitution; historical material remains preserved.

## Upstream references

- [Build Codex plugins](https://learn.chatgpt.com/docs/build-plugins#plugin-structure)
- [Build Codex skills](https://learn.chatgpt.com/docs/build-skills#where-to-save-skills)
- [Codex custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex `AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
