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
  effort?: string;
}

const LIBRARIAN_RESEARCH_TOOLS = [
  'resolve-library-id',
  'query-docs',
  'mcp',
  'web_search',
  'fetch_content',
  'get_search_content',
  'source_check',
] as const;

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function renderPiAgentDefinition(input: PiAgentDefinitionInput): string {
  const tools = [
    'read',
    'bash',
    ...(input.role.canMutateWorkspace ? ['edit', 'write'] : []),
    ...(input.role.name === 'librarian' ? LIBRARIAN_RESEARCH_TOOLS : []),
  ].join(', ');
  return [
    '---',
    `name: ${piSpecialistName(input.role.name)}`,
    `description: ${yamlScalar(input.description)}`,
    `tools: ${yamlScalar(tools)}`,
    ...(input.model ? [`model: ${yamlScalar(input.model)}`] : []),
    ...(input.effort ? [`effort: ${yamlScalar(input.effort)}`] : []),
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
