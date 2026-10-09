# @thoth-agents/pi-core

Shared, typed event and rendering contracts for the Thoth Pi ecosystem. This is a library,
**not a Pi extension**: importing it registers no tools or UI, and it has no
`pi.extensions` entry. It ships TypeScript source with no build step. Event and
render contracts use type-only Pi imports; the opt-in Work panel host lazily loads
the optional SDK/TUI peers. Event helpers accept the minimal structural
`pi.events` interface.

Requires Node >=22.19.0. Supports the event bus in Pi >=0.99.0; development and
tests use SDK 1.0.2.

## API

```ts
interface EventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

type Channel<T> = {
  readonly name: string;
  readonly version: number;
  readonly validate: (data: unknown) => data is T;
};
type ThothEnvelope<T> = {
  v: number;
  source: string;
  sessionId: string;
  at: number; // Unix milliseconds
  data: T;
};

defineChannel<T>(definition: Channel<T>): Channel<T>;
publish<T>(events: EventBus, channel: Channel<T>, snapshot: {
  sessionId: string; source: string; data: NoInfer<T>;
}): void;
request<T>(events: EventBus, requestChannel: Channel<T>, payload: {
  sessionId: string; source: string; data: NoInfer<T>;
}): void;
subscribe<T>(events: EventBus, channel: Channel<T>, options: {
  sessionId?: string;
  onSnapshot: (snapshot: ThothEnvelope<T>) => void;
}): () => void;
onRequest<T>(events: EventBus, requestChannel: Channel<T>, options: {
  sessionId?: string;
  onRequest: (request: ThothEnvelope<T>) => void;
}): () => void;
isTodoSnapshot(value: unknown): value is TodoSnapshot;
isTodoStateRequest(value: unknown): value is TodoStateRequest;
isSubagentsSnapshot(value: unknown): value is SubagentsSnapshot;
isSubagentsStateRequest(value: unknown): value is SubagentsStateRequest;
isSubagentsUsageSnapshot(value: unknown): value is SubagentsUsageSnapshot;
isSubagentsUsageRequest(value: unknown): value is SubagentsUsageRequest;
isBackgroundSnapshot(value: unknown): value is BackgroundSnapshot;
isBackgroundStateRequest(value: unknown): value is BackgroundStateRequest;
```

`publish` and `request` add the channel version and current timestamp to typed
payload data. Every channel, including requests, uses a `Channel<T>` definition
and the same `{ v, source, sessionId, at, data }` envelope.
`subscribe` and `onRequest` ignore unsupported versions, foreign session IDs when
filtered, malformed envelope fields, and invalid payloads (including throwing
validators). Without a session filter they receive all valid envelopes on that
channel. Errors in callbacks are not swallowed. Returned functions unsubscribe
from the bus.

`onRequest` passes the validated envelope to the producer. Producers must answer
only for their session, and queue requests until state is ready when needed;
these lifecycle concerns stay outside the library.

## Task-list contract

- `TODO_STATE_CHANNEL`: `thoth:todo:state`, version 1, validated `TodoSnapshot`.
- `TODO_STATE_REQUEST`: `thoth:todo:state:request`, version 1, validated
  `TodoStateRequest`.
- `TodoStateRequest`: `Record<string, never>`, an empty plain object (`{}`);
  the target session ID belongs to the envelope, not the request data.
- `TodoStatus`: `pending | in_progress | completed | deleted`.
- `TodoTask`: numeric `id`, string `subject`, optional string `description`,
  `activeForm` and `owner`, `status`, and required numeric array `blockedBy`.
- `TodoSnapshot`: `tasks: TodoTask[]`, `nextId: number`, and `counts: TodoCounts`.
- `TodoCounts`: all four status keys, each a non-negative integer.

The snapshot contains no session identity; that lives in the envelope. IDs,
blocker IDs and `nextId` are positive safe integers. Normalize absent blockers to
`[]` when publishing. The validator checks structure, not graph invariants,
count/task consistency or reducer transition rules. Additional object fields are
allowed. Snapshots are complete state, including deleted tombstones, not deltas;
consumers replace previous state.

Subscribe **before** requesting because a producer can respond synchronously:

