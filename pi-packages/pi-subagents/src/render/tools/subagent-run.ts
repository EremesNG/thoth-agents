import {
  themeAccent,
  themeBold,
  themeDim,
  themeError,
  themeStatus,
  themeSuccess,
  themeTitle,
  themeWarning,
} from '../completion-message.js';
import {
  loadSubagents,
  readSubagentsConfig,
  resolveEffectiveSubagentMode,
} from '../config.js';
import { openSubagentsPanel } from '../panel-opener.js';
import { taskFromDetails } from '../result-details.js';
import type { SubagentMode, SubagentTask } from '../types.js';
import {
  boxedComponent,
  emptyComponent,
  textComponent,
  toolRenderState,
} from './components.js';
import { resolveExpandHint } from './expansion-hint.js';
import {
  collapsedResultHint,
  formatDuration,
  formatTaskLabel,
  formatUsage,
  generationSpeed,
  hasAgentResponse,
  taskFinalText,
  taskResponseText,
} from './formatting.js';
import { progressText, statusGlyph } from './progress.js';

export function renderSubagentTaskCall(
  _agent?: string,
  _mode?: 'task' | 'background',
  _theme?: any,
  _detail?: string,
) {
  return emptyComponent();
}

function resolveRenderedSubagentRunMode(args: any, cwd: string): SubagentMode {
  if (args.mode === 'task' || args.mode === 'background') return args.mode;
  const config = readSubagentsConfig(cwd);
  const definitions = new Map(
    loadSubagents(cwd).map((definition) => [definition.name, definition]),
  );
  return resolveEffectiveSubagentMode({
    invocationMode: args.mode,
    definition: args.agent
      ? definitions.get(String(args.agent).toLowerCase())
      : undefined,
    config,
  });
}

export function renderSubagentRunCall(_args: any, _theme: any) {
  return emptyComponent();
}

function formatRuntimeMetrics(task: SubagentTask): {
  speed: string;
  elapsed: string;
} {
  const speed = generationSpeed(task.runtime_metrics);
  const started = Date.parse(task.started_at ?? '');
  const isLive =
    task.status === 'queued' ||
    task.status === 'running' ||
    task.status === 'stopping';
  const ended = isLive ? Date.now() : Date.parse(task.ended_at ?? '');
  const elapsed = Math.max(0, ended - started);
  return {
    speed: speed !== undefined ? `${Math.round(speed)} tok/s` : '',
    elapsed:
      Number.isFinite(started) && Number.isFinite(ended)
        ? formatDuration(isLive ? Math.floor(elapsed / 1000) * 1000 : elapsed)
        : '',
  };
}

