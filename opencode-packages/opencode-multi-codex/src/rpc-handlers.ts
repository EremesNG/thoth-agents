import type { Plugin } from '@opencode/plugin';
import type { RpcHandlers } from '@opencode/plugin/promise/rpc';
import { openCodeCredentials } from './accounts/opencode.js';
import type { AccountRegistry } from './accounts/registry.js';
import type { QuotaTracker } from './quota/quota.js';
import type { SessionAccountOverrides } from './request/overrides.js';
import {
  type CodexRpcInput,
  type CodexRpcMethod,
  type CodexRpcOutput,
  type CodexState,
  codexRpc,
} from './rpc.js';

export const ADD_GUIDANCE =
  "add another ChatGPT account in OpenCode's connect dialog (provider OpenAI), then run /codex-add";
type Runtime = {
  config?: { warning?: string };
  registry: Pick<AccountRegistry, 'list' | 'add' | 'remove' | 'notices'>;
  requests: { overrides: SessionAccountOverrides };
  quota: Pick<QuotaTracker, 'getQuota'>;
  refreshProviders(): Promise<void>;
  blockedUntil(number: number): number | null;
};

function quotaWindowView(
  window: { usedPercent: number; resetAt?: number } | undefined,
) {
  return window && Number.isFinite(window.usedPercent)
    ? {
        remainingPercent: 100 - window.usedPercent,
        ...(Number.isFinite(window.resetAt) ? { resetAt: window.resetAt } : {}),
      }
    : undefined;
}

export async function registerCodexRpc(ctx: Plugin.Context, runtime: Runtime) {
  async function state(
    input: { sessionID?: string },
    guidance?: string,
  ): Promise<CodexState> {
    const accounts = await runtime.registry.list();
    const credentials = await openCodeCredentials(ctx.integration).snapshot();
    return {
      accounts: await Promise.all(
        accounts.map(async (account) => {
          const quota = await runtime.quota.getQuota(account.number, {
            refresh: false,
          });
          const primary = quotaWindowView(quota.snapshot?.primary);
          const secondary = quotaWindowView(quota.snapshot?.secondary);
          const blockedUntil = runtime.blockedUntil(account.number);
          return {
            number: account.number,
            providerID: account.providerID,
            label:
              account.number === 1
                ? `${account.label} (openai default)`
                : account.label,
            credentialState: account.state,
            blockedUntil:
              blockedUntil !== null && Number.isFinite(blockedUntil)
                ? blockedUntil
                : null,
            quota: {
              state: quota.state,
              // Optional Zod keys still cannot contain undefined on the RPC wire.
              ...(primary === undefined ? {} : { primary }),
              ...(secondary === undefined ? {} : { secondary }),
              ...(Number.isFinite(quota.fetchedAt)
                ? { fetchedAt: quota.fetchedAt }
                : {}),
            },
          };
        }),
      ),
      unmappedCredentials: credentials.credentials.filter(
        (credential) =>
          !accounts.some((account) => account.credentialID === credential.id),
      ),
      sessionOverride: input.sessionID
        ? (runtime.requests.overrides.get(input.sessionID) ?? null)
        : null,
      notices: [
        ...runtime.registry.notices.map(
          (notice) =>
            `Account 1 rebound from ${notice.previousCredentialID} to ${notice.credentialID}.`,
        ),
        ...(runtime.config?.warning ? [runtime.config.warning] : []),
      ],
      ...(guidance ? { guidance } : {}),
    };
  }
  let pending: Promise<unknown> = Promise.resolve();
  function handler<M extends CodexRpcMethod>(
    method: M,
    run: (input: CodexRpcInput<M>) => Promise<CodexState>,
  ) {
    return (raw: CodexRpcInput<M>): Promise<CodexRpcOutput<M>> => {
      const operation = pending.then(async () => {
        const parsed = codexRpc.methods[method].input.safeParse(raw);
        if (!parsed.success)
          return {
            ok: false,
            error: { code: 'INVALID_REQUEST', message: parsed.error.message },
          };
        try {
          return {
            ok: true,
            value: await run(parsed.data as CodexRpcInput<M>),
          };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: 'OPERATION_FAILED',
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      });
      pending = operation;
      return operation as Promise<CodexRpcOutput<M>>;
    };
  }
  const handlers = {
    state: handler('state', state),
    refreshQuota: handler('refreshQuota', async (input) => {
      const accounts = await runtime.registry.list();
      if (
        input.number !== undefined &&
        !accounts.some((account) => account.number === input.number)
      )
        throw new Error('Account not found.');
      await Promise.all(
        accounts
          .filter(
            (account) =>
              input.number === undefined || input.number === account.number,
          )
          .map((account) => runtime.quota.getQuota(account.number)),
      );
      await runtime.refreshProviders();
      return state(input);
    }),
    remove: handler('remove', async (input) => {
      const result = await runtime.registry.remove(input.number);
      if (result.status !== 'removed')
        throw new Error(`Cannot remove account: ${result.status}.`);
      await runtime.refreshProviders();
      return state(input);
    }),
    switch: handler('switch', async (input) => {
      if (input.number === null)
        runtime.requests.overrides.clear(input.sessionID);
      else {
        if (
          !(await runtime.registry.list()).some(
            (account) =>
              account.number === input.number && account.state === 'ok',
          )
        )
          throw new Error('Account credential unavailable.');
        runtime.requests.overrides.set(input.sessionID, input.number);
      }
      await runtime.refreshProviders();
      return state(input);
    }),
    add: handler('add', async (input) => {
      const result = await runtime.registry.add(input.credentialID);
      if (
        result.status === 'no-unmapped-credential' ||
        result.status === 'no-active-credential'
      )
        return state(input, ADD_GUIDANCE);
      if (result.status !== 'added')
        throw new Error(`Cannot add account: ${result.status}.`);
      await runtime.refreshProviders();
      return state(input);
    }),
  } satisfies RpcHandlers<typeof codexRpc>;
  await ctx.rpc.register(codexRpc, handlers);
  return handlers;
}
