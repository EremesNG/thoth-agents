import type { AgentOverrideConfig, ModelEntry } from '../../config/schema.js';
import { AgentNameSchema } from '../../config/schema.js';

/** Shared canonical roster; never maintain a second role list here. */
export const PROFILE_ROLES = AgentNameSchema.options;
export type ProfileRole = (typeof PROFILE_ROLES)[number];
export type ProfileScope = 'global' | 'project';
export type RoleProfile = { model?: string; variant?: string };
export type NamedModelProfile = {
  agents: Partial<Record<ProfileRole, RoleProfile>>;
};
export type ModelProfilesDocument = {
  version: 1;
  active?: string;
  profiles: Record<string, NamedModelProfile>;
};
/** Already includes shipped defaults. No runtime or host objects are required. */
export type EffectiveRoster = Partial<
  Record<ProfileRole, Pick<AgentOverrideConfig, 'model' | 'variant'>>
>;
export type ModelProfileSelection = {
  name: string;
  scope?: ProfileScope;
  profile: NamedModelProfile;
  warnings: string[];
};
export type { ModelEntry };
