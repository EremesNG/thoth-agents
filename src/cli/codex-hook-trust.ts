import { createHash } from 'node:crypto';
import { CODEX_PLUGIN_ID } from './codex-plugin-install';

interface CommandHandler {
  type: string;
  command: string;
  commandWindows?: string | null;
  timeout?: number | null;
  async?: boolean;
  statusMessage?: string | null;
  additionalContextLimit?: number | null;
}
interface HookGroup {
  matcher?: string | null;
  hooks: CommandHandler[];
}
export interface CodexHookDeclarations {
  hooks: Record<string, HookGroup[]>;
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sorted(item)]),
    );
  }
  return value;
}

/** Version-coupled to rust-v0.162.1 discovery.rs / fingerprint.rs.
 * Identity is flattened, includes one handler, and omits TOML None values.
 * Commands are hashed before PLUGIN_ROOT substitution, after platform selection.
 */
export function codexHookTrustEntries(
  declarations: CodexHookDeclarations,
  source: string,
  platform: NodeJS.Platform,
): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [event, groups] of Object.entries(declarations.hooks)) {
    const eventName = event.replace(
      /[A-Z]/g,
      (letter, index) => `${index ? '_' : ''}${letter.toLowerCase()}`,
    );
    groups.forEach((group, groupIndex) => {
      group.hooks.forEach((handler, handlerIndex) => {
        if (handler.type !== 'command')
          throw new Error(`Unsupported Codex hook handler: ${handler.type}`);
        const short = event === 'SessionEnd' || event === 'Interrupt';
        const timeout = short
          ? Math.min(3, Math.max(1, handler.timeout ?? 1))
          : Math.max(1, handler.timeout ?? 600);
        const contextAllowed = [
          'PreToolUse',
          'PostToolUse',
          'SessionStart',
          'UserPromptSubmit',
          'SubagentStart',
        ].includes(event);
        const limit = contextAllowed
          ? handler.additionalContextLimit
          : undefined;
        const identity = {
          event_name: eventName,
          ...(!['UserPromptSubmit', 'Stop', 'Interrupt'].includes(event) &&
          group.matcher != null
            ? { matcher: group.matcher }
            : {}),
          hooks: [
            {
              type: 'command',
              command:
                platform === 'win32'
                  ? (handler.commandWindows ?? handler.command)
                  : handler.command,
              timeout,
              async: handler.async ?? false,
              ...(handler.statusMessage != null
                ? { statusMessage: handler.statusMessage }
                : {}),
              ...(limit != null && limit !== 2500
                ? { additionalContextLimit: limit }
                : {}),
            },
          ],
        };
        entries[`${source}:${eventName}:${groupIndex}:${handlerIndex}`] =
          `sha256:${createHash('sha256')
            .update(JSON.stringify(sorted(identity)))
            .digest('hex')}`;
      });
    });
  }
  return entries;
}

export function codexHookSource(pluginId = CODEX_PLUGIN_ID): string {
  return `${pluginId}:codex-hooks/hooks.json`;
}
