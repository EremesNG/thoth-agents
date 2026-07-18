import type { AgentDefinition } from './orchestrator';
import { OPENCODE_PROMPT_DIALECT } from './prompt-dialects';
import {
  createCoordinationSpecialistPromptSections,
  renderRolePrompt,
} from './prompt-sections';
import {
  appendPromptSections,
  composeAgentPrompt,
  getModelFamilyPromptSection,
} from './prompt-utils';

const SDD_SPECIFY_PROMPT = renderRolePrompt(
  createCoordinationSpecialistPromptSections('sdd-specify'),
  OPENCODE_PROMPT_DIALECT,
);

export function createSddSpecifyAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  return {
    name: 'sdd-specify',
    description:
      'Coordination-only SDD agent for Spec Kit-compatible feature requirements under openspec/.',
    config: {
      model,
      temperature: 0.1,
      color: 'accent',
      prompt: composeAgentPrompt({
        basePrompt: SDD_SPECIFY_PROMPT,
        customPrompt,
        customAppendPrompt: appendPromptSections(
          getModelFamilyPromptSection('sdd-specify', model),
          customAppendPrompt,
        ),
      }),
    },
  };
}
