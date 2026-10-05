# @thoth-agents/pi-core

Shared, typed event contracts for the Thoth Pi ecosystem. This is a library,
**not a Pi extension**: it registers no tools or UI and has no `pi.extensions`
entry. It ships TypeScript source for consumption by Pi extensions, with no build
step or runtime dependencies. The optional Pi SDK peer is for type compatibility;
all helpers accept the minimal structural `pi.events` interface.

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

## Development

From the repository root:

```sh
pnpm --filter @thoth-agents/pi-core run typecheck
pnpm --filter @thoth-agents/pi-core run test
```

MIT; copyright thoth-agents contributors.
