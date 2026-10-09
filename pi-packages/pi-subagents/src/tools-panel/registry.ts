export interface ToolsDefinitionTarget {
  role: string;
  filePath: string;
  scope: 'global' | 'project';
}

/** Structural v1 protocol: a host need not import this package to register. */
export interface ToolsPanelAdapter {
  version: 1;
  appliesTo(target: ToolsDefinitionTarget, content: string): boolean;
  validate(target: ToolsDefinitionTarget, content: string): void;
  defaultTools?(
    target: ToolsDefinitionTarget,
    content: string,
  ): readonly string[] | undefined;
}

export interface ToolsPanelRegistry {
  version: 1;
  adapter?: ToolsPanelAdapter;
  capability?: { version: 1; command: 'subagents-tools' };
}

export const toolsPanelRegistryKey = Symbol.for(
  'thoth-agents.pi-subagents.tools-panel.v1',
);
const shared = globalThis as typeof globalThis & {
  [toolsPanelRegistryKey]?: unknown;
};

export function getToolsPanelRegistry(): ToolsPanelRegistry | undefined {
  try {
    const registry = shared[toolsPanelRegistryKey] as
      | ToolsPanelRegistry
      | undefined;
    return registry?.version === 1 ? registry : undefined;
  } catch {
    return undefined;
  }
}

export function getToolsPanelAdapter(): ToolsPanelAdapter | undefined {
  try {
    const adapter = getToolsPanelRegistry()?.adapter;
    return adapter?.version === 1 &&
      typeof adapter.appliesTo === 'function' &&
      typeof adapter.validate === 'function' &&
      (adapter.defaultTools === undefined ||
        typeof adapter.defaultTools === 'function')
      ? adapter
      : undefined;
  } catch {
    return undefined;
  }
}

export function publishToolsPanelCapability(): void {
  shared[toolsPanelRegistryKey] = {
    ...getToolsPanelRegistry(),
    version: 1,
    capability: { version: 1, command: 'subagents-tools' },
  };
}
