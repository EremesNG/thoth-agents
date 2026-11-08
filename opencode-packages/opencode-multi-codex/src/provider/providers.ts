import type { Plugin } from '@opencode/plugin';
import type { AccountRegistry } from '../accounts/registry.js';
import { applyCodexModel, CODEX } from './codex-rules.js';

/** Setup snapshots mappings; RPC mutations must await refreshProviders afterwards.
 * Never binds sourceConnection: an active native connection is NOT the alias account.
 */
export async function registerProviders(
  ctx: Pick<Plugin.Context, 'provider' | 'model' | 'session'>,
  registry: Pick<AccountRegistry, 'list'>,
) {
  let accounts = await registry.list();
  const registration = await ctx.provider.transform((editor) => {
    const source = editor.get('openai');
    if (!source) return;
    for (const account of accounts) {
      if (account.number < 2) continue;
      const headers = Object.fromEntries(
        Object.entries(source.provider.headers ?? {}).filter(
          ([key]) =>
            ![
              'authorization',
              'chatgpt-account-id',
              ...Object.keys(CODEX.headers),
            ].includes(key.toLowerCase()),
        ),
      );
      editor.add({
        info: {
          ...source.provider,
          id: account.providerID as typeof source.provider.id,
          name: `OpenAI Codex #${account.number}`,
          activation: 'auto',
          package: '@opencode/ai/providers/openai',
          integrationID: 'openai' as typeof source.provider.integrationID,
          settings: {
            ...source.provider.settings,
            baseURL: CODEX.baseURL,
            transport: source.provider.settings?.transport ?? CODEX.transport,
            encoding: source.provider.settings?.encoding ?? CODEX.encoding,
          },
          headers: { ...headers, ...CODEX.headers },
        },
        models: [...source.models.values()],
      });
    }
  });
  const modelRegistration = await ctx.model.transform((editor) => {
    for (const account of accounts) {
      if (account.number < 2) continue;
      for (const model of editor.list(account.providerID)) {
        editor.update(model.providerID, model.id, applyCodexModel);
      }
    }
  });
  const isAlias = (providerID: string) =>
    accounts.some(
      (account) => account.number >= 2 && account.providerID === providerID,
    );
  const requestRegistration = await ctx.session.hook(
    'model.request',
    async (event) => {
      if (!isAlias(event.model.providerID)) return;
      if (
        event.baseURL &&
        URL.canParse(event.baseURL) &&
        new URL(event.baseURL).origin === CODEX.apiOrigin
      ) {
        event.baseURL = CODEX.baseURL;
      }
      const session = await ctx.session
        .get({ sessionID: event.sessionID })
        .catch(() => undefined);
      event.headers.originator = CODEX.headers.originator;
      event.headers['session-id'] =
        session?.parentID ??
        session?.fork?.sessionID ??
        session?.id ??
        event.sessionID;
      // Unit 4 attaches mapped credentials in model.request/http.request/ws.handshake.
      // Do not copy the globally active bearer or account ID into alias definitions.
    },
  );
  const limitRegistrations: Array<
    Awaited<ReturnType<Plugin.Context['session']['hook']>>
  > = [];
  for (const name of ['context', 'compaction'] as const) {
    limitRegistrations.push(
      await ctx.session.hook(name, (event) => {
        if (isAlias(event.model.providerID)) delete event.options.maxTokens;
      }),
    );
  }
  return {
    async refreshProviders() {
      accounts = await registry.list();
      await ctx.provider.reload();
    },
    async dispose() {
      for (const item of limitRegistrations) await item.dispose();
      await requestRegistration.dispose();
      await modelRegistration.dispose();
      await registration.dispose();
    },
  };
}
