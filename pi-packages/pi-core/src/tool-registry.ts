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

const TOOL_DEFINITION_REGISTRY_VERSION = 1;
const registryKey = Symbol.for(
  `thoth-agents.pi-core.tool-definitions.v${TOOL_DEFINITION_REGISTRY_VERSION}`,
);
const shared = globalThis as typeof globalThis & {
  [registryKey]?: unknown;
};

function isPublication(publication: Publication | null, name: string): boolean {
  const definition = publication?.definition;
  return (
    typeof publication?.token === 'symbol' &&
    definition?.name === name &&
    (definition.renderCall === undefined ||
      typeof definition.renderCall === 'function') &&
    (definition.renderResult === undefined ||
      typeof definition.renderResult === 'function') &&
    (definition.renderShell === undefined ||
      definition.renderShell === 'default' ||
      definition.renderShell === 'self')
  );
}

function registry(): Registry | undefined {
  try {
    if (shared[registryKey] === undefined)
      shared[registryKey] = { entries: new Map(), version: 0 };
    const state = shared[registryKey] as Registry | null;
    if (
      !state ||
      !(state.entries instanceof Map) ||
      !Number.isSafeInteger(state.version) ||
      state.version < 0
    )
      return undefined;
    for (const [name, publications] of state.entries) {
      if (
        typeof name !== 'string' ||
        !Array.isArray(publications) ||
        !publications.every((publication) => isPublication(publication, name))
      )
        return undefined;
    }
    return state;
  } catch {
    // Foreign records (including throwing accessors) act like no registry.
    return undefined;
  }
}

/** Publish full definitions for one instance; the latest live publication wins. */
export function publishToolDefinitions(
  definitions: readonly ToolDefinitionLike[],
): ToolDefinitionHandle {
  const state = registry();
  if (!state) return { publish() {}, withdraw() {} };
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
  return registry()?.entries.get(name)?.at(-1)?.definition;
}

/** Monotonic change counter; nonempty publication/withdrawal batches increment once. */
export function getToolDefinitionRegistryVersion(): number {
  return registry()?.version ?? 0;
}
