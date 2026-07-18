import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk/v2';
import {
  type AgentOverrideConfig,
  CONFIRMED_OPENAI_SUBAGENT_PRESET,
  DEFAULT_MODELS,
  getAgentOverride,
  loadAgentPrompt,
  OPENCODE_OPENAI_ORCHESTRATOR_PRESET,
  type PluginConfig,
  SUBAGENT_NAMES,
} from '../config';
import { createDeepAgent } from './deep';
import { createDesignerAgent } from './designer';
import { createExplorerAgent } from './explorer';
import { createLibrarianAgent } from './librarian';
import { createOracleAgent } from './oracle';
import { type AgentDefinition, createOrchestratorAgent } from './orchestrator';
import {
  appendPromptSections,
  detectModelFamily,
  getStepBudgetPromptSection,
} from './prompt-utils';
import { createQuickAgent } from './quick';

export type { AgentDefinition } from './orchestrator';

type AgentFactory = (
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
) => AgentDefinition;

type PermissionConfigObject = Exclude<
  NonNullable<SDKAgentConfig['permission']>,
  'allow' | 'ask' | 'deny'
>;

type BuiltinPermissionPreset = NonNullable<SDKAgentConfig['permission']>;

type BuiltinPermissionPresetName =
  | 'orchestrator'
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'quick'
  | 'deep';

type AgentOverrideWithPermission = AgentOverrideConfig & {
  permission?: SDKAgentConfig['permission'];
};

const GEMINI_DEFAULT_STEPS: Record<SubagentName, number> = {
  explorer: 120,
  librarian: 80,
  oracle: 80,
  designer: 80,
  quick: 40,
  deep: 120,
};

const BUILTIN_PERMISSION_PRESETS = {
  orchestrator: {
    read: 'allow',
    edit: 'allow',
    write: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    question: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    todowrite: 'allow',
    task: 'allow',
    external_directory: 'allow',
  },
  explorer: {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    external_directory: 'allow',
    bash: 'allow',
    question: 'allow',
    skill: 'allow',
    edit: 'deny',
    todowrite: 'deny',
    task: 'deny',
  },
  librarian: {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    external_directory: 'allow',
    bash: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    codesearch: 'allow',
    question: 'allow',
    skill: 'allow',
    edit: 'deny',
    todowrite: 'deny',
    task: 'deny',
  },
  oracle: {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    lsp: 'allow',
    codesearch: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    external_directory: 'allow',
    bash: 'allow',
    question: 'allow',
    skill: 'allow',
    edit: 'deny',
    todowrite: 'deny',
    task: 'deny',
  },
  designer: {
    read: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    question: 'allow',
    todowrite: 'deny',
    task: 'deny',
    external_directory: {
      '~/.config/opencode/skills/**': 'allow',
    },
  },
  quick: {
    read: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    question: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    todowrite: 'deny',
    task: 'deny',
    external_directory: {
      '~/.config/opencode/skills/**': 'allow',
    },
  },
  deep: {
    read: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    question: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    todowrite: 'deny',
    task: 'deny',
    external_directory: {
      '~/.config/opencode/skills/**': 'allow',
    },
  },
} as const satisfies Record<
  BuiltinPermissionPresetName,
  BuiltinPermissionPreset
>;

function normalizeModelArray(
  model: Array<string | { id: string; variant?: string }>,
): Array<{ id: string; variant?: string }> {
  return model.map((entry) =>
    typeof entry === 'string' ? { id: entry } : entry,
  );
}

function applyOverrides(
  agent: AgentDefinition,
  override: AgentOverrideConfig,
): void {
  if (override.model) {
    if (Array.isArray(override.model)) {
      agent._modelArray = normalizeModelArray(override.model);
      agent.config.model = undefined;
    } else {
      agent.config.model = override.model;
    }
  }

  if (override.variant) {
    agent.config.variant = override.variant;
  }

  if (override.temperature !== undefined) {
    agent.config.temperature = override.temperature;
  }

  if (override.steps !== undefined) {
    agent.config.steps = override.steps;
  }
}

function applyStepBudgetPrompt(agent: AgentDefinition): void {
  const stepBudgetPrompt = getStepBudgetPromptSection(agent.config.steps);

  if (!stepBudgetPrompt) {
    return;
  }

  agent.config.prompt = appendPromptSections(
    agent.config.prompt,
    stepBudgetPrompt,
  );
}

function applyGeminiDefaultSteps(agent: AgentDefinition): void {
  if (!isSubagent(agent.name) || agent.config.steps !== undefined) {
    return;
  }

  if (detectModelFamily(agent._modelArray ?? agent.config.model) !== 'gemini') {
    return;
  }

  agent.config.steps = GEMINI_DEFAULT_STEPS[agent.name];
}

