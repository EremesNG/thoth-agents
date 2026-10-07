import type { EventBus } from '@earendil-works/pi-coding-agent';

export function createFakeBus(): EventBus {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  return {
    emit(channel, data) {
      for (const listener of listeners.get(channel) ?? []) listener(data);
    },
    on(channel, handler) {
      let handlers = listeners.get(channel);
      if (!handlers) {
        handlers = new Set();
        listeners.set(channel, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
