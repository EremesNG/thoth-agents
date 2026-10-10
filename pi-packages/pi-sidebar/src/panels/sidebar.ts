import { homedir } from 'node:os';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import {
  computeSessionCost,
  getRenderKit,
  getWorkPanelSourceRows,
  listWorkPanelSources,
  type ProviderLimitEntry,
  type RenderKitTheme,
  resolveIcon,
  resolveStatusGlyph,
  type WorkPanelRow,
  type WorkPanelSource,
} from '@thoth-agents/pi-core';
import {
  createWorkPanelMetricGrid,
  panelFg,
  panelLingerEndsAt,
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
  WORK_PANEL_ANIMATION_INTERVAL_MS,
  type WorkPanelMetricGrid,
  workPanelRenderStatus,
  workPanelRowLineCount,
} from '@thoth-agents/pi-core/panel';
import type { SidebarConfig } from '../config.js';
import {
  iconSignature,
  isAsciiMode,
  type PanelRole,
  renderChrome,
} from './chrome.js';
import { type CostTracker, formatUsd, renderCostRows } from './cost.js';
import {
  clean,
  renderSessionRows,
  renderWorkspaceRows,
  type SessionView,
  sessionView,
} from './rows.js';
import type { WorkspaceSnapshot } from './workspace.js';

/** Shared host linger windows, then a failed-first three-finished-row cap. */
function retainedRows(rows: WorkPanelRow[], now: number): WorkPanelRow[] {
  const active: WorkPanelRow[] = [];
  const finished: WorkPanelRow[] = [];
  for (const row of rows) {
    if (row.summary) continue;
    const status = workPanelRenderStatus(row);
    const terminal =
      !['queued', 'stopping', 'pending'].includes(row.status ?? '') &&
      (row.state === 'done' ||
        row.state === 'failed' ||
        ['completed', 'failed', 'cancelled', 'interrupted', 'deleted'].includes(
          status,
        ));
    if (!terminal) active.push(row);
    else if (
      (panelLingerEndsAt(row) ?? 0) > now &&
      (row.expiresAt === undefined || row.expiresAt > now)
    )
      finished.push(row);
  }
  return [
    ...active,
    ...finished
      .sort(
        (a, b) =>
          Number(
            b.state === 'failed' ||
              workPanelRenderStatus(b) === 'failed' ||
              b.status === 'timed_out',
          ) -
            Number(
              a.state === 'failed' ||
                workPanelRenderStatus(a) === 'failed' ||
                a.status === 'timed_out',
            ) || (b.endedAt ?? 0) - (a.endedAt ?? 0),
      )
      .slice(0, 3),
  ];
}

function nextExpiry(rows: readonly WorkPanelRow[]): number {
  return rows.reduce((next, row) => {
    const linger = panelLingerEndsAt(row);
    return linger === undefined
      ? next
      : Math.min(next, linger, row.expiresAt ?? Infinity);
  }, Infinity);
}

/** Detail command shown in each work panel footer and in the empty title line. */
const DETAIL_COMMANDS: Record<string, string> = {
  subagents: '/subagents',
  todos: '/todos',
  'background-tasks': '/bg',
};
const COST_COMMAND = '/sidebar cost';
/** Below this width a panel cannot be read; the sidebar asks to be widened. */
const MIN_PANEL_WIDTH = 24;
export const WIDEN_HINT = 'widen: /sidebar resize';

