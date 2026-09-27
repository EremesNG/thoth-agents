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

const WORKER_PROMPT = renderRolePrompt(
  createWriteCapableSpecialistPromptSections('worker'),
  OPENCODE_PROMPT_DIALECT,
);

export function createWorkerAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  const prompt = composeAgentPrompt({
    basePrompt: WORKER_PROMPT,
    customPrompt,
    customAppendPrompt: appendPromptSections(
      getModelFamilyPromptSection('worker', model),
      customAppendPrompt,
    ),
  });

  return {
    name: 'worker',
    description:
      'Write-capable agent for bounded nonvisual implementation regardless of complexity, with thorough context analysis, edge-case handling, and correctness verification.',
    config: {
      model,
      temperature: 0.1,
      prompt,
      color: 'secondary',
      // steps: 80,
    },
  };
}
