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
      'Synchronous read-only strategic advisor for debugging, architecture, code review, and SDD plan review.',
    config: {
      model,
      temperature: 0.1,
      prompt,
      color: 'warning',
    },
  };
}
