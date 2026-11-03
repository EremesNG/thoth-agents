import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  WORK_PANEL_VERSION,
  type WorkPanelDetail,
  type WorkPanelProvider,
  type WorkPanelRow,
  type WorkPanelSegment,
} from '@thoth-agents/pi-core';
import {
  type CompactTodoTask,
  selectCompactLayout,
  selectTodoStatusCounts,
} from './state/selectors.js';
import { getRenderState, onRenderStateChanged } from './state/store.js';
import { showTodoPanel } from './todo-panel.js';
import { sanitizeTerminalText } from './tool/sanitize.js';

const representedCounts = (counts: CompactTodoTask['counts']) => ({
  running: counts.in_progress,
  queued: counts.pending,
  completed: counts.completed,
});

function taskRow(
  entry: CompactTodoTask,
  group?: { key: string; label: string },
): WorkPanelRow {
  const { task, blocked } = entry;
  const subject = sanitizeTerminalText(entry.displaySubject);
  const activeForm =
    task.status === 'in_progress' && task.activeForm
      ? ` (${sanitizeTerminalText(task.activeForm)})`
      : '';
  const blockedText = blocked
    ? ` ⊘ ${task.blockedBy?.map((id) => `#${id}`).join(', ')}`
    : '';
  const subjectRole: WorkPanelSegment['role'] =
    task.status === 'completed'
      ? 'completed'
      : task.status === 'in_progress'
        ? 'accent'
        : blocked
          ? 'dim'
          : 'muted';
  const segments: WorkPanelSegment[] = [
    { text: subject + blockedText, role: subjectRole },
  ];
  if (activeForm) segments.push({ text: activeForm, role: 'secondary' });
  return {
    id: String(task.id),
    primary: subject + activeForm + blockedText,
    status: task.status,
    statusGlyph: task.status === 'in_progress' ? 'taskInProgress' : task.status,
    statusGlyphRole: subjectRole === 'completed' ? 'success' : subjectRole,
    dropFirst: task.status === 'completed' ? true : undefined,
    compact: {
      group,
      depth: group ? 1 : 0,
      taskId: task.id,
      counts: representedCounts(entry.counts),
    },
    segments,
  };
}

function completedRow(
  id: string,
  primary: string,
  completed: number,
  compact: Omit<NonNullable<WorkPanelRow['compact']>, 'counts'> = { depth: 0 },
): WorkPanelRow {
  return {
    id,
    primary,
    status: 'completed',
    statusGlyph: 'completed',
    statusGlyphRole: 'success',
    dropFirst: true,
    segments: [{ text: primary, role: 'completed' }],
    compact: {
      ...compact,
      counts: { running: 0, queued: 0, completed },
    },
  };
}

/** The provider reads only the foreground session's local store, never the bus. */
export function createTodoWorkPanelProvider() {
  return {
    version: WORK_PANEL_VERSION,
    id: 'todos',
    label: 'Todos',
    priority: 20,
    selectableHeading: true,
    selectableSummary: true,
    droppedSummary: (count: number) => `+${count} done`,
    visibleCount() {
      return selectCompactLayout(getRenderState()).reduce(
        (sum, entry) =>
          sum +
          entry.counts.in_progress +
          entry.counts.pending +
          entry.counts.completed,
        0,
      );
    },
    summary() {
      const {
        in_progress: running,
        pending: queued,
        completed,
      } = selectTodoStatusCounts(getRenderState());
      return {
        running,
        queued,
        completed,
        total: running + queued + completed,
      };
    },
    listRows(_now: number): WorkPanelRow[] {
      return selectCompactLayout(getRenderState()).flatMap(
        (entry): WorkPanelRow[] => {
          if (entry.kind === 'task') return [taskRow(entry)];
          if (entry.kind === 'completed-summary')
            return [
              completedRow(
                'completed-summary',
                `+${entry.counts.completed} done`,
                entry.counts.completed,
                { depth: 0, completedSummary: true },
              ),
            ];
          const group = {
            key: entry.key,
            label: sanitizeTerminalText(entry.label),
          };
          if (entry.fullyCompleted)
            return [
              completedRow(
                `group:${entry.key}`,
                `${group.label} (${entry.counts.completed})`,
                entry.counts.completed,
                { group, depth: 0 },
              ),
            ];
          return [
            {
              id: `group:${entry.key}`,
              primary: group.label,
              segments: [{ text: group.label, role: 'primary' }],
              compact: {
                group,
                heading: true,
                depth: 0,
                counts: { running: 0, queued: 0, completed: 0 },
              },
            },
            ...entry.members.map((member) => taskRow(member, group)),
            ...(entry.counts.completed
              ? [
                  completedRow(
                    `group-done:${entry.key}`,
                    `${entry.counts.completed} done`,
                    entry.counts.completed,
                    { group, depth: 1 },
                  ),
                ]
              : []),
          ];
        },
      );
    },
    detail(_id: string, _now: number): WorkPanelDetail | null {
      return null;
    },
    open: (id: string, ctx: ExtensionContext) => showTodoPanel(ctx, id),
    openHistory: (ctx: ExtensionContext) => showTodoPanel(ctx),
    armCloseLabel: (_row: WorkPanelRow) => '',
    close(_id: string) {},
    onVisibleChanged(notify: () => void) {
      return onRenderStateChanged(notify);
    },
  } satisfies WorkPanelProvider;
}
