export type ClaudeCodeInstallScope = 'project' | 'user';

export type ClaudeCodeRoleName =
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'worker';

export const CLAUDE_CODE_ROLE_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
] as const satisfies readonly ClaudeCodeRoleName[];