/** Static status counts for agents/background tasks, `done/total` for todos. */
function sourceSummary(
  source: WorkPanelSource,
  theme: RenderKitTheme,
): string | undefined {
  const summary = source.summary;
  if (!summary) return undefined;
  const { running, completed, failed, total } = summary;
  if (source.id === 'todos') {
    return completed !== undefined && total !== undefined
      ? `${completed}/${total}`
      : undefined;
  }
  if (
    source.id in DETAIL_COMMANDS &&
    running !== undefined &&
    completed !== undefined &&
    failed !== undefined
  )
    return [
      running > 0
        ? panelFg(theme, 'accent', `${resolveStatusGlyph('running')}${running}`)
        : '',
      completed > 0
        ? panelFg(
            theme,
            'success',
            `${resolveStatusGlyph('completed')}${completed}`,
          )
        : '',
      failed > 0
        ? panelFg(theme, 'error', `${resolveStatusGlyph('failed')}${failed}`)
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  return summary.text ? clean(summary.text) : undefined;
}

interface PanelData {
  id: string;
  title: string;
  summary?: string;
  role?: PanelRole;
  /** Lines per block; blocks are the unit that `+N more` counts. */
  costs: number[];
  block(index: number): string[];
  /** Show `+N more` when blocks are cut by height. */
  more: boolean;
  footer?: string;
  bareFooter?: string;
  /** Title-only line regardless of height. */
  empty: boolean;
  animated?: boolean[];
  source: boolean;
  /** Allocated lines, assigned after budgeting. */
  height: number;
  rows: string[];
}

function stateWord(snapshot: WorkspaceSnapshot): string | undefined {
  const state = snapshot.git?.state;
  return state === 'conflicts'
    ? 'Conflicts'
    : state === 'modified'
      ? 'Modified'
      : state === 'clean'
        ? 'Clean'
        : undefined;
}

function staticPanel(
  id: string,
  title: string,
  rows: readonly string[],
  extra: Partial<PanelData> = {},
): PanelData {
  return {
    id,
    title,
    costs: rows.map(() => 1),
    block: (index) => [rows[index]],
    more: false,
    empty: false,
    source: false,
    height: 0,
    rows: [],
    ...extra,
  };
}

/** `/cmd ▸ detail`, right aligned and muted. */
function footerRow(
  command: string,
  label: string,
  width: number,
  theme: RenderKitTheme,
): string {
  const arrow = isAsciiMode() ? '>' : '▸';
  const full = label ? `${command} ${arrow} ${label}` : command;
  const text = truncatePanelText(
    panelVisibleWidth(full) <= width - 4 ? full : command,
    width - 4,
  );
  return (
    ' '.repeat(Math.max(0, width - 4 - panelVisibleWidth(text))) +
    panelFg(theme, 'muted', text)
  );
}

/** Blocks that fit in `budget` lines; `+N more` takes one line when shown. */
function fitBlocks(
  costs: readonly number[],
  budget: number,
  more: boolean,
): { count: number; overflow: boolean } {
  const within = (lines: number) => {
    let used = 0;
    let count = 0;
    for (const cost of costs) {
      if (used + cost > lines) break;
      used += cost;
      count++;
    }
    return count;
  };
  if (costs.reduce((sum, cost) => sum + cost, 0) <= budget)
    return { count: costs.length, overflow: false };
  if (!more) return { count: within(budget), overflow: false };
  const count = within(budget - 1);
  if (count > 0 || within(budget) === 0) return { count, overflow: true };
  // A lone row beats a bare count.
  return { count: within(budget), overflow: false };
}

export interface SidebarPanelsOptions {
  config: SidebarConfig;
  context(): ExtensionContext;
  theme: RenderKitTheme;
  thinking(): string;
  subscriptionProviders: readonly string[];
  subagentCost(): number;
  /** Cached, event-driven provider-limit observations. */
  limits?(): readonly ProviderLimitEntry[];
  workspace(): WorkspaceSnapshot;
  /** Event-driven subagent cost data behind the Cost panel. */
  cost?(): CostTracker;
  /** Home directory for path abbreviation; defaults to the OS home. */
  home?: string;
  height(): number;
  resizeWidth?(): number | undefined;
}

export class SidebarPanels implements Component {
  private cachedKey = '';
  private cachedPlan: PanelData[] = [];
  private cachedLines: string[] | undefined;
  private kit = getRenderKit();
  private icons = iconSignature();
  private revision = 0;
  private animated = false;
  private panelGap = 1;
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
      raw: WorkPanelRow[];
      expiresAt: number;
      grid: WorkPanelMetricGrid;
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
  private sessionView(): SessionView {
    return sessionView(
      this.options.context(),
      this.options.thinking(),
      this.cost,
      this.options.subagentCost(),
      this.usage ?? null,
      this.options.limits?.() ?? [],
    );
  }
  /** Unbudgeted panels in configured order; cheap, cached data only. */
  private build(
    sources: readonly WorkPanelSource[],
    frame: number,
    width: number,
  ): PanelData[] {
    const options = this.options;
    const inner = Math.max(1, width - 4);
    const now = Date.now();
    const panels: PanelData[] = [];
    const resizeWidth = options.resizeWidth?.();
    if (resizeWidth !== undefined)
      panels.push(
        staticPanel(
          'resize',
          'Resize',
          [
            `width ${resizeWidth} (28–72)`,
            '←/→ move divider · Shift 4',
            'Enter confirm · Esc revert',
          ],
          { role: 'warning' },
        ),
      );
    for (const preference of options.config.panels) {
      if (!preference.visible) continue;
      if (preference.id === 'session') {
        panels.push(
          staticPanel(
            'session',
            'Session',
            renderSessionRows(this.sessionView(), width, options.theme),
          ),
        );
      } else if (preference.id === 'workspace') {
        const workspace = options.workspace();
        panels.push(
          staticPanel(
            'workspace',
            'Workspace',
            renderWorkspaceRows(
              workspace,
              width,
              options.theme,
              options.home ?? homedir(),
              resolveIcon('branch'),
            ),
            { summary: stateWord(workspace) },
          ),
        );
      } else if (preference.id === 'cost') {
        const tracker = options.cost?.();
        if (!tracker) continue;
        const rows = renderCostRows(
          tracker.ranked().slice(0, 5),
          width,
          options.theme,
        );
        panels.push(
          staticPanel('cost', 'Cost', rows, {
            more: true,
            empty: rows.length === 0,
            summary: rows.length
              ? formatUsd(options.subagentCost() || tracker.total())
              : COST_COMMAND,
            footer: footerRow(COST_COMMAND, 'curves', width, options.theme),
            bareFooter: footerRow(COST_COMMAND, '', width, options.theme),
          }),
        );
      } else {
        const source = sources.find((source) => source.id === preference.id);
        if (!source) continue;
        panels.push(this.sourcePanel(source, frame, inner, now));
      }
    }
    return panels;
  }
  private sourcePanel(
    source: WorkPanelSource,
    frame: number,
    inner: number,
    now: number,
  ): PanelData {
    const options = this.options;
    let snapshot = this.snapshots.get(source.id);
    if (
      !snapshot ||
      snapshot.revision !== source.revision ||
      (snapshot.animated && snapshot.frame !== frame)
    ) {
      const raw = getWorkPanelSourceRows(source.id, {
        // Exact retention/overflow counts require the complete snapshot.
        maxRows: Number.MAX_SAFE_INTEGER,
        respectRowCap: false,
      });
      const items = retainedRows(raw, now);
      snapshot = {
        revision: source.revision,
        frame,
        raw,
        items,
        expiresAt: nextExpiry(items),
        grid: [],
        animated: false,
      };
      snapshot.grid = createWorkPanelMetricGrid(
        snapshot.items,
        panelVisibleWidth,
      );
      this.snapshots.set(source.id, snapshot);
    }
    const items = snapshot.items;
    const metricOptions = {
      metricLayout: 'grid' as const,
      metricGrid: snapshot.grid,
    };
    const command = DETAIL_COMMANDS[source.id];
    return {
      id: source.id,
      title: clean(source.label),
      // An empty panel is one title line that carries the command.
      summary:
        items.length === 0 && command
          ? [sourceSummary(source, options.theme), command]
              .filter(Boolean)
              .join(' ')
          : sourceSummary(source, options.theme),
      costs: items.map((row) =>
        workPanelRowLineCount(row, inner, panelVisibleWidth, metricOptions),
      ),
      block: (index) =>
        renderWorkPanelRow(items[index], {
          width: inner,
          now,
          theme: options.theme,
          clip: truncatePanelText,
          measure: panelVisibleWidth,
          last: index === items.length - 1,
          ...metricOptions,
        }),
      more: true,
      footer: command
        ? footerRow(command, 'detail', inner + 4, options.theme)
        : undefined,
      bareFooter: command
        ? footerRow(command, '', inner + 4, options.theme)
        : undefined,
      empty: items.length === 0,
      animated: items.map(
        (row) =>
          !row.summary &&
          ['running', 'in_progress'].includes(workPanelRenderStatus(row)),
      ),
      source: true,
      height: 0,
      rows: [],
    };
  }
  private plan(height: number, width = 44): PanelData[] {
    if (width < MIN_PANEL_WIDTH) {
      this.animated = false;
      return [];
    }
    this.readSession();
    const options = this.options;
    const sources = listWorkPanelSources();
    const kit = getRenderKit();
    const icons = iconSignature();
    if (kit !== this.kit || icons !== this.icons) {
      this.kit = kit;
      this.icons = icons;
      // Providers bake kit-dependent labels into even terminal row snapshots.
      this.snapshots.clear();
      this.invalidate();
    }
    const now = Date.now();
    // Prune cached rows on the existing cadence, without re-reading providers.
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.expiresAt <= now) {
        snapshot.items = retainedRows(snapshot.raw, now);
        snapshot.expiresAt = nextExpiry(snapshot.items);
        snapshot.grid = createWorkPanelMetricGrid(
          snapshot.items,
          panelVisibleWidth,
        );
        this.invalidate();
      }
    }
    const frame = Math.floor(now / WORK_PANEL_ANIMATION_INTERVAL_MS);
    // Animation state is part of the key, so the key is re-read after planning.
    const makeKey = () =>
      JSON.stringify([
        sources,
        height,
        width,
        this.revision,
        this.animated ? frame : 0,
        options.config,
        options.workspace(),
        options.cost?.().revision,
        options.resizeWidth?.(),
        this.sessionView(),
        icons,
        [...this.snapshots].map(([id, snapshot]) => [
          id,
          snapshot.items,
          snapshot.grid,
        ]),
        options.home,
      ]);
    if (makeKey() === this.cachedKey) return this.cachedPlan;
    for (const id of this.snapshots.keys()) {
      if (!sources.some((source) => source.id === id))
        this.snapshots.delete(id);
    }
    const panels = this.build(sources, frame, width);
    const budget = Math.max(0, Math.floor(height));
    const visible = panels.slice(0, budget);
    // Titles are mandatory. Drop gaps before dropping unavoidable trailing titles.
    this.panelGap = budget >= visible.length * 2 - 1 ? 1 : 0;
    let remaining =
      budget - visible.length - Math.max(0, visible.length - 1) * this.panelGap;
    const sizes = new Map<PanelData, number[]>();
    for (const panel of visible) {
      panel.height = 1;
      const total = panel.costs.reduce((sum, cost) => sum + cost, 0);
      const full = panel.empty ? 1 : total + (panel.footer ? 1 : 0) + 2;
      const fitting = [1];
      for (let size = 3; size <= Math.min(full, budget); size++) {
        const footer = Boolean(panel.footer && size >= total + 3);
        const fit = fitBlocks(
          panel.costs,
          size - 2 - Number(footer),
          panel.more,
        );
        const used =
          panel.costs.slice(0, fit.count).reduce((sum, cost) => sum + cost, 0) +
          Number(fit.overflow) +
          Number(footer) +
          2;
        if (used === size) fitting.push(size);
      }
      sizes.set(panel, fitting);
      const minimum = fitting.filter((size) => size <= 4).at(-1) ?? 1;
      if (remaining >= minimum - 1) {
        panel.height = minimum;
        remaining -= minimum - 1;
      }
    }
    // Only after minimums are reserved, grow whole rows in configured order.
    for (const panel of visible) {
      const target =
        sizes
          .get(panel)
          ?.filter((size) => size <= panel.height + remaining)
          .at(-1) ?? 1;
      remaining -= target - panel.height;
      panel.height = target;
    }
    this.animated = false;
    for (const panel of visible) {
      if (panel.height < 3 || panel.empty) continue;
      const total = panel.costs.reduce((sum, cost) => sum + cost, 0);
      // Footers go before rows.
      const footer = panel.footer && panel.height >= total + 3;
      const { count, overflow } = fitBlocks(
        panel.costs,
        panel.height - 2 - (footer ? 1 : 0),
        panel.more,
      );
      const snapshot = this.snapshots.get(panel.id);
      // Refresh newly exposed animation before rendering. Replan because fresh
      // provider text can change row count and line costs as well.
      if (
        snapshot &&
        snapshot.frame !== frame &&
        panel.animated?.slice(0, count).some(Boolean)
      ) {
        snapshot.raw = getWorkPanelSourceRows(panel.id, {
          maxRows: Number.MAX_SAFE_INTEGER,
          respectRowCap: false,
        });
        snapshot.items = retainedRows(snapshot.raw, now);
        snapshot.expiresAt = nextExpiry(snapshot.items);
        snapshot.grid = createWorkPanelMetricGrid(
          snapshot.items,
          panelVisibleWidth,
        );
        snapshot.frame = frame;
        return this.plan(height, width);
      }
      panel.rows = Array.from({ length: count }, (_, index) =>
        panel.block(index),
      ).flat();
      if (overflow) {
        const more = `+${panel.costs.length - count} more`;
        const available = width - 4 - panelVisibleWidth(more) - 1;
        const command = [panel.footer, panel.bareFooter]
          .map((text) => text?.trimStart())
          .find((text) => text && panelVisibleWidth(text) <= available);
        const gap =
          width -
          4 -
          panelVisibleWidth(more) -
          panelVisibleWidth(command ?? '');
        panel.rows.push(
          command && gap >= 1 ? more + ' '.repeat(gap) + command : more,
        );
      }
      if (footer && panel.footer) panel.rows.push(panel.footer);
      const active = panel.animated?.slice(0, count).some(Boolean) ?? false;
      if (snapshot) snapshot.animated = active;
      this.animated ||= active;
    }
    for (const [id, snapshot] of this.snapshots) {
      if (!visible.some((panel) => panel.id === id && panel.height >= 3))
        snapshot.animated = false;
    }
    // A lingering terminal row keeps only the already shared cadence alive.
    this.animated ||= [...this.snapshots.values()].some(
      (snapshot) =>
        Number.isFinite(snapshot.expiresAt) && snapshot.expiresAt > now,
    );
    this.cachedKey = makeKey();
    this.cachedPlan = visible;
    this.cachedLines = undefined;
    return visible;
  }
  sourceIds(width = 44): string[] {
    // A title-only panel still displays its source, even without live rows.
    return this.plan(this.options.height(), width)
      .filter((panel) => panel.source && panel.height >= 1)
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
    if (width < MIN_PANEL_WIDTH)
      return [
        panelFg(
          this.options.theme,
          'muted',
          truncatePanelText(WIDEN_HINT, width),
        ),
      ];
    const plan = this.plan(height, width);
    if (this.cachedLines) return this.cachedLines;
    const theme = this.options.theme;
    this.cachedLines = plan
      .flatMap((panel, index) => [
        ...(index && this.panelGap ? [''] : []),
        ...renderChrome({
          id: panel.id,
          title: panel.title,
          summary: panel.summary,
          rows: panel.rows,
          width,
          height: panel.height,
          theme,
          role: panel.role,
        }),
      ])
      .slice(0, height);
    return this.cachedLines;
  }
}
