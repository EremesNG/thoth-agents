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
The package declares only `@earendil-works/pi-tui >=0.99.0` as a peer;
`@earendil-works/pi-coding-agent` is a development dependency pinned to `1.0.2`.
Its private layout seams are tested on Pi 1.0.2 and feature-detected, not
guaranteed on every version.

## Controls

- `/sidebar` toggles enabled state; `auto` and `manual` select the width policy
  and enable the sidebar. `on` enables without changing policy; `off` disables.
  Auto-hidden sidebars still require enough terminal width to appear.
- `/sidebar settings` opens an overlay to show/hide and reorder panels
  (**Space** toggles, **Shift+↑/↓** moves), cycle the startup mode, set the
  default width (**←/→**, **Shift** steps four, 36–72) and switch the bar style
  in the `Bars` row between `thin` (default) and `classic` (**←/→**). **Enter**
  saves to `thoth-sidebar.json`; **Esc** or **q** cancels. A saved width or bar
  style applies immediately, without restarting Pi.
- `/sidebar cost` opens an overlay with cumulative subagent cost curves per task
  over time, colored like the Cost panel's legend; **q** or **Esc** closes it.
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

Preferred width defaults to 50, bounded to 36–72. Manual mode hides below 92
terminal columns; above that its effective width may shrink below the preferred
range to leave the main pane at least 64 columns, preserving the preference.
Auto mode collapses below `80 + width` and reopens eight columns later.
Mode, enabled state and `/sidebar resize`
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
  (default `claude-bridge` and `antigravity`). The context meter follows the
  bar style (see **Bar styles**): `thin` draws up to 16 cells, filled to the
  nearest half cell with `━` and a trailing `╾`, over a dim `─` track, so 52%
  reads `━━━━━━━━╾───────`; `classic` draws 10 cells of eighth blocks over a `░`
  track. The fill, boundary and percentage take the threshold role (success up
  to 70%, warning above 70%, error above 90%); only the thin track is dim. A row
  too narrow for the full length gets fewer cells and none below three, and ASCII
  mode keeps its 10-cell `#`/`-` meter in both styles.
- **Workspace**: the path abbreviated by pi-core's root `formatCwd`, like the editor border, branch (including
  worktrees and detached HEAD), the state (Clean, Modified, Conflicts) in the
  header, `Changed N files +A −D` against HEAD, and Untracked/Binary/Conflicts
  rows when non-zero. A reader refreshes on session start, turn start, every
  tool result and turn end, coalesced to 250 ms, without polling.
- **Agents, Todos, Background** (discovered sources): the header shows the
  provider summary — static running, queued, done, failed and cancelled status-icon
  counts for Agents and Background, omitting zero counts (ASCII uses the kit's
  status glyphs), and `done/total` for Todos. Queued counts require at least 36
  columns; crowded headers drop cancelled, then queued counts first.
  Agents uses a two-line plan: identity, summary and elapsed on line one; a
  width-dependent priority prefix of metrics (context, cost, speed, tokens, tools,
  warnings, model·effort) on line two. Lower-priority metrics are dropped as width
  shrinks; a row stays one line when no second-line metric qualifies. Other
  sources show identity and admitted keyed metrics on one body line in
  panel-aligned columns. Lower-priority columns are omitted when they do not fit
  alongside the identity; elapsed never drops. Numeric format reservations set
  shared column widths, and missing fields retain empty cells. Model·effort
  reserves 10 cells and truncates with an ellipsis. The footer shows the detail command
  (`/subagents ▸ detail`, `/todos ▸ detail`, `/bg ▸ detail`, `>` in ASCII). An
  empty panel is a single title line that includes the command. Sources retain
  all active/pending rows plus at most three finished rows, without linger or
  expiry limits. Agents and Background show
  active rows oldest launch first, then the three most recently completed rows,
  newest first regardless of failure. Completion ties use descending ID; missing
  completion times count as oldest. Other sources keep launch order and their
  last three finished rows. Missing launch times preserve provider order after
  timestamped rows. Finished history remains visible even after resume.
  Hidden history is not counted in `+N more`; header
  counts remain provider totals and full history remains in `/subagents`, `/bg`
  and `/todos`. Only displayed sources are declared absorbed; their work-panel
  sections return when hidden, too small, too narrow or disposed.
