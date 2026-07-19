export type ClaudeCodeInstallScope = 'project' | 'user';

export type ClaudeCodeRoleName =
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'sdd-specify'
  | 'sdd-plan'
  | 'sdd-tasks'
  | 'designer'
  | 'quick'
  | 'deep';

export const CLAUDE_CODE_ROLE_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'sdd-specify',
  'sdd-plan',
  'sdd-tasks',
  'designer',
  'quick',
  'deep',
] as const satisfies readonly ClaudeCodeRoleName[];
