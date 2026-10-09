import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import {
  combineSessionAndSubagentCost,
  computeSessionCost,
  getRenderKit,
  getWorkPanelSourceRows,
  listWorkPanelSources,
  type RenderKitTheme,
  resolveStatusGlyph,
  type WorkPanelRow,
  type WorkPanelSegment,
} from '@thoth-agents/pi-core';
import {
  padPanelText,
  panelVisibleWidth,
  renderPanelCard,
  truncatePanelText,
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
function segmentsText(
  segments: readonly WorkPanelSegment[],
  theme: RenderKitTheme,
): string {
  const kit = getRenderKit();
  return segments
    .map((segment) => {
      const role = segment.role;
      const tone =
        role === 'primary'
          ? 'text'
          : role === 'secondary' || role === 'meta' || role === 'completed'
            ? 'dim'
            : role;
      const text = clean(segment.text);
      return kit?.fg(theme, tone, text) ?? theme.fg(tone, text);
    })
    .join('');
}
function sourceRows(row: WorkPanelRow, theme: RenderKitTheme): string[] {
  const text = row.identity
    ? segmentsText(row.identity, theme)
    : row.segments
      ? segmentsText(row.segments, theme)
      : clean(row.primary);
  const status =
    row.statusGlyph === 'taskInProgress'
      ? 'in_progress'
      : (row.statusGlyph ?? row.status);
  const glyph =
    status &&
    [
      'pending',
      'queued',
      'in_progress',
      'running',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
      'stopping',
      'deleted',
      'blocked',
      'unknown',
    ].includes(status)
      ? resolveStatusGlyph(status as Parameters<typeof resolveStatusGlyph>[0])
      : '';
  const metrics = row.metrics
    ?.map((group) => segmentsText(group.segments, theme))
    .join(' · ');
  return [
    `${glyph ? `${glyph} ` : ''}${text}${metrics ? ` · ${metrics}` : ''}`,
    ...(row.extraSegments
      ? row.extraSegments.map((segments) => segmentsText(segments, theme))
      : (row.extraRows?.map(clean) ?? [])),
  ];
}

interface PanelData {
  id: string;
  title: string;
  rows: string[];
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
}
export class SidebarPanels implements Component {
  constructor(private readonly options: SidebarPanelsOptions) {}
  invalidate(): void {} // Data and kit are sampled on every render; no stale cache.
  private plan(height: number): PanelData[] {
    const options = this.options;
    const sources = listWorkPanelSources();
    const panels: PanelData[] = [];
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
        const rows = getWorkPanelSourceRows(source.id, { maxRows: 6 })
          .flatMap((row) => sourceRows(row, options.theme))
          .slice(0, 6);
        panels.push({
          id: source.id,
          title: clean(source.label),
          rows: rows.length ? rows : ['No items'],
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
  sourceIds(): string[] {
    return this.plan(this.options.height())
      .filter((panel) => panel.source && panel.height >= 3)
      .map((panel) => panel.id);
  }
  render(width: number): string[] {
    return this.renderAt(width, this.options.height());
  }
  renderAt(width: number, height: number): string[] {
    if (width <= 0 || height <= 0) return [];
    return this.plan(height)
      .flatMap((panel) =>
        panel.height < 3
          ? [truncatePanelText(panel.title, width)]
          : renderPanelCard({
              title: panel.title,
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
  }
}
