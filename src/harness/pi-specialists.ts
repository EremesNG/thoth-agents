import type { AgentRoleName } from './core/agent-pack';

export type PiSpecialistRole = Exclude<AgentRoleName, 'orchestrator'>;
export type PiSpecialistName = `thoth-${PiSpecialistRole}`;

export const PI_SPECIALIST_ROLES: readonly PiSpecialistRole[] = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
];

export function isPiSpecialistRole(role: string): role is PiSpecialistRole {
  return PI_SPECIALIST_ROLES.some((candidate) => candidate === role);
}

export function piSpecialistName(role: PiSpecialistRole): PiSpecialistName {
  return `thoth-${role}`;
}
