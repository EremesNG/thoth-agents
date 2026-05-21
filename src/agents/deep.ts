import type { AgentDefinition } from './orchestrator';
import { OPENCODE_PROMPT_DIALECT } from './prompt-dialects';
import {
  createWriteCapableSpecialistPromptSections,
  renderRolePrompt,
} from './prompt-sections';
import {
  appendPromptSections,
  composeAgentPrompt,
  getModelFamilyPromptSection,
} from './prompt-utils';

const DEEP_PROMPT = renderRolePrompt(
  createWriteCapableSpecialistPromptSections('deep'),
  OPENCODE_PROMPT_DIALECT,
);

export function createDeepAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: DEEP_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('deep', model),
      customAppendPrompt,
    ),
  });

  return {
    name: 'deep',
    description:
      'Synchronous write-capable implementation agent optimized for thorough context analysis, edge cases, and correctness — not for bulk mechanical changes.',
    config: {
      model,
      temperature: 0.1,
      prompt,
      color: 'secondary',
      // steps: 80,
    },
  };
}
