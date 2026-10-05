# @thoth-agents/pi-core

Shared, typed event and rendering contracts for the Thoth Pi ecosystem. This is a library,
**not a Pi extension**: it registers no tools or UI and has no `pi.extensions`
entry. It ships TypeScript source for consumption by Pi extensions, with no build
step or runtime dependencies. The optional Pi SDK and TUI peers are for type
compatibility only; event helpers accept the minimal structural `pi.events`
interface. Pi imports in the render contract are type-only.

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

## Render KIT v1

`ThothRenderKit` describes the theme-owned visual language. pi-core contains no
TUI implementation or timers. `pi-thoth-theme` supplies the kit at runtime;
producers have no dependency on that package.

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

Consumers depend on pi-core with `workspace:^`. Publish pi-core before consumers,
and use `pnpm pack` / `pnpm publish` so packed manifests contain a semver range.
For pi-subagents, semantic-release keeps `@semantic-release/npm` with
`npmPublish: false` for version preparation; pinned `@semantic-release/exec`
runs `pnpm publish --no-git-checks` (including `prepublishOnly`).

The npm plugin 13.1.5's existing credential contract is configured npmrc auth
(including `NPM_CONFIG_USERCONFIG`) or `NPM_TOKEN`. With npm publishing disabled,
the plugin skips auth setup, so the exec command preserves configured auth and,
only when missing and `NPM_TOKEN` is supplied, copies the user npmrc to an OS-temp
file with registry-scoped `_authToken=${NPM_TOKEN}` interpolation. Registry
resolution honors package `publishConfig.registry`, `NPM_CONFIG_REGISTRY`, scoped
npmrc registry and the default registry. pnpm receives the temporary file via
`NPM_CONFIG_USERCONFIG`; it is removed on both success and failure. No token is
embedded in command arguments or checked-in files. Without `NPM_TOKEN`, existing
npmrc/trusted-publishing configuration is left to pnpm unchanged; no new
credential or release workflow is introduced.

## Development

From the repository root:

```sh
pnpm --filter @thoth-agents/pi-core run typecheck
pnpm --filter @thoth-agents/pi-core run test
```

MIT; copyright thoth-agents contributors.
