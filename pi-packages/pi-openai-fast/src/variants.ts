import {
  type Api,
  getSupportedThinkingLevels,
  type Model,
  type ModelThinkingLevel,
} from '@earendil-works/pi-ai';

export const FAST_SUFFIX = '-fast';
const TARGET_APIS: ReadonlySet<string> = new Set([
  'openai-responses',
  'openai-codex-responses',
]);

export interface VariantSpec {
  provider: string;
  id: string;
  baseId: string;
  name: string;
  thinkingLevels: ModelThinkingLevel[];
  contextWindow: number;
  maxTokens: number;
  input: ('text' | 'image')[];
}

export interface VariantPlan {
  register: VariantSpec[];
  unregister: { provider: string; id: string }[];
}

export function variantKey(provider: string, id: string): string {
  return `${provider}/${id}`;
}

function isEligibleBase(model: Model<Api>): boolean {
  return TARGET_APIS.has(model.api) && !model.id.endsWith(FAST_SUFFIX);
}

/** Desired variants for the physical `models`, and tracked variants that no longer have a base. */
export function planVariantSync(
  models: readonly Model<Api>[],
  tracked: ReadonlySet<string>,
): VariantPlan {
  const physical = new Set(models.map((m) => variantKey(m.provider, m.id)));
  const register: VariantSpec[] = [];
  for (const base of models) {
    if (!isEligibleBase(base)) continue;
    const id = `${base.id}${FAST_SUFFIX}`;
    if (physical.has(variantKey(base.provider, id))) continue;
    register.push({
      provider: base.provider,
      id,
      baseId: base.id,
      name: `${base.name} (fast)`,
      thinkingLevels: getSupportedThinkingLevels(base),
      contextWindow: base.contextWindow,
      maxTokens: base.maxTokens,
      input: [...base.input],
    });
  }
  const desired = new Set(register.map((v) => variantKey(v.provider, v.id)));
  const unregister = [...tracked]
    .filter((key) => !desired.has(key))
    .map((key) => {
      const slash = key.indexOf('/');
      return { provider: key.slice(0, slash), id: key.slice(slash + 1) };
    });
  return { register, unregister };
}
