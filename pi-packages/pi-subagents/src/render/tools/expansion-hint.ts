import type { KeybindingHints } from '@earendil-works/pi-coding-agent';

/** Resolve while constructing component rows, not on each render frame. */
export function resolveExpandHint(
  action = 'to expand',
  context?: Partial<KeybindingHints>,
): string {
  const key = context?.keyText?.('app.tools.expand') ?? '';
  return key ? `${key} ${action}` : '';
}
