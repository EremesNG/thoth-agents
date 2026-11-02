import type { Task, TaskStatus } from '../tool/types.js';
import type { TaskState } from './state.js';

/** Tasks excluding deleted tombstones — the canonical "what's visible". */
export function selectVisibleTasks(state: TaskState): readonly Task[] {
  return state.tasks.filter((t) => t.status !== 'deleted');
}

/**
 * Group visible tasks by status. Iteration order at the call site uses
 * (`completed`, `inProgress`, `pending`) to match the `/todos` header part
 * order pinned by `todo.command.test.ts`.
 */
export interface TasksByStatus {
  pending: readonly Task[];
  inProgress: readonly Task[];
  completed: readonly Task[];
}
export function selectTasksByStatus(state: TaskState): TasksByStatus {
  const visible = selectVisibleTasks(state);
  return {
    pending: visible.filter((t) => t.status === 'pending'),
    inProgress: visible.filter((t) => t.status === 'in_progress'),
    completed: visible.filter((t) => t.status === 'completed'),
  };
}

/** Total counts for the overlay heading (`Todos (n/m)`) and `/todos` header. */
export interface TodoCounts {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}
export function selectTodoCounts(state: TaskState): TodoCounts {
  const counts = selectTodoStatusCounts(state);
  return {
    total: counts.pending + counts.in_progress + counts.completed,
    pending: counts.pending,
    inProgress: counts.in_progress,
    completed: counts.completed,
  };
}

export interface TodoStatusCounts {
  in_progress: number;
  pending: number;
  completed: number;
}

function countTasks(tasks: readonly Task[]): TodoStatusCounts {
  const counts: TodoStatusCounts = { in_progress: 0, pending: 0, completed: 0 };
  for (const task of tasks) {
    if (task.status !== 'deleted') counts[task.status]++;
  }
  return counts;
}

/** Heading counts include archived tasks, but never deleted tombstones. */
export function selectTodoStatusCounts(state: TaskState): TodoStatusCounts {
  return countTasks(state.tasks);
}

/**
 * Whether any visible task carries a `blockedBy` reference. The overlay uses
 * this to gate the `#id` prefix on per-task rows — without at least one
 * `⛓ #N` suffix, the per-row id has no anchor.
 */
export function selectShowTaskIds(state: TaskState): boolean {
  return selectVisibleTasks(state).some(
    (t) => t.blockedBy && t.blockedBy.length > 0,
  );
}

/**
 * Resolve a task's subject by id from the live state for renderCall's
 * accent label. `undefined` when the id is unknown — caller falls back to
 * `#id` plain rendering.
 */
export function selectTaskSubjectById(
  state: TaskState,
  id: number,
): string | undefined {
  return state.tasks.find((t) => t.id === id)?.subject;
}

export interface ResolvedTaskGroup {
  key: string;
  label: string;
  displaySubject: string;
}

/** The first token before the first literal `: `, not an arbitrary colon. */
function inferredGroup(subject: string): string | undefined {
  const delimiter = subject.indexOf(': ');
  if (delimiter < 0) return undefined;
  return subject.slice(0, delimiter).trim().split(/\s+/)[0] || undefined;
}

function displaySubject(subject: string, label: string): string {
  const text = subject.trimStart();
  if (!text.startsWith(label)) return subject;
  const rest = text.slice(label.length);
  if (rest.startsWith(': ')) return rest.slice(2).trimStart();
  if (/^\s/.test(rest)) return rest.trimStart();
  return subject;
}

/**
 * Resolve groups across all non-deleted tasks, including archived history.
 * Explicit labels win; a fallback label needs at least two resolved members.
 * Equal explicit/inferred labels share a group. Ungrouped ids are absent.
 */
