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

const SDD_TASKS_PROMPT = renderRolePrompt(
  createCoordinationSpecialistPromptSections('sdd-tasks'),
  OPENCODE_PROMPT_DIALECT,
);

export function createSddTasksAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  return {
    name: 'sdd-tasks',
    description:
      'Coordination-only SDD agent for dependency-ordered, verifiable implementation tasks under openspec/.',
    config: {
      model,
      temperature: 0.1,
      color: 'success',
      prompt: composeAgentPrompt({
        basePrompt: SDD_TASKS_PROMPT,
        customPrompt,
        customAppendPrompt: appendPromptSections(
          getModelFamilyPromptSection('sdd-tasks', model),
          customAppendPrompt,
        ),
      }),
    },
  };
}
