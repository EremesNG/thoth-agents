import type { Plugin } from '@opencode/plugin';
import type { RpcHandlers } from '@opencode/plugin/promise/rpc';
import type { OpenCodeDependencies } from './context';
import { translatePermissionRules } from './permission-rules';
import {
  countActionMatches,
  evaluateAction,
  SPECIALIST_ROLES,
  ToolsConflictError,
} from './tool-overrides';
import {
  type ToolRpcInput,
  type ToolRpcMethod,
  type ToolRpcOutput,
  type ToolState,
  toolRpc,
} from './tool-rpc';

export async function registerToolRpc(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  const { store } = deps.toolState;
  async function state(): Promise<ToolState> {
    const snapshot = store.resolve();
    const grouped = new Map<string, string[]>();
    for (const tool of await ctx.tool.list()) {
      const action = tool.options?.permission ?? tool.id;
      const members = grouped.get(action) ?? [];
      members.push(tool.id);
      grouped.set(action, members);
    }
    // Keep the non-editable restriction visible even if the host omits its tool.
    if (!grouped.has('subagent')) grouped.set('subagent', []);
    const inventory = [...grouped]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([action, tools]) => ({
        action,
        tools: tools.sort(),
        locked: action === 'subagent',
      }));
    const actions = inventory.map(({ action }) => action);
    return {
      specialists: [...SPECIALIST_ROLES],
      inventory,
      roles: SPECIALIST_ROLES.map((role) => {
        const scopeState = (scope: 'global' | 'project') => ({
          present: Object.hasOwn(snapshot[scope].document.roles, role),
          revision: snapshot[scope].revision,
          overrides: (
            snapshot[scope].document.roles[role]?.overrides ?? []
          ).map((entry) => ({
            ...entry,
            matchCount: countActionMatches(entry.action, actions),
          })),
        });
        const base = translatePermissionRules(deps.agents[role].permission);
        return {
          role,
          effectiveScope: snapshot.effective[role]?.origin ?? 'default',
          global: scopeState('global'),
          project: scopeState('project'),
          actions: inventory.map(({ action, locked }) => ({
            action,
            locked,
            baseEffect: evaluateAction(base, undefined, action).effect,
            ...evaluateAction(base, snapshot.effective[role], action),
          })),
        };
      }),
      warnings: snapshot.warnings,
    };
  }
  let pending: Promise<unknown> = Promise.resolve();
  function handler<M extends ToolRpcMethod>(
    method: M,
    run: (input: ToolRpcInput<M>) => Promise<ToolState>,
  ) {
    return (raw: ToolRpcInput<M>): Promise<ToolRpcOutput<M>> => {
      const operation = pending.then(async () => {
        const parsed = toolRpc.methods[method].input.safeParse(raw);
        if (!parsed.success)
          return {
            ok: false,
            error: { code: 'INVALID_REQUEST', message: parsed.error.message },
          };
        try {
          return { ok: true, value: await run(parsed.data as ToolRpcInput<M>) };
        } catch (error) {
          return {
            ok: false,
            error: {
              code:
                error instanceof ToolsConflictError
                  ? 'TOOLS_CONFLICT'
                  : 'OPERATION_FAILED',
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      });
      pending = operation;
      return operation as Promise<ToolRpcOutput<M>>;
    };
  }
  async function reload(): Promise<ToolState> {
    deps.toolState.refresh();
    await ctx.agent.reload();
    return state();
  }
  const handlers = {
    state: handler('state', state),
    save: handler('save', async ({ scope, role, overrides, baseRevision }) => {
      store.save(scope, role, overrides, baseRevision);
      return reload();
    }),
    reset: handler('reset', async ({ scope, role, baseRevision }) => {
      store.reset(scope, role, baseRevision);
      return reload();
    }),
  } satisfies RpcHandlers<typeof toolRpc>;
  await ctx.rpc.register(toolRpc, handlers);
}
