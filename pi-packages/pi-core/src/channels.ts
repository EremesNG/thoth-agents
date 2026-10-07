import { isNonEmptyString, isRecord } from './validation.js';

/** The structural pi.events contract shared by Pi 0.99.0 and 1.0.2. */
export interface EventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

export type Channel<T> = {
  readonly name: string;
  readonly version: number;
  readonly validate: (data: unknown) => data is T;
};

/** A versioned channel payload; snapshots are complete, not incremental deltas. */
export type ThothEnvelope<T> = {
  v: number;
  source: string;
  sessionId: string;
  /** Unix timestamp in milliseconds. */
  at: number;
  data: T;
};

export function defineChannel<T>(definition: Channel<T>): Channel<T> {
  return definition;
}

export function publish<T>(
  events: EventBus,
  channel: Channel<T>,
  snapshot: { sessionId: string; source: string; data: NoInfer<T> },
): void {
  events.emit(channel.name, {
    v: channel.version,
    source: snapshot.source,
    sessionId: snapshot.sessionId,
    at: Date.now(),
    data: snapshot.data,
  } satisfies ThothEnvelope<T>);
}

export function request<T>(
  events: EventBus,
  requestChannel: Channel<T>,
  payload: { sessionId: string; source: string; data: NoInfer<T> },
): void {
  publish(events, requestChannel, payload);
}

export function onRequest<T>(
  events: EventBus,
  requestChannel: Channel<T>,
  options: {
    sessionId?: string;
    onRequest: (request: ThothEnvelope<T>) => void;
  },
): () => void {
  return subscribe(events, requestChannel, {
    sessionId: options.sessionId,
    onSnapshot: options.onRequest,
  });
}

export function subscribe<T>(
  events: EventBus,
  channel: Channel<T>,
  options: {
    sessionId?: string;
    onSnapshot: (snapshot: ThothEnvelope<T>) => void;
  },
): () => void {
  return events.on(channel.name, (value) => {
    if (!isEnvelope(value, channel, options.sessionId)) return;
    options.onSnapshot(value);
  });
}

function isEnvelope<T>(
  value: unknown,
  channel: Channel<T>,
  sessionId?: string,
): value is ThothEnvelope<T> {
  try {
    return (
      isRecord(value) &&
      value.v === channel.version &&
      isNonEmptyString(value.source) &&
      isNonEmptyString(value.sessionId) &&
      (sessionId === undefined || value.sessionId === sessionId) &&
      typeof value.at === 'number' &&
      Number.isFinite(value.at) &&
      value.at >= 0 &&
      channel.validate(value.data)
    );
  } catch {
    // Ignore validation/accessor failures; consumer callback errors stay visible.
    return false;
  }
}
