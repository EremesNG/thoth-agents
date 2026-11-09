import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type Exposure = 'direct' | 'deferred';

/**
 * Register occasional tools direct at load, then reconcile once per session_start.
 * Auto defers only with active codemode/tool_search; THOTH_AGENTS_PI_EXPOSURE=direct
 * opts out. Unbound action APIs fall back to direct. Late registrations use the
 * last resolved exposure. The SDK registerTool signature preserves parameter,
 * result and renderer-state inference for callers.
 */
export function createAdaptiveToolRegistrar(pi: ExtensionAPI): {
  register: ExtensionAPI['registerTool'];
} {
  const tools = new Map<
    string,
    { exposure: Exposure; register(exposure: Exposure): void }
  >();
  let resolvedExposure: Exposure = 'direct';

  function apply(exposure: Exposure): void {
    resolvedExposure = exposure;
    for (const entry of tools.values()) {
      if (entry.exposure === exposure) continue;
      entry.register(exposure);
      entry.exposure = exposure;
    }
  }

  function updateActive(active: string[], exposure: Exposure): void {
    const next = new Set(
      active.filter((name) => exposure === 'direct' || !tools.has(name)),
    );
    if (exposure === 'direct') for (const name of tools.keys()) next.add(name);
    const current = new Set(active);
    if (
      current.size !== next.size ||
      [...next].some((name) => !current.has(name))
    ) {
      pi.setActiveTools([...next]);
    }
  }

  function recoverDirect(): void {
    resolvedExposure = 'direct';
    for (const entry of tools.values()) {
      if (entry.exposure === 'direct') continue;
      try {
        entry.register('direct');
        entry.exposure = 'direct';
      } catch {
        // One failed registration must not prevent recovery of the other tools.
      }
    }
    try {
      updateActive(pi.getActiveTools(), 'direct');
    } catch {
      // Missing or unbound action APIs cannot provide further recovery.
    }
  }

  pi.on('session_start', (_event, ctx) => {
    const value = process.env.THOTH_AGENTS_PI_EXPOSURE;
    if (value !== undefined && value !== 'auto' && value !== 'direct') {
      ctx.ui?.notify?.(
        'Invalid THOTH_AGENTS_PI_EXPOSURE; using auto.',
        'warning',
      );
    }
    try {
      if (
        typeof pi.getActiveTools !== 'function' ||
        typeof pi.setActiveTools !== 'function'
      ) {
        recoverDirect();
        return;
      }
      let active = pi.getActiveTools();
      const exposure =
        value !== 'direct' &&
        (active.includes('codemode') || active.includes('tool_search'))
          ? 'deferred'
          : 'direct';
      apply(exposure);
      // Each SDK registration refresh can reactivate still-direct allowlisted
      // tools. Reconcile only after the entire batch, preserving other changes.
      if (exposure === 'deferred') active = pi.getActiveTools();
      updateActive(active, exposure);
    } catch {
      // Action APIs can be unbound even when present (e.g. SDK child sessions).
      recoverDirect();
    }
  });
  return {
    register(definition) {
      const register = (exposure: Exposure): void => {
        pi.registerTool({
          ...definition,
          exposure,
          defaultActive: exposure === 'direct',
        });
      };
      register(resolvedExposure);
      tools.set(definition.name, { register, exposure: resolvedExposure });
    },
  };
}
