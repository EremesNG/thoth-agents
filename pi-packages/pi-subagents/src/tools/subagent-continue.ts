import { Type } from 'typebox';
import { readSubagentsConfig } from '../config.js';
import { continuationAvailable } from '../continuation-availability.js';
import { resolveContinuationEffectiveMode } from '../continuation-mode.js';
import type { SubagentManager } from '../manager.js';
import {
  appendSubagentResumeGuidance,
  backgroundLaunchContent,
  formatTaskModeContent,
} from '../render/tools/formatting.js';
import { progressText } from '../render/tools/progress.js';
import {
  renderSubagentContinueCall,
  renderSubagentContinueResult,
} from '../render/tools/subagent-continue.js';
import type { SubagentTask } from '../types.js';
import {
  installBackgroundHandoffShortcut,
  QUESTION_HANDOFF_GUIDANCE,
  withBackgroundHandoffBarrier,
} from './background-handoff-state.js';
import {
  compactResultDetails,
  compactTaskForToolResult,
} from './result-details.js';
import { installDoubleEscapeCancel } from './subagent-run.js';
import { fail, ok } from './tool-response.js';

export function createSubagentContinueTool(manager: SubagentManager, pi: any) {
  return {
    name: 'subagent_continue',
    label: 'Subagent Continue',
    description:
      'Continue a completed, failed, or cancelled task in its exact persisted nested Pi session, keeping task_id.',
    promptSnippet:
      "Omit mode to preserve the task's prior effective mode; background is the default if none exists. Overrides require an explicit user decision before you supply model or effort. Never auto-switch models.",
    parameters: Type.Object({
      task_id: Type.String(),
      prompt: Type.String(),
      mode: Type.Optional(
        Type.Union([Type.Literal('task'), Type.Literal('background')]),
      ),
      model: Type.Optional(Type.String()),
      effort: Type.Optional(
        Type.Union([
          Type.Literal('off'),
          Type.Literal('minimal'),
          Type.Literal('low'),
          Type.Literal('medium'),
          Type.Literal('high'),
          Type.Literal('xhigh'),
        ]),
      ),
    }),
    renderShell: 'self',
    execute: withBackgroundHandoffBarrier(
      async (
        toolReturned,
        _id: string,
        params: any,
        _signal: any,
        onUpdate: any,
        ctx: any,
      ) => {
        let cancelledByDoubleEscape = false;
        let frame = 0;
        let active = true;
        let latestTasks: SubagentTask[] = [];
        const cwd = ctx?.cwd ?? process.cwd();
        const availability = () => continuationAvailable(cwd, pi);
        const existing = manager.getTask(params.task_id, cwd);
        const config = readSubagentsConfig(cwd);
        const effectiveMode = resolveContinuationEffectiveMode({
          explicitMode: params.mode,
          previousTask: existing,
          config,
        });
        // This input survives tool return while prior runner cleanup is pending.
        const continuationInput = { ...params };
        const isBackground = effectiveMode === 'background';
        const canBackgroundInTaskMode = effectiveMode === 'task';
        const backgroundShortcut =
          config.background_handoff_shortcut ?? 'ctrl+h';
        let resolveBackground:
          | ((value: { mode: 'background'; task_ids: string[] }) => void)
          | undefined;
        const backgroundPromise = canBackgroundInTaskMode
          ? new Promise<{ mode: 'background'; task_ids: string[] }>(
              (resolve) => {
                resolveBackground = resolve;
              },
            )
          : undefined;
        const emit = () => {
          if (!active || isBackground) return;
          try {
            onUpdate?.({
              content: [
                {
                  type: 'text',
                  text: progressText(latestTasks, frame, {
                    backgroundable: canBackgroundInTaskMode,
                    backgroundShortcut,
                  }),
                },
              ],
              details: {
                tasks: latestTasks.map((task) =>
                  compactTaskForToolResult(task, availability(), {
                    includeResult: false,
                  }),
                ),
                frame: frame++,
                backgroundable: canBackgroundInTaskMode,
                backgroundShortcut,
              },
            });
          } catch {
            active = false;
          }
        };
        const uninstallCancel = isBackground
          ? () => {}
          : installDoubleEscapeCancel(
              ctx,
              manager,
              () => {
                cancelledByDoubleEscape = true;
              },
              () => latestTasks.map((task) => task.id),
            );
        const uninstallBackground = canBackgroundInTaskMode
          ? installBackgroundHandoffShortcut(
              ctx,
              manager,
              () => latestTasks.map((task) => task.id),
              (tasks) => {
                active = false;
                resolveBackground?.({
                  mode: 'background',
                  task_ids: tasks.map((task) => task.id),
                });
              },
              toolReturned,
              () => {
                continuationInput.mode = 'background';
                active = false;
                resolveBackground?.({
                  mode: 'background',
                  task_ids: [params.task_id],
                });
              },
            )
          : () => {};
        try {
          emit();
          const continuePromise = manager.continueTask(
            continuationInput,
            { ...ctx, pi },
            _signal,
            isBackground
              ? undefined
              : (tasks) => {
                  latestTasks = tasks;
                  emit();
                },
          );
          const result = backgroundPromise
            ? await Promise.race([continuePromise, backgroundPromise])
            : await continuePromise;
          if (cancelledByDoubleEscape)
            throw new Error('Subagent continuation cancelled by double escape');
          const available = availability();
          if (!('results' in result)) {
            const response = ok(
              [
                backgroundLaunchContent(result.task_ids, 'Continued'),
                !isBackground &&
                result.task_ids.some(
                  (id) => manager.getTask(id)?.pending_questions?.length,
                )
                  ? QUESTION_HANDOFF_GUIDANCE
                  : undefined,
              ]
                .filter(Boolean)
                .join('\n\n'),
              compactResultDetails(
                {
                  ...result,
                  tasks: result.task_ids
                    .map((id) => manager.getTask(id, cwd))
                    .filter(Boolean) as SubagentTask[],
                },
                available,
              ),
            );
            return isBackground ? response : { ...response, terminate: true };
          }
          const tasks = result.results ?? [];
          const text = formatTaskModeContent(tasks, available);
          const details = compactResultDetails(
            { task: tasks[0], ...result },
            available,
          );
          return tasks.some(
            (task) => task.status === 'failed' || task.status === 'cancelled',
          )
            ? { ...fail(text), details }
            : ok(text, details);
        } catch (e) {
          const task = manager.getTask(params.task_id, cwd);
          const tasks = task ? [task] : latestTasks;
          const available = availability();
          const message = e instanceof Error ? e.message : String(e);
          const response = fail(
            cancelledByDoubleEscape
              ? appendSubagentResumeGuidance(
                  message,
                  tasks.length ? tasks : [{ status: 'cancelled' }],
                  available,
                )
              : e,
          );
          return {
            ...response,
            details: compactResultDetails(
              { ...response.details, tasks },
              available,
            ),
          };
        } finally {
          active = false;
          uninstallCancel();
          uninstallBackground();
        }
      },
    ),
    renderCall: (args: any, theme: any) =>
      renderSubagentContinueCall(
        args,
        theme,
        args?.task_id
          ? manager.getTask(args.task_id, process.cwd())
          : undefined,
        process.cwd(),
      ),
    renderResult: renderSubagentContinueResult,
  };
}
