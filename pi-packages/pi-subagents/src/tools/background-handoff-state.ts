import { isWorkPanelRootEditorInputActive } from '@thoth-agents/pi-core';
import { readSubagentsConfig } from '../config.js';
import type { SubagentManager } from '../manager.js';
import type { SubagentTask } from '../types.js';

type BackgroundHandoffEntry = {
  createdAt: number;
  manager: SubagentManager;
  parentSessionId: string | undefined;
  getTaskIds: () => string[];
  handoff: () => SubagentTask[];
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
type QuestionHandoff = {
  manager: SubagentManager;
  parentSessionId: string | undefined;
  taskId: string;
  entries: Set<BackgroundHandoffEntry>;
  backgrounded: boolean;
};
const pendingQuestionHandoffs = new Set<QuestionHandoff>();
let backgroundHandoffSequence = 0;

// Keep the same identity precedence and validation as the manager.
function parentSessionIdFromContext(ctx: any): string | undefined {
  const direct = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const file = ctx?.sessionManager?.getSessionFile?.();
  return typeof file === 'string' && file.length > 0 ? file : undefined;
}

function belongsToQuestionSession(
  entry: BackgroundHandoffEntry,
  question: QuestionHandoff,
): boolean {
  return (
    entry.manager === question.manager &&
    (question.parentSessionId
      ? entry.parentSessionId === question.parentSessionId
      : entry.getTaskIds().includes(question.taskId))
  );
}

function joinQuestionHandoff(
  entry: BackgroundHandoffEntry,
  question: QuestionHandoff,
): void {
  question.entries.add(entry);
  if (entry.handoff().length) question.backgrounded = true;
}

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
  const question: QuestionHandoff = {
    manager,
    parentSessionId: manager.getTask(taskId)?.session_id,
    taskId,
    entries: new Set(),
    backgrounded: false,
  };
  pendingQuestionHandoffs.add(question);
  try {
    // Latch every matching call before awaiting any return, even if a
    // continuation has not yet published tasks while awaiting runner cleanup.
    for (const entry of activeClaudeBackgroundHandoffs) {
      if (belongsToQuestionSession(entry, question))
        joinQuestionHandoff(entry, question);
    }
    let pendingCount: number;
    do {
      pendingCount = question.entries.size;
      await Promise.allSettled(
        [...question.entries].map((entry) => entry.toolReturned),
      );
      // Calls registered while awaiting the barrier join this same handoff.
    } while (question.entries.size !== pendingCount);
    return question.backgrounded;
  } finally {
    pendingQuestionHandoffs.delete(question);
  }
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
  const parentSessionId = parentSessionIdFromContext(ctx);
  let backgroundRequested = false;
  const handoff = () => {
    backgroundRequested = true;
    return sendTasksToBackground(ctx, manager, getTaskIds, onBackground);
  };
  // Continuations may publish their tasks only after prior runner cleanup.
  const unsubscribeTaskUpdate = manager.onTaskUpdate(() => {
    if (backgroundRequested) handoff();
  });
  const entry: BackgroundHandoffEntry = {
    createdAt: ++backgroundHandoffSequence,
    manager,
    parentSessionId,
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
  for (const question of pendingQuestionHandoffs) {
    if (belongsToQuestionSession(entry, question))
      joinQuestionHandoff(entry, question);
  }
  const unsubscribeQuestion = manager.onQuestion(async (task) => {
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
    const cleanup = () => {
      activeClaudeBackgroundHandoffs.delete(entry);
      unsubscribeQuestion();
      unsubscribeTaskUpdate();
    };
    void toolReturned.then(cleanup, cleanup);
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