- **Cost**: how the session's subagent cost splits across tasks, live and
  persisted. The first body row is one share-of-total bar over the full inner
  width: each legend entry owns a segment sized by its share of the panel total
  (the larger of the reported subagent total and the tracked task sum) with
  largest-remainder rounding and at least one cell each. Every segment but the
  last ends in a half cell (`╸` in the thin style, `▌` in the classic one) so
  neighbours stay distinct without color, and nothing is scaled by the largest
  task; the thin style fills task segments with `━` and the classic style with
  `█`, and a one-cell segment that is not last is the cap alone. ASCII fills each
  segment with its legend digit (`1`–`0`) and the remainder with `.`, whatever
  the style. Below the bar a ranked legend shows at most five entries: a marker
  in the segment's color, the task display name (or a short name derived from the Agents row's task summary, with leading
  PHASE/CHANGE dispatch envelopes, Repo root phrases and absolute path tokens
  stripped, and the change name retained) truncated with `…` to the width left
  after the columns (at least 30 cells at 50 columns, 14 at 36), the integer
  share (muted; `<1%` below one percent; each share is rounded on its own, so
  they may not add up to 100) and the amount; the share column is dropped below
  an inner width of 28. With more than five tasks, or untracked cost (panel
  total minus tracked total) of at least half a cent, the legend shows the top
  four tasks and a remainder entry, `+N more tasks` (`+1 more task`; `other`
  when no task is hidden), whose share and amount are the panel total minus the
  four shown. Its bar segment is the track (a dim `─` in the thin style, a muted
  `░` in the classic one) and its marker is `○` (dim) or `░` (muted). A running
  task gets an accent `↑` (`^` in ASCII) in a trailing column reserved on every
  row, so labels never shift, and the header
  total shows `↑` while any task runs; running follows the latest live
  snapshot, so a task that disappears from it stops being marked. Segment and
  marker colors follow the rank and come from the palette shared with the
  curves view (warning/amber first, error/red last), so rank N has the same
  color and ASCII digit in both views. The header shows the panel total and the
  footer `/sidebar cost ▸ curves`. Data comes from the
  `thoth:subagents:state` v2 snapshots (including up to 100 cost-ranked
  persisted summaries in `history`); the curves view retains the top ten and plots cumulative cost samples recorded
  from them during this session against elapsed time since each task's start,
  with a duration axis from zero to the longest task duration (running tasks use
  the current time). Tasks without samples draw a straight segment from `(0,0)`
  to `(duration, final cost)`. Curve legends show `agent · label` (once when identical); the sidebar legend keeps the label alone.

### Bar styles

The Cost share bar and the Session context meter share one `bars` preference,
`thin` (default) or `classic`, edited only in the `Bars` row of
`/sidebar settings`; there is no command for it.

| Style     | Cost segments      | Cost remainder track, marker | Context meter                              |
| --------- | ------------------ | ---------------------------- | ------------------------------------------ |
| `thin`    | `━` with a `╸` cap | dim `─`, dim `○`            | up to 16 cells, `━` and `╾` on a dim `─` |
| `classic` | `█` with a `▌` cap | muted `░`, muted `░`        | 10 cells, eighth blocks on a `░` track    |

For tasks costing $2.64, $0.73, $0.25 and $0.17 within $3.79 at width 50 the
thin bar reads `━`×31 `╸`, `━`×8 `╸`, `━━╸`, `━━` (32, 9, 3 and 2 cells). Allocation,
segment colors, legend, `+N more tasks` folding, running arrows and thresholds
are the same in both styles, and ASCII icon mode ignores the style and draws
its usual `1`–`0` digits, `.` and `#`/`-`.

### Degradation

Every visible panel first receives its title plus up to two content lines and
its bottom border (or its full size if smaller); remaining height grows panels
in configured order, whole rows at a time. Metric rows are indivisible: when a
row needs more than the minimum body, `+N more` occupies that body until enough
height is available. A work or Cost panel that does not fit shows its first rows
and `+N more`, with its detail command right-aligned on that line when both fit.
Otherwise the command is omitted; standalone footers drop before rows. Cost
keeps its bar and first legend entry together as one block and folds the other
entries from the bottom, so its `+N more` counts hidden tasks (a folded
remainder entry counts all the tasks it covers); below that block it collapses to
its title and total, never a bare count.
Panels whose minimum cannot fit retain their title and summary. Gaps drop first
when necessary to keep every title; only when height is smaller than the number
of titles is an unavoidable bounded prefix shown. Measured height equals actual
rendered height. Below 24 columns the sidebar shows only
`widen: /sidebar resize`. Rendering is event-driven and cached: no session
traversal per render. Cost reads only what the tracker cached when a snapshot
arrived (ranking, total, task count and running flags). The shared 100 ms
cadence runs only for visible animated work rows, not finished history; plan
keys include retained rows, source summaries, workspace, cost revision (which
also changes when a task starts or stops running), the bar style and animation
frame, so saving a new style replans once.

## Preferences

`~/.pi/agent/thoth-sidebar.json` (or `$PI_CODING_AGENT_DIR/thoth-sidebar.json`):

```json
{
  "startup": "auto",
  "bars": "thin",
  "panels": [
    { "id": "session", "visible": true },
    { "id": "workspace", "visible": true }
  ]
}
```

`startup` accepts `auto`, `manual` or `off` (default `auto`); it applies to the
next session, not the current one. `width` (36–72, optional) is the default
preferred width, applied at start and when saved from `/sidebar settings`. `bars` (optional) is `thin` (default) or
`classic`, the look of the Cost bar and Context meter, applied immediately when saved from `/sidebar settings`;
anything else is ignored and the default applies. `panels` is an ordered array of non-empty
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
- Cost draws `●` and `↑`, which some terminals render two cells wide; legend
  rows can then misalign, and ASCII icon mode avoids both glyphs.
- The thin style draws `━ ╸ ╾ ─ ○`, which need a font that carries them and,
  in the dim `─` track, can read as a second border line under some themes. The
  `classic` style and ASCII icon mode avoid those glyphs.
- Real-terminal checks in both modes remain necessary, particularly scrollback,
  mouse dragging, focus restoration and terminal/custom keybinding behavior.

MIT; copyright thoth-agents contributors.
