import type { Plugin } from '@opencode/plugin';

export type MultiCodexConfig = { autoSwitchOn429: boolean; warning?: string };

export function parseConfig(input: unknown): MultiCodexConfig {
  if (input === undefined) return { autoSwitchOn429: true };
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Reflect.ownKeys(input).some((key) => key !== 'autoSwitchOn429') ||
    ('autoSwitchOn429' in input && typeof input.autoSwitchOn429 !== 'boolean')
  ) {
    return {
      autoSwitchOn429: false,
      warning:
        'Invalid multi-codex config: expected only autoSwitchOn429 (boolean). Automatic switching is disabled.',
    };
  }
  return {
    autoSwitchOn429:
      'autoSwitchOn429' in input ? input.autoSwitchOn429 === true : true,
  };
}

/** OpenCode v2.2.6 supplies plugins-entry options to setup via ctx.options.
 * Config therefore comes from that entry, not plugin storage or a separate file.
 */
export function configFromContext(
  context: Pick<Plugin.Context, 'options'>,
): MultiCodexConfig {
  return parseConfig(context.options);
}
