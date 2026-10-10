# @thoth-agents/pi-sidebar

A read-only right sidebar for Pi fullscreen and regular modes (SDK 1.0.2 tested).
Requires Node >=22.19.0. It never replaces the editor or footer and has no row
navigation or actions. Unsupported private renderer seams disable the sidebar
with one warning instead of breaking Pi.

## Install and modes

The complete Thoth Pi installer manages this package at `>=0.3.0`, preserving
compatible npm, local or Git copies. For a standalone install:

```sh
pi install npm:@thoth-agents/pi-sidebar
```

Restart Pi or `/reload` after installing. No theme is required. Only interactive
TUI sessions mount the sidebar; RPC/headless sessions do not. Fullscreen uses a
right layout column; regular mode reserves transcript/editor width and draws a
non-capturing sidebar over the live viewport. Neither mode owns the footer.
The package declares Pi SDK/TUI peers `>=0.99.0`, but its private layout seams
are tested on Pi 1.0.2 and feature-detected, not guaranteed on every version.

## Controls

- `/sidebar` toggles enabled state; `auto` and `manual` select the width policy
  and enable the sidebar. `on` enables without changing policy; `off` disables.
  Auto-hidden sidebars still require enough terminal width to appear.
- `/sidebar settings` opens an overlay to show/hide and reorder panels
  (**Space** toggles, **Shift+↑/↓** moves), cycle the startup mode and set the
  default width (**←/→**, **Shift** steps four, 28–72). **Enter** saves to
  `thoth-sidebar.json`; **Esc** cancels. A saved width applies immediately.
- `/sidebar cost` opens an overlay with cumulative subagent cost curves per task
  over time; **q** or **Esc** closes it.
- `/sidebar panels` lists panel ids in order, including unavailable saved ids.
- `/sidebar panels show|hide|up|down <id>` changes panel visibility or order.
- `/sidebar startup auto|manual|off` saves the next session's startup preference.
- `/sidebar resize` starts resizing when the sidebar is visible and mounted:
  **←** moves the divider left (grows width), **→** moves it right (shrinks width), **Shift** steps four columns, **Enter** confirms
  for the session and **Esc** restores the original width. A highlighted hint in the sidebar shows the
  current width and bounds as you resize. No keyboard shortcut is registered.
  If hidden, use `/sidebar on` first or widen the terminal.
- In fullscreen, drag within one column of the divider to resize. Input yields
  to blocking overlays and focused work-panel controls.

Width defaults to 44, bounded to 28–72. Manual mode hides below 92 terminal
columns; above that it temporarily shrinks to leave the main pane at least 64
columns, preserving the preferred width. Auto mode collapses below `80 + width`
and reopens eight columns later. Mode, enabled state and `/sidebar resize`
changes are session-only; the default width and startup (default `auto`) come
from `/sidebar settings`.

## Panels

Each panel renders as `╭─ <icon> TITLE … summary ─╮` with one hue per panel taken
from theme roles (Session accent, Workspace mdLink, Agents mdCode, Todos success,
Background syntaxNumber, Cost warning) and a dimmed border; ASCII icon mode
draws `+ - |`. Labels occupy 12 cells (9 below 28 columns); values align right.
Default order: Session, Workspace, Agents, Todos, Background, Cost. Saved orders
are never rearranged; Cost is appended when missing.

- **Session**: model and provider, thinking level, a context meter, session
  cost with `(sub)` for subscription providers plus the subagent cost, and a
  Limit row while a provider limit is warning or rejected. Subscription providers
  come from `statusLine.subscriptionProviders` in `pi-thoth-theme.json`
  (default `claude-bridge` and `antigravity`).
- **Workspace**: the path abbreviated by pi-core's root `formatCwd`, like the editor border, branch (including
  worktrees and detached HEAD), the state (Clean, Modified, Conflicts) in the
  header, `Changed N files +A −D` against HEAD, and Untracked/Binary/Conflicts
  rows when non-zero. A reader refreshes on session start, turn start, every
  tool result and turn end, coalesced to 250 ms, without polling.
