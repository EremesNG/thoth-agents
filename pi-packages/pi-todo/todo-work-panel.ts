import {
  WORK_PANEL_VERSION,
  type WorkPanelDetail,
  type WorkPanelProvider,
  type WorkPanelRow,
} from '@thoth-agents/pi-core';
import { selectTasksByStatus, selectTodoCounts } from './state/selectors.js';
import { getRenderState, onRenderStateChanged } from './state/store.js';
import { sanitizeTerminalText } from './tool/sanitize.js';

/** The provider reads only the foreground session's local store, never the bus. */
export function createTodoWorkPanelProvider() {
  return {
    version: WORK_PANEL_VERSION,
    id: 'todos',
    label: 'Todos',
    priority: 20,
    visibleCount() {
      const { pending, inProgress } = selectTodoCounts(getRenderState());
      return pending + inProgress;
    },
    summary() {
      const { completed, total } = selectTodoCounts(getRenderState());
      return { completed, total };
    },
    listRows(_now: number): WorkPanelRow[] {
      const groups = selectTasksByStatus(getRenderState());
      const open = [...groups.inProgress, ...groups.pending];
      const rows: WorkPanelRow[] = open.map((task) => ({
        id: String(task.id),
        primary:
          sanitizeTerminalText(task.subject) +
          (task.status === 'in_progress' && task.activeForm
            ? ` (${sanitizeTerminalText(task.activeForm)})`
            : ''),
        status: task.status,
      }));
      const completed = groups.completed.length;
      if (completed)
        rows.push({
          id: 'done',
          primary: `+${completed} done`,
          status: 'completed',
        });
      return rows;
    },
    detail(id: string, _now: number): WorkPanelDetail | null {
      const task = getRenderState().tasks.find(
        (task) => String(task.id) === id && task.status !== 'deleted',
      );
      if (!task) return null;
      return {
        id,
        title: sanitizeTerminalText(task.subject),
        status: task.status,
        metadata: [],
        evidence: {
          label: 'Description',
          text: (task.description || '(No description)')
            .split(/\r?\n/)
            .map(sanitizeTerminalText)
            .join('\n'),
        },
      };
    },
    armCloseLabel: (_row: WorkPanelRow) => '',
    close(_id: string) {},
    onVisibleChanged: onRenderStateChanged,
  } satisfies WorkPanelProvider;
}