```ts
import {
  onRequest, publish, request, subscribe,
  TODO_STATE_CHANNEL, TODO_STATE_REQUEST,
} from '@thoth-agents/pi-core';

const offProducer = onRequest(pi.events, TODO_STATE_REQUEST, {
  sessionId,
  onRequest: ({ sessionId }) => {
    publish(pi.events, TODO_STATE_CHANNEL, {
      sessionId,
      source: '@thoth-agents/pi-todo',
      data: currentSnapshot,
    });
  },
});
const offConsumer = subscribe(pi.events, TODO_STATE_CHANNEL, {
  sessionId,
  onSnapshot: ({ data }) => { currentSnapshot = data; },
});
request(pi.events, TODO_STATE_REQUEST, {
  sessionId,
  source: '@thoth-agents/example-consumer',
  data: {},
});
// Also publish complete snapshots after each mutation/replay.
// On disposal: offConsumer(); offProducer();
```

Transport is within one Pi session runtime. Cross-process delivery, child/parent
bus sharing and persistence are not provided by this package.

## Task summary and usage channels v1

All definitions, payload types and validators below are exported from the root
entry, with no runtime Pi/TUI dependency. Each state publication is a complete,
read-only snapshot, not a delta. Session identity belongs to the envelope.

| Definition | Channel | Data |
| --- | --- | --- |
| `SUBAGENTS_STATE_CHANNEL` | `thoth:subagents:state` | `SubagentsSnapshot` |
| `SUBAGENTS_STATE_REQUEST` | `thoth:subagents:state:request` | `SubagentsStateRequest` |
| `BACKGROUND_STATE_CHANNEL` | `thoth:background:state` | `BackgroundSnapshot` |
| `BACKGROUND_STATE_REQUEST` | `thoth:background:state:request` | `BackgroundStateRequest` |
| `SUBAGENTS_USAGE_CHANNEL` | `thoth:subagents:usage` | `SubagentsUsageSnapshot` |
| `SUBAGENTS_USAGE_REQUEST` | `thoth:subagents:usage:request` | `SubagentsUsageRequest` |

Every definition has version 1. Producer sources are
`@thoth-agents/pi-subagents` and `@thoth-agents/pi-background-tasks` respectively;
request sources identify the consumer package. All three request types are
`Record<string, never>` and accept only empty plain or null-prototype objects.
Subscribe before requesting with `data: {}`, as in the task-list example above.

### Subagents

- `SubagentStatus`: `queued | running | stopping | completed | failed |
  cancelled | interrupted`.
- `SubagentMode`: `task | background`.
- `SubagentEffort`: `off | minimal | low | medium | high | xhigh | max`.
- `SubagentTaskSummary`: required `id`, `agent`, `mode`, `status`, `createdAt`;
  optional `displayName`, `model`, `effort`, `startedAt`, `endedAt`,
  `lastActivityAt`, `usage`, `preview`. IDs and agent names are non-empty strings.
- `SubagentTaskUsage`: optional `input` and `output` token counts and `cost`.
  Token counts are non-negative safe integers; cost is finite and non-negative.
- `SubagentsSnapshot`: `tasks: SubagentTaskSummary[]`, `counts: SubagentsCounts`,
  `totals: SubagentsTotals`. Tasks are the active session's in-memory tasks;
  totals carry persisted session counts without history task details or IDs.
- `SubagentsCounts`: all seven status keys, each a non-negative safe integer.
  `SubagentsTotals`: the same keys plus required non-negative safe integer `total`.
  Producers normalize missing persisted status counts to zero.
- `preview` is a string of at most `SUBAGENT_PREVIEW_MAX_LENGTH` (800) UTF-16
  code units; producers truncate before publication.
- `SubagentsUsageSnapshot`: exactly `totalCost` (finite non-negative number) and
  `runCount` (non-negative safe integer), cumulative for the envelope's parent
  session. There is no `parentSessionId` in data. This channel replaces the raw
  `thoth:subagent-usage` bus event; the persistence discriminator is unchanged.

### Background tasks

