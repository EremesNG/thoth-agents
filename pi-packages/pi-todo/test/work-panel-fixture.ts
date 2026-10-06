import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { WorkPanelProvider } from '@thoth-agents/pi-core';
import { type Mock, vi } from 'vitest';

/** Capture the cross-package host boundary; the todo extension owns no UI. */
export const panel = {
  registrations: [] as Array<{
    provider: WorkPanelProvider;
    changed: Mock<() => void>;
    unregister: Mock<() => void>;
  }>,
  releases: [] as Mock<() => void>[],
  register: vi.fn((_owner: unknown, provider: WorkPanelProvider) => {
    const changed = vi.fn();
    const unsubscribe = provider.onVisibleChanged?.(changed);
    const unregister = vi.fn(() => unsubscribe?.());
    panel.registrations.push({ provider, changed, unregister });
    return unregister;
  }),
  ensure: vi.fn(async (_ctx: ExtensionContext): Promise<() => void> => {
    const release = vi.fn();
    panel.releases.push(release);
    return release;
  }),
  reset() {
    for (const registration of panel.registrations) registration.unregister();
    panel.registrations.length = 0;
    panel.releases.length = 0;
    panel.register.mockClear();
    panel.ensure.mockClear();
  },
};
