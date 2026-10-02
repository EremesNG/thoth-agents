import { clampThinkingLevel } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { createPriorityGuard } from './payload.ts';
import { withCodexPriorityPricing } from './pricing.ts';
import { planVariantSync, type VariantSpec, variantKey } from './variants.ts';

interface PricingMarker {
  provider: string;
  modelId: string;
  api: string;
}

export default function openAiFast(pi: ExtensionAPI) {
  const guard = createPriorityGuard();
  let routedRequest: PricingMarker | undefined;
  let pricingMarker: PricingMarker | undefined;
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
        routedRequest = undefined;
        pricingMarker = undefined;
        const base = ctx.modelRegistry.find(spec.provider, spec.baseId);
        if (!base) {
          throw new Error(
            `Fast variant ${spec.provider}/${spec.id} cannot run: base model ${spec.provider}/${spec.baseId} is no longer available.`,
          );
        }
        // Direct requests (compaction summaries, extension calls) keep the standard tier.
        if (request.reason !== 'direct') {
          guard.arm({ provider: spec.provider, baseId: spec.baseId });
          routedRequest = {
            provider: spec.provider,
            modelId: spec.baseId,
            api: base.api,
          };
        }
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

  pi.on('before_provider_request', (event) => {
    const payload = guard.apply(event.payload);
    if (payload) pricingMarker = routedRequest;
    routedRequest = undefined;
    return payload;
  });

  pi.on('message_end', (event, ctx) => {
    const { message } = event;
    if (message.role !== 'assistant') return;
    const marker = pricingMarker;
    pricingMarker = undefined;
    if (
      !marker ||
      message.api !== 'openai-codex-responses' ||
      message.api !== marker.api ||
      message.provider !== marker.provider ||
      message.model !== marker.modelId
    )
      return;
    const base = ctx.modelRegistry.find(marker.provider, marker.modelId);
    if (!base) return;
    const replacement = withCodexPriorityPricing(message, base);
    if (replacement) return { message: replacement };
  });
}
