import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import {
  getAnimationLevel,
  hasBlockingOverlay,
  isWorkPanelRootEditorInputActive,
  listProviderLimits,
  listWorkPanelSources,
  type ProviderLimitEntry,
  type RenderKitTheme,
  registerUIPreferences,
  request,
  SUBAGENTS_STATE_CHANNEL,
  SUBAGENTS_STATE_REQUEST,
  SUBAGENTS_USAGE_CHANNEL,
  SUBAGENTS_USAGE_REQUEST,
  subscribe,
  subscribeAnimationLevel,
  subscribeAnimationSteps,
  subscribeProviderLimits,
  subscribeWorkPanelRegistry,
  updateUIPreferences,
  withdrawUIPreferences,
} from '@thoth-agents/pi-core';
import {
  changePanel,
  loadConfig,
  loadSubscriptionProviders,
  reconcilePanels,
  type SidebarConfig,
  saveConfig,
} from './config.js';
import { SidebarControls } from './controls.js';
import { openCostCurves } from './curves.js';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from './layout/adapter.js';
import {
  createFullscreenAdapter,
  createInlineAdapter,
  type LayoutAdapter,
} from './layout/index.js';
import { concreteRenderer } from './layout/renderer.js';
import { CostTracker } from './panels/cost.js';
import { DEFAULT_BAR_STYLE } from './panels/meter.js';
import { SidebarPanels } from './panels/sidebar.js';
import { WorkspaceReader, type WorkspaceSnapshot } from './panels/workspace.js';
import { openSettings } from './settings.js';

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((line, index) => line === right[index])
  );
}

interface SidebarOutput {
  displayed: boolean;
  width: number;
  height: number;
  lines: readonly string[];
}

export class SidebarSession {
  private context: ExtensionContext;
  private readonly config: SidebarConfig;
  private readonly controls: SidebarControls;
  private readonly adapter: LayoutAdapter;
  private readonly panels: SidebarPanels;
  private readonly workspaceReader: WorkspaceReader;
  private workspace: WorkspaceSnapshot;
  private subagentCost = 0;
  private readonly costTracker = new CostTracker();
  private limits: readonly ProviderLimitEntry[] = [];
  private preference: symbol | undefined;
  private absorbed: readonly string[] = [];
  private rendered: SidebarOutput | undefined;
  private appliedWidth = DEFAULT_SIDEBAR_WIDTH;
  private resizeStatus: string | undefined;
  private resizeInputRelease: (() => void) | undefined;
  private animationRelease: (() => void) | undefined;
  private animationFrame = 0;
  private mounted = false;
  private disposed = false;
  private readonly releases: Array<() => void> = [];