- `BackgroundTaskStatus`: `running | succeeded | failed | cancelled | timed_out`.
- `BackgroundTaskKind`: `process | command_watch`.
- `BackgroundTaskSummary`: required `id`, `kind`, `status`, `createdAt`,
  `startedAt`; optional string `name`, lifecycle times `endedAt`, `deadlineAt`,
  `lastCheckedAt`, `lastProgressAt`, `stopRequestedAt`, `dismissedAt`, and
  `exitCode`, `signal`, `progress`, `dismissed`. IDs are non-empty strings.
  Metadata without a separate creation time uses its `startedAt` as `createdAt`.
- `exitCode` is a signed safe integer or null; `signal` is a non-empty string or
  null. `dismissed` is boolean. `progress` is a finite number or a string of at
  most `BACKGROUND_PROGRESS_MAX_LENGTH` (200) UTF-16 code units, not structured
  state or command output.
- `BackgroundSnapshot`: `tasks: BackgroundTaskSummary[]`, `counts:
  BackgroundCounts`, for the current cwd/session origin, including dismissed
  tasks. `BackgroundCounts` requires all five status keys as non-negative safe
  integers.

All lifecycle times in both summaries are non-negative safe integers in Unix
milliseconds, matching envelope `at`; subagent producers convert ISO timestamps.
Optional fields may be absent or undefined, but not null except exit code/signal.
Unlike the task-list contract, these validators reject **every unknown own key**
on snapshots, task entries, counts, totals and usage, including symbol and
non-enumerable keys; custom-prototype objects are also rejected. Prompts, context,
transcripts, results, thread snapshots, questions, commands, argv, environment,
stdout/stderr and log paths have no place in these payloads. Validators check
shape and bounds, not count/task consistency, timestamp ordering or lifecycle
transition rules, and return false on throwing accessors or proxies.

## Render KIT v1

`ThothRenderKit` describes the theme-owned visual language. The render-kit
contract owns no UI or timers. `pi-thoth-theme` supplies the kit at runtime;
producers have no dependency on that package. The opt-in Work panel host owns
its own widget and refresh lifecycle.

```ts
interface ThothRenderKit {
  readonly version: 1;
  card(theme: RenderKitTheme, options: RenderCardOptions, width: number): string[];
  collapse(theme: RenderKitTheme, rows: readonly string[], options?: RenderCollapseOptions): string[];
  cachedComponent(render: (width: number) => string[]): Component;
  indicator(theme: RenderKitTheme, context?: RenderIndicatorContext, options?: RenderIndicatorOptions): RenderIndicator;
  statusGlyph(theme: RenderKitTheme, status: RenderStatus): string;
  widgetHeading(theme: RenderKitTheme, options: RenderWidgetHeadingOptions, width: number): string;
  treeRow(theme: RenderKitTheme, options: RenderTreeRowOptions, width: number): string;
  fg(theme: RenderKitTheme, role: ThemeColor, text: string): string;
}
registerRenderKit(kit: ThothRenderKit, owner: object): RenderKitToken;
withdrawRenderKit(token: RenderKitToken): void;
getRenderKit(): ThothRenderKit | undefined;
formatDuration(ms: number): string;
```

- `RenderKitTheme` is a structural `Theme` subset: `fg`, optional `bold` and
  `strikethrough`. `Component` and `ThemeColor` are SDK/TUI types, not runtime
  dependencies. All `Render*` option/result types are exported from the root.
- Cards accept optional `title`, `body`, `sections: { title?, rows }[]`, `footer`,
  `status`, `isError` and `wrap`. Every section starts with a labeled or unlabeled
  divider. Status and footer are embedded according to the theme's language.
  Rows are pre-sanitized/pre-styled strings or a `(contentWidth) => rows` callback;
  the kit handles frame width, padding, truncation and optional wrapping. Widths
  are finite viewport cell counts; zero width produces no lines.
  `part: 'full'` (default) includes both borders, `'start'` omits the bottom,
  and `'end'` omits the top, allowing call/result slots to form one frame.
- Collapse takes `expanded`, a non-negative content-row `budget` (default 8;
  `Infinity` disables folding), and optional complete `expandHint`. The hint is
  an extra row beyond the budget and appears only when rows are hidden. The
  implementation resolves the current expand key when no hint is supplied.
- Each cached component caches independently by width. `invalidate()` clears
  every width; invalidate when its inputs or theme change. Do not cache kit
  discovery inside a component across renders.
