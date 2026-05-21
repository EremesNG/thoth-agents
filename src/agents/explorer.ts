import type { AgentDefinition } from './orchestrator';
import { OPENCODE_PROMPT_DIALECT } from './prompt-dialects';
import {
  createReadOnlySpecialistPromptSections,
  renderRolePrompt,
} from './prompt-sections';
import {
  appendPromptSections,
  composeAgentPrompt,
  getModelFamilyPromptSection,
} from './prompt-utils';

const EXPLORER_PROMPT = renderRolePrompt(
  createReadOnlySpecialistPromptSections('explorer'),
  OPENCODE_PROMPT_DIALECT,
);

export function createExplorerAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: EXPLORER_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('explorer', model),
      customAppendPrompt,
    ),
  });

  return {
    name: 'explorer',
    description:
      'Read-only local discovery agent for fast codebase search, references, and repository mapping.',
    config: {
      model,
      temperature: 0.1,
      prompt,
      color: 'info',
    },
  };
}