  constructor(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    private readonly tui: TUI,
    theme: RenderKitTheme,
  ) {
    this.context = ctx;
    this.config = loadConfig();
    this.controls = new SidebarControls(this.config.startup);
    if (this.config.width !== undefined)
      this.controls.setWidth(this.config.width);
    this.workspace = { cwd: ctx.cwd, note: 'Reading git status…' };
    this.workspaceReader = new WorkspaceReader(ctx.cwd, (snapshot) => {
      this.workspace = snapshot;
      this.refresh();
    });
    this.discover();
    this.panels = new SidebarPanels({
      config: this.config,
      context: () => this.context,
      theme,
      thinking: () => pi.getThinkingLevel(),
      subscriptionProviders: loadSubscriptionProviders(),
      subagentCost: () => this.subagentCost,
      cost: () => this.costTracker,
      limits: () => this.limits,
      workspace: () => this.workspace,
      height: () => tui.terminal.rows,
      resizeWidth: () =>
        this.controls.resizing
          ? this.controls.effectiveWidth(tui.terminal.columns)
          : undefined,
    });
    const diagnostic = (message: string) => ctx.ui.notify(message, 'warning');
    this.adapter =
      tui.mode === 'fullscreen'
        ? createFullscreenAdapter(tui, diagnostic, () => this.sync())
        : createInlineAdapter(tui, diagnostic, () => this.sync());
    // Set visibility before mounting to avoid a briefly visible overlay at startup off.
    this.adapter.setVisible(this.controls.sync(tui.terminal.columns));
    this.appliedWidth = this.controls.effectiveWidth(tui.terminal.columns);
    this.mounted = this.adapter.mount(this.panels, this.controls.width);
    if (!this.mounted) return;
    this.adapter.setWidth(this.controls.width, this.appliedWidth);
    this.releases.push(
      subscribeAnimationLevel(() => {
        this.rendered = undefined;
        this.refresh();
      }),
      subscribeWorkPanelRegistry(() => {
        this.discover();
        this.providerChanged();
      }),
    );
    // Subscriptions replay nothing, so read the registry once at start.
    this.limits = listProviderLimits();
    this.releases.push(
      subscribeProviderLimits(() => {
        this.limits = listProviderLimits();
        this.providerChanged();
      }),
    );
    this.releases.push(
      subscribe(pi.events, SUBAGENTS_USAGE_CHANNEL, {
        sessionId: ctx.sessionManager.getSessionId(),
        onSnapshot: ({ data }) => {
          this.subagentCost = data.totalCost;
          this.panels.refreshSessionCost();
          this.providerChanged();
        },
      }),
    );
    this.releases.push(
      subscribe(pi.events, SUBAGENTS_STATE_CHANNEL, {
        sessionId: ctx.sessionManager.getSessionId(),
        onSnapshot: ({ data, at }) => {
          this.costTracker.update(data, at);
          this.providerChanged();
        },
      }),
    );
    const input = (data: string) => this.input(data);
    this.releases.push(ctx.ui.onTerminalInput(input));
    if (tui.mode === 'fullscreen') {
      // Pi's viewport selection listener otherwise consumes divider mouse input.
      // Only reorder our own registration; deleting it restores foreign ordering.
      this.prioritizeInput(input);
    }
    this.sync();
    this.rendered = this.output();
    request(pi.events, SUBAGENTS_USAGE_REQUEST, {
      sessionId: ctx.sessionManager.getSessionId(),
      source: '@thoth-agents/pi-sidebar',
      data: {},
    });
    request(pi.events, SUBAGENTS_STATE_REQUEST, {
      sessionId: ctx.sessionManager.getSessionId(),
      source: '@thoth-agents/pi-sidebar',
      data: {},
    });
    this.workspaceReader.refresh();
  }
  private discover(): void {
    reconcilePanels(this.config, [
      'session',
      'workspace',
      ...listWorkPanelSources().map((source) => source.id),
      'cost',
    ]);
  }
  /** Called by a zero-row widget on every main render, including when hidden. */
  sync(): void {
    if (this.disposed || !this.mounted) return;
    const visible = this.controls.sync(this.tui.terminal.columns);
    const width = this.controls.effectiveWidth(this.tui.terminal.columns);
    if (this.appliedWidth !== width) {
      this.appliedWidth = width;
      this.adapter.setWidth(this.controls.width, width);
    }
    this.setResizeStatus(this.controls.resizing);
    this.adapter.setVisible(visible);
    const displayed = this.adapter.isDisplayed();
    this.syncAnimation(displayed && this.panels.hasAnimation(width));
    const ids = displayed ? this.panels.sourceIds(width) : [];
    if (!displayed || ids.length === 0) {
      if (this.preference) withdrawUIPreferences(this.preference);
      this.preference = undefined;
      this.absorbed = [];
    } else if (!this.preference) {
      this.preference = registerUIPreferences({
        absorbedWorkPanelSources: ids,
        isActive: () => this.adapter.isDisplayed(),
      });
      this.absorbed = ids;
    } else if (!sameLines(this.absorbed, ids)) {
      updateUIPreferences(this.preference, {
        absorbedWorkPanelSources: ids,
        isActive: () => this.adapter.isDisplayed(),
      });
      this.absorbed = ids;
    }
  }
  private syncAnimation(active: boolean): void {
    if (!active && this.animationRelease) {
      this.animationRelease();
      this.animationRelease = undefined;
      this.panels.pauseAnimation();
    } else if (active && !this.animationRelease) {
      this.animationRelease = subscribeAnimationSteps({
        intendedMs: 100,
        onStep: (step) => {
          // Retain the displayed frame when pausing replaces the subscription.
          this.panels.stepAnimation(
            step.static ? undefined : ++this.animationFrame,
          );
          this.refresh();
        },
      });
    }
  }
  private providerChanged(): void {
    // Invalidate now, but coalesce animated provider changes into the next step.
    // Idle sidebars and off-mode data changes remain event-driven.
    this.panels.invalidate();
    if (!this.animationRelease || getAnimationLevel() === 'off') this.refresh();
  }
  private output(): SidebarOutput {
    const displayed = this.adapter.isDisplayed();
    return {
      displayed,
      width: this.appliedWidth,
      height: this.tui.terminal.rows,
      lines: displayed ? this.panels.render(this.appliedWidth) : [],
    };
  }
  refresh(ctx?: ExtensionContext, workspace = false, cost = false): void {
    if (this.disposed) return;
    if (ctx) this.context = ctx;
    if (cost) {
      this.panels.refreshSessionCost();
      // Entries lapse at their reset time without an event.
      this.limits = listProviderLimits();
    }
    if (workspace) this.workspaceReader.refresh();
    this.sync();
    const output = this.output();
    if (
      !this.rendered ||
      output.displayed !== this.rendered.displayed ||
      output.width !== this.rendered.width ||
      output.height !== this.rendered.height ||
      !sameLines(output.lines, this.rendered.lines)
    ) {
      this.rendered = output;
      this.tui.requestRender();
    }
  }
  private inputActive(): boolean {
    return (
      !hasBlockingOverlay(this.tui) &&
      isWorkPanelRootEditorInputActive(this.context) !== false
    );
  }
  private prioritizeInput(input: (data: string) => unknown): void {
    const listeners: unknown = (
      concreteRenderer(this.tui) as TUI & { inputListeners?: unknown }
    ).inputListeners;
    if (listeners instanceof Set && listeners.delete(input)) {
      const existing = [...listeners];
      listeners.clear();
      listeners.add(input);
      for (const listener of existing) listeners.add(listener);
    }
  }
  private setResizeStatus(active: boolean): void {
    if (active && !this.resizeInputRelease) {
      // The retained work panel consumes arrows even in inline mode. Give this
      // temporary registration priority, without changing foreign ordering.
      const input = (data: string) => this.input(data);
      this.resizeInputRelease = this.context.ui.onTerminalInput(input);
      this.prioritizeInput(input);
    } else if (!active && this.resizeInputRelease) {
      this.resizeInputRelease();
      this.resizeInputRelease = undefined;
    }
    const status = active
      ? `Sidebar width ${this.controls.effectiveWidth(this.tui.terminal.columns)} (${MIN_SIDEBAR_WIDTH}–${MAX_SIDEBAR_WIDTH}) · ←/→ move divider · Shift 4 · Enter confirm · Esc revert`
      : undefined;
    if (status === this.resizeStatus) return;
    this.resizeStatus = status;
    this.context.ui.setStatus('thoth-sidebar-resize', status);
  }
  beginResize(ctx: ExtensionContext): void {
    this.context = ctx;
    this.sync();
    if (!this.mounted) {
      ctx.ui.notify('Sidebar unavailable — renderer is not mounted.', 'info');
      return;
    }
    if (!this.controls.visible) {
      ctx.ui.notify(
        this.controls.enabled
          ? 'Sidebar hidden — terminal too narrow.'
          : 'Sidebar hidden — /sidebar on first.',
        'info',
      );
      return;
    }
    if (!this.adapter.isDisplayed()) {
      ctx.ui.notify('Sidebar unavailable — renderer is not mounted.', 'info');
      return;
    }
    if (!this.inputActive() || !this.controls.beginResize()) return;
    this.setResizeStatus(true);
    this.tui.requestRender();
  }
  private input(data: string): { consume: true } | undefined {
    if (this.disposed || !this.mounted) return;
    this.sync();
    if (!this.inputActive()) {
      const resizing = this.controls.resizing;
      this.controls.cancelResize();
      this.setResizeStatus(false);
      if (resizing) this.refresh();
      return;
    }
    if (this.controls.key(data, this.tui.terminal.columns)) {
      this.setResizeStatus(this.controls.resizing);
      this.refresh();
      return { consume: true };
    }
    // SGR coordinates are one-based. Read raw input before the layout routes it,
    // so the one-column hit target also covers the main side of the divider.
    if (this.tui.mode === 'fullscreen' && data.startsWith('\x1b[<')) {
      const mouse = data.slice(3).match(/^(\d+);(\d+);(\d+)([Mm])$/);
      if (mouse) {
        const button = Number(mouse[1]);
        if (
          Number.isSafeInteger(button) &&
          Number.isSafeInteger(Number(mouse[2])) &&
          Number(mouse[2]) > 0 &&
          Number.isSafeInteger(Number(mouse[3])) &&
          Number(mouse[3]) > 0 &&
          (button & 64) === 0 &&
          (button & 3) === 0
        ) {
          const type =
            mouse[4] === 'm' ? 'release' : button & 32 ? 'drag' : 'press';
          if (
            this.controls.mouse(
              type,
              Number(mouse[2]) - 1,
              this.tui.terminal.columns,
            )
          ) {
            this.refresh();
            return { consume: true };
          }
        }
      }
    }
    return undefined;
  }
  command(args: string, ctx: ExtensionContext): void {
    this.context = ctx;
    this.sync();
    const [command = '', action, id, ...extra] = args.trim().split(/\s+/);
    if (command === 'resize' && !action) {
      this.beginResize(ctx);
      return;
    }
    if (command === 'cost' && !action) {
      this.fail(ctx, openCostCurves(ctx, this.costTracker));
      return;
    }
    if (command === 'settings' && !action) {
      this.fail(ctx, this.settings(ctx));
      return;
    }
    if (command === 'panels') {
      this.discover();
      if (!action) {
        const sources = listWorkPanelSources();
        ctx.ui.notify(
          this.config.panels
            .map(
              (panel) =>
                `${panel.visible ? 'on ' : 'off'} ${panel.id}${!['session', 'workspace', 'cost'].includes(panel.id) && !sources.some((source) => source.id === panel.id) ? ' (unavailable)' : ''}`,
            )
            .join('\n'),
          'info',
        );
        return;
      }
      if (!id || extra.length || !changePanel(this.config, action, id)) {
        this.help(ctx);
        return;
      }
      this.persist(ctx);
    } else if (
      command === 'startup' &&
      !id &&
      (action === 'auto' || action === 'manual' || action === 'off')
    ) {
      this.config.startup = action;
      this.persist(ctx);
    } else if (!action && this.controls.command(command)) {
      this.setResizeStatus(this.controls.resizing);
    } else {
      this.help(ctx);
      return;
    }
    this.refresh();
  }
  private fail(ctx: ExtensionContext, work: Promise<unknown>): void {
    work.catch((error) =>
      ctx.ui.notify(
        `Sidebar overlay failed: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      ),
    );
  }
  private async settings(ctx: ExtensionContext): Promise<void> {
    const saved = await openSettings(ctx, {
      panels: this.config.panels,
      startup: this.config.startup,
      width: this.config.width ?? DEFAULT_SIDEBAR_WIDTH,
      bars: this.config.bars ?? DEFAULT_BAR_STYLE,
      unavailable: (id) =>
        !['session', 'workspace', 'cost'].includes(id) &&
        !listWorkPanelSources().some((source) => source.id === id),
      save: (draft) => {
        const next = { ...this.config, ...draft };
        saveConfig(next);
        Object.assign(this.config, next);
        if (!this.controls.resizing) this.controls.setWidth(draft.width);
      },
    });
    if (saved) this.refresh();
  }
  private help(ctx: ExtensionContext): void {
    ctx.ui.notify(
      '/sidebar [auto|manual|on|off|resize|cost|settings] · panels [show|hide|up|down <id>] · startup auto|manual|off',
      'info',
    );
  }
  private persist(ctx: ExtensionContext): void {
    try {
      saveConfig(this.config);
    } catch (error) {
      ctx.ui.notify(
        `Sidebar preferences were not saved: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.syncAnimation(false);
    this.controls.cancelResize();
    this.workspaceReader.dispose();
    for (const off of this.releases.splice(0).reverse()) off();
    if (this.preference) withdrawUIPreferences(this.preference);
    this.preference = undefined;
    this.setResizeStatus(false);
    this.adapter.dispose();
  }
}
