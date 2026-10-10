/**
 * todo tool + /todos command — thin registration shell.
 *
 * Tool/command identity, schema, types, reducer, store, replay, response
 * envelope, selectors, and view formatters live in the layered modules under
 * `tool/`, `state/`, and `view/`. Public re-exports preserve upstream import
 * paths for consumers and ported tests.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolveIcon } from '@thoth-agents/pi-core';
import { publishTodoState } from './state/publish.js';
import {
  selectTasksByStatus,
  selectTodoCounts,
  selectVisibleTasks,
} from './state/selectors.js';
import { applyTaskMutation } from './state/state-reducer.js';
import { commitState, getState, sid } from './state/store.js';
import { canOpenTodoPanel, showTodoPanel } from './todo-panel.js';
import { currentEpoch, isCompletedListHidden } from './todo-visibility.js';
import { buildToolResult } from './tool/response-envelope.js';
import {
  COMMAND_NAME,
  ERR_REQUIRES_INTERACTIVE,
  MSG_NO_TODOS,
  type TaskMutationParams,
  TOOL_LABEL,
  TOOL_NAME,
  TodoParamsSchema,
} from './tool/types.js';
import {
  formatCommandTaskLine,
  formatStatusLabel,
  renderTodoCall,
  renderTodoResult,
} from './view/format.js';
import { taskGlyph } from './view/task-glyphs.js';

// Fixed upstream English section headings.
const SECTION_PENDING = '── Pending ──';
const SECTION_IN_PROGRESS = '── In Progress ──';
const SECTION_COMPLETED = '── Completed ──';

// ---------------------------------------------------------------------------
// Public re-exports — existing consumers (overlay, tests, index.ts) keep
// importing from `./todo.js`. New code may opt into deeper imports.
// ---------------------------------------------------------------------------

export { isTransitionValid } from './state/invariants.js';
export { applyTaskMutation } from './state/state-reducer.js';
export {
  __resetState,
  getNextId,
  getTodos,
  setActiveRenderSession,
  sid,
} from './state/store.js';
export { deriveBlocks, detectCycle } from './state/task-graph.js';
export type {
  Task,
  TaskAction,
  TaskDetails,
  TaskStatus,
} from './tool/types.js';
export { TOOL_NAME } from './tool/types.js';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const DEFAULT_PROMPT_SNIPPET =
  'Manage a task list to track multi-step progress';
export const DEFAULT_PROMPT_GUIDELINES: string[] = [
  'Use `todo` for complex work with 3+ steps, when the user gives you a list of tasks, or immediately after receiving new instructions to capture requirements. Skip it for single trivial tasks and purely conversational requests.',
  'When starting a task from the todo list, mark it in_progress BEFORE beginning work. Mark it completed IMMEDIATELY when done — never batch completions. Exactly one task in_progress at a time.',
  'Never mark a task completed if tests are failing, the implementation is partial, or you hit unresolved errors — keep it in_progress and create a new task for the blocker instead.',
  "Task status is a 4-state machine: pending → in_progress → completed, plus deleted as a tombstone. Pass activeForm (present-continuous label, e.g. 'researching existing tool') when marking in_progress.",
  'To change a task\'s status, call update with the task id and the target status, e.g. {"action":"update","id":3,"status":"completed"} or {"action":"update","id":3,"status":"in_progress","activeForm":"writing tests"}. status is the field that changes the task; an update without a mutable field (status or another) is rejected.',
  'Use blockedBy to express dependencies (A is blocked by B). On create, pass blockedBy as the initial set. On update, use addBlockedBy / removeBlockedBy (additive merge — do not resend the full array). Cycles are rejected.',
  'list hides tombstoned (deleted) tasks by default; pass includeDeleted:true to see them. Pass status to filter by a single status.',
  "Subject must be short and imperative (e.g. 'Research existing tool'); description is for long-form detail. activeForm is a present-continuous label shown while in_progress.",
];

export function registerTodoTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description:
      'Manage a task list for tracking multi-step progress. Actions: create (new task), update (change status/fields/dependencies), list (all tasks, optionally filtered by status), get (single task details), delete (tombstone), clear (reset all). Status: pending → in_progress → completed, plus deleted tombstone. Use this to plan and track multi-step work like research, design, and implementation.',
    promptSnippet: DEFAULT_PROMPT_SNIPPET,
    promptGuidelines: DEFAULT_PROMPT_GUIDELINES,
    parameters: TodoParamsSchema,
    renderShell: 'self',

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const id = sid(ctx);
      const result = applyTaskMutation(
        getState(id),
        params.action,
        params as TaskMutationParams,
      );
      commitState(id, result.state);
      if (
        result.op.kind === 'create' ||
        result.op.kind === 'delete' ||
        result.op.kind === 'clear' ||
        (result.op.kind === 'update' && result.op.changed)
      )
        publishTodoState(pi.events, id);
      return buildToolResult(
        params.action,
        params as TaskMutationParams,
        result.state,
        result.op,
      );
    },

    // renderCall shows only what the caller supplied (action + id/subject); the
    // result summary is derived from the result snapshot, never foreground state.
    renderCall(args, theme, context) {
      return renderTodoCall(args as never, theme, context);
    },

    renderResult(result, opts, theme, context) {
      return renderTodoResult(result, theme, opts, context);
    },
  });
}

// ---------------------------------------------------------------------------
// /todos slash command
// ---------------------------------------------------------------------------

export function registerTodosCommand(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAME, {
    description: 'Show all todos on the current branch, grouped by status',
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify(ERR_REQUIRES_INTERACTIVE, 'error');
        return;
      }
      const id = sid(ctx);
      const state = getState(id);
      const visible = isCompletedListHidden(id, state, currentEpoch(ctx))
        ? []
        : selectVisibleTasks(state);
      if (visible.length === 0) {
        ctx.ui.notify(MSG_NO_TODOS, 'info');
        return;
      }
      if (canOpenTodoPanel(ctx)) {
        await showTodoPanel(ctx);
        return;
      }
      const groups = selectTasksByStatus(state);
      const counts = selectTodoCounts(state);

      const header: string[] = [];
      if (counts.completed > 0)
        header.push(
          `${counts.completed}/${counts.total} ${formatStatusLabel('completed')}`,
        );
      if (counts.inProgress > 0)
        header.push(`${counts.inProgress} ${formatStatusLabel('in_progress')}`);
      if (counts.pending > 0)
        header.push(`${counts.pending} ${formatStatusLabel('pending')}`);

      const lines: string[] = [
        header.join(` ${resolveIcon('separator', '·')} `),
      ];
      if (groups.pending.length > 0) {
        lines.push(SECTION_PENDING);
        for (const task of groups.pending)
          lines.push(formatCommandTaskLine(task, taskGlyph('pending')));
      }
      if (groups.inProgress.length > 0) {
        lines.push(SECTION_IN_PROGRESS);
        for (const task of groups.inProgress)
          lines.push(formatCommandTaskLine(task, taskGlyph('in_progress')));
      }
      if (groups.completed.length > 0) {
        lines.push(SECTION_COMPLETED);
        for (const task of groups.completed)
          lines.push(formatCommandTaskLine(task, taskGlyph('completed')));
      }

      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });
}
