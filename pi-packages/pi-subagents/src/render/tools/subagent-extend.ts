import { resolveIcon } from '@thoth-agents/pi-core';
import {
  agentIcon,
  themeDim,
  themeError,
  themeFg,
  themeTitle,
} from '../completion-message.js';
import { iconAwareRenderer } from '../icon-aware-component.js';
import {
  boxedComponent,
  emptyComponent,
  toolRenderState,
} from './components.js';
import { resolveExpandHint } from './expansion-hint.js';

export function renderSubagentExtendCall(_args?: any, _theme?: any) {
  return emptyComponent();
}

export const renderSubagentExtendResult = iconAwareRenderer(
  function renderSubagentExtendResult(
    result: any,
    options: any,
    theme: any,
    context?: any,
  ) {
    const renderState = toolRenderState(result, options, context);
    const failed = Boolean(renderState.context.isError);
    const { expanded } = options ?? {};
    const details = result?.details ?? {};
    const archPrefix = themeFg(theme, 'accent', agentIcon());
    const title = `${archPrefix} ${themeTitle(theme, failed ? `subagent extend ${resolveIcon('separator', '·')} failed` : 'subagent extend')}`;

    if (failed || !details.task_id) {
      const text = result?.content?.[0]?.text ?? details.error ?? '';
      return boxedComponent(
        [failed ? themeError(theme, text) : themeDim(theme, text)],
        { title, theme, ...renderState, wrapped: true },
      );
    }

    const lines = [
      `task_id: ${details.task_id}`,
      `added: ${details.added_ms}ms ${resolveIcon('separator', '·')} extensions remaining: ${details.extensions_remaining}`,
    ];
    if (expanded) {
      lines.push(
        themeDim(theme, `extensions used: ${details.extensions_used}`),
        themeDim(theme, `deadline_at: ${details.deadline_at}`),
      );
    } else {
      lines.push(themeDim(theme, resolveExpandHint('to expand', context)));
    }
    return boxedComponent(lines, {
      title,
      theme,
      ...renderState,
      wrapped: true,
    });
  },
);
