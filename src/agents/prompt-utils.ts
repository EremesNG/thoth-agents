import {
  type AgentPromptRole,
  OPENCODE_PROMPT_DIALECT,
} from './prompt-dialects';
import {
  createModelFamilySection,
  createQuestionProtocolSection,
  createResponseBudgetSection,
  createStepBudgetSection,
  createSubagentRulesSection,
  renderPromptSection,
} from './prompt-sections';

export type {
  AgentPromptRole,
  CapabilityProfile,
  HarnessPromptDialect,
  ToolNomenclature,
} from './prompt-dialects';
export type {
  ModelFamilySection,
  PromptSection,
  PromptSectionRenderer,
  QuestionProtocolSection,
  ResponseBudgetSection,
  RolePromptSection,
  RoleTextSection,
  SemanticMemoryAccess,
  StepBudgetSection,
  SubagentRulesSection,
} from './prompt-sections';

interface ComposeAgentPromptOptions {
  basePrompt: string;
  customPrompt?: string;
  customAppendPrompt?: string;
  placeholders?: Record<string, string | number | undefined>;
}

export type ModelEntry = string | { id: string; variant?: string };

export const QUESTION_PROTOCOL = renderPromptSection(
  createQuestionProtocolSection(),
  OPENCODE_PROMPT_DIALECT,
);

export const SUBAGENT_RULES = renderPromptSection(
  createSubagentRulesSection('base'),
  OPENCODE_PROMPT_DIALECT,
);

export const SUBAGENT_RULES_READONLY = renderPromptSection(
  createSubagentRulesSection('readonly'),
  OPENCODE_PROMPT_DIALECT,
);

export const SUBAGENT_RULES_WRITABLE = renderPromptSection(
  createSubagentRulesSection('writable'),
  OPENCODE_PROMPT_DIALECT,
);

export const RESPONSE_BUDGET = renderPromptSection(
  createResponseBudgetSection(),
  OPENCODE_PROMPT_DIALECT,
);

function trimPromptSection(section?: string): string | undefined {
  const trimmed = section?.trim();
  return trimmed ? trimmed : undefined;
}

export function appendPromptSections(
  ...sections: Array<string | undefined>
): string {
  return sections.map(trimPromptSection).filter(Boolean).join('\n\n');
}

export function getStepBudgetPromptSection(steps?: number): string | undefined {
  const section = createStepBudgetSection(steps);

  if (!section) {
    return undefined;
  }

  return renderPromptSection(section, OPENCODE_PROMPT_DIALECT);
}

export function getModelFamilyPromptSection(
  role: AgentPromptRole,
  model?: string | ModelEntry[],
): string | undefined {
  const section = createModelFamilySection(role, model);

  if (!section) {
    return undefined;
  }

  return renderPromptSection(section, OPENCODE_PROMPT_DIALECT);
}

export function replacePromptPlaceholders(
  template: string,
  placeholders: Record<string, string | number | undefined> = {},
): string {
  return Object.entries(placeholders).reduce((prompt, [key, value]) => {
    if (value === undefined) {
      return prompt;
    }

    return prompt.replaceAll(`{{${key}}}`, String(value));
  }, template);
}

export function composeAgentPrompt({
  basePrompt,
  customPrompt,
  customAppendPrompt,
  placeholders,
}: ComposeAgentPromptOptions): string {
  const resolvedBase = replacePromptPlaceholders(basePrompt, placeholders);

  if (customPrompt) {
    return replacePromptPlaceholders(customPrompt, placeholders);
  }

  return appendPromptSections(
    resolvedBase,
    replacePromptPlaceholders(customAppendPrompt ?? '', placeholders),
  );
}