export function renderSubagentRunResult(
  result: any,
  options: any = {},
  theme: any,
  context?: any,
) {
  const renderState = toolRenderState(result, options, context);
  const { expanded, isPartial } = options ?? {};
  const task = taskFromDetails(result);
  const isBg =
    task?.mode === 'background' ||
    task?.effective_mode === 'background' ||
    result?.details?.mode === 'background';
  const isRunning = task?.status === 'running' || task?.status === 'queued';
  const isLaunched =
    isBg &&
    isRunning &&
    !renderState.context.isPartial &&
    !renderState.context.isError;
  // The finalized card represents the launch, not the live background task.
  if (isLaunched) {
    renderState.status = 'completed';
    renderState.isSuccess = true;
  }
  const statusLabel = isLaunched
    ? 'launched'
    : (task?.status ?? (renderState.context.isError ? 'failed' : 'completed'));
  const runtime =
    task && (isPartial || !isBg) ? formatRuntimeMetrics(task) : undefined;
  const archPrefix = themeStatus(
    theme,
    isLaunched ? 'completed' : statusLabel,
    isBg && isRunning
      ? '⤓'
      : statusGlyph(statusLabel, result?.details?.frame ?? 0),
  );
  const bgSuffix = isBg ? ' (background)' : '';

  if (isPartial) {
    const frame = result?.details?.frame ?? 0;
    const backgroundable = Boolean(result?.details?.backgroundable);
    const raw = progressText(task ? [task] : [], frame, {
      backgroundable,
      backgroundShortcut: result?.details?.backgroundShortcut,
      runtime: isBg ? undefined : runtime?.speed,
    });
    const lines = raw.split('\n');
    // Current activity is last in the trail, before the optional background hint.
    const currentActivityIndex = task?.live_activity?.trail?.length
      ? lines.length - (backgroundable ? 2 : 1)
      : -1;
    const styled = lines
      .map((line: string, index: number) => {
        if (index === 0) return themeWarning(theme, line);
        if (index === currentActivityIndex)
          return themeBold(theme, themeAccent(theme, line));
        return themeDim(theme, line);
      })
      .filter(Boolean) as string[];
    const agentOrName = task?.display_name || task?.agent || 'subagent';
    const title = `${archPrefix} ${themeTitle(theme, `subagent · ${agentOrName} · running${bgSuffix}`)}`;
    return boxedComponent(styled, {
      title,
      theme,
      ...renderState,
      workingRow: 0,
      wrapped: true,
      onClick: task?.id ? () => openSubagentsPanel(task.id) : undefined,
    });
  }
  const failed = Boolean(
    renderState.context.isError ||
      task?.status === 'failed' ||
      task?.status === 'cancelled',
  );
  const isExpanded = Boolean(expanded);
  const status = isLaunched
    ? themeSuccess(theme, 'launched')
    : task
      ? themeStatus(theme, task.status ?? (failed ? 'failed' : 'done'))
      : failed
        ? themeError(theme, 'failed')
        : themeSuccess(theme, 'done');
  const taskLabel = formatTaskLabel(task);
  const hasResp = hasAgentResponse(task, result);
  const responseText = taskResponseText(task, result);

  let title: string;
  if (isRunning) {
    const agentOrName = task?.display_name || task?.agent || 'subagent';
    title = `${archPrefix} ${themeTitle(theme, `subagent · ${agentOrName} · ${statusLabel}${bgSuffix}`)}`;
  } else if (!isExpanded) {
    const titleLabel = failed
      ? themeError(theme, `[subagent] ${taskLabel} · ${statusLabel}`)
      : themeTitle(theme, `[subagent] ${taskLabel} · ${statusLabel}`);
    title = `${archPrefix} ${titleLabel}`.trim();
  } else if (hasResp) {
    title = `${archPrefix} ${themeTitle(theme, `subagent result · ${taskLabel}`)}`;
  } else {
    title = `${archPrefix} ${themeTitle(theme, `subagent · ${taskLabel}`)}`;
  }

  const usage = task ? formatUsage(task as SubagentTask) : '';
  const usageLine = [
    usage ? `usage: ${usage}` : undefined,
    runtime?.speed,
    runtime?.elapsed ? `⧗ elapsed ${runtime.elapsed}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!isRunning && !isExpanded) {
    const costSuffix =
      typeof task?.usage?.cost === 'number' && task.usage.cost > 0
        ? ` · $${task.usage.cost.toFixed(2)}`
        : '';
    const metaLine = themeDim(
      theme,
      `subagent: ${task?.agent ?? 'subagent'} · model: ${task?.model ?? 'default/current'} · effort: ${task?.effort ?? 'default/current'} · status: ${statusLabel}${costSuffix}`,
    );
    const collapsedLines: string[] = [metaLine];
    if (failed) {
      const errorRaw =
        task?.error ||
        (renderState.context.isError &&
        typeof result?.content?.[0]?.text === 'string'
          ? result.content[0].text
          : undefined);
      if (errorRaw) {
        const firstLine = errorRaw.split('\n')[0]?.trim();
        if (firstLine) {
          collapsedLines.push(themeError(theme, firstLine));
        }
      }
    }
    collapsedLines.push(
      themeDim(theme, resolveExpandHint('to expand', context)),
    );
    return boxedComponent(collapsedLines, {
      title,
      theme,
      ...renderState,
      wrapped: false,
      onClick: task?.id ? () => openSubagentsPanel(task.id) : undefined,
    });
  }

  const historyShortcut =
    readSubagentsConfig(process.cwd()).history_panel_shortcut ?? 'ctrl+,';
  const detailsHint = `(click to view execution) · (${historyShortcut} or /subagents for details)`;
  const metaLines = task
    ? ([
        `subagent: ${themeAccent(theme, task.agent)} · status: ${status} · attempt: ${themeAccent(theme, String(task.attempt ?? 1))} · effort: ${themeAccent(theme, task.effort ?? 'default/current')}`,
        themeDim(theme, `model: ${task.model ?? 'default/current'}`),
        usageLine ? themeDim(theme, usageLine) : undefined,
        themeDim(theme, detailsHint),
      ].filter(Boolean) as string[])
    : [status, themeDim(theme, detailsHint)];
  const contentLines = [...metaLines];
  if (hasResp && responseText) {
    contentLines.push(
      themeTitle(theme, 'Subagent response'),
      ...responseText.split('\n'),
    );
  } else if (failed && task?.error) {
    contentLines.push(
      themeError(theme, 'Subagent error'),
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
}
