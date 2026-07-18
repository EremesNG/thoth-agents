import type { AgentOverrideConfig, PluginConfig } from './schema';

/**
 * Get an agent override by its canonical v0.3 role name.
 *
 * @param config - The plugin configuration
 * @param name - The current agent name
 * @returns The agent-specific override configuration if found
 */
export function getAgentOverride(
  config: PluginConfig | undefined,
  name: string,
): AgentOverrideConfig | undefined {
  return config?.agents?.[name];
}

/**
 * Resolve the primary model id from an agent override `model` value, which may
 * be a single id, an object with an `id`, or a failover array of either.
 */
export function getPrimaryModelId(
  model: AgentOverrideConfig['model'],
): string | undefined {
  if (Array.isArray(model)) {
    const first = model[0];
    return typeof first === 'string' ? first : first?.id;
  }

  return model;
}