- Indicator context structurally accepts the SDK's `executionStarted`,
  `isPartial`, `isError`, `invalidate` and shared `state`. Options accept an
  explicit `status`, `elapsedMs` (producer-owned background runtime), `label` and
  optional caller-owned `frame`. A finite frame selects the ten-frame braille
  sequence (`⠋`, `⠙`, …), floored and wrapped, for `running`/`in_progress` only;
  without it, the implementer's elapsed-time animation is unchanged. Widgets
  with their own refresh loop pass a frame without creating an indicator timer.
  This optional field is additive to v1; existing callers need no changes.
  The result has styled `glyph`, `elapsed`, `text` and optional numeric
  `elapsedMs`; `elapsed` is empty when unknown. Call it at render time. The
  implementer owns state, ticking and cleanup, scoped to its interactive UI
  session; a headless child's lifecycle must not freeze parent indicators.
- Status names: `pending`, `queued`, `in_progress`, `running`, `completed`,
  `failed`, `cancelled`, `interrupted`, `stopping`, `deleted`, `blocked`, `unknown`.
  Producers normalize domain statuses to these names rather than supplying
  hardcoded glyphs or colors.
- Widget headings take `title`, optional `{ completed, total }` counts, `status`
  and `suffix`. Tree rows take pre-styled `text`, optional `depth`, `last`,
  `selected` and `status`. Both are width-aware. Keyboard/navigation behavior
  stays with the producer; use `fg` for other SDK theme-role styling. To group
  content without truncation, measure the visible width of `treeRow` with empty
  `text` and the same row options, then subtract that rail width from the viewport.
  The theme reserves 5 cells at depth zero and 7 at depth one, selected or not
  (an optional status adds its own glyph and space).

The process-wide registry lives at
`globalThis[Symbol.for('thoth-agents.pi-core.render-kit.v1')]`, including across
separately loaded library copies. It holds one `{ kit, owner, token }` record;
registration replaces the previous record and returns a fresh symbol token.
Withdrawal is idempotent, removes only that token's registration, and never
restores an older kit. Missing, unsupported-version or malformed kits are ignored.
The theme registers only for its UI session with styling enabled, and withdraws
only its own token. Headless children must not register or withdraw the parent kit.

Look up `getRenderKit()` **inside each render**, not at extension load time or
component creation. Every migrated tool declares stable `renderShell: 'self'`:
when the kit is absent, the producer renders a native pi-tui `Box(1, 1, bg)` with
`toolPendingBg`, `toolSuccessBg` or `toolErrorBg`, matching the SDK default shell.
The SDK freezes shell choice at component construction, so kit presence must
never control `renderShell`. Message/widget fallbacks retain native presentation.

`formatDuration` preserves the theme's millisecond semantics: non-finite or
non-positive inputs give `0s`; below 1 second it floors to `ms`; below 1 minute
it rounds to one decimal second without `.0`; below 1 hour it gives `Nm SSs`;
otherwise `Nh MMm`. No clock reads, side effects or locale dependencies.

### Shared test kit

```ts
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
const token = registerRenderKit(createTestRenderKit(), {});
// Exercise kit-present rendering, then withdraw and re-render the same component.
withdrawRenderKit(token);
```

The fake emits simple `╭─ title`, `├─ section`, `╰─ status · footer` markers
(`!` for error cards), uncolored glyphs, deterministic collapse hints and real
per-width caching. It has no timers, state mutation or wall-clock reads; elapsed
text uses only an explicit `elapsedMs`. Caller-owned `frame` values select the
same braille sequence as the real adapter, and tree rows reserve the same
selection gutter/rail width whether selected or not. `fg` passes text through.
Its clipping counts code points, not terminal cells, and it does not wrap or
interpret ANSI: keep real-theme tests for terminal layout and ticker behavior.
Producers share this helper rather than defining package-local kits.

### Workspace package release

Consumers depend on pi-core with `workspace:^`. `pnpm pack` and `pnpm publish`
rewrite it to a semver range (for example `^0.1.0`) in the packed manifest.
Every `pi-packages/*` package is versioned independently and published to npm
by the root `v*.*.*` tag release workflow (`.github/workflows/release.yml`)
through npm trusted publishing, before the root package. Publish pi-core before
its consumers on first publication; later bumps follow the root release flow.

