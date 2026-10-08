import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  WORK_PANEL_VERSION,
  type WorkPanelDetail,
  type WorkPanelProvider,
  type WorkPanelRow,
  type WorkPanelSegment,
} from '@thoth-agents/pi-core';
import { selectTodoCounts, selectVisibleTasks } from './state/selectors.js';
import {
  getActiveRenderSession,
  getRenderState,
  onRenderStateChanged,
} from './state/store.js';
import { showTodoPanel } from './todo-panel.js';
import { currentEpoch, isCompletedListHidden } from './todo-visibility.js';
import { sanitizeTerminalText } from './tool/sanitize.js';
import { taskGlyph } from './view/task-glyphs.js';

export interface TodoWorkPanelOptions {
  /** Session whose prompt epoch hides a fully completed list. */
  ctx?: ExtensionContext;
  /** Theme strikethrough for completed rows. */
  strikethrough?: (text: string) => string;
}

/** The provider reads only the foreground session's local store, never the bus. */
export function createTodoWorkPanelProvider(
  options: TodoWorkPanelOptions = {},
) {
  let epoch = 0;
  const hidden = () => {
    if (options.ctx) epoch = currentEpoch(options.ctx, epoch);
    return isCompletedListHidden(
      getActiveRenderSession(),
      getRenderState(),
      epoch,
    );
  };
  const strike = (text: string) => {
    try {
      return options.strikethrough?.(text) ?? text;
    } catch {
      return text;
    }
  };
  return {
    version: WORK_PANEL_VERSION,
    id: 'todos',
    label: 'Todos',
    priority: 20,
    selectableHeading: true,
    selectableSummary: true,
    droppedSummary: (count: number) => `+${count} done`,
    visibleCount() {
      return hidden() ? 0 : selectVisibleTasks(getRenderState()).length;
    },
    summary() {
      const { completed, total } = selectTodoCounts(getRenderState());
      return { completed, total };
    },
    listRows(_now: number): WorkPanelRow[] {
      if (hidden()) return [];
      return selectVisibleTasks(getRenderState()).map((task): WorkPanelRow => {
        const subject = sanitizeTerminalText(task.subject);
        const base = {
          id: String(task.id),
          status: task.status,
          statusGlyph: taskGlyph(task.status),
        };
        if (task.status === 'completed')
          return {
            ...base,
            primary: subject,
            dropFirst: true,
            statusGlyphRole: 'success',
            segments: [{ text: strike(subject), role: 'dim' }],
          };
        const activeForm =
          task.status === 'in_progress' && task.activeForm
            ? ` (${sanitizeTerminalText(task.activeForm)})`
            : '';
        const segments: WorkPanelSegment[] = [
          { text: subject, role: 'primary' },
        ];
        if (activeForm) segments.push({ text: activeForm, role: 'secondary' });
        return {
          ...base,
          primary: subject + activeForm,
          statusGlyphRole:
            task.status === 'in_progress' ? 'accent' : 'secondary',
          segments,
        };
      });
    },
    // Task details live in the panel opened by `open`; there is no generic card.
    detail(_id: string, _now: number): WorkPanelDetail | null {
      return null;
    },
    open: (id: string, ctx: ExtensionContext) => showTodoPanel(ctx, id),
    openHistory: (ctx: ExtensionContext) => showTodoPanel(ctx),
    armCloseLabel: (_row: WorkPanelRow) => '',
    close(_id: string) {},
    onVisibleChanged(notify: () => void) {
      // Record a completed list's epoch at commit time, before a prompt can advance it.
      return onRenderStateChanged(() => {
        hidden();
        notify();
      });
    },
  } satisfies WorkPanelProvider;
}
