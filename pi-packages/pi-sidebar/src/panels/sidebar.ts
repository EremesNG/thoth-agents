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
  createWorkPanelColumnPlan,
  panelFg,
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
  WORK_PANEL_ANIMATION_INTERVAL_MS,
  workPanelRenderStatus,
  workPanelRowLineCount,
} from '@thoth-agents/pi-core/panel';
import type { SidebarConfig } from '../config.js';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../layout/adapter.js';
import {
  iconSignature,
  isAsciiMode,
  type PanelRole,
  renderChrome,
} from './chrome.js';
import { type CostTracker, formatUsd, renderCostRows } from './cost.js';
import {
  activeLimit,
  clean,
  renderSessionRows,
  renderWorkspaceRows,
  type SessionView,
  sessionView,
} from './rows.js';
import type { WorkspaceSnapshot } from './workspace.js';

/** Retention state wins over presentation; queued, stopping and pending stay live. */
function isFinished(row: WorkPanelRow): boolean {
  if (['queued', 'stopping', 'pending'].includes(row.status ?? ''))
    return false;
  if (row.state) return row.state === 'done' || row.state === 'failed';
  return (
    row.status === 'timed_out' ||
    [
      'completed',
      'failed',
      'timedOut',
      'cancelled',
      'interrupted',
      'deleted',
      'resolved',
      'expectedExit',
    ].includes(workPanelRenderStatus(row))
  );
}

const finiteTime = (value: number | undefined): number | undefined =>
  Number.isFinite(value) ? value : undefined;
const byId = (a: WorkPanelRow, b: WorkPanelRow) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Launch order, oldest first; missing/non-finite timestamps follow in stable input order. */
function byLaunch(a: WorkPanelRow, b: WorkPanelRow): number {
  const aTime = finiteTime(a.sortStartedAt);
  const bTime = finiteTime(b.sortStartedAt);
  if (aTime === undefined) return bTime === undefined ? 0 : 1;
  if (bTime === undefined) return -1;
  return aTime - bTime || byId(a, b);
}

/** Completion order, most recent first; id descending on ties; no time counts as oldest. */
function byCompletion(a: WorkPanelRow, b: WorkPanelRow): number {
  const aTime = finiteTime(a.endedAt) ?? Number.NEGATIVE_INFINITY;
  const bTime = finiteTime(b.endedAt) ?? Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return aTime < bTime ? 1 : -1;
  return byId(b, a);
}

/** Sources whose panels list active work first and finished work by recency. */
const ACTIVE_FIRST_SOURCES: ReadonlySet<string> = new Set([
  'subagents',
  'background-tasks',
]);

/**
 * Agents and Background: active rows in launch order (oldest on top), then the three most
 * recently finished rows, most recent first. Other sources keep launch order, oldest first,
 * where missing timestamps count as later launches for the last-three cap.
 */
