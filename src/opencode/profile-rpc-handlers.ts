import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Plugin } from '@opencode/plugin';
import type { RpcHandlers } from '@opencode/plugin/promise/rpc';
import type { OpenCodeDependencies } from './context';
import {
  type ProfileError,
  type ProfileRpcInput,
  type ProfileRpcMethod,
  type ProfileRpcOutput,
  type ProfileState,
  profileRpc,
} from './profile-rpc';
import { SessionProfileSelections } from './profile-sessions';
import {
  ModelProfileStore,
  type NamedModelProfile,
  PROFILE_ROLES,
  ProfileConflictError,
  type ProfileScope,
  resolveRoleProfile,
  validateProfileName,
} from './profiles';

type RpcValue<M extends ProfileRpcMethod> = Extract<
  ProfileRpcOutput<M>,
  { ok: true }
>['value'];

function revision(profile: NamedModelProfile | null): string {
  // Canonical role order avoids false conflicts when JSON property order changes.
  const canonical =
    profile === null
      ? null
      : {
          agents: Object.fromEntries(
            PROFILE_ROLES.filter((role) => profile.agents[role]).map((role) => [
              role,
              {
                model: profile.agents[role]?.model,
                variant: profile.agents[role]?.variant,
              },
            ]),
          ),
        };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
class RequestError extends Error {
  constructor(
    readonly code: ProfileError['code'],
    message: string,
  ) {
    super(message);
  }
}

export async function registerProfileRpc(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  const { store, roster } = deps.profileState;
  const sessions = new SessionProfileSelections(ctx.storage, deps.directory);

  async function capture(sessionID: string) {
    const session = await ctx.session.get({ sessionID });
    // Cold sessions inherit the host's actual agent default until explicitly switched.
    const ref =
      session.model ??
      (await ctx.agent.get({ agentID: session.agent ?? 'orchestrator' })).data
        .model;
    return ref
      ? {
          model: `${ref.providerID}/${ref.id}`,
          ...(ref.variant ? { variant: ref.variant } : {}),
        }
      : {};
  }

  function snapshot(
    sessionName?: string,
    change?: { scope: 'session' | ProfileScope; name?: string },
  ) {
    const warnings: string[] = [];
    const global = store.read('global', warnings);
    const project = store.read('project', warnings);
    // Zod accepts explicit undefined for optional keys, but OpenCode's HTTP
    // JSON encoder does not. Absent selections must be omitted entirely.
    const selections: ProfileState['selections'] = {
      ...(sessionName === undefined ? {} : { session: sessionName }),
      ...(project.active === undefined ? {} : { project: project.active }),
      ...(global.active === undefined ? {} : { global: global.active }),
    };
    if (change) {
      if (change.name === undefined) delete selections[change.scope];
      else selections[change.scope] = change.name;
    }
    let effective: ProfileState['effective'] = {
      name: 'default',
      selectedBy: 'default',
      profile: store.defaultProfile(),
    };
    for (const selectedBy of ['session', 'project', 'global'] as const) {
      const name = selections[selectedBy];
      if (!name) continue;
      if (name === 'default') {
        effective = { name, selectedBy, profile: store.defaultProfile() };
        break;
      }
      const source = Object.hasOwn(project.profiles, name)
        ? 'project'
        : 'global';
      const profile = (source === 'project' ? project : global).profiles[name];
      if (
        Object.hasOwn(
          (source === 'project' ? project : global).profiles,
          name,
        ) &&
        (selectedBy !== 'global' || Object.hasOwn(global.profiles, name))
      ) {
        effective = { name, source, selectedBy, profile };
        break;
      }
      warnings.push(
        `Missing ${selectedBy} model profile "${name}"; falling back.`,
      );
    }
    const profiles: ProfileState['profiles'] = [];
    for (const [source, document] of [
      ['global', global],
      ['project', project],
    ] as const) {
      for (const [name, profile] of Object.entries(document.profiles))
        profiles.push({
          name,
          scope: source,
          source,
          profile,
          revision: revision(profile),
          shadowed:
            source === 'global' && Object.hasOwn(project.profiles, name),
        });
    }
    return {
      profiles,
      defaultProfile: store.defaultProfile(),
      roles: [...PROFILE_ROLES],
      selections,
      effective,
      warnings,
    };
  }

  async function catalog(): Promise<ProfileState['providers']> {
    const [providers, models] = await Promise.all([
      ctx.provider.list(),
      ctx.model.list({ types: ['chat'] }),
    ]);
    return providers.data.map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: models.data
        .filter((model) => model.providerID === provider.id && model.enabled)
        .map((model) => ({
          id: model.id,
          name: model.name,
          variants: model.variants.map((variant) => variant.id),
        })),
    }));
  }
  async function state(sessionID?: string): Promise<ProfileState> {
    return {
      ...snapshot(
        sessionID ? (await sessions.get(sessionID))?.name : undefined,
      ),
      ...(sessionID ? { orchestrator: await capture(sessionID) } : {}),
      providers: await catalog(),
    };
  }
  function available(
    profile: NamedModelProfile,
    providers: ProfileState['providers'],
    name: string,
  ) {
    for (const role of PROFILE_ROLES) {
      const entry = resolveRoleProfile(role, profile, roster);
      if (!entry.model) continue;
      const slash = entry.model.indexOf('/');
      const providerID = entry.model.slice(0, slash);
      const modelID = entry.model.slice(slash + 1);
      const model = providers
        .find((provider) => provider.id === providerID)
        ?.models.find((candidate) => candidate.id === modelID);
      if (!model || (entry.variant && !model.variants.includes(entry.variant)))
        throw new RequestError(
          'MODEL_UNAVAILABLE',
          `Unavailable model or variant in profile "${name}" for ${role}: ${entry.model}${entry.variant ? `#${entry.variant}` : ''}. Nothing changed.`,
        );
    }
  }
  async function activate(input: ProfileRpcInput<'clear'> & { name?: string }) {
    if (input.scope === 'session' && !input.sessionID)
      throw new RequestError(
        'INVALID_REQUEST',
        'Open a session to change its profile selection.',
      );
    const previous = input.sessionID
      ? (await sessions.get(input.sessionID))?.name
      : undefined;
    const providers = await catalog();
    if (input.name !== undefined) {
      const target = store.lookup(
        input.name,
        input.scope === 'global' ? 'global' : undefined,
      );
      if (!target)
        throw new RequestError(
          'INVALID_REQUEST',
          `Profile not found: ${input.name}`,
        );
      available(target.profile, providers, input.name);
    }
    if (input.scope !== 'session') {
      // Reload installs defaults without a session selection; validate that
      // result independently so the current session cannot mask it.
      const defaults = snapshot(undefined, input);
      available(defaults.effective.profile, providers, defaults.effective.name);
    }
    const next = snapshot(previous, input);
    available(next.effective.profile, providers, next.effective.name);
    if (input.scope === 'session' && input.sessionID)
      await sessions.set(input.sessionID, input.name);
    else {
      if (input.scope === 'global') store.setGlobalActive(input.name);
      else store.setProjectPin(input.name);
      deps.profileState.refresh();
      await ctx.agent.reload();
    }
    const orchestrator = resolveRoleProfile(
      'orchestrator',
      next.effective.profile,
      roster,
    );
    if (input.sessionID && orchestrator.model) {
      const slash = orchestrator.model.indexOf('/');
      await ctx.session.switchModel({
        sessionID: input.sessionID,
        model: {
          providerID: orchestrator.model.slice(0, slash),
          id: orchestrator.model.slice(slash + 1),
          ...(orchestrator.variant ? { variant: orchestrator.variant } : {}),
        },
      });
    }
    return state(input.sessionID);
  }

  // Serialize this server's calls across async catalog/storage/reload boundaries.
  // Cross-process file writers retain the core's optimistic save guarantees.
  let pending: Promise<unknown> = Promise.resolve();
  function handler<M extends ProfileRpcMethod>(
    method: M,
    run: (input: ProfileRpcInput<M>) => Promise<RpcValue<M>> | RpcValue<M>,
  ) {
    return (raw: ProfileRpcInput<M>): Promise<ProfileRpcOutput<M>> => {
      const operation = pending.then(async () => {
        const parsed = profileRpc.methods[method].input.safeParse(raw);
        if (!parsed.success)
          return {
            ok: false,
            error: { code: 'INVALID_REQUEST', message: parsed.error.message },
          };
        try {
          return {
            ok: true,
            value: await run(parsed.data as ProfileRpcInput<M>),
          };
        } catch (error) {
          const code =
            error instanceof ProfileConflictError
              ? 'PROFILE_CONFLICT'
              : error instanceof RequestError
                ? error.code
                : 'OPERATION_FAILED';
          return {
            ok: false,
            error: {
              code,
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      });
      pending = operation;
      return operation as Promise<ProfileRpcOutput<M>>;
    };
  }
  function writable(name: string) {
    try {
      validateProfileName(name, true);
    } catch (error) {
      throw new RequestError('INVALID_REQUEST', String(error));
    }
  }
  function current(scope: ProfileScope, name: string) {
    const document = store.read(scope);
    return Object.hasOwn(document.profiles, name)
      ? document.profiles[name]
      : null;
  }
  function projectStore(projectDir: string) {
    return projectDir === deps.directory
      ? store
      : new ModelProfileStore({
          cwd: projectDir,
          roster,
          paths: {
            global: store.paths.global,
            project: path.join(
              projectDir,
              '.opencode',
              'thoth',
              'profiles.json',
            ),
          },
        });
  }

  // Identity is scope + owning file + name, never profile contents or name alone.
  function identity(project: ModelProfileStore, name: string) {
    const found = project.lookup(name);
    return found
      ? found.scope
        ? `${project.paths[found.scope]}:${name}`
        : 'default'
      : undefined;
  }

  async function maintenance(
    scope: ProfileScope,
    name: string,
    newName?: string,
  ) {
    const selections = await sessions.all();
    const target = `${store.paths[scope]}:${name}`;
    const affected = selections.filter(
      (selection) =>
        identity(projectStore(selection.projectDir), selection.name) === target,
    );
    const projects = new Map(
      [
        ...new Set([deps.directory, ...selections.map((s) => s.projectDir)]),
      ].map((dir) => [dir, projectStore(dir)]),
    );
    const pins: ModelProfileStore[] = [];
    for (const project of projects.values()) {
      const pin = project.read('project').active;
      if (pin && identity(project, pin) === target) pins.push(project);
    }
    if (newName !== undefined) {
      for (const [dir, project] of projects) {
        const global = structuredClone(project.read('global'));
        const local = structuredClone(project.read('project'));
        const changed =
          scope === 'global'
            ? global
            : project.paths.project === store.paths.project
              ? local
              : undefined;
        if (changed && Object.hasOwn(changed.profiles, name)) {
          changed.profiles[newName] = changed.profiles[name];
          delete changed.profiles[name];
          if (changed.active === name) changed.active = newName;
        }
        if (pins.includes(project)) local.active = newName;
        function after(pointer: string | undefined, globalPointer = false) {
          if (!pointer) return undefined;
          if (pointer === 'default') return 'default';
          if (globalPointer && !Object.hasOwn(global.profiles, pointer))
            return undefined;
          const source = Object.hasOwn(local.profiles, pointer)
            ? 'project'
            : 'global';
          if (
            !Object.hasOwn(
              (source === 'project' ? local : global).profiles,
              pointer,
            )
          )
            return undefined;
          return `${project.paths[source]}:${pointer}`;
        }
        function guard(before: string | undefined, next: string | undefined) {
          const expected =
            before === target ? `${store.paths[scope]}:${newName}` : before;
          if (next !== expected)
            throw new RequestError(
              'PROFILE_SHADOWED',
              `Renaming to "${newName}" collides with a shadowing profile in ${dir}. Nothing changed.`,
            );
        }
        for (const selection of selections.filter(
          (s) => s.projectDir === dir,
        )) {
          const before = identity(project, selection.name);
          guard(before, after(before === target ? newName : selection.name));
        }
        const pin = project.read('project').active;
        guard(pin ? identity(project, pin) : undefined, after(local.active));
        const active = project.read('global').active;
        const beforeGlobal =
          active && project.lookup(active, 'global')
            ? identity(project, active)
            : undefined;
        guard(beforeGlobal, after(global.active, true));
      }
    }
    return { affected, pins };
  }

  const handlers = {
    state: handler('state', ({ sessionID }) => state(sessionID)),
    capture: handler('capture', ({ sessionID }) => capture(sessionID)),
    activate: handler('activate', activate),
    clear: handler('clear', activate),
    create: handler('create', ({ scope, name, profile }) => {
      writable(name);
      store.create(scope, name, profile);
      return { revision: revision(current(scope, name)) };
    }),
    save: handler('save', ({ scope, name, profile, baseRevision }) => {
      writable(name);
      const expected = current(scope, name);
      if (revision(expected) !== baseRevision)
        throw new ProfileConflictError(scope, name);
      store.save(scope, name, profile, { expected });
      return { revision: revision(current(scope, name)) };
    }),
    rename: handler('rename', async ({ scope, name, newName }) => {
      writable(name);
      writable(newName);
      const { affected, pins } = await maintenance(scope, name, newName);
      store.rename(scope, name, newName);
      for (const project of pins) project.setProjectPin(newName);
      for (const selection of affected)
        await sessions.set(selection.sessionID, newName, selection.projectDir);
      return {};
    }),
    delete: handler('delete', async ({ scope, name }) => {
      writable(name);
      const { affected, pins } = await maintenance(scope, name);
      store.delete(scope, name);
      for (const project of pins) project.setProjectPin();
      for (const selection of affected)
        await sessions.set(selection.sessionID, undefined);
      return {};
    }),
  } satisfies RpcHandlers<typeof profileRpc>;
  await ctx.rpc.register(profileRpc, handlers);
}
