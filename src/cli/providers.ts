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
  _installConfig: InstallConfig,
): Record<string, unknown> {
  return { $schema: THOTH_AGENTS_CONFIG_SCHEMA_URL };
}
