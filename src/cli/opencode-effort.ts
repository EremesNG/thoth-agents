import type { ModelRoleInput } from './operations/types';

export type OpenCodeEffortResolution =
  | { ok: true; variant: string | undefined }
  | { ok: false; code: string; message: string };

const OPENAI_GPT_RUNTIME_VARIANTS = new Set([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
]);

export function resolveOpenCodeEffort(
  input: Pick<
    ModelRoleInput,
    'catalogId' | 'availableEfforts' | 'effort' | 'model'
  >,
): OpenCodeEffortResolution {
  if (!input.effort || input.effort.kind === 'inherit') {
    return { ok: true, variant: undefined };
  }

  const variant = input.effort.value;
  if (!input.availableEfforts?.includes(variant)) {
    return {
      ok: false,
      code: 'opencode-effort-catalog-unsupported',
      message: `Effort ${variant} is not supported by ${input.catalogId ?? input.model} in the models.dev catalog.`,
    };
  }

  if (
    input.catalogId?.startsWith('openai/gpt-') &&
    OPENAI_GPT_RUNTIME_VARIANTS.has(variant)
  ) {
    return { ok: true, variant };
  }

  return {
    ok: false,
    code: 'opencode-effort-runtime-unconfirmed',
    message: `Effort ${variant} is catalogued for ${input.catalogId ?? input.model}, but the OpenCode runtime mapping is not confirmed.`,
  };
}
