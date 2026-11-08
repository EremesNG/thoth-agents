import type { Plugin } from '@opencode/plugin';
import type { OpenCodeDependencies } from './context';
import { SessionProfileSelections } from './profile-sessions';
import {
  formatModelString,
  PROFILE_ROLES,
  resolveRoleProfile,
} from './profiles';

export async function registerProfileRuntime(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  const sessions = new SessionProfileSelections(ctx.storage, deps.directory);
  await ctx.tool.hook('execute.before', async (event) => {
    if (event.tool !== 'subagent') return;
    const input = event.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    const args = input as Record<string, unknown>;
    if (args.model !== undefined) return;
    const role = PROFILE_ROLES.find((role) => role === args.agent);
    if (!role) return;
    const { store, roster } = deps.profileState;
    const selection = store.resolve(
      (await sessions.get(event.sessionID))?.name,
    );
    const model = formatModelString(
      resolveRoleProfile(role, selection.profile, roster),
    );
    if (model !== undefined) args.model = model;
  });
}
