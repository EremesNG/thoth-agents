// biome-ignore lint/suspicious/noExplicitAny: The host owns renderer signatures; keep this optional-peer contract loose.
type ToolRenderer = (...args: any[]) => any;

/** SDK-independent renderer subset, compatible with the host resolver's result. */
export interface ToolRenderersLike {
  renderCall?: ToolRenderer;
  renderResult?: ToolRenderer;
  renderShell?: 'default' | 'self';
}

/** Minimal definition shape; publication preserves the full object and its fields. */
export interface ToolDefinitionLike extends ToolRenderersLike {
  name: string;
}

/** Owns one instance's publications, without withdrawing other instances' tools. */
export interface ToolDefinitionHandle {
  /** Add or replace this handle's tools; ignored after withdrawal. */
  publish(definitions: readonly ToolDefinitionLike[]): void;
  /** Remove this handle's publications. Repeated withdrawal is a no-op. */
  withdraw(): void;
}

interface Publication {
  token: symbol;
  definition: ToolDefinitionLike;
}

interface Registry {
  entries: Map<string, Publication[]>;
  version: number;
}

const registryKey = Symbol.for('thoth-agents.pi-core.tool-definitions.v1');
const shared = globalThis as typeof globalThis & {
  [registryKey]?: Registry;
};

function registry(): Registry {
  shared[registryKey] ??= { entries: new Map(), version: 0 };
  return shared[registryKey];
}

/** Publish full definitions for one instance; the latest live publication wins. */
export function publishToolDefinitions(
  definitions: readonly ToolDefinitionLike[],
): ToolDefinitionHandle {
  const state = registry();
  const entries = state.entries;
  const token = Symbol('tool-definition-publication');
  const names = new Set<string>();
  let live = true;
  const handle: ToolDefinitionHandle = {
    publish(more) {
      if (!live || !more.length) return;
      for (const definition of more) {
        names.add(definition.name);
        const publications = (entries.get(definition.name) ?? []).filter(
          (publication) => publication.token !== token,
        );
        publications.push({ token, definition });
        entries.set(definition.name, publications);
      }
      state.version++;
    },
    withdraw() {
      if (!live) return;
      live = false;
      for (const name of names) {
        const remaining = (entries.get(name) ?? []).filter(
          (publication) => publication.token !== token,
        );
        if (remaining.length) entries.set(name, remaining);
        else entries.delete(name);
      }
      if (names.size) state.version++;
      names.clear();
    },
  };
  handle.publish(definitions);
  return handle;
}

/** Look up the most recent live definition without re-evaluating its extension. */
export function getPublishedToolDefinition(
  name: string,
): ToolDefinitionLike | undefined {
  return registry().entries.get(name)?.at(-1)?.definition;
}

/** Monotonic change counter; nonempty publication/withdrawal batches increment once. */
export function getToolDefinitionRegistryVersion(): number {
  return registry().version;
}
