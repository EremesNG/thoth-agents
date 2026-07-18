import type { AgentOverrideConfig, PluginConfig } from '../config';
import { getAgentOverride, loadAgentPrompt } from '../config';
import type { AgentRoleName } from '../harness/core/agent-pack';
import type { HarnessPromptDialect } from './prompt-dialects';
import {
  createModelFamilySection,
  createRolePromptSections,
  createStepBudgetSection,
  renderPromptSection,
  renderRolePrompt,
} from './prompt-sections';
import { appendPromptSections, composeAgentPrompt } from './prompt-utils';

export function renderConfiguredRolePrompt({
  role,
  dialect,
  config,
  model,
}: {
  role: AgentRoleName;
  dialect: HarnessPromptDialect;
  config?: PluginConfig;
  model?: AgentOverrideConfig['model'] | string;
}): string {
  const promptOverrides = loadAgentPrompt(role, config?.preset);
  const override = getAgentOverride(config, role);
  const modelSection = createModelFamilySection(role, model);
  const stepSection = createStepBudgetSection(override?.steps);
  const basePrompt = renderRolePrompt(createRolePromptSections(role), dialect);
  const prompt = composeAgentPrompt({
    basePrompt,
    customPrompt: promptOverrides.prompt,
    customAppendPrompt: appendPromptSections(
      modelSection ? renderPromptSection(modelSection, dialect) : undefined,
      promptOverrides.appendPrompt,
    ),
  });

  return appendPromptSections(
    prompt,
    stepSection ? renderPromptSection(stepSection, dialect) : undefined,
  );
}
