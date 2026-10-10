import type {
  RenderKitTheme,
  SubagentsSnapshot,
  SubagentTaskSummary,
} from '@thoth-agents/pi-core';
import {
  padPanelText,
  panelFg,
  panelVisibleWidth,
} from '@thoth-agents/pi-core/panel';
import { isAsciiMode, labelColumn } from './chrome.js';
import { clean } from './rows.js';

export interface CostSample {
  at: number;
  cost: number;
}

export interface CostTask {
  id: string;
  label: string;
  cost: number;
  /** Unix ms; the earliest known moment of the task. */
  start: number;
  end?: number;
  /** Cumulative cost observed in state snapshots; empty for history-only tasks. */
  samples: CostSample[];
}

/** Bars show the most expensive tasks only. */
export const COST_TOP = 10;
const MAX_TASKS = 200;
const MAX_SAMPLES = 120;

function label(task: SubagentTaskSummary): string {
  return clean(task.displayName?.trim() || task.agent || task.id);
}

/**
 * Session subagent costs from `thoth:subagents:state` snapshots. Updated by the
 * event handler only; renders read the cached ranking and the revision.
 */
export class CostTracker {
  revision = 0;
  private readonly tasks = new Map<string, CostTask>();
  private top: CostTask[] = [];
  private sum = 0;

  /** Live tasks win over history entries with the same id. */
  update(snapshot: SubagentsSnapshot, at: number): void {
    const merged = new Map<string, SubagentTaskSummary>();
    for (const task of snapshot.history) merged.set(task.id, task);
    for (const task of snapshot.tasks) merged.set(task.id, task);
    let changed = false;
    for (const task of merged.values()) {
      const cost = task.usage?.cost;
      if (cost === undefined || !(cost > 0)) continue;
      const name = label(task);
      const start = task.startedAt ?? task.createdAt;
      const known = this.tasks.get(task.id);
      if (!known) {
        // A task already finished on first sight has no observed progression.
        this.tasks.set(task.id, {
          id: task.id,
          label: name,
          cost,
          start,
          end: task.endedAt,
          samples: task.endedAt === undefined ? [{ at, cost }] : [],
        });
        changed = true;
        continue;
      }
      if (
        known.cost === cost &&
        known.label === name &&
        known.end === task.endedAt
      )
        continue;
      changed = true;
      known.label = name;
      known.start = Math.min(known.start, start);
      known.end = task.endedAt;
      if (cost !== known.cost) {
        known.cost = cost;
        const previous = known.samples.at(-1)?.at ?? 0;
        known.samples.push({
          at: Math.max(previous, Math.min(at, task.endedAt ?? at)),
          cost,
        });
        // Keep the first and newest samples when the bound is reached.
        if (known.samples.length > MAX_SAMPLES) known.samples.splice(1, 1);
      }
    }
    if (!changed) return;
    if (this.tasks.size > MAX_TASKS)
      for (const [id] of [...this.tasks]
        .sort((a, b) => a[1].cost - b[1].cost)
        .slice(0, this.tasks.size - MAX_TASKS))
        this.tasks.delete(id);
    const all = [...this.tasks.values()];
    this.sum = all.reduce((total, task) => total + task.cost, 0);
    this.top = all
      .sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label))
      .slice(0, COST_TOP);
    this.revision++;
  }

  /** Most expensive tasks, highest first. */
  ranked(): readonly CostTask[] {
    return this.top;
  }

  /** Sum over every tracked task. */
  total(): number {
    return this.sum;
  }
}

export function formatUsd(value: number): string {
  return `$${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)}`;
}

const PARTIALS = '▏▎▍▌▋▊▉';

/** Horizontal bar of at most `cells` cells with eighth-block resolution. */
export function costBar(ratio: number, cells: number): string {
  if (cells <= 0 || !(ratio > 0)) return '';
  const clamped = Math.min(1, ratio);
  if (isAsciiMode())
    return '#'.repeat(Math.max(1, Math.round(clamped * cells)));
  const eighths = Math.max(1, Math.round(clamped * cells * 8));
  const full = Math.floor(eighths / 8);
  const rest = eighths % 8;
  return '█'.repeat(full) + (rest ? PARTIALS[rest - 1] : '');
}

/** `label  ████▍   $0.42`; the bar takes whatever the label and amount leave. */
export function renderCostRows(
  tasks: readonly CostTask[],
  width: number,
  theme: RenderKitTheme,
): string[] {
  if (!tasks.length) return [];
  const inner = Math.max(0, width - 4);
  const column = Math.min(labelColumn(width), inner);
  const max = tasks[0].cost;
  const amounts = tasks.map((task) => formatUsd(task.cost));
  const amountWidth = Math.max(...amounts.map((text) => text.length));
  const barRoom = Math.max(0, inner - column - amountWidth - 2);
  return tasks.map((task, index) => {
    const name = panelFg(theme, 'muted', padPanelText(task.label, column));
    const bar = costBar(task.cost / max, barRoom);
    const padding = ' '.repeat(barRoom - panelVisibleWidth(bar));
    return `${name} ${panelFg(theme, 'warning', bar)}${padding} ${amounts[index].padStart(amountWidth)}`;
  });
}
