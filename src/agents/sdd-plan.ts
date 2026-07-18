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

const SDD_PLAN_PROMPT = renderRolePrompt(
  createCoordinationSpecialistPromptSections('sdd-plan'),
  OPENCODE_PROMPT_DIALECT,
);

export function createSddPlanAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  return {
    name: 'sdd-plan',
    description:
      'Coordination-only SDD agent for executable technical plans and supporting Spec Kit artifacts under openspec/.',
    config: {
      model,
      temperature: 0.1,
      color: 'secondary',
      prompt: composeAgentPrompt({
        basePrompt: SDD_PLAN_PROMPT,
        customPrompt,
        customAppendPrompt: appendPromptSections(
          getModelFamilyPromptSection('sdd-plan', model),
          customAppendPrompt,
        ),
      }),
    },
  };
}
