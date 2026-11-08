import type { Plugin } from '@opencode/plugin';
import type { OpenCodeDependencies } from './context';
import { translatePermissionRules } from './permission-rules';
import { appendOverrideRules, type SpecialistRole } from './tool-overrides';

// v2 colors are literal hex values, not the v1 theme token names.
const ROLE_COLORS: Record<string, string> = {
  orchestrator: '#7c3aed',
  explorer: '#0ea5e9',
  librarian: '#0284c7',
  oracle: '#f59e0b',
  designer: '#ec4899',
  worker: '#10b981',
};

export async function registerAgents(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  await ctx.agent.transform((editor) => {
    for (const { name } of deps.agentDefs) {
      const config = deps.agents[name];
      const first = deps.effectiveModelArrays[name]?.[0];
      const model = first?.id ?? config.model;
      const variant = first ? first.variant : config.variant;
      editor.update(name, (agent) => {
        agent.description = config.description;
        agent.system = config.prompt;
        agent.mode = name === 'orchestrator' ? 'primary' : 'subagent';
        agent.hidden = config.hidden ?? false;
        agent.color = /^#[0-9a-f]{6}$/i.test(config.color ?? '')
          ? config.color
          : ROLE_COLORS[name];
        agent.steps = config.steps;
        agent.permissions = translatePermissionRules(config.permission);
        if (name !== 'orchestrator') {
          const overrides =
            deps.toolState.state.effective[name as SpecialistRole]?.overrides;
          if (overrides?.length) {
            agent.permissions.push(...appendOverrideRules(overrides));
          }
        }
        // A bare model ID has no provider; leave it to host model inheritance.
        const separator = model?.indexOf('/') ?? -1;
        agent.model =
          model && separator > 0 && separator < model.length - 1
            ? ({
                providerID: model.slice(0, separator),
                id: model.slice(separator + 1),
                ...(variant ? { variant } : {}),
              } as NonNullable<typeof agent.model>)
            : undefined;
      });
    }
    editor.default('orchestrator');
    editor.remove('explore');
    editor.remove('general');
  });
}
