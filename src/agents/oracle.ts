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

const ORACLE_PROMPT = renderRolePrompt(
  createReadOnlySpecialistPromptSections('oracle'),
  OPENCODE_PROMPT_DIALECT,
);

export function createOracleAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: ORACLE_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('oracle', model),
      customAppendPrompt,
    ),
  });

  return {
    name: 'oracle',
    description:
      'Read-only strategic advisor for debugging, architecture, focused plan review, and independent verification.',
    config: {
      model,
      temperature: 0.1,
      prompt,
      color: 'warning',
    },
  };
}
