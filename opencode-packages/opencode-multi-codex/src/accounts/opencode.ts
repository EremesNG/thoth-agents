import type { Plugin } from '@opencode/plugin';
import type { CredentialSource } from './registry.js';

/** v2.2.6 returns { location, data }; connection IDs are credential IDs, not tokens. */
export function openCodeCredentials(
  integration: Pick<Plugin.Context['integration'], 'list' | 'connection'>,
): CredentialSource {
  return {
    async snapshot() {
      const result = await integration.list();
      const openai = result.data.find((item) => item.id === 'openai');
      if (!openai) return { credentials: [] };
      const active = await integration.connection.active('openai');
      return {
        credentials: openai.connections.flatMap((connection) =>
          connection.type === 'credential'
            ? [{ id: connection.id, label: connection.label }]
            : [],
        ),
        activeCredentialID:
          active?.type === 'credential' ? active.id : undefined,
      };
    },
  };
}