## Panel primitives and list editor

Import TUI panels from `@thoth-agents/pi-core/panel`, like the existing
`/history-panel` subpath. This entry needs the optional `pi-tui` peer; the root
entry remains importable without runtime Pi peers. No runtime coding-agent
import is added.

The `./panel` entrypoint exports `registerEditorSlot` for shared above-editor
rows, active editor replacements, and terminal-input routing. Contributions
retain editor callbacks and app actions. Expanded questions acquire focus through
owned-overlay handles; collapsed questions return input to the editor, and
teardown preserves visible foreign-overlay focus.

- `panelVisibleWidth(text)`, `truncatePanelText(text, width)` and
  `padPanelText(text, width)` use terminal cells and preserve ANSI/OSC styling.
- `renderPanelFrame({ title, rows, width, maxHeight?, theme? })` draws the titled
  rounded frame using current render-kit glyphs and tones, with a native fallback
  and tiny-size degradation. `PanelRow` is `{ text, selected?, tone? }`;
  `renderPanelRow(row, width, theme?)` fills selected rows with `selectedBg` after
  padding, and `panelHintRow(text)` creates a muted hint.
  `createPanelFrame({ theme?, text, borderTone? })` composes styled border spans,
  side content, multi-column cells and junction/divider rows; `text` supplies
  clipping, padding and measurement for legacy-compatible output.
  `renderPanelCard({ title, body, width, maxHeight?, theme, text })` selects a
  semantic render-kit card or the native frame through the same primitive.
- `normalizePanelKey(data, matchesKey?)` recognizes terminal/application arrows,
  home/end, enter, escape, backspace, space and Ctrl-U, including Pi's native
  CSI-u/kitty encodings by default; Ctrl-C is escape. `matchesPanelKey` exposes
  native Pi matching without list-editor aliases. Literal
  terminal controls take precedence over custom bindings; ordinary input keeps
  its case. `panelMouseClick(data)` and `panelMouseWheelDelta(data)` parse
  SGR/urxvt/X10 input, preserving the history helpers' behavior and exports.
- `panelViewport(count, cursor, budget, maxRows?)` returns `{ start, end, notice? }`
  with an exclusive end and cursor-centered window. The budget includes a range
  notice; `maxRows` caps only choices. `PanelDiscardConfirmation` provides
  `request(dirty)`, `active`, `handleInput(data)` and `rows()`: d discards, k/esc
  resumes.
- `openPanelOverlay<T>(ctx, factory, options?)` wraps `openOwnedOverlay` with
  centered 96% width / 90% maximum height by default; owned-overlay options can
  override geometry. The factory receives `(tui, theme, keys, close, host)`;
  pass `host.maxHeight` and `host.requestRender` to the shell. Height is resolved
  from terminal rows on every render. In regular TUI mode, the host enables
  mouse reporting for wheel navigation and releases it on close, rejection or
  disposal (nested panels share a terminal lease). Fullscreen-owned tracking is
  left untouched.

`createListEditor(options)` returns a `ListEditor` component (`render`,
`handleInput`, `invalidate`, `getState`) with `openPicker(view, initialIndex?)`
and `showOverview()`. Options include `overview`, `wideBreakpoint` (outer width,
84 by default; use 102 for models), `maxHeight`, `theme`, `matchesKey`, optional
`pendingCount`, `onSave`, `onSaved`, `onCancel` and `requestRender`.

A view supplies `title`, `rows()` and optional `hints`, `header(context)`,
`footer(context)`, `maxVisibleRows`, `navigation: 'clamp' | 'wrap'` and `filter`.
Rows are `{ id, label, dirty? }`; labels may be functions of
`{ layout: 'wide' | 'compact', width, index, selected, filter }`. The width excludes
frame padding and selection/dirty markers. Domain drafts and persistence stay in
the adapter. `onAction(key, row, editor)` returns true to consume custom actions
(e.g. opening another picker, toggling tools or resetting a profile).

Navigation and typed filters precede custom actions. Arrows/j/k move; home/end
and g/G jump (g/G become text once a filter is nonempty). Filter views consume
other printable text, including q/s; backspace removes one code point and Ctrl-U
clears. Filters can supply `text(row)` or `matches(row, lowercaseQuery)`.
Opening/replacing a picker resets its filter/cursor; returning to overview restores
its cursor. Wheel input moves selection without wrapping. An unhandled picker
enter/esc/q returns to overview; an unhandled overview s saves and esc/q cancels.

