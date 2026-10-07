import { resolveIcon } from '@thoth-agents/pi-core';
import { agentIcon, themeFg, themeStatus } from '../completion-message.js';
import { iconAwareRenderer } from '../icon-aware-component.js';
import { openSubagentsPanel } from '../panel-opener.js';
import { taskFromDetails } from '../result-details.js';
import { boxedComponent, toolRenderState } from './components.js';
import { resolveExpandHint } from './expansion-hint.js';
import {
  formatTaskLabel,
  formatUsage,
  hasAgentResponse,
  modelEffortLine,
  taskResponseText,
} from './formatting.js';
import { statusGlyph } from './progress.js';

export const renderSubagentResult = iconAwareRenderer(
  function renderSubagentResult(
    result: any,
    options: any,
    theme: any,
    context?: any,
  ) {
    const renderState = toolRenderState(result, options, context);
    const { expanded } = options ?? {};
    const task = taskFromDetails(result);
    const failed = Boolean(
      renderState.context.isError ||
        task?.status === 'failed' ||
        task?.status === 'cancelled',
    );
    const isRunning = task?.status === 'running' || task?.status === 'queued';
    const hasResp = hasAgentResponse(task, result);
    const responseText = taskResponseText(task, result);
    const archPrefix = task
      ? themeStatus(theme, task.status, statusGlyph(task.status))
      : themeFg(theme, 'accent', agentIcon());

    if (!task) {
      const text =
        theme.fg?.(
          failed ? 'error' : 'dim',
          result?.content?.[0]?.text ?? '',
        ) ??
        result?.content?.[0]?.text ??
        '';
      const titleText = hasResp ? 'Subagent result' : 'Subagent';
      const title = `${archPrefix} ${theme.fg?.('toolTitle', titleText) ?? titleText}`;
      return boxedComponent([text], {
        title,
        theme,
        ...renderState,
        wrapped: true,
      });
    }

    const status = failed
      ? (theme.fg?.('error', task.status) ?? task.status)
      : (theme.fg?.('success', task.status) ?? task.status);
    const taskLabel = formatTaskLabel(task, true);
    const isBg =
      task.mode === 'background' ||
      task.effective_mode === 'background' ||
      result?.details?.mode === 'background';
    const bgSuffix = isBg ? ' (background)' : '';
    let title: string;
    if (isRunning) {
      const agentOrName = task.display_name || task.agent || 'subagent';
      title = `${archPrefix} ${theme.fg?.('toolTitle', `Subagent ${resolveIcon('separator', '·')} ${agentOrName} ${resolveIcon('separator', '·')} ${task.status}${bgSuffix}`) ?? `Subagent ${resolveIcon('separator', '·')} ${agentOrName} ${resolveIcon('separator', '·')} ${task.status}${bgSuffix}`}`;
    } else if (hasResp) {
      title = `${archPrefix} ${theme.fg?.('toolTitle', `Subagent result ${resolveIcon('separator', '·')} ${taskLabel}`) ?? `Subagent result ${resolveIcon('separator', '·')} ${taskLabel}`}`;
    } else {
      title = `${archPrefix} ${theme.fg?.('toolTitle', `Subagent ${resolveIcon('separator', '·')} ${taskLabel}`) ?? `Subagent ${resolveIcon('separator', '·')} ${taskLabel}`}`;
    }

    if (!expanded) {
      const metaLine = `subagent: ${theme.fg?.('accent', task.agent) ?? task.agent} ${resolveIcon('separator', '·')} model: ${task.model ?? 'default/current'} ${resolveIcon('separator', '·')} effort: ${task.effort ?? 'default/current'} ${resolveIcon('separator', '·')} status: ${status}`;
      const expandHint = resolveExpandHint('to expand', context);
      const lines = [metaLine, theme.fg?.('dim', expandHint) ?? expandHint];
      return boxedComponent(lines, {
        title,
        theme,
        ...renderState,
        wrapped: true,
      });
    }

    const usage = formatUsage(task, true);
    const summaryLines = [
      `subagent: ${theme.fg?.('accent', task.agent) ?? task.agent} ${resolveIcon('separator', '·')} status: ${status} ${resolveIcon('separator', '·')} attempt: ${task.attempt ?? 1}`,
      theme.fg?.('dim', modelEffortLine(task, true)) ??
        modelEffortLine(task, true),
      usage
        ? (theme.fg?.('dim', `usage: ${usage}`) ?? `usage: ${usage}`)
        : undefined,
      task.undelivered_message_count
        ? (theme.fg?.(
            'dim',
            `undelivered messages: ${task.undelivered_message_count}`,
          ) ?? `undelivered messages: ${task.undelivered_message_count}`)
        : undefined,
    ].filter(Boolean) as string[];

    const contentLines = [...summaryLines];
    if (hasResp && responseText) {
      contentLines.push(
        theme.fg?.('toolTitle', 'Subagent response') ?? 'Subagent response',
        ...responseText.split('\n'),
      );
    } else if (failed && task.error) {
      contentLines.push(
        theme.fg?.('error', 'Subagent error') ?? 'Subagent error',
        ...task.error.split('\n'),
      );
    }

    return boxedComponent(contentLines, {
      title,
      theme,
      ...renderState,
      wrapped: true,
      onClick: task?.id ? () => openSubagentsPanel(task.id) : undefined,
    });
  },
);
