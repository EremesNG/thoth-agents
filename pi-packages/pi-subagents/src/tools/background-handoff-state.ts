import { isWorkPanelRootEditorInputActive } from '@thoth-agents/pi-core';
import { readSubagentsConfig } from '../config.js';
import type { SubagentManager } from '../manager.js';
import type { SubagentTask } from '../types.js';

type BackgroundHandoffEntry = {
  createdAt: number;
  manager: SubagentManager;
  getTaskIds: () => string[];
  handoff: (taskId?: string) => SubagentTask[];
  hasActiveTask: () => boolean;
  toolReturned: Promise<unknown>;
};

export const QUESTION_HANDOFF_GUIDANCE =
  'A question is pending. Answer with `subagent_reply` using the task_id and request_id from the question notification.';

export function withBackgroundHandoffBarrier<Args extends unknown[], Result>(
  execute: (toolReturned: Promise<void>, ...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args) => {
    let markToolReturned!: () => void;
    const toolReturned = new Promise<void>((resolve) => {
      markToolReturned = resolve;
    });
    const result = execute(toolReturned, ...args);
    // Await the returned tool promise, not just resolution of its handoff race.
    void result.then(markToolReturned, markToolReturned);
    return result;
  };
}

const activeClaudeBackgroundHandoffs = new Set<BackgroundHandoffEntry>();
let backgroundHandoffSequence = 0;

function sendTasksToBackground(
  ctx: any,
  manager: SubagentManager,
  getTaskIds: () => string[],
  onBackground: (tasks: SubagentTask[]) => void,
): SubagentTask[] {
  const backgrounded = manager.sendToBackground(getTaskIds());
  if (!backgrounded.length) return [];
  ctx?.ui?.notify?.(
    backgrounded.length === 1
      ? `Sent subagent to background: ${backgrounded[0]!.id}`
      : `Sent ${backgrounded.length} subagent task(s) to background.`,
    'info',
  );
  onBackground(backgrounded);
  return backgrounded;
}

export function triggerClaudeBackgroundHandoff(): boolean {
  const candidates = [...activeClaudeBackgroundHandoffs]
    .filter((entry) => entry.hasActiveTask())
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const entry of candidates) {
    if (entry.handoff().length) return true;
  }
  return false;
}

export async function triggerTaskBackgroundHandoff(
  manager: SubagentManager,
  taskId: string,
): Promise<boolean> {
  for (const entry of activeClaudeBackgroundHandoffs) {
    if (entry.manager !== manager || !entry.getTaskIds().includes(taskId))
      continue;
    const backgrounded = entry.handoff(taskId).length > 0;
    // Concurrent questions share the barrier even after the first handoff.
    await entry.toolReturned;
    return backgrounded;
  }
  return false;
}

function ctrlShortcutToTerminalInput(shortcut: string): string | undefined {
  const match = shortcut
    .trim()
    .toLowerCase()
    .match(/^ctrl\+([a-z])$/);
  if (!match) return undefined;
  const code = match[1]!.charCodeAt(0) - 96;
  return code >= 1 && code <= 26 ? String.fromCharCode(code) : undefined;
}

export function installBackgroundHandoffShortcut(
  ctx: any,
  manager: SubagentManager,
  getTaskIds: () => string[],
  onBackground: (tasks: SubagentTask[]) => void,
  toolReturned: Promise<unknown>,
): () => void {
  const shortcut =
    readSubagentsConfig(ctx?.cwd ?? process.cwd())
      .background_handoff_shortcut ?? 'ctrl+h';
  const terminalInput = ctrlShortcutToTerminalInput(shortcut);
  const handoff = (taskId?: string) =>
    sendTasksToBackground(
      ctx,
      manager,
      taskId ? () => [taskId] : getTaskIds,
      onBackground,
    );
  const entry: BackgroundHandoffEntry = {
    createdAt: ++backgroundHandoffSequence,
    manager,
    getTaskIds,
    toolReturned,
    handoff,
    hasActiveTask: () =>
      getTaskIds().some((id) => {
        const task = manager.getTask(id);
        return Boolean(
          task &&
            task.mode !== 'background' &&
            (task.status === 'queued' || task.status === 'running'),
        );
      }),
  };
  activeClaudeBackgroundHandoffs.add(entry);
  const unsubscribeQuestion = manager.onQuestion(async (task) => {
    if (!getTaskIds().includes(task.id)) return;
    await triggerTaskBackgroundHandoff(manager, task.id);
  });
  const unsubscribe = terminalInput
    ? ctx?.ui?.onTerminalInput?.((data: string) => {
        if (
          data !== terminalInput ||
          isWorkPanelRootEditorInputActive(ctx) === false
        )
          return undefined;
        return handoff().length ? { consume: true } : undefined;
      })
    : undefined;
  return () => {
    // Tool cleanup runs before its returned promise settles; keep questions gated.
    void toolReturned.then(() => {
      activeClaudeBackgroundHandoffs.delete(entry);
      unsubscribeQuestion();
    });
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