`onSave` returns `{ success, error?, warning? }` (or a promise), or undefined for
success. Failures remain editable and retain discard protection even after a
partial save clears dirty rows. Thrown persistence errors become visible failures.
Save/cancel input is blocked while an asynchronous save is pending; completion
callbacks fire once. Dirty cancellation asks for d discard or k/esc resume.
Height fitting prioritizes save messages, hints and the selected row over metadata
and footers; a terminal too short for a frame shows only its title.

## Development

From the repository root:

```sh
pnpm --filter @thoth-agents/pi-core run typecheck
pnpm --filter @thoth-agents/pi-core run test
```

MIT; copyright thoth-agents contributors.

## Work panel v1

```ts
registerWorkPanelProvider(pi: ExtensionAPI | ExtensionContext,
  provider: WorkPanelProvider): () => void;
ensureWorkPanel(ctx: ExtensionContext): Promise<() => void>;
isWorkPanelRootEditorInputActive(ctx: ExtensionContext): boolean | undefined;
bindWorkPanelLifecycle(pi: ExtensionAPI, ctx: ExtensionContext): () => void;
getWorkPanelLifecycle(ctx: ExtensionContext): WorkPanelLifecycleState;
```

`WORK_PANEL_VERSION` is `1`. Providers carry `version`, `id`, `label`, `priority`,
`visibleCount`, `listRows(now)`, `detail(id, now, { logTailLines? })`,
`armCloseLabel(row)` and `close(id)`. Optional methods are `summary`, `open`,
`showSection`, `parentRow` and `onVisibleChanged`. Use priorities 10/20/30 for
Agents/Todos/Background. Lists retain provider ordering and empty sections hide.
`visibleCount()` is advisory; the host derives interaction cues and the footer
count from selectable rows in shown sections, excluding summaries and expired rows.
`summary()` returns counter text or `{ text?, running?, failed?, completed?, total? }`.
Return an empty close label for items with no close action.

The process-wide `Symbol.for('thoth.pi-core.work-panel')` registry shares providers
and in-flight installations across bundled copies. Each session manager/session
id contributes one above-editor widget and input routing through the shared
editor-slot owner, which installs one editor factory and terminal-input listener
per session. Await `ensure` in session-start handlers; each call returns an idempotent, reference-counted
release. The final release or final provider unregister tears down the host.
Registering with `pi` also hooks session shutdown automatically. **Context-only
callers must release on shutdown themselves.** Provider unregister is token-owned,
so a stale disposer cannot remove a replacement registration. Session shutdown
removes the host, not providers; extension owners unregister providers on unload.

Rows need `id` and `primary`, with optional name, status/tone, elapsed and legacy
navigator metadata. `row.render(bodyWidth, now)` returns `{ text, extraRows? }`:
truncate the task label before metrics, and put metrics in a continuation only
when they cannot fit inline. Continuations and `summary: true` rows are not
selectable. `statusGlyph` may be a string or `(now) => string`.
Set `refreshIntervalMs` to request ticks (minimum 100ms); the host ticks only while that provider has running/in-progress rows.
Notify through `onVisibleChanged` for all state changes; transient `expiresAt`
rows also request a one-shot expiry render. Timers stop on teardown.

The preferred item cap is 3 per section (`rowCap` overrides it), not a hard limit:
caps are exceeded when the total space budget permits. The entire panel, including
its hint row, fits 12 rows or half the terminal height, whichever is smaller.
Hidden items show `+N more`; navigation still traverses all items and
keeps the selected item visible. At very short heights, lower-priority sections
may be omitted to preserve the selected item's metrics. There are no blank
separator rows. Render-kit discovery happens on every render, with unframed
native output when absent.

