import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { getRenderKit, resolveIcon } from '@thoth-agents/pi-core';
import {
  createHistoryPanelKeyMatcher,
  HistoryPanel,
  type HistoryPanelLine,
  type HistoryPanelOptions,
} from '@thoth-agents/pi-core/history-panel';
import { selectTodoCounts } from './state/selectors.js';
import { listCurrentTasks } from './todo-visibility.js';
import { sanitizeTerminalText } from './tool/sanitize.js';
import type { Task, TaskStatus } from './tool/types.js';
import { taskGlyph } from './view/task-glyphs.js';

type PanelStatus = Exclude<TaskStatus, 'deleted'>;
type PanelTheme = NonNullable<HistoryPanelOptions['theme']>;

const GROUPS: readonly { status: PanelStatus; label: string }[] = [
  { status: 'in_progress', label: 'In progress' },
  { status: 'pending', label: 'Not started' },
  { status: 'completed', label: 'Completed' },
];

/** In progress, not started, then completed; task order is kept inside each group. */
export function groupTasks(tasks: readonly Task[]): Task[] {
  return GROUPS.flatMap(({ status }) =>
    tasks.filter((t) => t.status === status),
  );
}

export function describeTaskCounts(tasks: readonly Task[]): string {
  const counts = selectTodoCounts({ tasks: [...tasks], nextId: 0 });
  const parts = [`${counts.completed}/${counts.total} completed`];
  if (counts.inProgress) parts.push(`${counts.inProgress} in progress`);
  parts.push(`${counts.pending} not started`);
  return parts.join(` ${resolveIcon('separator')} `);
}

/** Overlay with the full current task list; the selected task's description on the right. */
export class TodoPanel extends HistoryPanel<Task> {
  constructor(
    tasks: () => readonly Task[],
    options: Omit<HistoryPanelOptions, 'title'>,
  ) {
    const theme = options.theme;
    const fg = (role: Parameters<PanelTheme['fg']>[0], text: string) => {
      if (!theme) return text;
      return getRenderKit()?.fg(theme, role, text) ?? theme.fg(role, text);
    };
    const strike = (text: string) => theme?.strikethrough?.(text) ?? text;
    const ordered = () => groupTasks(tasks());
    const subject = (task: Task) => sanitizeTerminalText(task.subject);
    const marker = (selected: boolean) =>
      selected ? resolveIcon('selection') : ' ';
    const toned = (task: Task, text: string) =>
      task.status === 'completed' ? fg('dim', strike(text)) : text;
    const heading = (label: string, count: string) =>
      `${fg('accent', resolveIcon('boxHorizontal').repeat(2))} ${fg('toolTitle', label)} ${fg('dim', count)}`;

    super(
      {
        items: ordered,
        id: (task) => String(task.id),
        // The shell tones the whole label by selection; only strikethrough is added.
        renderItemLabel: (task, context) =>
          `${marker(context.selected)} ${taskGlyph(task.status)} ${task.status === 'completed' ? strike(subject(task)) : subject(task)}`,
        renderHeader: () => {
          const summary = fg('success', describeTaskCounts(ordered()));
          return { wideRows: [summary], narrowRows: [summary] };
        },
        renderContent: (task, width) => {
          const all = ordered();
          const label = GROUPS.find((g) => g.status === task.status)?.label;
          const lines: (string | HistoryPanelLine)[] = [
            `${taskGlyph(task.status)} ${toned(task, theme?.bold?.(subject(task)) ?? subject(task))}`,
            fg(
              'dim',
              [
                label,
                `#${task.id}`,
                task.blockedBy?.length
                  ? `blocked by ${task.blockedBy.map((id) => `#${id}`).join(',')}`
                  : undefined,
              ]
                .filter(Boolean)
                .join(` ${resolveIcon('separator')} `),
            ),
          ];
          if (task.status === 'in_progress' && task.activeForm)
            lines.push(fg('accent', sanitizeTerminalText(task.activeForm)));
          lines.push('');
          const bar = fg('dim', resolveIcon('separatorHeavy'));
          const description = (task.description ?? '')
            .split(/\r?\n/)
            .map(sanitizeTerminalText)
            .join('\n')
            .trim();
          for (const line of description
            ? description.split('\n')
            : [undefined]) {
            const wrapped =
              line === undefined
                ? [fg('dim', 'No description.')]
                : wrapTextWithAnsi(line, Math.max(1, width - 2));
            for (const part of wrapped) lines.push(`${bar} ${part}`);
          }
          for (const group of GROUPS) {
            const members = all.filter((t) => t.status === group.status);
            if (!members.length) continue;
            lines.push('', heading(group.label, String(members.length)));
            for (const member of members) {
              const selected = member.id === task.id;
              const text = `${marker(selected)} ${taskGlyph(member.status)} ${fg('dim', `#${member.id}`)} ${toned(member, subject(member))}`;
              lines.push({
                text: selected ? fg('accent', text) : text,
                itemId: String(member.id),
              });
            }
          }
          return lines;
        },
      },
      {
        ...options,
        title: 'Todos',
        listLabel: 'tasks',
        contentScroll: 'top',
        emptyText: 'No active task list.',
        titleIcon: () => resolveIcon('taskInProgress'),
      },
    );
  }
}

/** Custom overlay UI exists only in the interactive TUI. */
export function canOpenTodoPanel(ctx: ExtensionContext): boolean {
  return ctx.hasUI && ctx.mode === 'tui' && typeof ctx.ui.custom === 'function';
}

export async function showTodoPanel(
  ctx: ExtensionContext,
  selectedTaskId?: string,
): Promise<void> {
  if (!canOpenTodoPanel(ctx)) return;
  let panel: TodoPanel | undefined;
  let releaseMouse: (() => void) | undefined;
  try {
    await ctx.ui.custom<void>(
      (tui, theme, keybindings, done) => {
        // Fullscreen Pi owns mouse tracking; never disable its terminal mode.
        if (tui.mode !== 'fullscreen') {
          tui.terminal.write('\x1b[?1000h\x1b[?1006h');
          releaseMouse = () => tui.terminal.write('\x1b[?1006l\x1b[?1000l');
        }
        panel = new TodoPanel(() => listCurrentTasks(ctx), {
          theme,
          onClose: done,
          initialSelectedId: selectedTaskId,
          matchesKey: createHistoryPanelKeyMatcher({
            matches: (data, key) =>
              keybindings.matches(
                data,
                key as Parameters<typeof keybindings.matches>[1],
              ),
          }),
          maxLines: () => Math.max(12, tui.terminal.rows ?? 42),
          requestRender: () => tui.requestRender(),
        });
        return panel;
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: 'top-left',
          width: '100%',
          maxHeight: '100%',
          margin: 0,
        },
      },
    );
  } finally {
    panel?.dispose();
    releaseMouse?.();
  }
}
