import type { AgentConfig } from '@opencode-ai/sdk/v2';
import { OPENCODE_PROMPT_DIALECT } from './prompt-dialects';
import {
  createOrchestratorPromptSections,
  renderRolePrompt,
} from './prompt-sections';
import {
  appendPromptSections,
  composeAgentPrompt,
  getModelFamilyPromptSection,
} from './prompt-utils';

export interface AgentDefinition {
  name: string;
  description?: string;
  config: AgentConfig;
  /** Priority-ordered model entries for runtime fallback resolution. */
  _modelArray?: Array<{ id: string; variant?: string }>;
}

const ORCHESTRATOR_PROMPT = renderRolePrompt(
  createOrchestratorPromptSections(),
  OPENCODE_PROMPT_DIALECT,
);

export function createOrchestratorAgent(
  model?: string | Array<string | { id: string; variant?: string }>,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: ORCHESTRATOR_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('orchestrator', model),
      customAppendPrompt,
    ),
  });

  const definition: AgentDefinition = {
    name: 'orchestrator',
    description:
      'Delegate-first coordinator for SDD workflow, specialist dispatch, and root-session memory ownership.',
    config: {
      temperature: 0.1,
      prompt,
      color: 'primary',
      // steps: 100,
    },
  };

  if (Array.isArray(model)) {
    definition._modelArray = model.map((entry) =>
      typeof entry === 'string' ? { id: entry } : entry,
    );
  } else if (typeof model === 'string' && model) {
    definition.config.model = model;
  }

  return definition;
}
