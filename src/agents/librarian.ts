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

const LIBRARIAN_PROMPT = renderRolePrompt(
  createReadOnlySpecialistPromptSections('librarian'),
  OPENCODE_PROMPT_DIALECT,
);

export function createLibrarianAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: LIBRARIAN_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('librarian', model),
      customAppendPrompt,
    ),
  });

  return {
    name: 'librarian',
    description:
      'Read-only research agent for official docs, public examples, and externally sourced implementation guidance.',
    config: {
      model,
      temperature: 0.1,
      prompt,
      color: 'info',
    },
  };
}