function clonePermissionConfig(
  permission: BuiltinPermissionPreset,
): BuiltinPermissionPreset {
  if (typeof permission === 'string') {
    return permission;
  }

  return Object.fromEntries(
    Object.entries(permission).map(([key, value]) => [
      key,
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...value }
        : value,
    ]),
  ) as PermissionConfigObject;
}

function getBuiltinPermissionPreset(
  name: BuiltinPermissionPresetName,
): BuiltinPermissionPreset {
  return clonePermissionConfig(BUILTIN_PERMISSION_PRESETS[name]);
}

function getExplicitPermissionOverride(
  override?: AgentOverrideConfig,
): SDKAgentConfig['permission'] | undefined {
  return (override as AgentOverrideWithPermission | undefined)?.permission;
}

function getPrimaryModelForPrompt(
  model: AgentOverrideConfig['model'] | string | undefined,
): string | undefined {
  if (Array.isArray(model)) {
    const first = model[0];
    return typeof first === 'string' ? first : first?.id;
  }

  return model;
}

export type SubagentName = (typeof SUBAGENT_NAMES)[number];

type CanonicalOpenAISubagentName =
  keyof typeof CONFIRMED_OPENAI_SUBAGENT_PRESET;

export function isSubagent(name: string): name is SubagentName {
  return (SUBAGENT_NAMES as readonly string[]).includes(name);
}

const SUBAGENT_FACTORIES: Record<CanonicalOpenAISubagentName, AgentFactory> = {
  explorer: createExplorerAgent,
  librarian: createLibrarianAgent,
  oracle: createOracleAgent,
  designer: createDesignerAgent,
  quick: createQuickAgent,
  deep: createDeepAgent,
};

export function createAgents(config?: PluginConfig): AgentDefinition[] {
  const protoSubAgents = (
    Object.entries(SUBAGENT_FACTORIES) as [
      CanonicalOpenAISubagentName,
      AgentFactory,
    ][]
  ).map(([name, factory]) => {
    const override = getAgentOverride(config, name);
    const prompts = loadAgentPrompt(name, config?.preset);
    const model =
      getPrimaryModelForPrompt(override?.model) ??
      (DEFAULT_MODELS[name] as string);

    const agent = factory(model, prompts.prompt, prompts.appendPrompt);
    agent.config.variant = CONFIRMED_OPENAI_SUBAGENT_PRESET[name].effort;
    return agent;
  });

  const allSubAgents = protoSubAgents.map((agent) => {
    const override = getAgentOverride(config, agent.name);
    if (override) {
      applyOverrides(agent, override);
    }
    applyGeminiDefaultSteps(agent);
    applyStepBudgetPrompt(agent);
    return agent;
  });

  const orchestratorOverride = getAgentOverride(config, 'orchestrator');
  const orchestratorPrompts = loadAgentPrompt('orchestrator', config?.preset);
  const orchestrator = createOrchestratorAgent(
    orchestratorOverride?.model ??
      `openai/${OPENCODE_OPENAI_ORCHESTRATOR_PRESET.model}`,
    orchestratorPrompts.prompt,
    orchestratorPrompts.appendPrompt,
  );
  orchestrator.config.variant = OPENCODE_OPENAI_ORCHESTRATOR_PRESET.effort;

  if (orchestratorOverride) {
    applyOverrides(orchestrator, orchestratorOverride);
  }
  applyStepBudgetPrompt(orchestrator);

  return [orchestrator, ...allSubAgents];
}

export function getAgentConfigs(
  config?: PluginConfig,
): Record<string, SDKAgentConfig> {
  const agents = createAgents(config);

  return Object.fromEntries(
    agents.map((agent) => {
      const override = getAgentOverride(config, agent.name);
      const sdkConfig: SDKAgentConfig = {
        ...agent.config,
        description: agent.description,
      };

      const builtinPermission = isSubagent(agent.name)
        ? getBuiltinPermissionPreset(agent.name as BuiltinPermissionPresetName)
        : agent.name === 'orchestrator'
          ? getBuiltinPermissionPreset('orchestrator')
          : undefined;
      const explicitPermissionOverride =
        getExplicitPermissionOverride(override);

      sdkConfig.permission =
        explicitPermissionOverride ??
        agent.config.permission ??
        builtinPermission;

      if (isSubagent(agent.name)) {
        sdkConfig.mode = 'subagent';
      } else if (agent.name === 'orchestrator') {
        sdkConfig.mode = 'primary';
      }

      return [agent.name, sdkConfig];
    }),
  );
}
