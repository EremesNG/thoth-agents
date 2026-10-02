import { clampThinkingLevel } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { createPriorityGuard } from './payload.ts';
import { planVariantSync, type VariantSpec, variantKey } from './variants.ts';

export default function openAiFast(pi: ExtensionAPI) {
  const guard = createPriorityGuard();
  // Variants this extension registered; only these are ever unregistered.
  const tracked = new Set<string>();

  function register(spec: VariantSpec) {
    pi.registerVirtualModel({
      provider: spec.provider,
      id: spec.id,
      name: spec.name,
      thinkingLevels: spec.thinkingLevels,
      contextWindow: spec.contextWindow,
      maxTokens: spec.maxTokens,
      input: spec.input,
      route(request, ctx: ExtensionContext) {
        guard.disarm();
        const base = ctx.modelRegistry.find(spec.provider, spec.baseId);
        if (!base) {
          throw new Error(
            `Fast variant ${spec.provider}/${spec.id} cannot run: base model ${spec.provider}/${spec.baseId} is no longer available.`,
          );
        }
        // Direct requests (compaction summaries, extension calls) keep the standard tier.
        if (request.reason !== 'direct')
          guard.arm({ provider: spec.provider, baseId: spec.baseId });
        return {
          model: base,
          thinkingLevel: clampThinkingLevel(base, request.thinkingLevel),
        };
      },
    });
    tracked.add(variantKey(spec.provider, spec.id));
  }

  pi.on('session_start', (_event, ctx) => {
    const plan = planVariantSync(ctx.modelRegistry.getAll(), tracked);
    for (const { provider, id } of plan.unregister) {
      pi.unregisterVirtualModel(provider, id);
      tracked.delete(variantKey(provider, id));
    }
    for (const spec of plan.register) register(spec);
  });

  pi.on('before_provider_request', (event) => guard.apply(event.payload));
}
