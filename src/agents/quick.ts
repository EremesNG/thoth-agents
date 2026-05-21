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

const QUICK_PROMPT = renderRolePrompt(
  createWriteCapableSpecialistPromptSections('quick'),
  OPENCODE_PROMPT_DIALECT,
);

export function createQuickAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: QUICK_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('quick', model),
      customAppendPrompt,
    ),
  });

  return {
    name: 'quick',
    description:
      'Synchronous write-capable implementation agent optimized for fast, mechanical, well-bounded changes — including uniform patterns across multiple files.',
    config: {
      model,
      temperature: 0.2,
      prompt,
      color: 'success',
      // steps: 30,
    },
  };
}
