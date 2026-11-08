# OpenCode runtime and integrations

## Responsibility

This route owns the OpenCode >=2.2.6 plugin, native roles, tools, MCPs,
`/thoth-init`, `/subagents-model`, package skills, permissions and session hooks.
Entrypoints: `src/index.ts`, `src/opencode/` and `src/tui/`.
Provider memory lifecycle remains external.

## Registration and delegation

The entry exports a plain object satisfying `Plugin.Plugin`; `@opencode/plugin`
2.2.5 is a type-only devDependency, not a bundled runtime import. Setup composes
agent, tool, MCP, command, skill, permission, delegation and session registrars.
It registers six roles, defaults to `orchestrator`, and removes host `explore`
and `general`. Models use `{providerID,id,variant}`; only the `openai` built-in
model profile ships.

The native `subagent` tool takes `agent`, `description`, `prompt`, optional
`background`, `model` and continuation `sessionID`. Native completion wakes the
owner; there is no `task`/`task_status` alias or `@role` dispatch contract.
Completed foreground Oracle gate results receive exactly one
`thoth-gate-verdict` line. Running placeholders and non-gate results are unchanged.
Background completions enter as synthetic host messages without a mutable
admission hook: root must run the explicit compact-validator fallback from the
installed `thoth-sdd` skill on the unchanged result.

## Model profiles and TUI

- `src/opencode/profiles/` owns the host-neutral store/editor/resolver. Files:
  `<opencode-config-dir>/thoth/profiles.json` and
  `<project>/.opencode/thoth/profiles.json`, both
  `{version:1, active?, profiles:{name:{agents:{role:{model?,variant?}}}}}`.
  Config directory: `OPENCODE_CONFIG_DIR` → `$XDG_CONFIG_HOME/opencode` →
  `~/.config/opencode`. Six canonical roles include orchestrator.
- Selection: session → project pin → global active → virtual read-only `default`
  (= effective `thoth-agents.json` roster). Project names shadow global names;
  missing pointers warn and fall through. `active` in the project/global file
  is its pin/selection. Model + variant are a pair: a model entry owns its variant
  (absence means none); variant-only entries use the inherited model. Profile
  values precede root role configuration and shipped defaults.
- Setup resolves the effective profile in `context.ts`; `agents.ts` registers
  profile models first, followed by deduplicated configured fallback models.
  This covers the first cold orchestrator session without `switchModel`.
- `profile-runtime.ts` fills only absent native `subagent` models from the parent
  session's effective profile (`provider/id#variant`). Explicit models are never
  replaced. `profile-sessions.ts` stores session selections in plugin storage.
- `profile-rpc.ts` defines the shared RPC contract; `profile-rpc-handlers.ts`
  handles state, editing, activation, clearing and capture. Activation switches
  the current orchestrator; project/global changes reload agent defaults.
  Unavailable models warn without changing activation state.
- `src/tui/index.ts` is the auto-loaded package `./tui` entry. It registers
  `/subagents-model` using native select/prompt/confirm dialogs over RPC, not a
  server command or custom renderer. Markers are `● S P G ~` (effective, session,
  project, global, shadowed). Per-role editing, create/clone/rename/delete,
  capture, save/discard and activation use action rows, no single-letter hotkeys.
  Drafts remain unsaved until Save; conflicts require reload. Home-route use
  disables session-only actions. See [user reference](../provider-configurations.md).
- `src/cli/opencode-profiles.ts` manages global profiles only; CLI Apply writes
  and activates the complete `agents` roster. Project pins belong to the TUI.

## Packaged skill precedence

Skills register from absolute package `skills/<name>/SKILL.md` paths. OpenCode
runs external plugin transforms before config skill discovery; discovered
same-ID copies win, not the plugin. The installer detects legacy copies and
moves them only after interactive CLI/TUI confirmation or the explicit
`--move-legacy-opencode-skills` flag. Moves are rename-only, never delete or
overwrite, into `$XDG_DATA_HOME/thoth-agents/.opencode-legacy-skills/<UTC>-<rand>/<source-label>/<name>`
(default data root `~/.local/share`). Without consent, or on move failure,
originals remain with a shadowing warning; dry-run/status report planned moves.
Restore by moving the backup directory to its original path without overwriting;
this restores shadowing too. The scanner skips the hidden backup even from an
ancestor root. A root explicitly inside the backup or a non-dot symlink into it
remains a documented residual. See [recovery](../installation.md#opencode-legacy-skill-copies).

## Permissions

Ordered `{action,resource,effect}` rules replace role defaults: broad rules first,
narrow exceptions last; last match wins and unmatched actions ask. Translation
uses host actions `read`, `glob`, `grep`, `edit`, `shell`, `subagent`, `webfetch`,
`external_directory`, `skill`, `question`, `todowrite`, and `exa_*` MCP matching.
Legacy list/codesearch/LSP read intent maps to `read`; write/patch maps to `edit`.
The permission evaluation hook denies `subagent` from every Thoth specialist;
only orchestrator may delegate. These are host permissions, not an OS sandbox.

## Session and cache invariants

- Retry uses `retry` + awaited `switchModel` over configured chains, bounded
  without repetition and preserving operator-selected models. No abort/replay.
- Active change records and running children live in keyed session instructions.
  The host freezes the initial instructions and appends later updates; keyed
  entries survive compaction's new instruction epoch. The compaction hook also
  carries current state into the summary (or its request when no result exists).
- Never mutate `context.system`, tools or prior messages per request. Evolving
  state uses deterministic keyed entries; compaction is the accepted prefix reset.
- Built-in MCPs honor `disabled_mcps`. Six LSP/AST tools keep their existing
  implementations. OpenCode has no plugin API for host LSP config overrides:
  Thoth standalone LSP tools use built-in defaults and do not consume host
  overrides. Configure host-native LSP separately; this is a capability gap.
- Tmux and runtime auto-update checking are removed. Runtime does not install
  packages or automatically rewrite configuration; explicit profile actions can
  save profile files and report warnings. Use the CLI for package updates.

## Focused verification

Run `src/opencode/`, `src/hooks/`, `src/agents/`, `src/tools/` and
`src/plugin-node-runtime.test.ts`. See [testing](testing.md) for host smoke and
cache-guard boundaries; [CLI installation](cli-installation.md) owns paths/pins.

Pi runtime composition remains separate in `src/pi.ts`; see
[harness packaging](harness-packaging.md). thoth-mem mechanics remain provider-owned.