- **Agents, Todos, Background** (discovered sources): the header shows the
  provider summary — `active·done·failed` for Agents and Background, `done/total`
  for Todos. Rows use keyed metrics with reserved format widths for stable row height
  and semantic icons (`elapsed` included; text labels in ASCII), through the
  shared work-panel renderer with right-aligned columns
  (model·effort, tokens, cost, elapsed) that drop tokens, then cost, then model
  as the width shrinks; elapsed stays. The footer shows the detail command
  (`/subagents ▸ detail`, `/todos ▸ detail`, `/bg ▸ detail`, `>` in ASCII). An
  empty panel is a single title line that includes the command. Sources retain
  active/pending rows plus at most five terminal rows (newest first when
  timestamped). Only displayed sources are declared absorbed; their work-panel
  sections return when hidden, too small, too narrow or disposed.
- **Cost**: horizontal bars for the ten most expensive subagent tasks of the
  session, live and persisted, labeled by task display name and scaled to the
  largest with eighth blocks (`#` in ASCII). The header shows the session
  subagent total and the footer `/sidebar cost ▸ curves`. Data comes from the
  `thoth:subagents:state` v2 snapshots (including up to 100 cost-ranked
  persisted summaries in `history`); the curves view plots cost samples recorded
  from them during this session, and tasks without samples are drawn as a
  straight segment from start to end.

### Degradation

Panels fill in configured order until the height runs out. A work or Cost panel
that does not fit shows its first rows and `+N more`; footers drop before rows;
a panel that cannot show its title and one row becomes a title-only line, and
panels after the last line are omitted. Below 24 columns the sidebar shows only
`widen: /sidebar resize`. Rendering is event-driven and cached: no session
traversal per render, plans are keyed by source summaries, workspace, cost data
revision and the shared animation frame.

## Preferences

`~/.pi/agent/thoth-sidebar.json` (or `$PI_CODING_AGENT_DIR/thoth-sidebar.json`):

```json
{
  "startup": "auto",
  "panels": [
    { "id": "session", "visible": true },
    { "id": "workspace", "visible": true }
  ]
}
```

`startup` accepts `auto`, `manual` or `off` (default `auto`); it applies to the
next session, not the current one. `width` (28–72, optional) is the default
preferred width, applied at start and when saved from `/sidebar settings`. `panels` is an ordered array of non-empty
string ids and boolean `visible` flags. Built-in ids are `session`, `workspace` and `cost`; work-source ids are
`subagents`, `todos` and `background-tasks` (use `/sidebar panels` for all
discovered ids). Display labels are not command ids.

Missing or malformed files use defaults. Invalid/duplicate ids are ignored;
a missing or invalid visibility flag defaults to `true`. Newly discovered
panels default to visible and are added before Cost. Unrecognized ids and keys
are preserved when saving. Current mode and enabled state are not stored here. Writes use a unique
same-directory temporary file and atomic rename; failures are reported and
session changes remain usable. Shutdown releases input listeners, registry and
usage subscriptions, preferences, pending git work and owned layout changes.

## Development

```sh
pnpm --filter @thoth-agents/pi-sidebar test
pnpm --filter @thoth-agents/pi-sidebar typecheck
pnpm --filter @thoth-agents/pi-sidebar build
```

## Known limitations

- Layout-root access, renderer-proxy patching and overlay classification rely on
  private Pi internals. Guards disable unsupported mounts with one diagnostic
  instead of throwing; disposal restores layout/render only while still owned.
- Regular mode supports the **live viewport only**. Previously emitted sidebar
  cells can remain in native scrollback; resize can clear scrollback. Automated
  viewport tests do not establish artifact-free historical scrollback.
- Mixed old extension bundles can retain first-owner editor-slot/work-panel
  closures that do not know decorative overlays or absorption. The regular
  adapter refuses to mount over detected pre-feature owners. Upgrade related
  Thoth extensions together and `/reload`; a declared version floor alone does
  not upgrade already-loaded closures. Old work-panel hosts may not honor
  absorption in fullscreen either.
- Source providers own session scoping and history availability. Untimestamped
  sources keep provider order; a provider that hides completed lists cannot
  supply those rows to the sidebar.
- Panels are bounded read-only summaries, not history views or interactive rows.
  Use existing source commands or restore the Work panel with `/sidebar off`
  for actions. Cost curves show only progression observed while the sidebar ran;
  tasks first seen in persisted history are drawn as a straight segment.
- Real-terminal checks in both modes remain necessary, particularly scrollback,
  mouse dragging, focus restoration and terminal/custom keybinding behavior.

MIT; copyright thoth-agents contributors.
