import { PROFILE_ROLES, type ProfileRole } from '../profiles/types.js';

export type SpecialistRole = Exclude<ProfileRole, 'orchestrator'>;
export const SPECIALIST_ROLES = PROFILE_ROLES.filter(
  (role): role is SpecialistRole => role !== 'orchestrator',
);
export type ToolScope = 'global' | 'project';
export type ToolEffect = 'allow' | 'ask' | 'deny';
export type ActionOverride = { action: string; effect: ToolEffect };
export type RoleToolOverrides = { overrides: ActionOverride[] };
export type ToolsDocument = {
  version: 1;
  roles: Partial<Record<SpecialistRole, RoleToolOverrides>>;
};
export type EffectiveToolOverrides = RoleToolOverrides & { origin: ToolScope };
/** Opaque token for the entire on-disk file, including invalid content. */
export type ToolsRevision = string;
export type ToolsSnapshot = {
  document: ToolsDocument;
  revision: ToolsRevision;
  warnings: string[];
};
export type ToolsState = {
  global: ToolsSnapshot;
  project: ToolsSnapshot;
  effective: Partial<Record<SpecialistRole, EffectiveToolOverrides>>;
  warnings: string[];
};
