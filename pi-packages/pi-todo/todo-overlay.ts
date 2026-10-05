/**
 * todo-overlay.ts — Persistent widget showing todo list above the editor.
 *
 * Lifecycle controller for Pi's `setWidget` contract: factory-form
 * registration in widgetContainerAbove, register-once + requestRender()
 * refresh, collapse-not-scroll (12 content rows plus a trailing spacer),
 * Pi tool-output expansion awareness, and auto-hide when empty.
 *
 * Reads live state via `getRenderState()` (the ctx-less foreground slot) at render
 * time — NEVER `replayFromBranch` from `tool_execution_end` (branch is stale;
 * `message_end` runs after).
 */

import type {
  ExtensionUIContext,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { type TUI, truncateToWidth } from '@earendil-works/pi-tui';
import {
  selectHasActive,
  selectOverlayLayout,
  selectShowTaskIds,
  selectTodoCounts,
} from './state/selectors.js';
import { getRenderState } from './state/store.js';
import { formatOverlayTaskLine, formatStatusLabel } from './view/format.js';

const WIDGET_KEY = 'thoth-todos';
const MAX_WIDGET_LINES = 12;

export class TodoOverlay {
  private uiCtx: ExtensionUIContext | undefined;
  private widgetRegistered = false;
  private tui: TUI | undefined;
  private completedTaskIdsPendingHide = new Set<number>();
  private hiddenCompletedTaskIds = new Set<number>();
  private lastNextId: number | undefined;
  private collapsed = false;

  setUICtx(ctx: ExtensionUIContext): void {
    // Identity-compare so repeat session_start handlers are idempotent;
    // on identity change (/reload) invalidate so update() re-registers.
    if (ctx !== this.uiCtx) {
      this.uiCtx = ctx;
      this.widgetRegistered = false;
      this.tui = undefined;
    }
  }

  update(): void {
    if (!this.uiCtx) return;
    const snapshot = this.getSnapshot();
    const visible = this.selectOverlayTasks(snapshot);

    if (visible.length === 0) {
      if (this.widgetRegistered) {
        this.uiCtx.setWidget(WIDGET_KEY, undefined);
        this.widgetRegistered = false;
        this.tui = undefined;
      }
      return;
    }

    if (!this.widgetRegistered) {
      this.uiCtx.setWidget(
        WIDGET_KEY,
        (tui, factoryTheme) => {
          this.tui = tui;
          return {
            render: (width: number) =>
              this.renderWidget(this.uiCtx?.theme ?? factoryTheme, width),
            invalidate: () => {
              // No rendered strings are cached. Pi invalidates on theme changes;
              // the next render reads uiCtx.theme.
            },
          };
        },
        { placement: 'aboveEditor' },
      );
      this.widgetRegistered = true;
    } else {
      this.tui?.requestRender();
    }
  }

  resetCompletedDisplayState(): void {
    this.completedTaskIdsPendingHide.clear();
    this.hiddenCompletedTaskIds.clear();
    this.lastNextId = undefined;
  }

  hideCompletedTasksFromPreviousTurn(): void {
    if (this.completedTaskIdsPendingHide.size === 0) return;
    for (const taskId of this.completedTaskIdsPendingHide) {
      this.hiddenCompletedTaskIds.add(taskId);
    }
    this.completedTaskIdsPendingHide.clear();
    this.tui?.requestRender();
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    // Forced full redraw on the collapsed↔expanded height step, mirroring the
    // lane-dock's requestRender(shapeChanged); distinct from the non-forced
    // requestRender() refresh paths in update()/hideCompletedTasksFromPreviousTurn().
    this.tui?.requestRender(true);
  }

  isRegistered(): boolean {
    return this.widgetRegistered;
  }

  private getSnapshot() {
    const state = getRenderState();
    if (this.lastNextId !== undefined && state.nextId < this.lastNextId) {
      this.resetCompletedDisplayState();
    }
    this.lastNextId = state.nextId;
    const completedTaskIds = new Set(
      state.tasks
        .filter((task) => task.status === 'completed')
        .map((task) => task.id),
    );
    for (const taskId of this.completedTaskIdsPendingHide) {
      if (!completedTaskIds.has(taskId))
        this.completedTaskIdsPendingHide.delete(taskId);
    }
    for (const taskId of this.hiddenCompletedTaskIds) {
      if (!completedTaskIds.has(taskId))
        this.hiddenCompletedTaskIds.delete(taskId);
    }
    return { tasks: [...state.tasks], nextId: state.nextId };
  }

  private selectOverlayTasks(snapshot: ReturnType<TodoOverlay['getSnapshot']>) {
    return snapshot.tasks.filter(
      (task) =>
        task.status !== 'deleted' && !this.shouldHideCompletedTask(task),
    );
  }

  private shouldHideCompletedTask(
    task: ReturnType<TodoOverlay['getSnapshot']>['tasks'][number],
  ): boolean {
    return (
      task.status === 'completed' && this.hiddenCompletedTaskIds.has(task.id)
    );
  }

  private renderWidget(theme: Theme, width: number): string[] {
    const snapshot = this.getSnapshot();
    const overlayTasks = this.selectOverlayTasks(snapshot);
    if (overlayTasks.length === 0) return [];

    const overlayState = { tasks: overlayTasks, nextId: snapshot.nextId };
    const truncate = (line: string): string =>
      truncateToWidth(line, width, '…');
    const counts = selectTodoCounts(overlayState);
    const hasActive = selectHasActive(overlayState);
    const showIds = selectShowTaskIds(overlayState);

    const headingColor = hasActive ? 'accent' : 'dim';
    const headingIcon = hasActive ? '●' : '○';
    const headingText = `Todos (${counts.completed}/${counts.total})`;
    const heading = truncate(
      `${theme.fg(headingColor, headingIcon)} ${theme.fg(headingColor, headingText)}`,
    );

    // Collapsed tasks were not displayed, so they must not be queued for hiding
    // on the next turn. Keep this before completed-display tracking below.
    if (this.collapsed) {
      const hint = 'ctrl+shift+t to expand';
      return this.withTrailingSpacer([
        heading,
        truncate(`${theme.fg('dim', '└─')} ${theme.fg('dim', hint)}`),
      ]);
    }

    const lines: string[] = [heading];
    // Budget for content rows (heading + tasks/summary). The rendered widget is
    // one line taller — withTrailingSpacer() appends a blank row below the panel.
    // Pi's global tool-output expansion mode is read on every render so its
    // expand/collapse shortcut also expands this live widget. Optional chaining
    // preserves compatibility with hosts predating getToolsExpanded().
    const bodyBudget =
      this.uiCtx?.getToolsExpanded?.() === true
        ? overlayTasks.length
        : MAX_WIDGET_LINES - 1;
    const layout = selectOverlayLayout(overlayState, bodyBudget);
    for (const task of layout.visible) {
      lines.push(
        truncate(
          `${theme.fg('dim', '├─')} ${formatOverlayTaskLine(task, theme, showIds)}`,
        ),
      );
    }

    const newlyDisplayedCompletedTaskIds = overlayTasks
      .filter(
        (task) =>
          task.status === 'completed' &&
          !this.completedTaskIdsPendingHide.has(task.id) &&
          !this.hiddenCompletedTaskIds.has(task.id),
      )
      .map((task) => task.id);
    for (const taskId of newlyDisplayedCompletedTaskIds) {
      this.completedTaskIdsPendingHide.add(taskId);
    }

    if (layout.hiddenCompleted === 0 && layout.truncatedTail === 0) {
      const last = lines.length - 1;
      lines[last] = lines[last].replace('├─', '└─');
      return this.withTrailingSpacer(lines);
    }

    const totalHidden = layout.hiddenCompleted + layout.truncatedTail;
    const overflowParts: string[] = [];
    if (layout.hiddenCompleted > 0)
      overflowParts.push(
        `${layout.hiddenCompleted} ${formatStatusLabel('completed')}`,
      );
    if (layout.truncatedTail > 0)
      overflowParts.push(
        `${layout.truncatedTail} ${formatStatusLabel('pending')}`,
      );
    const more = 'more';
    const summary =
      overflowParts.length > 0
        ? `+${totalHidden} ${more} (${overflowParts.join(', ')})`
        : `+${totalHidden} ${more}`;
    lines.push(
      truncate(`${theme.fg('dim', '└─')} ${theme.fg('dim', summary)}`),
    );
    return this.withTrailingSpacer(lines);
  }

  /**
   * Append a trailing blank line so the overlay isn't flush against the
   * editor box. Pi's host adds a leading spacer above the widget but none
   * below, which leaves the last "└─" row (or the "+N more" summary) glued
   * to the input box. The empty string gives the "Todos" panel a little
   * breathing room.
   */
  private withTrailingSpacer(lines: string[]): string[] {
    if (lines.length === 0) return lines;
    lines.push('');
    return lines;
  }

  dispose(): void {
    if (this.uiCtx) this.uiCtx.setWidget(WIDGET_KEY, undefined);
    this.widgetRegistered = false;
    this.tui = undefined;
    this.uiCtx = undefined;
    this.collapsed = false;
    this.resetCompletedDisplayState();
  }
}
