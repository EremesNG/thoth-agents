import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import type { WorkPanelProvider } from '../src/work-panel.js';
import type { WorkPanelHost } from '../src/work-panel-host.js';
import { provider } from './work-panel-fixture.js';

/** Pre-change ownership layout/algorithm: no lifecycle in the unversioned slot. */
export function legacyWorkPanel(ctx: ExtensionContext): () => void {
  const key = Symbol.for('thoth.pi-core.work-panel');
  const shared = globalThis as typeof globalThis & {
    [key]?: {
      version: 1;
      providers: Map<string, { provider: WorkPanelProvider }>;
      hosts: Map<object, WorkPanelHost>;
    };
  };
  shared[key] ??= {
    version: 1,
    providers: new Map(),
    hosts: new Map(),
  };
  const state = shared[key];
  state.providers.set('legacy', { provider: provider('legacy', 'Legacy') });
  const existing = state.hosts.get(ctx.sessionManager);
  if (existing) {
    existing.refresh();
    return () => {
      state.providers.delete('legacy');
      existing.refresh();
    };
  }
  let removeInput = () => {};
  const host: WorkPanelHost = {
    sessionId: ctx.sessionManager.getSessionId(),
    holders: 1,
    ready: Promise.resolve(),
    isRootEditorInputActive: () => true,
    refresh() {},
    dispose() {
      removeInput();
      ctx.ui.setWidget('thoth-work-panel', undefined);
      state.hosts.delete(ctx.sessionManager);
      state.providers.delete('legacy');
    },
  };
  state.hosts.set(ctx.sessionManager, host);
  ctx.ui.setWidget(
    'thoth-work-panel',
    () =>
      ({
        render: () => ['Legacy item'],
        invalidate() {},
      }) satisfies Component,
    { placement: 'aboveEditor' },
  );
  removeInput = ctx.ui.onTerminalInput(() => undefined);
  return () => host.dispose();
}
