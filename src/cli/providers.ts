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

export const MODEL_MAPPINGS = {
  openai: buildOpenAIModelMappings(),
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
