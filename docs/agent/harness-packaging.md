# Harness packaging and compatibility

## Entrypoints

- `src/harness/registry.ts`: supported/default harnesses
- `src/harness/core/agent-pack.ts`: six-role contract
- `src/harness/core/sdd.ts`: route, phase and artifact contract
- `src/harness/adapters/`: native translation
- `src/harness/generate-integration-packages.ts`: shared Codex/Claude plugin
- `plugin/`: generated shared distribution bundle
- `skills/`: canonical thoth-owned workflow bundle
- `EremesNG/thoth-plugins`: separately versioned central Codex and Claude Code
  marketplace catalogs

## Invariants

- OpenCode remains default.
- OpenCode npm plugin loading does not expose package-relative native skills;
  the CLI synchronizes the five canonical owned skill trees into
  `~/.config/opencode/skills/`. Init never creates project-local skill copies.
- Codex uses plugin-hook developer context: `SessionStart` injects the ambient
  root on startup/resume/clear/compact; `SubagentStart` selects five role prompts
  by `agent_type`. The manifest explicitly references `codex-hooks/hooks.json`;
  `codex-hooks/context.cjs` loads six generated `codex-hooks/payloads/*.md`
  files with no default context-size limit. This path avoids Claude Code's
  automatic `hooks/hooks.json` discovery in the shared bundle. Node >=22.19 on
  PATH is required, including for Desktop hooks.
