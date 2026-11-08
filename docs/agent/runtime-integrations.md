# OpenCode runtime and integrations

## Responsibility

This route owns the OpenCode >=2.2.6 plugin, native roles, tools, MCPs,
`/thoth-init`, `/subagents-model`, `/subagents-tools`, package skills, permissions
and session hooks.
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

## Tool overrides and TUI

- `src/opencode/tool-overrides/` (not `src/opencode/tools/`) owns the
  host-neutral store, validation, matcher and evaluator. Files are
  `<opencode-config-dir>/thoth/tools.json` and
  `<project>/.opencode/thoth/tools.json`, with the same config-dir resolution as
  profiles. Schema: `{version:1, roles:{<specialist>:{overrides:[{action,effect}]}}}`;
  effects are `allow|ask|deny`. Only explorer/librarian/oracle/designer/worker
  are editable. Ordered entries survive writes; invalid input loads with warnings,
  writes are atomic and whole-file revision conflicts return `TOOLS_CONFLICT`.
- Project presence replaces global per role, including an empty list. Reset
  deletes that scope's role entry, so project reset resumes global inheritance.
  To mask global overrides with shipped defaults, save an empty project list.
- `context.ts` owns mutable `toolState`; `agents.ts` keeps shipped arrays exactly
  when there are no effective overrides. Otherwise it appends resource-`*`
  overrides, then a final locked `subagent` deny. Orchestrator is unaffected and
  the existing `permissions.ts` evaluation deny remains. Last match wins;
  wildcards match whole actions (`*` includes `/`, `?` one character,
  case-insensitive on Windows).
- Actions group tools: write/patch/edit → `edit`, bash → `shell`; MCP actions
  appear as `server_tool`. Resource-`*` deny hides tools, ask prompts. Matching
  `external_directory` overrides supersede designer/worker's shipped
  resource-specific allow; this is intentional, including broader access on allow.
- `src/opencode/tool-rpc.ts` defines JSON-safe `thoth-tool-permissions`
  state/save/reset; `src/opencode/tool-rpc-handlers.ts` serializes operations,
  groups `ctx.tool.list()` by permission action, and returns role effects,
  origins, shipped `baseEffect`, locks, scope revisions and warnings. Saves/reset
  refresh tool state and call `ctx.agent.reload()`; changes apply at the next
  context selection, not via request-local tool mutation.
- `src/tui/tools/model.ts` and `src/tui/tools/flow.ts` implement native dialogs
  registered in `src/tui/index.ts` beside `/subagents-model`. Overview shows G/P
  scope, counts and summaries; role rows use `●` override, `○` pattern,
  `·` default and `🔒` locked. Scope selection, inherit/allow/ask/deny, manual
  patterns with action match counts, draft Save/Discard/Keep editing, conflict
  reload and confirmed immediate reset work without a session. Inherit removes
  exact entries only; broader patterns can still match.
- Effects are role-level, not session-level; session permissions may supersede
  them. Disconnected/undiscovered MCP tools are absent from inventory (manual
  patterns may match zero actions). Code Mode catalog tools may remain despite
  deny: version-sensitive, requiring live verification. See the
  [user guide](../provider-configurations.md#manage-tool-permissions-inside-opencode).

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
  packages or automatically rewrite configuration; explicit profile/tool actions
  can save their configuration files and report warnings. Use the CLI for package updates.

## Focused verification

Run `src/opencode/`, `src/hooks/`, `src/agents/`, `src/tools/` and
`src/plugin-node-runtime.test.ts`. See [testing](testing.md) for host smoke and
cache-guard boundaries; [CLI installation](cli-installation.md) owns paths/pins.

Pi runtime composition remains separate in `src/pi.ts`; see
[harness packaging](harness-packaging.md). thoth-mem mechanics remain provider-owned.
