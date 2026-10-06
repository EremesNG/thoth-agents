# @thoth-agents/pi-todo

Session-owned task lists for Pi. Registers the `todo` tool, `/todos` command,
and a Todos section in pi-core's shared Work panel. Requires Node >=22.19 and
Pi >=0.99.0.

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
- Registers a versioned Work panel provider (priority 20, label `Todos`) with
  a `completed/total done` counter. Open tasks appear in-progress first (with
  their active form), then pending, followed by `+N done` when completed tasks
  exist. Deleted tasks are excluded; an empty list hides the section. Enter opens
  the host's subject/status/description detail; todos have no close action.
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

## Tool

`todo` supports `create`, `update`, `list`, `get`, `delete`, and `clear`.
Statuses are `pending`, `in_progress`, `completed`, and `deleted` (tombstone).
Completed tasks cannot reopen; deleted tasks are terminal. The tool supports
`description`, `activeForm`, `owner`, `metadata`, `blockedBy`, `addBlockedBy`,
`removeBlockedBy`, and `includeDeleted`. Dependency cycles are rejected.
Tool-result details retain the upstream persistence format, so existing `todo`
history replays without migration. Do not load both forks in the same session:
they register the same tool and command.

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
