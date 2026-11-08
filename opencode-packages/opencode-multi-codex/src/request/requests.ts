import { createHash } from 'node:crypto';
import type { Plugin } from '@opencode/plugin';
import type { AccountRegistry } from '../accounts/registry.js';
import { SessionAccountOverrides } from './overrides.js';

export type RequestScope = {
  sessionID: string;
  providerID: string;
  kind: 'primary' | 'compaction' | 'title' | 'generate';
};
export type AccountRouter = (
  input: RequestScope & { accountNumber: number },
) => number | Promise<number>;
export type ResolvedAccount = {
  accountNumber: number;
  access: string;
  accountID: string;
};

function pinnedAccount(providerID: string): number | undefined {
  if (providerID === 'openai') return 1;
  const match = /^openai-codex-([2-9]|[1-9]\d+)$/.exec(providerID);
  const number = match ? Number(match[1]) : undefined;
  return Number.isSafeInteger(number) ? number : undefined;
}

function jwtAccountID(access: string): string | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(access.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    const id = payload['https://api.openai.com/auth']?.chatgpt_account_id;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function registerRequests(
  ctx: Pick<Plugin.Context, 'session' | 'integration' | 'event'>,
  registry: Pick<AccountRegistry, 'list'>,
) {
  const overrides = new SessionAccountOverrides();
  const socketAccounts = new Map<string, number>();
  // Retain previous token fingerprints for delayed responses after native refresh.
  // Hash both native headers so separate grants for the same ChatGPT account stay distinct.
  const sentAccounts = new Map<string, number | undefined>();
  const sentKey = (headers: Headers) => {
    const authorization = headers.get('authorization');
    const accountID = headers.get('chatgpt-account-id');
    if (!authorization || !accountID) return undefined;
    return createHash('sha256')
      .update(JSON.stringify([authorization, accountID]))
      .digest('hex');
  };
  const rememberSentHeaders = (headers: HeadersInit, accountNumber: number) => {
    const key = sentKey(new Headers(headers));
    if (!key) return;
    // Identical native headers cannot identify two mappings: abstain rather than misattribute.
    if (sentAccounts.has(key) && sentAccounts.get(key) !== accountNumber)
      sentAccounts.set(key, undefined);
    else sentAccounts.set(key, accountNumber);
  };
  const accountForSentHeaders = (headers: HeadersInit): number | undefined => {
    const key = sentKey(new Headers(headers));
    return key ? sentAccounts.get(key) : undefined;
  };
  let router: AccountRouter | undefined;
  const resolveCredential = async (
    accountNumber: number,
  ): Promise<ResolvedAccount | undefined> => {
    try {
      const account = (await registry.list()).find(
        (item) => item.number === accountNumber,
      );
      if (account?.state === 'ok') {
        const integrations = await ctx.integration.list();
        const connection = integrations.data
          .find((item) => item.id === 'openai')
          ?.connections.find(
            (item) =>
              item.type === 'credential' && item.id === account.credentialID,
          );
        // resolve owns token refresh and persistence; never cache or activate a credential.
        const value = connection
          ? await ctx.integration.connection.resolve(connection)
          : undefined;
        if (value?.type === 'oauth' && value.access) {
          const metadataID = value.metadata?.accountID;
          const accountID =
            typeof metadataID === 'string' && metadataID.length > 0
              ? metadataID
              : jwtAccountID(value.access);
          if (accountID)
            return { accountNumber, access: value.access, accountID };
        }
      }
    } catch {
      // Do not expose native error details: they may contain credential values.
    }
    if (accountNumber === 1) return undefined;
    throw new Error(
      `Codex account ${accountNumber} has no resolvable OAuth credential/account ID. Reconnect it through the native connect dialog.`,
    );
  };

  const resolveAccountForRequest = async (scope: RequestScope) => {
    const pinned = pinnedAccount(scope.providerID);
    if (pinned === undefined) return undefined;
    const accountNumber = overrides.get(scope.sessionID) ?? pinned;
    const routed = router
      ? await router({ ...scope, accountNumber })
      : accountNumber;
    if (!Number.isSafeInteger(routed) || routed < 1)
      throw new Error('Codex router returned an invalid account number.');
    return routed;
  };
  type HeaderEvent = {
    sessionID: string;
    model: { providerID: string };
    kind: RequestScope['kind'];
    headers: Record<string, string>;
  };
  const credentialFor = async (event: Omit<HeaderEvent, 'headers'>) => {
    const accountNumber = await resolveAccountForRequest({
      sessionID: event.sessionID,
      providerID: event.model.providerID,
      kind: event.kind,
    });
    if (accountNumber === undefined) return;
    return resolveCredential(accountNumber);
  };
  const substituteHeaders = async (event: HeaderEvent) => {
    const credential = await credentialFor(event);
    if (!credential) return;
    for (const key of Object.keys(event.headers)) {
      if (['authorization', 'chatgpt-account-id'].includes(key.toLowerCase()))
        delete event.headers[key];
    }
    event.headers.Authorization = `Bearer ${credential.access}`;
    event.headers['ChatGPT-Account-Id'] = credential.accountID;
    rememberSentHeaders(event.headers, credential.accountNumber);
    return credential;
  };
  const registrations = [
    await ctx.session.hook('model.request', async (event) => {
      await substituteHeaders(event);
    }),
    await ctx.session.hook('http.request', async (event) => {
      const credential = await credentialFor(event);
      if (!credential) return;
      // Mutate only headers: preserve Request identity, streaming body and cancellation.
      event.request.headers.set('Authorization', `Bearer ${credential.access}`);
      event.request.headers.set('ChatGPT-Account-Id', credential.accountID);
      rememberSentHeaders(event.request.headers, credential.accountNumber);
    }),
    // Only handshake substitution updates WebSocket attribution; HTTP traffic must not.
    await ctx.session.hook('experimental.ws.handshake', async (event) => {
      const credential = await substituteHeaders(event);
      // v2.2.6 model-transport.ts L309-345 runs this before socket selection;
      // L509-530 serializes handshake + exchange under the per-session lock.
      // Receive (L430-456) therefore belongs to this last handshake, even on reuse.
      if (credential)
        socketAccounts.set(event.sessionID, credential.accountNumber);
      else socketAccounts.delete(event.sessionID);
    }),
  ];
  const signal = new AbortController();
  // The adapter closes this iterator on plugin unload; abort also supports explicit disposal.
  const events = ctx.event?.subscribe({
    types: ['session.deleted'],
    signal: signal.signal,
  });
  const deletionTask = (async () => {
    if (!events) return;
    try {
      for await (const event of events) {
        overrides.clear(event.data.sessionID);
        socketAccounts.delete(event.data.sessionID);
      }
    } catch {
      // Event transport shutdown must not produce an unhandled rejection on unload.
    }
  })();
  return {
    overrides,
    resolveCredential,
    resolveAccountForRequest,
    accountForSentHeaders,
    accountForWebSocket(sessionID: string) {
      return socketAccounts.get(sessionID);
    },
    setRouter(next: AccountRouter | undefined) {
      router = next;
    },
    async dispose() {
      signal.abort();
      await deletionTask;
      overrides.clearAll();
      sentAccounts.clear();
      socketAccounts.clear();
      for (const registration of registrations) await registration.dispose();
    },
  };
}