The panel's bottom-left hint row appears only when a selectable row exists across
its shown sections: dim `← interact` when unfocused and selection-aware controls
when focused. The footer shows `← work · N`, counting only selectable rows.
Left focuses only with selectable rows and a truly empty root editor; otherwise
it passes through. Unfocused up/down retain Pi's history behavior. Focused: up/down move across sections, Enter opens, x (only for
closable items) requires two presses within 3 seconds, Esc/right release. Editor
identity, focused component and overlay guards fail closed. Providers with a custom
`open` (such as subagents) show their own UI instead of the generic detail card.
The host suspends input before invoking `open(id, ctx)` and releases focus when it
settles: **custom UI providers must return a promise that resolves only after their
UI closes**.
Without `open`, a centered, framed opaque detail card shows styled metadata,
section headings and evidence. Its size is fixed for the largest item in the
opened section, capped by the terminal; card up/down stays within that section
and stops at its ends. Folding appears only for oversized content, log-tail `l`
only when the provider supports it, and `x` only when the item is closable.
The card auto-closes and releases panel focus when another overlay, custom UI,
native dialog or replaced editor takes focus, leaving Esc to the new UI.
SDK/TUI imports are lazy and optional; missing focus hooks disable interception
instead of guessing.

`isWorkPanelRootEditorInputActive(ctx)` is a read-only query of that session's
editor-identity, focused-component, overlay and suspension guards. It installs
nothing, consumes no input and does not require an empty editor or Work focus.
It returns `true` only when the installed host's root editor is input-active,
`false` when guarded, and `undefined` when the session has no installed host.
Separate task-mode controls can reuse it; callers own their no-host fallback.

### Prompt retention (additive v1 opt-in)

Providers may set `retention: 'prompt'`, supply each item's
`state: 'running' | 'failed' | 'done'` and terminal `endedAt` (Unix milliseconds),
and implement `openHistory(ctx)`. Normalize queued/stopping work to `running`,
and timed-out work to `failed`. Presentation `status`, glyphs and formatting
remain independent. Providers without this opt-in keep the behavior above,
including the task-list's informational summaries and advisory row caps.

Opting-in extensions call `bindWorkPanelLifecycle(pi, ctx)` on session activation,
before `ensureWorkPanel(ctx)`. Only the first live binding for that session
manager/session ID subscribes; later bindings return inert disposers. The owning
binding's release, session replacement or shutdown unsubscribes and clears its
state/candidates, allowing a fresh binding to take over. Binding installs no UI.
`getWorkPanelLifecycle` returns a read-only snapshot
`{ epoch, epochStartedAt, busy }`; busy initializes from `!ctx.isIdle()` and is
refreshed on `agent_start`/`agent_settled`, never `agent_end`.

Epoch boundaries are an **observed-text heuristic**, not an origin guarantee.
The bridge retains the latest four non-blank interactive/RPC input texts observed
while `ctx.isIdle()`. A `before_agent_start` advances the epoch only if its prompt
exactly equals a retained candidate, consuming one matching occurrence. Earlier
handlers' transforms are already part of the observed text. Later transforms or
prompt expansion, handled inputs with no matching later run, distinct extension
prompts/wake-ups, and steer/followUp entered while streaming do not advance it.
Conversely, *any* run matching retained text advances it, including an extension
run or another input transformed into a coincidentally equal prompt. Candidates
survive unrelated/interleaved runs until matched, evicted or disposed.

While busy, or while that section has running items, rows eligible for the panel
are all running items, all failures ending at/after `epochStartedAt`, and the
three most recent completions ending at/after it. Missing/non-finite terminal
`endedAt` values are ineligible. Provider ordering is retained; equal completion
times prefer the provider's earlier rows. Legacy `expiresAt` does not apply to
opted-in rows. Budget overflow counts only eligible rows, never older history or
completions excluded by the hard cap. This filters the panel, not provider storage.

When idle with no running items, each opted-in section becomes one selectable
heading: e.g. `▲ Agents · 4 done · 1 failed`. Session counts come from numeric
`summary().completed`/`summary().failed` when supplied, otherwise from all listed
items; provide totals explicitly when dismissed items are omitted from `listRows`.
Even an empty opted-in section has a summary unless `showSection` suppresses it.
Summary lines share the single cursor with item rows: left focuses, up/down move,
Enter invokes `openHistory(ctx)`, Esc/right release. They have no close action;
the hint advertises history only when an opener exists. Like `open`, asynchronous
`openHistory` must resolve only once its UI closes so host input stays suspended.
