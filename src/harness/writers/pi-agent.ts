import type { AgentRoleContract } from '../core/agent-pack';
import { type PiSpecialistRole, piSpecialistName } from '../pi-specialists';

export const PI_MANAGED_OWNER = 'thoth-agents';
export const PI_ROOT_START = '<!-- thoth-agents:pi-root:start -->';
export const PI_ROOT_END = '<!-- thoth-agents:pi-root:end -->';

export interface PiAgentDefinitionInput {
  role: AgentRoleContract & { name: PiSpecialistRole };
  description: string;
  instructions: string;
  model?: string;
  thinking?: string;
  async?: boolean;
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function renderPiAgentDefinition(input: PiAgentDefinitionInput): string {
  return [
    '---',
    `name: ${piSpecialistName(input.role.name)}`,
    `description: ${yamlScalar(input.description)}`,
    ...(input.model ? [`model: ${yamlScalar(input.model)}`] : []),
    ...(input.thinking ? [`thinking: ${yamlScalar(input.thinking)}`] : []),
    ...(input.async === undefined ? [] : [`async: ${input.async}`]),
    'defaultContext: fresh',
    'maxSubagentDepth: 1',
    `managed-by: ${PI_MANAGED_OWNER}`,
    '---',
    '',
    input.instructions.trim(),
    '',
  ].join('\n');
}

export function renderPiRootBlock(instructions: string): string {
  return [PI_ROOT_START, instructions.trim(), PI_ROOT_END, ''].join('\n');
}
