import { type AgentRoleContract, getAgentRole } from '../core/agent-pack';
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
  subagentMode: 'task' | 'background';
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

const PI_SPECIALIST_DISALLOWED_TOOLS = [
  'ask_user_question',
  'todo',
  'AskClaude',
  'AskAntigravity',
  'bg_delegate',
  'bg_run_pi_attested',
  'bg_result',
  'fusion_reason',
  'fusion_investigate',
  'fusion_research',
  'fusion_validate',
] as const;

export function getPiSpecialistDefaultTools(role: PiSpecialistRole): string[] {
  const contract = getAgentRole(role);
  return [
    'read',
    'bash',
    ...(contract.canMutateWorkspace ? ['edit', 'write'] : []),
    ...(role === 'librarian' ? LIBRARIAN_RESEARCH_TOOLS : []),
  ];
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function renderPiAgentDefinition(input: PiAgentDefinitionInput): string {
  const tools = getPiSpecialistDefaultTools(input.role.name).join(', ');
  const disallowedTools = [
    ...PI_SPECIALIST_DISALLOWED_TOOLS,
    ...(input.role.name === 'oracle' ? ['ask_orchestrator'] : []),
  ].join(', ');
  return [
    '---',
    `name: ${piSpecialistName(input.role.name)}`,
    `description: ${yamlScalar(input.description)}`,
    `tools: ${yamlScalar(tools)}`,
    `disallowed_tools: ${yamlScalar(disallowedTools)}`,
    ...(input.model ? [`model: ${yamlScalar(input.model)}`] : []),
    ...(input.effort ? [`effort: ${yamlScalar(input.effort)}`] : []),
    `subagent_mode: ${yamlScalar(input.subagentMode)}`,
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
