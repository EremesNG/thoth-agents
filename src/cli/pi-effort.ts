import type { ModelRoleInput } from './operations/types';

export const PI_EFFORT_VALUES = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;

const PI_EFFORTS = new Set<string>(PI_EFFORT_VALUES);

export type PiEffortResolution =
  | { ok: true; effort: string | undefined }
  | { ok: false; message: string };

export function resolvePiEffort(
  input: Pick<ModelRoleInput, 'availableEfforts' | 'effort' | 'model'>,
): PiEffortResolution {
  if (!input.effort || input.effort.kind === 'inherit') {
    return { ok: true, effort: undefined };
  }

  const effort = input.effort.value;
  if (!PI_EFFORTS.has(effort)) {
    return {
      ok: false,
      message: `Pi does not support effort ${effort}; expected ${PI_EFFORT_VALUES.join(', ')}, or inherit.`,
    };
  }

  if (
    input.availableEfforts !== undefined &&
    !input.availableEfforts.includes(effort)
  ) {
    return {
      ok: false,
      message: `Effort ${effort} is not available for ${input.model} in the selected model catalog entry.`,
    };
  }

  return { ok: true, effort };
}
