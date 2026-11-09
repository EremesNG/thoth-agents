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

const DESIGNER_PROMPT = renderRolePrompt(
  createWriteCapableSpecialistPromptSections('designer'),
  OPENCODE_PROMPT_DIALECT,
);

export function createDesignerAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: DESIGNER_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('designer', model),
      customAppendPrompt,
    ),
  });

  return {
    name: 'designer',
    description:
      'Write-capable UI/UX and creative/artistic specialist owning approach, execution, and visual and creative verification.',
    config: {
      model,
      temperature: 0.4,
      prompt,
      color: 'accent',
      // steps: 50,
    },
  };
}