- Codex plugins carry skills/MCP/hooks but cannot register agent roles
  (openai/codex #18308/#36855). The mandatory CLI therefore writes five thin
  global TOMLs with name, description, hook-context pointer, model/effort and
  sandbox. It preserves operator model/effort and records ownership digests in
  managed state. No root is written to `~/.codex/AGENTS.md`; a valid legacy
  managed block is removed with a `.bak` and surrounding bytes preserved.
  Migration requires an enabled installed plugin with declarations, loader and
  all six payloads; install/update do the plugin step first, while sync fails
  and asks for update if the bundle is not hook-capable. `$thoth-init` creates
  project governance only.
- Codex global config merges set `features.default_mode_request_user_input`
  and `agents.max_concurrent_threads_per_session = 6` (six children plus root),
  recording prior capacity once and preserving later operator changes.
  Optional `[hooks.state]` entries require `--trust-hooks`, the CLI default-No
  y/N prompt or TUI consent, disclosing that hooks can run outside the sandbox.
  Without trust, Codex silently skips hooks: thoth root/role orchestration does
  nothing until native `/hooks` review or **Trust all and continue**. Trust hashes
  cover declarations, not payloads/version, so prompt updates need no re-trust.
  Hashing is version-coupled to Codex 0.162.1; doctor reports mismatches as
  `modified` and directs native review.
- Codex delegates with `fork_turns: "none"`, bounds spawns by observed free
  capacity, and permits completed-child `followup_task` reuse only for the same
  role, objective and SDD phase, unchanged mutable surface (or read-only work),
  and no independent judgment. Oracle plan reviews and verifications are always
  fresh; never `send_message` to completed children. On `agent thread limit
  reached`, inspect `list_agents`, reconcile native liveness and report the
  limit truthfully. Capacity is fixed per session; restart after config changes.
- `thoth-agents doctor --agent=codex` is read-only: plugin presence/enablement/
  version, hook capability/trust, Node, TOML drift, threads and legacy root
  leftovers, with fixes. `thoth-agents uninstall --agent=codex [--dry-run]`
  uses the native plugin manager and removes attributable TOMLs, managed/
  recovery state, the Codex ledger entry, valid legacy blocks and recorded
  hash-matching trust. It restores prior capacity only if still managed, and
  preserves/reports operator changes or unverifiable ownership. It retains the
  request-user-input feature, provider thoth-mem surfaces, external skills and
  marketplace registration. See [Codex installation](../codex-install.md).
- Claude packages root plus five generated namespaced subagents.
- Pi is published from the same `thoth-agents` npm artifact with exactly
  `./dist/pi.js` and `./skills` in `package.json#pi`. Generation writes five
  package-owned `pi/agents/*.md` assets plus `.thoth-agents-assets.json`; no
  orchestrator child or external implementation tree is packaged. Pi discovers
  the five owned skills from the manifest, while the shared synchronizer
  materializes the five specialists for the separate
  `@thoth-agents/pi-subagents` runtime from
  `npm:@thoth-agents/pi-subagents@>=0.3.0`.
  The root package and all eleven `pi-packages/*` members declare Pi SDK peers
  `>=0.99.0`, pin development SDK/TUI dependencies to `1.0.2`, and require Node
  `>=22.19.0`. Features requiring newer Pi APIs are runtime-guarded; the theme's
  tool renderers need Pi `>=1.0.1` and are inert on older supported versions.
  The workspace `@thoth-agents/pi-core` (`pi-packages/pi-core`) is a library of
  typed, versioned `pi.events` channels, session-state publish/request/subscribe
  helpers, the Render KIT contract/registry, the discoverable Work panel v2
  registry, UI-preferences/decorative-overlay coordination, shared session cost
  helpers and pure `formatDuration`, not a standalone extension. The first-party
  `@thoth-agents/pi-todo` (`pi-packages/pi-todo`) is a fork of
  `@juicesharp/rpiv-todo` `2.12.0`, providing the `todo` tool, `/todos`, and a
  current-session Todos section in the shared Work panel. It replays branch state,
  publishes full task snapshots through pi-core, and reinjects open tasks before
  agent start, including after compaction. The CLI installs pi-todo as its sixth
  selected Pi package; pi-core is its library dependency. The first-party
  `@thoth-agents/pi-questions-user` (`pi-packages/pi-questions-user`) is the fifth
  selected package, providing root-owned `ask_user_question` with stable ids,
  single/multi/text/confirm types, recommended options, previews and notes,
  no fixed question/option maximum, and structured per-id answers. It falls
  back to sequential select/input without custom UI and reports `no_ui`
  truthfully when UI is unavailable.
  The delegation fork verifies native registry, rendering, and steering.
  Selected registered deferred/codemode tools can be callable while inactive;
  excluded tools are absent from the child registry.
  Delegation controls use native `model-only` exposure. Live messaging
  distinguishes queued, extension-handled, rejected, and model-consumed input.
  Its responsibility remains LLM subagent delegation; non-LLM shell jobs belong to
  the vendored `@thoth-agents/pi-background-tasks` (`pi-packages/pi-background-tasks`,
  a trimmed local-jobs fork of pi-better-background-tasks), installed and verified
  by the CLI at `>=0.3.0` along with `@thoth-agents/pi-thoth-theme@>=0.3.0` as the
  seventh and eighth selected packages (theme, then background tasks).
  `@thoth-agents/pi-sidebar@>=0.3.0` is the ninth selected package, a read-only
  right sidebar with guarded fullscreen/regular adapters. Existing
  compatible copies from any source are preserved and verified without
  reinstalling; older copies remain untouched and block completion with manual
  upgrade guidance, and ambiguous identity fails closed. Jobs survive `/reload`
  of their session and stop on any other shutdown, including subagent teardown.
  The workspace `@thoth-agents/pi-openai-fast` (`pi-packages/pi-openai-fast`,
  operator-installed, not in `PI_PACKAGE_SPECS`) adds `<id>-fast` virtual models
  under every provider with `openai-responses`/`openai-codex-responses` models
  (including extension providers such as `openai-codex-2`); agent-loop requests
  routed through them send `service_tier: "priority"`, while compaction and
  other direct requests keep the standard tier.
  Generated definitions use supported `model`, `effort`, and `subagent_mode`
  fields; they do not claim fresh-context or depth enforcement. Omitted run mode
  follows the selected definition and configuration, with background as the
  runtime fallback; an explicit `mode: "task"` continues to wait. The
  `/subagents-model` manages named model/effort profiles independently of
  definition scope. Storage is global `<agentDir>/thoth/profiles.json`
  (`PI_CODING_AGENT_DIR`, default `~/.pi/agent`) or project
  `<project>/.pi/thoth/profiles.json`, with schema
  `{version:1, active?, profiles:{name:{agents:{agent:{model?,effort?}}}}}`.
  Global `active` names a global profile (or `default`); project `active` pins
  either scope (or `default`). Selection is session → project pin → global
  active → read-only virtual `default`, with project-over-global name shadowing
  and warning/fallback for missing references. Profile fields override
  definition fields, configuration defaults, then parent model/effort;
  missing agents/fields use that fallback chain. `default` is never stored
  and exposes definition/shipped values without overrides. Session selection
  persists in the Pi session across reload/resume; switching applies at run
  time to new runs/continuations without rewriting definitions. The old
  `model_profiles` field in `subagents.json` is no longer used.
  Keys: ←/→ browse profiles, ↑/↓ agents, Enter edit, `n` new, `c` clone,
  `s` save, `r` rename, `d` delete, `u` session, `g` global active, `p` project
  pin. New/cloned profiles are drafts until save; unedited new saves copy all
  listed agents' default effective model/effort into a self-contained profile.
  Editing `default` offers creation instead; rename/delete are forbidden.
  Referenced deletion confirms and clears active/pin pointers; unsaved close
  confirms discard. Non-overlay fallbacks only list/activate. See
  [installation](../installation.md#configure-subagent-model-profiles-inside-pi)
  for panel and storage details.
  pi-subagents registers both `/subagents-model` and `/subagents-tools`; the
  tools command lives in `pi-packages/pi-subagents/src/tools-panel/`, not the
  root extension. It edits the resolved global/project definitions, changing
  only `tools` while preserving unrelated frontmatter and body bytes, with
  stale-write detection and partial-save retry. The root registers an optional
  Thoth adapter through `Symbol.for('thoth-agents.pi-subagents.tools-panel.v1')`.
  Its `appliesTo`/`validate` checks and optional `defaultTools` apply only to
  marked canonical global `agents/thoth-*.md` specialists; project and unmanaged
  definitions use generic persistence. Reset is unavailable without adapter
  defaults. `/subagents-tools` discovers registered tools (active and inactive)
  and edits exact names only. Globs and unrecognized names are shown read-only
  and retained on normal save and retry; explicit defaults reset replaces them.
  There is no `*` control or dynamic mode. The registry also publishes command
  ownership: new Thoth warns once at session start when it is absent, and new
  pi-subagents warns about duplicate owners exposed by Pi's command registry.
  The operator upgrade pairs both packages and finishes with `/reload`; `0.3.0`
  is the first command-owning pi-subagents release. Child-provided
  `ask_orchestrator` and `notify_orchestrator` notes describe the channels as
  subject to their respective `enable_ask_orchestrator` and
  `enable_notify_orchestrator` flags and `disallowed_tools`; they are not checkboxes. The panel does not read runtime
  configuration or edit denials.
  Generated defaults are explicit: `read, bash, grep, find, ls` for Oracle;
  Explorer adds `codemode`; Designer and Worker add `edit, write` before the
  search tools; Librarian adds its research tools and `codemode`. All omit `ask_user_question`, `todo` and
  third-party delegation tools. Every enabled child receives `ask_orchestrator`
  regardless of selection form unless denied. Only Oracle's generated definition
  declares `disallowed_tools`, denying `ask_orchestrator` for independent judgment
  while keeping `notify_orchestrator`. All five roles receive notify guidance.
  Other harnesses are unchanged. Manual advanced globs, including `*`, expand
  against all registered root tools (active and inactive), minus native
  `subagent_*` exclusions and the definition's `disallowed_tools`.
  `disallowed_tools` is a comma-separated string or YAML list of exact names,
  subtracted after resolution, including injected tools. Manual frontmatter
  editing covers injected tools absent from the panel and trimming glob results.
  Absent or
  explicitly empty means no denial; malformed values fail closed and uninstalled denied
  names are inert. Native exclusions cover only `subagent_*` tools.
  `enable_ask_orchestrator` defaults to true and gates both the child tool and
  root's `subagent_reply`; false removes both. `ask_timeout_ms` defaults to
  600000. `ask_orchestrator({ message })` carries only questions and blocks for
  root's reply. Independently, `enable_notify_orchestrator` defaults to true
  (global/project cascade) and injects `notify_orchestrator({ message })` unless
  denied. It returns immediately, records progress/checkpoint information on the
  task (latest five updates), and triggers no root turn or reply. Timeout checkpoint
  steering uses notify only when it is in the child's verified tool selection.
  If the question channel is
  unavailable, the rendered child fallback is owned by
  `src/agents/prompt-dialects.ts` and `AGENT_RETURN_CONTRACT` in
  `src/harness/core/agent-pack.ts`; tests: `src/harness/adapters/pi.test.ts`.
  Tool filtering is not a sandbox: shell and MCP tools can still launch agents
  indirectly. `src/cli/pi-tool-config.ts` supplies the Thoth adapter's
  managed-file validation and defaults; pi-subagents owns panel persistence.
  Synchronization preserves operator tools (including `*` and other globs),
  modes, model, effort and operator-set `disallowed_tools` (including explicit
  empty). Otherwise package values apply even with custom tools; malformed
  definitions remain unchanged with diagnostics. `@active` is rejected with a
  diagnostic recommending exact names, never accepted as an alias or explicit
  name. Unsupported overrides remain untouched with diagnostics during
  synchronization. Empty panel selections and exact native `subagent_*`
  delegation names are rejected. Globs resolve at child launch; for every
  selection form (explicit lists or globs, including `*`) tools without a child
  implementation are dropped and reported as durable warnings on the running
  widget card and in status/results/completion while the child uses the available
  subset. An empty effective permitted selection or unexpected extra child tools
  still fails; either injected orchestrator tool alone can keep the selection nonempty.
  Explicit names and tools matched by globs reach the child even when inactive
  in the root, allowing roles to activate deferred or advanced tools. Globs are
  edited manually in definition frontmatter. Native TUI/AI modules are declared public peers and
  kept external in the build; static imports let Pi's loader resolve its native
  aliases for compiled JS. Lazy imports from a natively loaded compiled extension
  bypass those aliases. Root model and external override precedence remain
  Pi-owned.
- Both central catalog entries resolve to one `plugin/` bundle containing one copy of the
  five canonical thoth-owned skills, including `thoth-sdd` and `plan-reviewer`.
  Harness-specific manifests and MCP files
  coexist in that bundle. External skills are installed from their source
  repositories by the mandatory CLI flow; published installs then invoke
  thoth-mem's public setup without copying provider assets into the bundle.
  Explicit local Pi package installs leave thoth-mem to its separate local
  installer.
- Native managers own marketplace snapshots, normal cache lifecycle,
  enablement, and trust. The Codex CLI migration has one bounded exception: only
  fixed product-owned legacy roots may be removed after central verification and
  two fail-closed path/provenance checks.
- Generated files are outputs; edit canonical adapters, prompts, or skills.
- Capability gaps remain explicit and deduplicated. Only unrecoverable required
  generation errors exit nonzero.
- Build and npm version lifecycle synchronize both plugin manifests and the
  generated shared bundle; release then publishes only this product's central
  catalog pin and required owned-skill inventory. The publisher reads the built
  `plugin/skills/` inventory; the central validator verifies every required
  skill against the release tag before any push.
- No adapter bundles thoth-mem hooks, MCP, skill, lifecycle behavior, or project
  QA executables.
- Pi subagent children run in-process and expose no `PI_SUBAGENT_CHILD` marker.
  Global `<agent-dir>/subagents.json` therefore requests
  `session_resources: "lean"` and `enable_continue: false`; lean filters
  `before_agent_start` and `session_start`, while full child resources are
  unsupported. Lean children retain their specialist prompt and receive a
  metadata-only skill catalog (name, description, location), not skill bodies,
  context files, prompt templates, themes, or root injection. Discovery uses
  native user skills, configured packages, and trusted project/ancestor skills
  for the child cwd, offline without installing packages. Parent project trust
  is reused for children inside that project; other child directories consult
  persisted native trust, with unknown trust treated as untrusted. Discovery
  failures produce diagnostics; `disable-model-invocation` skills stay hidden.
  Optional agent frontmatter `skills` lists names or globs: omitted means all
  discovered skills, `[]` means none, and unmatched entries produce diagnostics.
  Thoth config `agents.<role>.skills` generates that Pi-only field; sync preserves
  operator-edited filters. Global/project `lean_skills` defaults to true;
  `lean_skills: false` disables child catalogs without enabling full resources.
  Explicit assignment paths remain available alongside catalog discovery.
  Trusted packages in `lifecycle_passthrough` (default: the two
  provider bridges, background tasks and `@thoth-agents/pi-openai-fast`; never
  thoth-agents) are the exception: they keep their full lifecycle in children,
  with prompt-shaping events observe-only as defense in depth except that a
  `before_provider_request` return replaces the provider payload (so `-fast`
  variants send `service_tier: "priority"` in children); that list is a trust
  list, not a sandbox. A project-local `subagents.json` may override global lean
  settings. Child `tools`, `disallowed_tools`, configuration and native
  `subagent_*` exclusions provide runtime-verified registry filtering. Delegation
  depth and behavioral role limits are instruction-level; neither these role
  boundaries nor registry filtering form an OS or process sandbox.
- Pi's Context7 and web-access integrations are native extensions. Only grep.app
  uses `pi-mcp-adapter`, through the exact attributable global server entry.
- Pi safely merges `session_resources: "lean"` and `enable_continue: false`
  into global `subagents.json` without replacing unrelated keys, including an
  operator's `lean_skills` choice; Thoth does not write that default. Detected
  incumbent `pi-subagents` or former `pi-subagents-j0k3r` packages block before
  mutation with manual recovery; setup never removes them or installs both
  delegation runtimes.
- Pi requires the first-party `@thoth-agents/pi-questions-user` provider of
  `ask_user_question` for root-owned interaction; the CLI also
  installs the first-party `@thoth-agents/pi-todo` task extension. Role-specific
  progress and research guidance is rendered by `src/agents/prompt-sections.ts`
  and `src/agents/prompt-dialects.ts`; tests: `src/agents/prompt-rendering.test.ts`.
  Package presence remains distinct from live UI/provider availability.

## Pi codemode

The Pi installer fills global `settings.json` codemode defaults after native
package installs, re-reading the file so package entries and unrelated settings
are preserved. An absent `defaultTools` becomes `["+codemode"]`; a non-empty list
containing only `+`/`-` selectors gains `+codemode`. Empty or replacement lists
gain plain `codemode`. Existing `codemode`, `+codemode` or `-codemode` entries
are unchanged. An absent `codemode.mode` becomes `"on"`; existing modes and nested
fields such as `inlineBudget` are preserved. Reinstallation is idempotent, and
managed-write safety rejects symlinked settings.

With theme tool rendering enabled, pi-thoth-theme renders the builtin codemode
tool as a compact card of nested calls (name, status and duration; up to eight
collapsed, plus a remaining count). Expansion shows the script, output and
errors. The renderer does not replace or wrap Pi's builtin implementation.
Explorer and Librarian select codemode by default; lean children with codemode
selected load Pi's public codemode extension in mode `on`, scoped to their other
selected tools.

Batch independent script-callable reads, research and memory work through
codemode. Delegation controls, `ask_orchestrator`, `notify_orchestrator` and `ask_user_question` are
`model-only`: call them directly, never from scripts. They remain direct under
both `on` and user-selected `only`. Task-list and background-task tools remain
script-callable; the boundary does not exclude all control-plane tools.

## Pi question dock and editor slot

`ask_user_question` replaces the editor while expanded; it never mounts a question
overlay or covers the chat. Inline mode retains native scrollback, and fullscreen
`PageUp`/`PageDown` scroll the transcript. `Ctrl+]` collapses the questionnaire to
a one-line dock above the restored editor (default hint: `Ctrl+] expand`); typing
and `Enter` belong to the editor, and during an active run `Enter` queues a
steering message without answering the question. `Ctrl+]` from the editor or a
history/detail overlay expands the same questionnaire with its answers, cursor,
tab, scroll positions and drafts intact. The open tool-call card marks collapsed
state until expansion or completion. While the question is open, this terminal
binding shadows the editor's `jumpForward`; when collapsed, `Esc` belongs to the
editor or focused overlay, not question cancellation.

pi-core's `./panel` entrypoint exports `registerEditorSlot`: a shared owner installs
one editor factory and terminal-input listener per session, retaining editor
callbacks and app actions. Work-panel rows and routing are slot contributions;
the question contributes an editor replacement or collapsed dock. Expanded
questions acquire focus through owned-overlay handles so a visible history
panel cannot recapture the next key. History/detail panels close only their own
handle; close repair targets the expanded question or otherwise the mounted
root editor. Collapsing, answering, cancelling, aborting and teardown preserve
focus held by a still-visible foreign overlay. No polling is used.

See [question controls and lifecycle](../../pi-packages/pi-questions-user/README.md#custom-ui-seam-and-lifecycle),
[panel API](../../pi-packages/pi-core/README.md#panel-primitives-and-list-editor),
and [verification scope](testing.md#local-closeout-gate).

## Pi work-panel registry v2

pi-core's root exports `listWorkPanelSources()`,
`subscribeWorkPanelRegistry(listener)`, `getWorkPanelSourceRows(id, { maxRows })`
and `invokeWorkPanelAction(ctx, id, rowId, action)` for `open`, `history` and
`close`. Listing and reading need neither a TUI import nor an installed host.
Sources expose identity, ordering, contract version, selectable flags, row cap
and optional provider `summary` counts/text, failure-isolated like row reads,
and per-source monotonic revision; revisions increase on registration and every
provider change, continuing across re-registration. Synchronous, failure-isolated
listeners receive the affected source id on registration, removal and changes;
the returned disposer unsubscribes. Reads preserve provider ordering and are
bounded by both the requested maximum and source cap, not host retention or
height budgets. Actions require the caller's live context for an installed
same-session host; open/history also require interactive UI and suspend panel
input until the UI closes. Results are `ok`, `unavailable` or `missing`; consumers
never receive provider closures.

`WORK_PANEL_VERSION` is `2`. Rows are unstyled data: semantic segments,
responsive `identity` and `metrics`/`continuation` groups, and optional
`extraRows`/`extraSegments`. `statusGlyph` is `RenderStatus | 'taskInProgress'`,
not a function or literal glyph; the host owns animation and glyph resolution.
The `completed` role gives task-list rows dim/strikethrough styling in the host.
Keyed metrics reserve number-format widths to stabilize row height across
digit-width changes. The host keeps greedy packing; the sidebar uses
`metricLayout: 'grid'` with a shared column schema, wrapping all metrics without
dropping them and aligning missing fields as empty cells. Model·effort reserves
16 cells with ellipsis; out-of-range numbers widen their shared column without
truncation. The optional degrading `metricLayout: 'columns'` remains available.
Semantic metric
icons include `elapsed`; ASCII retains labels. Selection, focus and keys are unchanged.

The v2 upgrade procedure pairs pi-subagents, pi-background-tasks and pi-todo
at `>=0.3.0`, followed by `/reload`. The version-independent ownership slot
remains first-owner-wins:
incompatible v1/v2 copies install no host, register no section and expose no
discovery, so mixed versions hide incompatible sections regardless of load order.
Subagent state is v2; background state, usage, requests and Render KIT remain v1. See
[the provider and discovery API](../../pi-packages/pi-core/README.md#work-panel-v2).

## Pi sidebar and UI coordination

`@thoth-agents/pi-sidebar` mounts only in interactive TUI sessions and never
replaces the editor/footer. Fullscreen reads the private layout root after shape
checks, wraps it in an HStack and restores it only while owned. Regular mode
patches the concrete main-screen render width through Pi's forwarding proxy and
mounts a top-right, full-height non-capturing overlay. Unsupported seams disable
the mount with one diagnostic. Pi 1.0.2 is tested; regular mode covers the live
viewport, not historical terminal scrollback.

`/sidebar` toggles; `auto|manual|on|off` controls session policy/enabled state.
Width defaults to 44 (28–72), leaving at least 64 columns for the main pane.
Manual hides below 92; auto collapses below `80 + preferred width` and reopens
8 columns later. `/sidebar resize` enters resize (← grows, → shrinks by 1, Shift 4, Enter confirm,
Esc revert), with a live hint inside the sidebar; fullscreen also supports divider drag. `/sidebar panels` lists ids;
`panels show|hide|up|down <id>` persists visibility/order, and
`startup auto|manual|off` persists next-session policy in
`~/.pi/agent/thoth-sidebar.json`. `/sidebar settings` opens a show/hide/order,
startup and default-width overlay (Space, Shift+↑/↓, ←/→; Enter saves, Esc
cancels). Saved default width applies immediately; resize width and current
mode/enabled state are session-only. `/sidebar cost` opens cumulative task-cost
curves from observed snapshots, with straight segments for unsampled history.

Session uses pi-core's `computeSessionCost` and
`combineSessionAndSubagentCost`, shared with the theme; cumulative subagent
snapshots replace rather than add to earlier snapshots, and `(sub)` classifies
the current provider. Workspace reads its own git branch/status (including
worktrees) on session start, turn start, every tool result and turn end,
coalesced to 250 ms without periodic polling. Discovered work-source panels read bounded
data rows and use the current render kit with native fallback. Atelier-style
chrome uses per-panel theme roles and SGR-dim borders. Session adds a context
meter and warning/rejected Limit row. Workspace shares pi-core's root
`formatCwd`, showing Clean/Modified/Conflicts and `Changed N files +A −D` from
porcelain v2 and numstat against HEAD (empty tree when unborn). Work panels
show static running/done/failed status-icon counts with zero counts omitted
(Todos keeps completed/total), all metrics with icons in aligned columns that
wrap onto stable continuation lines (ASCII labels), and `/subagents`, `/todos`, `/bg` footers; empty panels keep
a title-plus-command line. Cost shows the top ten live/persisted session task
costs as bars, using display names or short task-summary names. Curves plot
elapsed time per task from zero to the longest task duration. Under pressure footers drop before
rows, panels reduce to titles, and widths below 24 show `/sidebar resize`.

The process-wide, owner-tokened `registerUIPreferences` / `updateUIPreferences` /
`withdrawUIPreferences` registry merges `absorbedWorkPanelSources`. The host
omits absorbed sources from rendering, selection and left-arrow focus, while
discovery/actions remain available. The sidebar absorbs only source panels
actually displayed, releasing preferences on hiding, height omission, failed
mount or disposal. `registerDecorativeOverlay(tui, component)` returns a disposer
or `undefined`; `hasBlockingOverlay(tui)` ignores registered decorative
components but yields to every other visible overlay, including non-capturing
ones. Visibility uses hidden/options.visible, not rendered bounds. Unknown
stack shapes conservatively use `hasOverlay()`.

Unversioned editor-slot/work-panel ownership remains first-owner-wins. Old
closures cannot be upgraded in place: the regular adapter refuses detected
pre-feature owners instead of blocking editor input; old fullscreen hosts may
not honor absorption. The compatible upgrade pairs related extensions and
finishes with `/reload`.
See [controls, config schema and limitations](../../pi-packages/pi-sidebar/README.md),
[core APIs](../../pi-packages/pi-core/README.md#sidebar-ui-preferences-and-decorative-overlays)
and [closeout checks](testing.md#local-closeout-gate). Provider quota panels
and sidebar row actions are not part of this package.

## Pi provider status and subscription cost

pi-core's root exports `reportProviderLimit`, `listProviderLimits` and
`subscribeProviderLimits`. The versioned
`globalThis[Symbol.for('thoth.pi-core.provider-limits.v1')]` registry is
process-wide, including separately loaded library copies and in-process child
sessions; it is **not** a `pi.events` bus channel. Limits are account-wide: the
latest report replaces the entry for its provider/window, while `sessionId`
identifies the observing query, not the scope of the limit. Validated entries
contain only status, utilization (0..1), reset/observation times (Unix ms), window
type, overage flags and observing session identity. Reads project expired windows
as `allowed` without utilization; there is no persistence, polling or quota
fetching. Synchronous isolated listeners receive reports, with no initial replay.
See [the exact registry contract](../../pi-packages/pi-core/README.md#provider-limits-v1).

The Claude bridge reports every SDK `rate_limit_event`, including root queries,
subagent children, AskClaude and summaries, with per-query session attribution;
existing notifications remain unchanged. pi-subagents captures reports while the
child is live in a bounded per-task UI cache. Active warning/rejected observations
appear on the Agents Work row and `/subagents` detail with reset time when known,
without changing task status. They survive child teardown and another session's
replacement of the account-wide entry, and clear at reset without task activity.

Quota is on demand only: `/claude quota` uses the **experimental** SDK usage
control request for available 5-hour, weekly, Opus/Sonnet/model and extra-usage
windows. It sends no prompt, enables no tools, reuses the bridge's cwd/environment/
executable options, times out after 30 seconds and closes its CLI query on all
paths. Missing API/plan data is reported explicitly; nothing periodically fetches
quota or puts it in sidebar state. `/agy quota` remains the Antigravity command.
agy 1.3.2 starts configured global MCP servers even in print-mode `/usage`, despite
custom-agent MCP exclusions. On Windows their `.cmd` shims may flash; a possible
operator workaround uses native executables or `node.exe` with the server's
actual JS entrypoint where supported. This is upstream process startup, not a
bridge spawn-option change;
a visible flash and this workaround still need live validation. See
[Claude quota](../../pi-packages/pi-claude-bridge/README.md#rate-limits-and-claude-quota)
and [Windows quota diagnosis](../../pi-packages/pi-antigravity-bridge/README.md#windows-quota-console-diagnosis).

Antigravity messages use API-equivalent `calculateCost` prices from pi-ai's
`compat` catalog via an explicit normalized-model mapping: Gemini Flash versions
to matching Google entries, Gemini 3.1 Pro to `google/gemini-3.1-pro-preview`,
Claude Sonnet 4.6 to Anthropic, and GPT-OSS 120B variants to Groq. Unmapped/missing
catalog models stay at $0 and log once as unpriced. Both engines feed these costs
into session and subagent totals; ACP token estimates remain estimates and exact
usage replaces them with recomputed cost. This is not subscription billing.
The theme defaults `statusLine.subscriptionProviders` to
`["claude-bridge", "antigravity"]`; explicit user lists remain unchanged. `(sub)`
retains its current-provider classification of the displayed total, not a
per-message billing split.

The Claude/Antigravity bridges and pi-openai-fast are **manual installs**, not
installer-managed packages. See [manual Pi provider installation](../installation.md#manual-pi-provider-extensions)
for the three `pi install` commands and authentication requirements.

## Pi AskCodex delegation

`@thoth-agents/pi-askcodex` (`pi-packages/pi-askcodex`) is a manually installed
`AskCodex` tool, not a model provider or installer-managed package. It delegates
to the user's local `codex app-server --stdio` harness. Start with the
[package README](../../pi-packages/pi-askcodex/README.md) for installation,
parameters, configuration, and troubleshooting; implementation and offline
fake-server tests live under the package's `src/` and `tests/` directories.

Configuration is `~/.pi/agent/askcodex/config.json`; overrides are `ASKCODEX_BIN`,
`ASKCODEX_ENABLED`, `ASKCODEX_DEFAULT_MODEL`, and `ASKCODEX_DEFAULT_EFFORT`.
Binary resolution prefers the explicit env/config path, then the newest Windows
Desktop-bundled executable, then PATH with a warning. Native-app Computer Use
requires Codex Desktop running; browser Computer Use via the Codex browser
extension does not. `plan` selects a read-only shell sandbox, **not read-only MCP
or GUI actions**; `accept-edits` selects workspace-write. Exact app identifiers
in `allowedApps` receive session approval only; other approvals ask through Pi UI
or decline without it, never granting "always" persistence. Non-ephemeral
`conversationId` threads persist in `~/.codex/sessions` and may appear in Desktop
history. The experimental app-server protocol and alpha Desktop binary can drift;
unknown requests are rejected and protocol failures fail closed. Standalone PATH
Codex on Windows may have blank screenshots, missing typing, or read-only shell
sandbox errors; prefer the Desktop bundle.

## Pi task channels

pi-core defines these channels and their validators: subagent state is v2;
background state, usage and requests remain v1. They use
`{ v, source, sessionId, at, data }` envelopes (`at` is Unix milliseconds):

| Snapshot | Request | Producer |
| --- | --- | --- |
| `thoth:subagents:state` | `thoth:subagents:state:request` | `@thoth-agents/pi-subagents` |
| `thoth:background:state` | `thoth:background:state:request` | `@thoth-agents/pi-background-tasks` |
| `thoth:subagents:usage` | `thoth:subagents:usage:request` | `@thoth-agents/pi-subagents` |

Subagent snapshots contain current-session in-memory task identity, agent/display
name, mode/status, model/effort, lifecycle times, token usage/cost and an output
preview of at most 800 UTF-16 code units, plus status counts and persisted totals.
The required v2 `history` array carries up to 100 persisted session summaries,
selected and ordered by descending cost with the same strict allow-list.
Background snapshots contain current cwd/session-origin task identity/name,
kind/status, lifecycle times, exit code/signal and dismissal, plus counts. The
contract permits numeric or short-text progress (at most 200 code units); the
publisher currently omits it. Payloads exclude prompts, context, transcripts,
results, questions, commands, argv, environment, stdout/stderr and logs/log paths.
Usage data contains only cumulative `totalCost` and `runCount` for the parent
session identified by the envelope.

Consumers subscribe before requesting with `data: {}` and the target session ID
in the envelope. Producers answer with complete snapshots, not deltas; requests
before readiness are answered once by the readiness publication. State is also
published after changes and session readiness/replay. Subagent activity uses the
manager's 150 ms coalescing. Background publication uses fresh metadata reads,
filesystem change notifications for cross-process writes (no polling timers),
and watch disposal/rebinding on session switch and shutdown. These channels do
not provide full task detail/history, bus replay caching or child/parent bus sharing.
Invalid, unsupported-version or foreign-session envelopes are ignored by filtered
subscriptions. See [pi-core's exact payload contracts](../../pi-packages/pi-core/README.md#task-summary-and-usage-channels).

The raw `thoth:subagent-usage` bus event and raw request handler are removed;
only its checkpoint custom-entry discriminator is retained. The status line
subscribes to the usage envelope and requests it on session start. The compatible
upgrade pairs pi-subagents and pi-thoth-theme at `>=0.3.0`, followed by `/reload`;
mixed old/new versions lose the subagent cost display. No dual publication is
provided.

## Pi Render KIT and workspace releases

`@thoth-agents/pi-core` defines `ThothRenderKit` v1 and the process-wide
`registerRenderKit` / `getRenderKit` / `withdrawRenderKit` registry. Its root
entry remains importable without runtime Pi peers; the opt-in `./panel` entry
uses the optional pi-tui peer. `@thoth-agents/pi-thoth-theme` implements the kit's
cards, collapse hints, per-width caching, working/elapsed indicators, status
glyphs and widget primitives. It registers on `session_start` only for its
interactive UI session while `tools.enabled` is true, and withdraws only its own
registration on `session_shutdown`. Headless children do not replace or withdraw
the parent kit, or stop its indicators.

pi-questions-user, pi-todo, pi-background-tasks, pi-subagents, pi-claude-bridge and
pi-antigravity-bridge discover `getRenderKit()` inside each render of their tool
calls/results, custom messages and above-editor widgets where provided, never
at extension load or component creation. A missing or incompatible kit means
native Pi rendering. These producers depend on pi-core, not pi-thoth-theme;
extension load order does not matter.

Every migrated tool declares a stable `renderShell: 'self'`: the SDK fixes the
shell when constructing the tool component, so kit availability must not choose
it. Each render draws either the KIT frame or native output equivalent to the
SDK's default pi-tui `Box(1, 1, bg)`, with `toolPendingBg`, `toolSuccessBg` or
`toolErrorBg`, without nested frames. Message/widget fallbacks retain native
presentation. See [pi-core's KIT contract](../../pi-packages/pi-core/README.md#render-kit-v1).

The `@thoth-agents/pi-core/panel` subpath exports titled frames, terminal-cell
width helpers, key normalization, SGR/urxvt/X10 mouse and wheel parsing,
cursor-centered viewports, selectedBg rows, hints, dirty-discard confirmation,
and a list-editor shell. Both list editors use that shell with height-aware
viewports (tools wide at 84 columns, models at 102). History panels and Work
detail use the primitives without changing navigation, scrolling or folding.
Panel overlays open through `openOwnedOverlay`, including background history.
The list editors and background history use its shared `openPanelOverlay` host,
which enables mouse reporting in regular TUI mode and balances cleanup on close,
rejection or disposal without touching fullscreen-owned tracking. Shared keyboard
normalization recognizes Pi-native CSI-u/kitty control keys by default as well
as legacy terminal sequences.
See [the panel API](../../pi-packages/pi-core/README.md#panel-primitives-and-list-editor).

Pi packages are versioned and published independently of the root package.
`pnpm pack` / `pnpm publish` converts `workspace:^` dependencies to semver
ranges.

### Release flow

`release.yml` runs on the root `v*.*.*` tag, after CI, build and the runtime test.
Its CI gate selects the latest `push` run at the tagged SHA on the verified
main/master release branch; manual CI does not satisfy it. Polling allows roughly
45 minutes (270 attempts, 10-second sleeps), with a 90-minute publish-job timeout
leaving room for build and publishing. Completed non-success runs fail immediately.
While CI is still running, `gh run view --json jobs` also rejects completed jobs
with failure, cancelled, timed_out, action_required, startup_failure or stale
conclusions, reporting the job names and CI URL without waiting for other jobs.
Skipped/neutral jobs do not by themselves block a successful run.

After the gate:

1. **Publish Pi packages** in dependency order (pi-core first), only versions not
   yet on npm, via trusted publishing.
2. **Reconcile Pi releases**: create the per-package tag `<name>@<version>` and a
   GitHub release for each published version, with notes from commits touching
   that package directory. Reconciliation is idempotent; rerunning the workflow
   fills in whatever is missing. After a successful Pi publish, reconciliation
   waits up to five shared minutes for npm propagation and fails if any expected
   version remains missing.
3. **Root notes** exclude Pi-only commits and list the released Pi versions
   (`scripts/generate-release-notes.ts` flags `--tag-prefix`, `--path`,
   `--exclude-path`, `--package-tags`).
4. Root `npm publish`, GitHub release, then marketplace publication.

A Pi publish failure blocks the root publish.

### Bumping

```
pnpm release:pi pi-subagents patch   # dir or name; patch|minor|major
git commit -am "chore(pi-subagents): release x.y.z"
pnpm release:patch                   # or release:minor / release:major
```

`release:pi` runs `npm version --no-git-tag-version`. The root release needs a
clean tree, and a Pi-only fix still bumps the root, since Pi packages ship only
from a root tag. In 0.x, a caret range does not cross a minor: a pi-core bump
0.1 → 0.2 falls outside consumers' published `^0.1.0` until the consumers are
bumped and republished.

PRs get a non-blocking "Pi version bump" warning (`scripts/check-pi-version-bumps.mjs`)
when a Pi package changed without a version bump; when skipped it emits a
`::notice`.

### One-time bootstrap

Trusted publishing can only be configured for packages that already exist on npm,
so each new package's first version is published manually. The original packages
bootstrapped at 0.1.0; pi-sidebar starts at 0.3.0.

Prerequisites: npm >= 11.15.0 (`npm i -g npm@latest`), `npm login`, account 2FA
enabled, ownership of the `@thoth-agents` npm organization (a scope must be a
user or an organization; without it `PUT` returns `E404`; create it at
npmjs.com/org/create), a fresh `pnpm login` after creating it (older tokens may
lack write access to the new scope and also yield `E404`), and a clean checkout of the merged commit with
`pnpm install --frozen-lockfile`.

The bootstrap procedure publishes in dependency order, each from its own
directory (pnpm rewrites `workspace:^`; its OTP prompt also accepts
`--otp <code>`):

```
cd pi-packages/<pkg>
pnpm publish --access public --no-git-checks
npm view @thoth-agents/<pkg> version
```

Order: pi-core, pi-subagents, pi-questions-user, pi-todo, pi-antigravity-bridge,
pi-background-tasks, pi-claude-bridge, pi-askcodex, pi-openai-fast, pi-thoth-theme,
pi-sidebar.

New packages can take a few minutes to appear in public registry reads
(`npm view` returns `E404` meanwhile; `npm access list packages @thoth-agents`
already lists them). The root release follows visibility of all versions: the
release decides what to publish from registry reads, and republishing
an existing version fails the run before the root is published.

Per-package trusted-publisher configuration follows publication:

```
npm trust github @thoth-agents/<pkg> --file release.yml --repository EremesNG/thoth-agents --yes --allow-publish
```

`npm trust --help` documents flag names (syntax: `npm trust github [package]
--file [--repo|--repository] [--env|--environment] [--allow-publish]
[--allow-stage-publish] [-y|--yes]`). Configurations created after 2026-09-03
default to stage-publish only, so `--allow-publish` is needed for direct
`npm publish` from CI. Confirmation is available on npmjs.com → package →
Settings → Trusted publishing. The root `thoth-agents` trusted publisher also references
`release.yml` (already in use).

The sidebar bootstrap uses a clean merged checkout after the frozen install
and build. The sidebar bundle inlines pi-core, so pi-core does not need
to be published first:

```sh
cd pi-packages/pi-sidebar
pnpm publish --access public --no-git-checks
npm view @thoth-agents/pi-sidebar@0.3.0 version
npm trust github @thoth-agents/pi-sidebar --file release.yml --repository EremesNG/thoth-agents --yes --allow-publish
```

The sidebar's npm Settings → Trusted publishing configuration references this
repository and `release.yml` with direct publishing enabled. The next approved
root release follows registry visibility of 0.3.0. Republishing an existing
version fails; local validation does not require version bumps. The next root
tag triggers `release.yml`; reconciliation creates missing package tags/releases
for manually bootstrapped versions, and later versions use trusted publishing.

## Verification

Select focused adapter/generator tests for the touched output. When generated
integration artifacts change, run `pnpm run integration:sync` and
`pnpm run integration:verify`. Packaging changes require `pnpm run build`; add
`pnpm run verify:pi-package` when the packed Pi manifest, inventory, or
unrelated-directory extension-load contract is affected. Apply the
[local-closeout gate](testing.md#local-closeout-gate) for repository checks and
release-tooling input triggers; unrelated tooling suites do not block local
product-change closeout.
