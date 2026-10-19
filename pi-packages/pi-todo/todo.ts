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

export const DEFAULT_PROMPT_SNIPPET = 'Track task list progress';
export const DEFAULT_PROMPT_GUIDELINES: string[] = [
  'Batch known plans: 1–50 ordered create/update/delete ops, all-or-nothing. Example: {"action":"batch","ops":[{"action":"create","subject":"Research","ref":"research","status":"in_progress"},{"action":"create","subject":"Implement","blockedBy":["research"]}]}. String ids/dependencies are unique refs from earlier creates in this call, not persisted ids.',
  'Never complete tasks with failing tests, partial implementation or unresolved errors; keep in_progress and create a blocker task.',
  'To change status, use update with id and status; every update requires a mutable field. Set activeForm when marking in_progress.',
  'Dependencies: A.blockedBy=[B] means A waits for B. Set blockedBy on create; update with addBlockedBy/removeBlockedBy, not the full array. Cycles are rejected.',
  'Use short, imperative subjects; description holds detail.',
];

export function registerTodoTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description:
      'Track multi-step work. Use for requests with 3+ steps, user-given task lists, delegated work units or SDD phases; capture requirements right after new instructions. Create items up front, mark in_progress BEFORE starting, and complete as soon as done. Parallel tasks may be in_progress together. Skip single trivial tasks and purely conversational turns. Actions: create, update, list, get, delete (tombstone), clear (reset all), batch. Lifecycle: pending → in_progress → completed; deleted is a tombstone.',
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
      if (result.op.kind !== 'error') commitState(id, result.state);
      if (
        result.op.kind === 'batch' ||
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
