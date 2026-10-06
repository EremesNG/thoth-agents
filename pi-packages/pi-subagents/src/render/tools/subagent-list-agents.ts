import { resolveIcon } from '@thoth-agents/pi-core';
import {
  agentIcon,
  themeDim,
  themeFg,
  themeTitle,
} from '../completion-message.js';
import { iconAwareRenderer } from '../icon-aware-component.js';
import type { ModelRef, ThinkingEffort } from '../types.js';
import { boxedComponent, toolRenderState } from './components.js';
import { resolveExpandHint } from './expansion-hint.js';

export type ListedSubagent = {
  name: string;
  model?: ModelRef;
  effort?: ThinkingEffort;
  tools: string[];
};

function modelLabel(model?: ModelRef): string {
  return model ? `${model.provider}/${model.id}` : 'default/current';
}

function summary(agent: ListedSubagent, ui = false): string {
  return `${agent.name} ${ui ? resolveIcon('separator', '·') : '·'} model: ${modelLabel(agent.model)} ${ui ? resolveIcon('separator', '·') : '·'} effort: ${agent.effort ?? 'default/current'}`;
}

export function formatSubagentList(
  agents: ListedSubagent[],
  includeTools: boolean,
): string {
  if (!agents.length) return 'No subagents available.';
  return agents
    .map((agent) =>
      includeTools
        ? `${summary(agent)} · tools: ${agent.tools.join(', ') || 'none'}`
        : summary(agent),
    )
    .join('\n');
}

export const renderSubagentListResult = iconAwareRenderer(
  function renderSubagentListResult(
    result: any,
    options: any,
    theme: any,
    context?: any,
  ) {
    const renderState = toolRenderState(result, options, context);
    const expanded = Boolean(
      typeof options === 'object' && options !== null
        ? options.expanded
        : options,
    );
    const agents: ListedSubagent[] = Array.isArray(result?.details?.agents)
      ? result.details.agents
      : [];
    const archPrefix = themeFg(theme, 'accent', agentIcon());
    const title = `${archPrefix} ${themeTitle(theme, agents.length ? `subagents ${resolveIcon('separator', '·')} ${agents.length} available` : 'subagents')}`;

    if (!agents.length) {
      return boxedComponent([themeDim(theme, 'No subagents available.')], {
        title,
        theme,
        ...renderState,
        wrapped: true,
      });
    }

    if (expanded) {
      const lines = agents.flatMap((agent) => [
        summary(agent, true),
        themeDim(theme, `  tools: ${agent.tools.join(', ') || 'none'}`),
      ]);
      return boxedComponent(lines, {
        title,
        theme,
        ...renderState,
        wrapped: true,
      });
    }

    const names = agents.map((a) => a.name);
    const sample = names.slice(0, 5).join(', ');
    const summaryLine =
      agents.length > 5
        ? `agents: ${sample}, ${resolveIcon('ellipsis', '…')} (${agents.length} total)`
        : `agents: ${sample}`;

    const lines = [
      summaryLine,
      themeDim(theme, resolveExpandHint('to expand', context)),
    ];

    return boxedComponent(lines, {
      title,
      theme,
      ...renderState,
      wrapped: true,
    });
  },
);