function retainedRows(rows: WorkPanelRow[], sourceId: string): WorkPanelRow[] {
  const listed = rows.filter((row) => !row.summary);
  if (ACTIVE_FIRST_SOURCES.has(sourceId))
    return [
      ...listed.filter((row) => !isFinished(row)).sort(byLaunch),
      ...listed.filter(isFinished).sort(byCompletion).slice(0, 3),
    ];
  const ordered = listed.sort(byLaunch);
  const retained = new Set(ordered.filter(isFinished).slice(-3));
  return ordered.filter((row) => !isFinished(row) || retained.has(row));
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

/** Narrowest panel that still shows the queued count. */
const QUEUED_MIN_WIDTH = 36;
/** Cells the header needs besides the summary: borders, icon and spacing. */
const HEADER_CHROME = 10;

/** Static status counts for agents/background tasks, `done/total` for todos. */
function sourceSummary(
  source: WorkPanelSource,
  theme: RenderKitTheme,
  width: number,
): string | undefined {
  const summary = source.summary;
  if (!summary) return undefined;
  const { running, queued, cancelled, completed, failed, total } = summary;
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
  ) {
    const parts = [
      { status: 'running', role: 'accent', count: running },
      {
        status: 'queued',
        role: 'dim',
        count: width >= QUEUED_MIN_WIDTH ? (queued ?? 0) : 0,
      },
      { status: 'completed', role: 'success', count: completed },
      { status: 'failed', role: 'error', count: failed },
      { status: 'cancelled', role: 'muted', count: cancelled ?? 0 },
    ] as const;
    const shown = parts.filter((part) => part.count > 0);
    const text = (items: typeof shown) =>
      items.map((part) => `${resolveStatusGlyph(part.status)}${part.count}`);
    const room = width - HEADER_CHROME - panelVisibleWidth(clean(source.label));
    // Drop ■ then ○ before the header summary would vanish entirely.
    const kept = [...shown];
    for (const status of ['cancelled', 'queued'])
      if (panelVisibleWidth(text(kept).join(' ')) > room)
        kept.splice(
          kept.findIndex((part) => part.status === status),
          kept.some((part) => part.status === status) ? 1 : 0,
        );
    return kept
      .map((part, index) => panelFg(theme, part.role, text(kept)[index]))
      .join(' ');
  }
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
  /** Block indices to hide first; absent means keep the fitting prefix. */
  dropOrder?: number[];
  footer?: string;
  bareFooter?: string;
  /** Title-only line regardless of height. */
  empty: boolean;
  animated?: boolean[];
  source: boolean;
  /** Rows may span two lines (Agents); only these panels get the whole-row minimum. */
  twoLine?: boolean;
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
  dropOrder?: readonly number[],
): { indices: number[]; overflow: boolean } {
  const indices = costs.map((_, index) => index);
  const total = costs.reduce((sum, cost) => sum + cost, 0);
  const within = (lines: number) => {
    if (dropOrder) {
      let used = total;
      const hidden = new Set<number>();
      for (const index of dropOrder) {
        if (used <= lines) break;
        used -= costs[index];
        hidden.add(index);
      }
      return indices.filter((index) => !hidden.has(index));
    }
    let used = 0;
    const fitting: number[] = [];
    for (const index of indices) {
      if (used + costs[index] > lines) break;
      used += costs[index];
      fitting.push(index);
    }
    return fitting;
  };
  if (total <= budget) return { indices, overflow: false };
  if (!more) return { indices: within(budget), overflow: false };
  const fitting = within(budget - 1);
  if (fitting.length > 0 || within(budget).length === 0)
    return { indices: fitting, overflow: true };
  // A lone row beats a bare count.
  return { indices: within(budget), overflow: false };
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
  private cachedKey: readonly unknown[] | undefined;
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
    this.revision++;
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
            `width ${resizeWidth} (${MIN_SIDEBAR_WIDTH}–${MAX_SIDEBAR_WIDTH})`,
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
      const items = retainedRows(raw, source.id);
      snapshot = {
        revision: source.revision,
        frame,
        items,
        animated: false,
      };
      this.snapshots.set(source.id, snapshot);
    }
    const items = snapshot.items;
    // One panel-wide plan per render: every row shares the same visible columns.
    const metricOptions = {
      metricLayout: 'columns' as const,
      metricGrid: createWorkPanelColumnPlan(
        items,
        inner,
        panelVisibleWidth,
        // Agents rows carry their metrics on a second line under the name.
        source.id === 'subagents' ? { lines: 2 } : undefined,
      ),
    };
    const command = DETAIL_COMMANDS[source.id];
    return {
      id: source.id,
      title: clean(source.label),
      // An empty panel is one title line that carries the command.
      summary:
        items.length === 0 && command
          ? [sourceSummary(source, options.theme, inner + 4), command]
              .filter(Boolean)
              .join(' ')
          : sourceSummary(source, options.theme, inner + 4),
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
      // Finished rows hide first (oldest completion last in the list), then oldest active.
      dropOrder: [
        ...items
          .flatMap((row, index) => (isFinished(row) ? [index] : []))
          .sort((a, b) =>
            ACTIVE_FIRST_SOURCES.has(source.id) ? b - a : a - b,
          ),
        ...items.flatMap((row, index) => (!isFinished(row) ? [index] : [])),
      ],
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
      twoLine: source.id === 'subagents',
      height: 0,
      rows: [],
    };
  }
  private plan(height: number, width = DEFAULT_SIDEBAR_WIDTH): PanelData[] {
    if (width < MIN_PANEL_WIDTH) {
      this.animated = false;
      this.cachedKey = undefined;
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
    const frame = Math.floor(now / WORK_PANEL_ANIMATION_INTERVAL_MS);
    const ctx = options.context();
    const workspace = options.workspace();
    const git = workspace.git;
    const limit = activeLimit(options.limits?.() ?? []);
    // Only small input fields are compared structurally. Provider rows are
    // covered by source revisions; session traversals stay behind readSession.
    const key = [
      height,
      width,
      this.revision,
      this.sessionLeafId,
      options.cost?.().revision,
      options.resizeWidth?.(),
      ctx.model?.provider,
      ctx.model?.id,
      ctx.thinkingLevel ?? options.thinking(),
      options.subagentCost(),
      limit?.window,
      limit?.status,
      limit?.utilization,
      limit?.provider,
      workspace.cwd,
      workspace.branch,
      workspace.note,
      git?.state,
      git?.files,
      git?.added,
      git?.removed,
      git?.untracked,
      git?.binary,
      git?.conflicts,
      options.config.startup,
      options.config.width,
      options.config.panels.length,
      ...options.config.panels.flatMap(({ id, visible }) => [id, visible]),
      sources.length,
      ...sources.flatMap(({ id, revision }) => [id, revision]),
      kit,
      icons,
      options.home,
      this.animated ? frame : 0,
    ];
    const cachedKey = this.cachedKey;
    if (
      cachedKey?.length === key.length &&
      key.every((value, index) => Object.is(value, cachedKey[index]))
    )
      return this.cachedPlan;
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
          panel.dropOrder,
        );
        const used =
          fit.indices.reduce((sum, index) => sum + panel.costs[index], 0) +
          Number(fit.overflow) +
          Number(footer) +
          2;
        if (used === size) fitting.push(size);
      }
      sizes.set(panel, fitting);
    }
    // The previous allocation: a title-only panel until a small block fits.
    const baseline = (panel: PanelData) =>
      sizes
        .get(panel)
        ?.filter((size) => size <= 4)
        .at(-1) ?? 1;
    for (const [index, panel] of visible.entries()) {
      let minimum = baseline(panel);
      if (panel.twoLine) {
        // Two-line rows keep one whole row and its `+N more` line, without starving
        // the panels below, which still receive their previous minimum.
        const later = visible
          .slice(index + 1)
          .reduce((sum, other) => sum + Math.max(0, baseline(other) - 1), 0);
        const cap = 3 + (panel.costs[0] ?? 1);
        minimum = Math.max(
          minimum,
          sizes
            .get(panel)
            ?.filter((size) => size <= cap && size - 1 <= remaining - later)
            .at(-1) ?? 1,
        );
      }
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
      const { indices, overflow } = fitBlocks(
        panel.costs,
        panel.height - 2 - (footer ? 1 : 0),
        panel.more,
        panel.dropOrder,
      );
      const snapshot = this.snapshots.get(panel.id);
      // Refresh newly exposed animation before rendering. Replan because fresh
      // provider text can change row count and line costs as well.
      if (
        snapshot &&
        snapshot.frame !== frame &&
        indices.some((index) => panel.animated?.[index])
      ) {
        const raw = getWorkPanelSourceRows(panel.id, {
          maxRows: Number.MAX_SAFE_INTEGER,
          respectRowCap: false,
        });
        snapshot.items = retainedRows(raw, panel.id);
        snapshot.frame = frame;
        this.cachedKey = undefined;
        return this.plan(height, width);
      }
      panel.rows = indices.flatMap((index) => panel.block(index));
      if (overflow) {
        const more = `+${panel.costs.length - indices.length} more`;
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
      const active = indices.some((index) => panel.animated?.[index]);
      if (snapshot) snapshot.animated = active;
      this.animated ||= active;
    }
    for (const [id, snapshot] of this.snapshots) {
      if (!visible.some((panel) => panel.id === id && panel.height >= 3))
        snapshot.animated = false;
    }
    // Planning discovers whether the frame is an input, without another key read.
    key[key.length - 1] = this.animated ? frame : 0;
    this.cachedKey = key;
    this.cachedPlan = visible;
    this.cachedLines = undefined;
    return visible;
  }
  sourceIds(width = DEFAULT_SIDEBAR_WIDTH): string[] {
    // A title-only panel still displays its source, even without live rows.
    return this.plan(this.options.height(), width)
      .filter((panel) => panel.source && panel.height >= 1)
      .map((panel) => panel.id);
  }
  hasAnimation(width = DEFAULT_SIDEBAR_WIDTH): boolean {
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
