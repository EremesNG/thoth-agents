import {
  type Api,
  type AssistantMessage,
  calculateCost,
  type Model,
} from '@earendil-works/pi-ai';

function codexPriorityMultiplier(modelId: string): number {
  // Mirrors pi-ai's getServiceTierCostMultiplier in api/openai-codex-responses.
  return modelId === 'gpt-5.5' ? 2.5 : 2;
}

export function withCodexPriorityPricing(
  message: AssistantMessage,
  base: Model<Api>,
): AssistantMessage | undefined {
  // calculateCost mutates usage.cost, so calculate the standard tier on a copy.
  const standardCost = calculateCost(base, {
    ...message.usage,
    cost: { ...message.usage.cost },
  });
  const isStandardCost =
    Math.abs(message.usage.cost.total - standardCost.total) <= 1e-12;
  if (!isStandardCost) return undefined;
  const multiplier = codexPriorityMultiplier(message.model);
  const cost = {
    input: message.usage.cost.input * multiplier,
    output: message.usage.cost.output * multiplier,
    cacheRead: message.usage.cost.cacheRead * multiplier,
    cacheWrite: message.usage.cost.cacheWrite * multiplier,
    total: message.usage.cost.total * multiplier,
  };
  return { ...message, usage: { ...message.usage, cost } };
}
