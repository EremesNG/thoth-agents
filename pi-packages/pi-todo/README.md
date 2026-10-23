# @thoth-agents/pi-todo

Session-owned task lists for Pi. Registers the `todo` tool, `/todos` command,
and a Todos section in pi-core's shared Work panel. Requires Node >=22.19 and
Pi >=0.99.0.

## Install

```sh
pi install npm:@thoth-agents/pi-todo
```

## Origin and attribution

This is a first-party MIT fork of **@juicesharp/rpiv-todo 2.12.0**, by juicesharp,
from [rpiv-mono](https://github.com/juicesharp/rpiv-mono/tree/68d9a0014b70006d7b04b57933752338a2716db7/packages/rpiv-todo).
The upstream source layout, tool schema, state transitions, terminal-safe
renderers, and branch replay are retained. The standalone overlay and collapse
shortcut are replaced by the shared Work panel. Applicable tests are ported from
that revision with local SDK mocks; configuration and localization tests do not
apply. LICENSE retains juicesharp's
copyright and adds Thoth contributors' copyright.

Open-task reinjection uses the append-only approach demonstrated by
[gentle-shell](https://github.com/Gentleman-Programming/gentle-shell/blob/07f7d1d4bc6320de37a6c5c41dbf529ac0bc8b1b/extensions/gentle-todo.ts).

## Differences from upstream

- No configuration or localization dependencies: English text and upstream
  default tool guidance are fixed. Pi's tool-output expansion support is retained.
- Registers a v2 data-only Work panel provider (priority 20, label `Todos`) with
  a `completed/total done` counter. Every non-deleted task is listed; completed
  tasks are marked (completed glyph, dim, strikethrough) and are dropped first
  on overflow with an exact `+N done` line. Enter on any row, the heading or a
  summary line opens the Todos panel (pi-core history panel shell) with the
  current list grouped in progress, not started and completed, plus the selected
  task's details. `/todos` opens the same panel in the interactive TUI, uses text
  output in UI contexts without custom TUI, and reports `/todos requires interactive mode`
  in headless sessions. A fully completed list stays visible until the next
  recognized prompt, then disappears from the section, panel and `/todos`
  without changing task state. Todos have no close action.
- The provider reads only the foreground session's local store and notifies the
  host on every foreground mutation, replay, or ownership change. Children never
  rebind the panel or display their tasks in it. Headless sessions retain the
  tool, replay, context reinjection, and state publication without requesting UI.
  This package installs no widget, editor replacement, footer, input listener,
  or collapse shortcut; pi-core owns the shared panel and navigation.
- Renders `todo` calls/results through the theme's Render KIT when present,
  discovered through `@thoth-agents/pi-core` at render time. pi-core also renders
  the shared panel with the kit or native unframed output. Without the kit, tools
  keep native Pi rendering; there is no dependency on
  `@thoth-agents/pi-thoth-theme`.
- Publishes full `TodoSnapshot` envelopes through `@thoth-agents/pi-core` on
  `thoth:todo:state` after mutations and replay on `session_start`, `session_tree`,
  and `session_compact`. Snapshots include tombstones, status counts, `nextId`,
  and every task field (including metadata); missing `blockedBy` becomes `[]`.
  Source is `@thoth-agents/pi-todo`. Subscribe before requesting your session
  through pi-core's `TODO_STATE_REQUEST` channel (`thoth:todo:state:request`, v1).
  Use `request(pi.events, TODO_STATE_REQUEST, { sessionId, source, data: {} })`
  with the consumer's package as `source`; requests use the same versioned
  envelope as snapshots. Invalid requests are ignored. Requests received before
  replay are deferred; the replay broadcast answers them. Other sessions' state
  is never substituted for the requested session.
- Before each agent start, appends a compact block of this session's pending
  and in-progress tasks. Runtime detection checks mutable
  `systemPromptOptions.appendSystemPrompt` (present in both Pi 0.99.0 and 1.0.2).
  Unsupported hosts degrade without throwing. This never returns a replacement
  system prompt, preserving Pi/Claude bridge prompt sections. Repeated hooks
  replace the extension's own block instead of duplicating it.

## Work-panel compatibility and discovery

Upgrade pi-subagents, pi-background-tasks and pi-todo together to `>=0.3.0`, then
`/reload`. The shared registry remains first-owner-wins; mixed v1/v2 copies hide
incompatible sections. Todo rows contain semantic status and unstyled segments;
the host renders the `completed` role dim with theme strikethrough. There are no
row render callbacks or pre-styled glyphs/text.

pi-core's [discovery/action API](../pi-core/README.md#discovery-and-actions) lists
sources, subscribes to revisions, reads bounded rows and invokes same-session
open/history/close actions. Todos supports open/history, not close. The separate
task-state channel remains v1.

## Tool

`todo` supports `create`, `update`, `list`, `get`, `delete`, `clear`, and `batch`.
Statuses are `pending`, `in_progress`, `completed`, and `deleted` (tombstone).
Create accepts `pending` (default), `in_progress` or `completed`, not `deleted`.
Multiple tasks may be `in_progress` for parallel work; complete as soon as done.
Allowed status changes are `pending → in_progress | completed | deleted`,
`in_progress → pending | completed | deleted`, and `completed → deleted`;
same-status updates are allowed. Completed tasks cannot reopen; deleted tasks
are terminal. The tool supports `description`, `activeForm`, `owner`, and
`metadata`; updates merge metadata keys, with `null` deleting a key.
Set `blockedBy` on create only; updates use `addBlockedBy` / `removeBlockedBy`.
Dependency cycles are rejected. `list` accepts a `status` filter and excludes
deleted tasks unless `includeDeleted: true`. `clear` resets the entire list,
including tombstones, and restarts ids at 1.
Batch applies 1–50 ordered create/update/delete ops atomically; any failure leaves
state unchanged and reports the failing op index. A create may declare a unique
call-scoped `ref`. Later `id`, `blockedBy`, `addBlockedBy` and `removeBlockedBy`
fields accept numeric ids or string refs from earlier creates (even numeric-looking
strings are refs). Refs are not stored on tasks or available in later calls.

```json
{"action":"batch","ops":[
  {"action":"create","subject":"Research","ref":"research","status":"in_progress"},
  {"action":"create","subject":"Implement","blockedBy":["research"]}
]}
```

Each successful state-changing call persists its full details snapshot as an
`rpiv-todo-state` custom session entry, including calls nested inside codemode
and every successful batch. Reads, errors, rolled-back batches and unchanged
single updates append nothing. Session resume, tree navigation and compaction
replay the latest valid custom snapshot on the current branch, falling back to
legacy `todo` tool-result details only when no valid custom snapshot exists.
The upstream persistence format is retained, so existing history replays without
migration. Do not load both forks in the same session: they register the same
tool and command.

## Development

```sh
pnpm --filter @thoth-agents/pi-todo run typecheck
pnpm --filter @thoth-agents/pi-todo run test
pnpm --filter @thoth-agents/pi-todo run test:real-sdk
```

The packed real-SDK test packs both workspace packages, installs their tarballs
with npm into an OS temporary directory, and loads the installed extension with
Pi 1.0.2. It uses the locally installed SDK peers and npm's offline mode: no model
credentials, provider calls, or registry access are required.
