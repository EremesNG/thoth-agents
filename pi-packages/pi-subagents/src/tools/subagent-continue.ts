import {
  getAnimationLevel,
  subscribeAnimationLevel,
  subscribeAnimationSteps,
} from '@thoth-agents/pi-core';
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
import type { SubagentMode, SubagentTask } from '../types.js';
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
      'Omit mode: background by default. Use mode=task only when explicitly asked to wait. Supply model or effort only after an explicit user decision. Never auto-switch models.',
    parameters: Type.Object({
      task_id: Type.String(),
      prompt: Type.String(),
      mode: Type.Optional(
        Type.Unsafe<SubagentMode>({
          type: 'string',
          enum: ['task', 'background'],
        }),
      ),
      model: Type.Optional(Type.String()),
      effort: Type.Optional(
        Type.Unsafe<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>({
          type: 'string',
          enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        }),
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
        const config = readSubagentsConfig(cwd);
        const effectiveMode = resolveContinuationEffectiveMode({
          explicitMode: params.mode,
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
        let heartbeat: (() => void) | undefined;
        const stopHeartbeat = () => {
          heartbeat?.();
          heartbeat = undefined;
        };
        const syncHeartbeat = () => {
          const hasActiveForegroundTask =
            active &&
            !isBackground &&
            !_signal?.aborted &&
            latestTasks.some(
              (task) =>
                task.mode === 'task' &&
                (task.status === 'queued' ||
                  task.status === 'running' ||
                  task.status === 'stopping'),
            );
          if (!hasActiveForegroundTask) {
            stopHeartbeat();
            return;
          }
          if (heartbeat !== undefined) return;
          const removeSteps = subscribeAnimationSteps({
            intendedMs: 200,
            onStep(step) {
              syncHeartbeat();
              if (!heartbeat) return;
              // The initial progress update has already painted frame 0.
              if (step.frame !== undefined) frame = step.frame + 1;
              emit();
            },
          });
          const removeLevel = subscribeAnimationLevel(() => emit());
          heartbeat = () => {
            removeSteps();
            removeLevel();
          };
        };
        const emit = () => {
          if (!active || isBackground || _signal?.aborted) return;
          const currentFrame =
            getAnimationLevel() === 'off' ? undefined : frame;
          try {
            onUpdate?.({
              content: [
                {
                  type: 'text',
                  text: progressText(latestTasks, currentFrame, {
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
                frame: currentFrame,
                backgroundable: canBackgroundInTaskMode,
                backgroundShortcut,
              },
            });
          } catch {
            active = false;
          }
          syncHeartbeat();
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
                stopHeartbeat();
                resolveBackground?.({
                  mode: 'background',
                  task_ids: tasks.map((task) => task.id),
                });
              },
              toolReturned,
              () => {
                continuationInput.mode = 'background';
                active = false;
                stopHeartbeat();
                resolveBackground?.({
                  mode: 'background',
                  task_ids: [params.task_id],
                });
              },
            )
          : () => {};
        try {
          if (!isBackground)
            _signal?.addEventListener('abort', stopHeartbeat, { once: true });
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
          stopHeartbeat();
          if (!isBackground)
            _signal?.removeEventListener('abort', stopHeartbeat);
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
      ),
    renderResult: renderSubagentContinueResult,
  };
}
