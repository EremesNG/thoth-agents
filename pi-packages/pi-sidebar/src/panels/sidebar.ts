import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import {
  combineSessionAndSubagentCost,
  computeSessionCost,
  getRenderKit,
  getWorkPanelSourceRows,
  listWorkPanelSources,
  type RenderKitTheme,
  type WorkPanelRow,
} from '@thoth-agents/pi-core';
import {
  padPanelText,
  panelVisibleWidth,
  renderPanelCard,
  renderWorkPanelRow,
  truncatePanelText,
  WORK_PANEL_ANIMATION_INTERVAL_MS,
  workPanelRenderStatus,
  workPanelRowLineCount,
} from '@thoth-agents/pi-core/panel';
import type { SidebarConfig } from '../config.js';
import type { WorkspaceSnapshot } from './workspace.js';

export function sessionRows(
  ctx: ExtensionContext,
  thinking: string,
  subscriptionProviders: readonly string[],
  subagentCost: number,
  cost = computeSessionCost(ctx.sessionManager.getEntries(), {
    subscriptionProviders,
    providerOf: () => ctx.model?.provider,
  }),
  usage: ReturnType<
    ExtensionContext['getContextUsage']
  > | null = ctx.getContextUsage(),
): string[] {
  const number = (value: number) => value.toLocaleString('en-US');
  const context =
    usage?.tokens == null
      ? `unknown${usage ? ` / ${number(usage.contextWindow)}` : ''}`
      : `${usage.percent?.toFixed(1) ?? '?'}% · ${number(usage.tokens)} / ${number(usage.contextWindow)}`;
  return [
    `${ctx.model?.provider ?? 'No provider'} / ${ctx.model?.id ?? 'No model'}`,
    `Thinking: ${ctx.thinkingLevel ?? thinking}`,
    `Context: ${context}`,
    `Cost: $${combineSessionAndSubagentCost(cost.cost, subagentCost).toFixed(3)}${cost.isSubscription ? ' (sub)' : ''}`,
  ];
}

/** Provider text is data, not terminal control sequences. */
function clean(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code <= 159) ? ' ' : character;
  }).join('');
}
/** Keep all active/pending work and at most five terminal items per source. */
function retainedRows(rows: WorkPanelRow[]): WorkPanelRow[] {
  const items = rows.filter((row) => !row.summary);
  const terminal = (row: WorkPanelRow) =>
    row.state === 'done' ||
    row.state === 'failed' ||
    [
      'completed',
      'succeeded',
      'failed',
      'timed_out',
      'cancelled',
      'interrupted',
      'deleted',
    ].includes(row.status ?? '') ||
    ['completed', 'failed', 'cancelled', 'interrupted', 'deleted'].includes(
      row.statusGlyph ?? '',
    );
  const finished = items.filter(terminal);
  if (!finished.some((row) => Number.isFinite(row.endedAt))) {
    // No recency contract: earlier provider positions are discarded first.
    // Keep the last five finished rows without regrouping the retained sequence.
    let excess = Math.max(0, finished.length - 5);
    return items.filter((row) => !terminal(row) || excess-- <= 0);
  }
  return [
    ...items.filter((row) => !terminal(row)),
    ...finished
      .sort(
        (a, b) =>
          (Number.isFinite(b.endedAt) ? (b.endedAt ?? 0) : 0) -
          (Number.isFinite(a.endedAt) ? (a.endedAt ?? 0) : 0),
      )
      .slice(0, 5),
  ];
}