export function selectTaskGroups(
  state: TaskState,
): ReadonlyMap<number, ResolvedTaskGroup> {
  const candidates = selectVisibleTasks(state).map((task) => ({
    task,
    explicit: task.group?.trim(),
    label: task.group?.trim() || inferredGroup(task.subject),
  }));
  const counts = new Map<string, number>();
  for (const { label } of candidates) {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const groups = new Map<number, ResolvedTaskGroup>();
  for (const { task, explicit, label } of candidates) {
    if (!label || (!explicit && (counts.get(label) ?? 0) < 2)) continue;
    groups.set(task.id, {
      key: label,
      label,
      displaySubject: displaySubject(task.subject, label),
    });
  }
  return groups;
}

export interface CompactTodoTask {
  kind: 'task';
  task: Task;
  displaySubject: string;
  blocked: boolean;
  counts: TodoStatusCounts;
  fullyCompleted: boolean;
}

export interface CompactTodoGroup {
  kind: 'group';
  key: string;
  label: string;
  members: readonly CompactTodoTask[];
  counts: TodoStatusCounts;
  fullyCompleted: boolean;
}

export type CompactTodoEntry = CompactTodoTask | CompactTodoGroup;

function taskRank(entry: CompactTodoTask): number {
  if (entry.task.status === 'in_progress') return 0;
  if (entry.task.status === 'pending') return entry.blocked ? 2 : 1;
  return 3;
}

function compareTasks(a: CompactTodoTask, b: CompactTodoTask): number {
  return (
    taskRank(a) - taskRank(b) ||
    (a.task.status === 'completed'
      ? (b.task.completedAt ?? -Infinity) - (a.task.completedAt ?? -Infinity)
      : 0) ||
    a.task.id - b.task.id
  );
}

/**
 * Unbounded compact layout; renderers own height/retention. Archived tasks are
 * excluded before counts/collapse. Groups stay contiguous and rank by their
 * most active member. Completed entries use their newest completion, with
 * missing legacy timestamps oldest; other ties use the lowest represented id.
 */
export function selectCompactLayout(
  state: TaskState,
): readonly CompactTodoEntry[] {
  const groups = selectTaskGroups(state);
  const unresolved = new Set(
    state.tasks
      .filter(
        (task) => task.status === 'pending' || task.status === 'in_progress',
      )
      .map((task) => task.id),
  );
  const entries: CompactTodoEntry[] = [];
  const grouped = new Map<string, CompactTodoGroup>();
  for (const task of selectVisibleTasks(state)) {
    if (task.archivedAt !== undefined) continue;
    const group = groups.get(task.id);
    const member: CompactTodoTask = {
      kind: 'task',
      task,
      displaySubject: group?.displaySubject ?? task.subject,
      blocked:
        task.status === 'pending' &&
        !!task.blockedBy?.some((id) => unresolved.has(id)),
      counts: countTasks([task]),
      fullyCompleted: task.status === 'completed',
    };
    if (!group) {
      entries.push(member);
      continue;
    }
    let entry = grouped.get(group.key);
    if (!entry) {
      entry = {
        kind: 'group',
        key: group.key,
        label: group.label,
        members: [],
        counts: countTasks([]),
        fullyCompleted: false,
      };
      grouped.set(group.key, entry);
      entries.push(entry);
    }
    entry.members = [...entry.members, member];
  }
  const ordered = entries.map((entry) => {
    const members =
      entry.kind === 'group' ? [...entry.members].sort(compareTasks) : [entry];
    if (entry.kind === 'group') {
      entry.members = members;
      entry.counts = countTasks(members.map((member) => member.task));
      entry.fullyCompleted = entry.counts.completed === members.length;
    }
    return {
      entry,
      rank: taskRank(members[0]),
      lowestId: Math.min(...members.map((member) => member.task.id)),
      completedAt: Math.max(
        ...members.map((member) => member.task.completedAt ?? -Infinity),
      ),
    };
  });
  ordered.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.rank === 3 ? b.completedAt - a.completedAt : 0) ||
      a.lowestId - b.lowestId,
  );
  return ordered.map(({ entry }) => entry);
}

/**
 * Helper: whether any visible task is `pending` or `in_progress`. The overlay
 * uses this to pick the heading icon (`accent`+`●` vs `dim`+`○`).
 */
export function selectHasActive(state: TaskState): boolean {
  return selectVisibleTasks(state).some(
    (t) => t.status === 'in_progress' || t.status === 'pending',
  );
}

export const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'pending',
  'in_progress',
]);
