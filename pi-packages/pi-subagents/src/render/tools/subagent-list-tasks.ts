import { ARCH_ICON, themeFg, themeTitle } from '../completion-message.js';
import type { SubagentTask } from '../types.js';
import { boxedComponent, toolRenderState } from './components.js';
import { formatTaskListRender } from './formatting.js';

export function renderSubagentListTasksResult(
  result: any,
  options: any,
  theme: any,
  context?: any,
) {
  const renderState = toolRenderState(result, options, context);
  const isExpanded = Boolean(
    typeof options === 'object' && options !== null
      ? options.expanded
      : options,
  );
  const tasks: SubagentTask[] = Array.isArray(result?.details?.tasks)
    ? result.details.tasks
    : [];
  const archPrefix = themeFg(theme, 'accent', ARCH_ICON);
  const title = `${archPrefix} ${themeTitle(theme, tasks.length ? `subagent tasks · ${tasks.length} listed` : 'subagent tasks')}`;

  const text = formatTaskListRender(tasks, isExpanded, context);
  const lines = isExpanded
    ? text.split('\n')
    : (theme?.fg?.('dim', text) ?? text).split('\n');

  return boxedComponent(lines, {
    title,
    theme,
    ...renderState,
    wrapped: true,
  });
}
