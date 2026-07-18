import {
  CONFIRMED_OPENAI_SUBAGENT_PRESET,
  getDefaultOpenCodeModel,
  getDefaultOpenCodeVariant,
} from '../config';
import type { InstallConfig } from './types';

export const THOTH_AGENTS_CONFIG_SCHEMA_URL =
  'https://unpkg.com/thoth-agents@latest/thoth-agents.schema.json';

type ModelMapping = { model: string; variant?: string };

function buildOpenAIModelMappings(): Record<string, ModelMapping> {
  const mappings: Record<string, ModelMapping> = {
    orchestrator: {
      model: getDefaultOpenCodeModel('orchestrator'),
      variant: getDefaultOpenCodeVariant('orchestrator'),
    },
  };

  for (const [name, preset] of Object.entries(
    CONFIRMED_OPENAI_SUBAGENT_PRESET,
  )) {
    mappings[name] = {
      model: `openai/${preset.model}`,
      variant: preset.effort,
    };
  }

  return mappings;
}

// Model mappings by provider - only 4 supported providers
export const MODEL_MAPPINGS = {
  openai: buildOpenAIModelMappings(),
  kimi: {
    orchestrator: { model: 'kimi-for-coding/k2p5' },
    oracle: { model: 'kimi-for-coding/k2p5', variant: 'high' },
    librarian: { model: 'kimi-for-coding/k2p5', variant: 'low' },
    explorer: { model: 'kimi-for-coding/k2p5', variant: 'low' },
    designer: { model: 'kimi-for-coding/k2p5', variant: 'medium' },
    quick: { model: 'kimi-for-coding/k2p5', variant: 'low' },
    deep: { model: 'kimi-for-coding/k2p5', variant: 'high' },
  },
  copilot: {
    orchestrator: { model: 'github-copilot/claude-opus-4.6' },
    oracle: { model: 'github-copilot/claude-opus-4.6', variant: 'high' },
    librarian: { model: 'github-copilot/grok-code-fast-1', variant: 'low' },
    explorer: { model: 'github-copilot/grok-code-fast-1', variant: 'low' },
    designer: {
      model: 'github-copilot/gemini-3.1-pro-preview',
      variant: 'medium',
    },
    quick: { model: 'github-copilot/claude-sonnet-4.6', variant: 'low' },
    deep: { model: 'github-copilot/claude-opus-4.6', variant: 'high' },
  },
  'zai-plan': {
    orchestrator: { model: 'zai-coding-plan/glm-5' },
    oracle: { model: 'zai-coding-plan/glm-5', variant: 'high' },
    librarian: { model: 'zai-coding-plan/glm-5', variant: 'low' },
    explorer: { model: 'zai-coding-plan/glm-5', variant: 'low' },
    designer: { model: 'zai-coding-plan/glm-5', variant: 'medium' },
    quick: { model: 'zai-coding-plan/glm-5', variant: 'low' },
    deep: { model: 'zai-coding-plan/glm-5', variant: 'high' },
  },
} as const;

export function generateLiteConfig(
  installConfig: InstallConfig,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    $schema: THOTH_AGENTS_CONFIG_SCHEMA_URL,
    preset: 'openai',
    presets: {},
  };

  const createAgentConfig = (modelInfo: {
    model: string;
    variant?: string;
  }) => {
    return {
      model: modelInfo.model,
      variant: modelInfo.variant,
    };
  };

  const buildPreset = (mappingName: keyof typeof MODEL_MAPPINGS) => {
    const mapping = MODEL_MAPPINGS[mappingName];
    return Object.fromEntries(
      Object.entries(mapping).map(([agentName, modelInfo]) => [
        agentName,
        createAgentConfig(modelInfo),
      ]),
    );
  };

  // Always use OpenAI as default
  (config.presets as Record<string, unknown>).openai = buildPreset('openai');

  if (installConfig.hasTmux) {
    config.tmux = {
      enabled: true,
      layout: 'main-vertical',
      main_pane_size: 60,
    };
  }

  return config;
}
