import {
  ALL_AGENT_NAMES,
  CONFIRMED_OPENAI_SUBAGENT_PRESET,
  getDefaultOpenCodeModel,
  getDefaultOpenCodeVariant,
  SUBAGENT_NAMES,
} from '../config';
import {
  CLAUDE_CODE_SUBAGENT_DEFAULT_EFFORTS,
  CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS,
} from '../harness/adapters/claude-code';
import type { HarnessId } from '../harness/types';
import type { ModelRoleInput } from './operations/types';

/** Shipped recommendations, independent of installed configuration. */
export function getShippedModelRoles(harness: HarnessId): ModelRoleInput[] {
  if (harness === 'opencode') {
    return ALL_AGENT_NAMES.map((role) => ({
      role,
      model: getDefaultOpenCodeModel(role),
      effort: { kind: 'effort', value: getDefaultOpenCodeVariant(role) },
    }));
  }

  return SUBAGENT_NAMES.map((role) => {
    if (harness === 'claude') {
      return {
        role,
        model: CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS[role],
        effort: {
          kind: 'effort',
          value: CLAUDE_CODE_SUBAGENT_DEFAULT_EFFORTS[role],
        },
      };
    }
    const preset = CONFIRMED_OPENAI_SUBAGENT_PRESET[role];
    return {
      role,
      model: harness === 'pi' ? `openai-codex/${preset.model}` : preset.model,
      effort: { kind: 'effort', value: preset.effort },
    };
  });
}
