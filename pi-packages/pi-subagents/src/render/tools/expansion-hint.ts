import { keyText } from '@earendil-works/pi-coding-agent';

export type KeybindingResolver = (keybinding: string) => string | undefined;

let customKeybindingResolver: KeybindingResolver | undefined;

export function setExpandKeybindingProviderForTests(
  resolver: KeybindingResolver | undefined,
): void {
  customKeybindingResolver = resolver;
}

export function resetExpandKeybindingProviderForTests(): void {
  customKeybindingResolver = undefined;
}

export function resolveExpandKeyText(context?: any): string {
  if (customKeybindingResolver) {
    const custom = customKeybindingResolver('app.tools.expand');
    if (typeof custom === 'string' && custom.trim()) return custom.trim();
  }

  const contextKb = context?.keybindings ?? context?.ui?.keybindings;
  if (typeof contextKb?.getKeys === 'function') {
    const keys = contextKb.getKeys('app.tools.expand');
    if (
      Array.isArray(keys) &&
      keys.length > 0 &&
      typeof keys[0] === 'string' &&
      keys[0].trim()
    ) {
      return keys[0].trim();
    }
    if (typeof keys === 'string' && keys.trim()) {
      return keys.trim();
    }
  }

  try {
    const text = keyText('app.tools.expand');
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }
  } catch {
    // Keybindings may not be initialized outside the TUI.
  }

  return 'ctrl+o';
}

/** Resolve while constructing component rows, not on each render frame. */
export function resolveExpandHint(action = 'to expand', context?: any): string {
  return `${resolveExpandKeyText(context)} ${action}`;
}
