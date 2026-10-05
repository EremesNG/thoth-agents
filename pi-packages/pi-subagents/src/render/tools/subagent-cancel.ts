import {
  ARCH_ICON,
  themeAccent,
  themeDim,
  themeError,
  themeFg,
  themeStatus,
  themeTitle,
} from '../completion-message.js';
import { taskFromDetails } from '../result-details.js';
import {
  boxedComponent,
  emptyComponent,
  toolRenderState,
} from './components.js';
import { resolveExpandHint } from './expansion-hint.js';
import { formatTaskLabel, formatUsage, modelEffortLine } from './formatting.js';

export function renderSubagentCancelCall(_args: any, _theme: any) {
  return emptyComponent();
}

export function renderSubagentCancelResult(
  result: any,
  options: any,
  theme: any,
  context?: any,
) {
  const renderState = toolRenderState(result, options, context);
  const { expanded } = options ?? {};
  const task = taskFromDetails(result);
  const failed = Boolean(renderState.context.isError);
  const archPrefix = themeFg(theme, 'accent', ARCH_ICON);

  if (!task) {
    const title = `${archPrefix} ${themeTitle(theme, failed ? 'subagent cancel · failed' : 'subagent cancel')}`;
    const text = result?.content?.[0]?.text ?? '';
    return boxedComponent(
      [failed ? themeError(theme, text) : themeDim(theme, text)],
      { title, theme, ...renderState, wrapped: true },
    );
  }

  const label = formatTaskLabel(task);
  const status = themeStatus(theme, task.status ?? 'stopping');
  const modeSuffix =
    task.mode === 'background' || task.effective_mode === 'background'
      ? ' (background)'
      : '';
  const title = `${archPrefix} ${themeTitle(theme, `subagent cancel · ${label} · ${task.status ?? 'stopping'}${modeSuffix}`)}`;
  const lines = [
    `subagent: ${themeAccent(theme, task.agent)} · model: ${task.model ?? 'default/current'} · effort: ${themeAccent(theme, task.effort ?? 'default/current')} · status: ${status}`,
  ];

  if (expanded) {
    const usage = formatUsage(task);
    lines.push(
      themeDim(theme, modelEffortLine(task)),
      usage ? themeDim(theme, `usage: ${usage}`) : '',
      themeDim(theme, 'task_id is available to the agent in tool details'),
    );
  } else {
    lines.push(themeDim(theme, resolveExpandHint('to expand', context)));
  }

  return boxedComponent(lines.filter(Boolean), {
    title,
    theme,
    ...renderState,
    wrapped: true,
  });
}
