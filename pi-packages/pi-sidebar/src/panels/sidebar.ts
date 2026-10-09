import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import {
  combineSessionAndSubagentCost,
  computeSessionCost,
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
  workPanelRenderStatus,
} from '@thoth-agents/pi-core/panel';
import type { SidebarConfig } from '../config.js';
import type { WorkspaceSnapshot } from './workspace.js';

export function sessionRows(
  ctx: ExtensionContext,
  thinking: string,
  subscriptionProviders: readonly string[],
  subagentCost: number,
): string[] {
  const cost = computeSessionCost(ctx.sessionManager.getEntries(), {
    subscriptionProviders,
    providerOf: () => ctx.model?.provider,
  });
  const usage = ctx.getContextUsage();
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

/** Height overflow counts retained items, never continuation lines or discarded history. */
function boundedBody(blocks: string[][], budget: number): string[] {
  if (blocks.flat().length <= budget) return blocks.flat();
  const lines: string[] = [];
  let shown = 0;
  for (const block of blocks) {
    if (lines.length + block.length > budget - 1) break;
    lines.push(...block);
    shown++;
  }
  return budget > 0 ? [...lines, `+${blocks.length - shown} more`] : [];
}

interface PanelData {
  id: string;
  title: string;
  rows: string[];
  blocks?: string[][];
  animated?: boolean[];
  priority: number;
  source: boolean;
  height: number;
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
  constructor(private readonly options: SidebarPanelsOptions) {}
  invalidate(): void {} // Data and kit are sampled on every render; no stale cache.
  private plan(height: number, width = 44): PanelData[] {
    const options = this.options;
    const sources = listWorkPanelSources();
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
          rows: sessionRows(
            options.context(),
            options.thinking(),
            options.subscriptionProviders,
            options.subagentCost(),
          ),
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
        const items = retainedRows(
          getWorkPanelSourceRows(source.id, {
            maxRows: 100_000,
            respectRowCap: false,
          }),
        );
        const blocks = items.map((row, index) =>
          renderWorkPanelRow(row, {
            width: Math.max(1, width - 4),
            now,
            theme: options.theme,
            clip: truncatePanelText,
            measure: panelVisibleWidth,
            last: index === items.length - 1,
          }),
        );
        const rows = blocks.flat();
        panels.push({
          id: source.id,
          title: clean(source.label),
          rows: rows.length ? rows : ['No items'],
          blocks: rows.length ? blocks : undefined,
          animated: items.map(
            (row) =>
              !row.summary &&
              ['running', 'in_progress'].includes(workPanelRenderStatus(row)),
          ),
          priority: source.priority,
          source: true,
          height: Math.max(1, rows.length) + 2,
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
    return panels.filter((panel) => panel.height > 0);
  }
  sourceIds(width = 44): string[] {
    return this.plan(this.options.height(), width)
      .filter((panel) => panel.source && panel.height >= 3)
      .map((panel) => panel.id);
  }
  hasAnimation(width = 44): boolean {
    return this.plan(this.options.height(), width).some((panel) => {
      if (!panel.blocks || panel.height < 3) return false;
      const budget = panel.height - 2;
      const overflow = panel.blocks.flat().length > budget;
      let used = 0;
      return panel.blocks.some((block, index) => {
        used += block.length;
        return used <= budget - (overflow ? 1 : 0) && panel.animated?.[index];
      });
    });
  }
  render(width: number): string[] {
    return this.renderAt(width, this.options.height());
  }
  renderAt(width: number, height: number): string[] {
    if (width <= 0 || height <= 0) return [];
    return this.plan(height, width)
      .flatMap((panel) =>
        panel.height < 3
          ? [truncatePanelText(panel.title, width)]
          : renderPanelCard({
              title:
                panel.id === 'resize'
                  ? this.options.theme.fg('warning', panel.title)
                  : panel.title,
              body: () =>
                panel.blocks
                  ? boundedBody(panel.blocks, panel.height - 2)
                  : panel.rows.slice(0, panel.height - 2),
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
  }
}
