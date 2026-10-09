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
- `/sidebar panels` lists panel ids in order, including unavailable saved ids.
- `/sidebar panels show|hide|up|down <id>` changes panel visibility or order.
- `/sidebar startup auto|manual|off` saves the next session's startup preference.
- **Ctrl+Shift+R** starts resizing: **←** grows left, **→** shrinks, **Shift** steps
  four columns, **Enter** confirms and **Esc** restores the original width.
  Pi 1.0.2 has no default Ctrl+Shift+R binding; custom keybindings may conflict.
- In fullscreen, drag within one column of the divider to resize. Input yields
  to blocking overlays and focused work-panel controls.

Width defaults to 44, bounded to 28–72. Manual mode hides below 92 terminal
columns; above that it temporarily shrinks to leave the main pane at least 64
columns, preserving the preferred width. Auto mode collapses below `80 + width`
and reopens eight columns later. Mode, preferred width and enabled state are
session-only. Startup defaults to `auto`.

## Panels

Panels stack in configured order. Height reduction first shortens lower-priority
panels, then removes them; Session has the highest priority and Workspace the
lowest. Terminal height bounds rendering; work sources retain active/pending items plus
at most five terminal items. Timestamped sources put active/pending items first,
then terminal items newest completion timestamp first. Untimestamped sources keep
provider order across all retained rows; without a recency contract, earlier
provider positions are dropped first, keeping the last five terminal items in
provider order. Rendering samples the current pi-core render kit, with native
frames when no theme supplies a kit.

- **Session**: current provider/model, thinking level, context percent/tokens,
  session cost plus the latest cumulative subagent cost. Subscription providers
  add `(sub)`. Reads `statusLine.subscriptionProviders` from `pi-thoth-theme.json`
  in the same agent directory; defaults to `claude-bridge` and `antigravity`.
- **Workspace**: cwd, branch (including linked worktrees and detached HEAD), and
  staged/changed/untracked/conflict counts. Its own git reader refreshes on
  session start, turn end, and write/edit/bash/powershell tool results, debounced
  150 ms without polling. Non-git directories and unavailable git are tolerated.
- **Work sources**: one panel per pi-core discovered source, including Todos,
  Subagents and Background. Rows use the work-panel host's shared data renderer
  at the card body width (including status glyphs, metric continuations and
  completed strikethrough). Height overflow counts only hidden retained items,
  not discarded older history or continuation lines. Registry notifications
  refresh the sidebar. Only
  sources actually displayed are declared absorbed: their work-panel sections
  return when hidden, height-reduced away, too narrow or disposed. A failed mount
  declares no absorption. Regular-mode overlays are registered decorative so
  editor input and foreign dialogs retain their normal behavior.

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
next session, not the current one. `panels` is an ordered array of non-empty
string ids and boolean `visible` flags. Built-in ids are `session` and
`workspace`; use `/sidebar panels` for the discovered work-source ids (for
example `agents`). Display labels are not command ids.

Missing or malformed files use defaults. Invalid/duplicate ids are ignored;
a missing or invalid visibility flag defaults to `true`. Newly discovered
panels default to visible and append to the saved order. Unrecognized ids and
keys are preserved when saving. Width, current mode and enabled state are not
stored here. Writes use a unique
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
  for actions. There is no dedicated Cost or quota panel.
- Real-terminal checks in both modes remain necessary, particularly scrollback,
  mouse dragging, focus restoration and terminal/custom keybinding behavior.

MIT; copyright thoth-agents contributors.