interface PanelData {
  id: string;
  title: string;
  rows: string[];
  animated?: boolean[];
  priority: number;
  source: boolean;
  height: number;
  items?: WorkPanelRow[];
  costs?: number[];
}
export interface SidebarPanelsOptions {
  config: SidebarConfig;
  context(): ExtensionContext;
  theme: RenderKitTheme;
  thinking(): string;
  subscriptionProviders: readonly string[];
  subagentCost(): number;
  workspace(): WorkspaceSnapshot;
  height(): number;
  resizeWidth?(): number | undefined;
}
export class SidebarPanels implements Component {
  private cachedKey = '';
  private cachedPlan: PanelData[] = [];
  private cachedLines: string[] | undefined;
  private kit = getRenderKit();
  private revision = 0;
  private animated = false;
  private cost: ReturnType<typeof computeSessionCost>;
  private usage: ReturnType<ExtensionContext['getContextUsage']>;
  private sessionDirty = true;
  private sessionLeafId: string | null | undefined;
  private snapshots = new Map<
    string,
    {
      revision: number;
      frame: number;
      items: WorkPanelRow[];
      animated: boolean;
    }
  >();
  constructor(private readonly options: SidebarPanelsOptions) {
    this.cost = { cost: 0, isSubscription: false };
  }
  private readSession(): void {
    const ctx = this.options.context();
    const leafId = ctx.sessionManager.getLeafId?.();
    if (!this.sessionDirty && leafId === this.sessionLeafId) return;
    this.usage = ctx.getContextUsage();
    this.cost = computeSessionCost(ctx.sessionManager.getEntries(), {
      subscriptionProviders: this.options.subscriptionProviders,
      providerOf: () => ctx.model?.provider,
    });
    this.sessionLeafId = leafId;
    this.sessionDirty = false;
  }
  refreshSessionCost(): void {
    // message_end precedes persistence; the leaf check catches a later append.
    this.sessionDirty = true;
    this.invalidate();
  }
  invalidate(): void {
    this.revision++;
    this.cachedLines = undefined;
  }
  private sessionRows(): string[] {
    return sessionRows(
      this.options.context(),
      this.options.thinking(),
      this.options.subscriptionProviders,
      this.options.subagentCost(),
      this.cost,
      this.usage ?? null,
    );
  }
  private plan(height: number, width = 44): PanelData[] {
    this.readSession();
    const options = this.options;
    const sources = listWorkPanelSources();
    const kit = getRenderKit();
    if (kit !== this.kit) {
      this.kit = kit;
      this.invalidate();
    }
    const frame = Math.floor(Date.now() / WORK_PANEL_ANIMATION_INTERVAL_MS);
    const makeKey = () =>
      JSON.stringify([
        sources,
        height,
        width,
        this.revision,
        this.animated ? frame : 0,
        options.config,
        options.workspace(),
        options.resizeWidth?.(),
        this.sessionRows(),
      ]);
    if (makeKey() === this.cachedKey) return this.cachedPlan;
    for (const id of this.snapshots.keys()) {
      if (!sources.some((source) => source.id === id))
        this.snapshots.delete(id);
    }
    const panels: PanelData[] = [];
    const resizeWidth = options.resizeWidth?.();
    if (resizeWidth !== undefined)
      panels.push({
        id: 'resize',
        title: 'Resize',
        rows: [
          `width ${resizeWidth} (28–72)`,
          '←/→ move divider · Shift 4',
          'Enter confirm · Esc revert',
        ],
        priority: -1,
        source: false,
        height: 5,
      });
    const now = Date.now();
    for (const preference of options.config.panels) {
      if (!preference.visible) continue;
      if (preference.id === 'session')
        panels.push({
          id: 'session',
          title: 'Session',
          rows: this.sessionRows(),
          priority: 0,
          source: false,
          height: 6,
        });
      else if (preference.id === 'workspace') {
        const workspace = options.workspace();
        panels.push({
          id: 'workspace',
          title: 'Workspace',
          rows: [
            clean(workspace.cwd),
            clean(workspace.branch ?? 'No branch'),
            workspace.status,
          ],
          priority: 1000,
          source: false,
          height: 5,
        });
      } else {
        const source = sources.find((source) => source.id === preference.id);
        if (!source) continue;
        let snapshot = this.snapshots.get(source.id);
        if (
          !snapshot ||
          snapshot.revision !== source.revision ||
          (snapshot.animated && snapshot.frame !== frame)
        ) {
          snapshot = {
            revision: source.revision,
            frame,
            items: retainedRows(
              getWorkPanelSourceRows(source.id, {
                // Exact retention/overflow counts require the complete snapshot.
                maxRows: Number.MAX_SAFE_INTEGER,
                respectRowCap: false,
              }),
            ),
            animated: false,
          };
          this.snapshots.set(source.id, snapshot);
        }
        const items = snapshot.items;
        const costs = items.map((row) =>
          workPanelRowLineCount(row, Math.max(1, width - 4), panelVisibleWidth),
        );
        panels.push({
          id: source.id,
          title: clean(source.label),
          rows: ['No items'],
          items,
          costs,
          animated: items.map(
            (row) =>
              !row.summary &&
              ['running', 'in_progress'].includes(workPanelRenderStatus(row)),
          ),
          priority: source.priority,
          source: true,
          height:
            Math.max(
              1,
              costs.reduce((sum, cost) => sum + cost, 0),
            ) + 2,
        });
      }
    }
    const available = Math.max(0, Math.floor(height));
    const reduction = [...panels].sort((a, b) => b.priority - a.priority);
    let total = panels.reduce((sum, panel) => sum + panel.height, 0);
    for (const panel of reduction) {
      const removed = Math.min(
        Math.max(0, total - available),
        panel.height - 3,
      );
      panel.height -= removed;
      total -= removed;
    }
    for (const panel of reduction) {
      if (total <= available) break;
      // Keep a heading for the final highest-priority panel in tiny viewports.
      if (
        panels.filter((panel) => panel.height > 0).length === 1 &&
        available > 0
      ) {
        panel.height = available;
        break;
      }
      total -= panel.height;
      panel.height = 0;
    }
    const visible = panels.filter((panel) => panel.height > 0);
    this.animated = false;
    for (const panel of visible) {
      if (!panel.items?.length || !panel.costs || panel.height < 3) continue;
      const budget = panel.height - 2;
      const overflow =
        panel.costs.reduce((sum, cost) => sum + cost, 0) > budget;
      let used = 0;
      let shown = 0;
      const blocks: string[][] = [];
      const snapshot = this.snapshots.get(panel.id);
      // Refresh newly exposed animation before rendering. Replan because fresh
      // provider text can change row count and line costs as well.
      let exposed = 0;
      let exposedCost = 0;
      for (const cost of panel.costs) {
        if (exposedCost + cost > budget - (overflow ? 1 : 0)) break;
        exposedCost += cost;
        exposed++;
      }
      if (
        snapshot &&
        snapshot.frame !== frame &&
        panel.animated?.slice(0, exposed).some(Boolean)
      ) {
        snapshot.items = retainedRows(
          getWorkPanelSourceRows(panel.id, {
            maxRows: Number.MAX_SAFE_INTEGER,
            respectRowCap: false,
          }),
        );
        snapshot.frame = frame;
        return this.plan(height, width);
      }
      for (let index = 0; index < panel.items.length; index++) {
        const cost = panel.costs[index];
        if (used + cost > budget - (overflow ? 1 : 0)) break;
        blocks.push(
          renderWorkPanelRow(panel.items[index], {
            width: Math.max(1, width - 4),
            now,
            theme: options.theme,
            clip: truncatePanelText,
            measure: panelVisibleWidth,
            last: index === panel.items.length - 1,
          }),
        );
        used += cost;
        shown++;
      }
      const active = panel.animated?.slice(0, shown).some(Boolean) ?? false;
      if (snapshot) snapshot.animated = active;
      this.animated ||= active;
      panel.rows = blocks.flat();
      if (overflow) panel.rows.push(`+${panel.items.length - shown} more`);
    }
    for (const [id, snapshot] of this.snapshots) {
      if (!visible.some((panel) => panel.id === id && panel.height >= 3))
        snapshot.animated = false;
    }
    this.cachedKey = makeKey();
    this.cachedPlan = visible;
    this.cachedLines = undefined;
    return visible;
  }
  sourceIds(width = 44): string[] {
    return this.plan(this.options.height(), width)
      .filter((panel) => panel.source && panel.height >= 3)
      .map((panel) => panel.id);
  }
  hasAnimation(width = 44): boolean {
    this.plan(this.options.height(), width);
    return this.animated;
  }

  render(width: number): string[] {
    return this.renderAt(width, this.options.height());
  }
  renderAt(width: number, height: number): string[] {
    if (width <= 0 || height <= 0) return [];
    const plan = this.plan(height, width);
    if (this.cachedLines) return this.cachedLines;
    this.cachedLines = plan
      .flatMap((panel) =>
        panel.height < 3
          ? [truncatePanelText(panel.title, width)]
          : renderPanelCard({
              title:
                panel.id === 'resize'
                  ? this.options.theme.fg('warning', panel.title)
                  : panel.title,
              body: () => panel.rows.slice(0, panel.height - 2),
              width,
              maxHeight: panel.height,
              theme: this.options.theme,
              text: {
                clip: truncatePanelText,
                pad: padPanelText,
                measure: panelVisibleWidth,
              },
            }),
      )
      .slice(0, height);
    return this.cachedLines;
  }
}
