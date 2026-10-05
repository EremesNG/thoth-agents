import {
  ARCH_ICON,
  themeDim,
  themeError,
  themeFg,
  themeTitle,
} from '../completion-message.js';
import {
  boxedComponent,
  emptyComponent,
  toolRenderState,
} from './components.js';
import { resolveExpandHint } from './expansion-hint.js';
import { clip } from './formatting.js';

export function renderSubagentReplyCall() {
  return emptyComponent();
}

export function renderSubagentReplyResult(
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
  const details = result?.details ?? {};
  const rejected = Boolean(renderState.context.isError);
  const status = rejected ? 'rejected' : 'replied';
  const text = result?.content?.[0]?.text ?? '';
  const lines = [
    details.task_id
      ? themeDim(theme, `task_id: ${details.task_id}`)
      : undefined,
    expanded && details.request_id
      ? themeDim(theme, `request_id: ${details.request_id}`)
      : undefined,
    rejected
      ? themeError(theme, text)
      : expanded
        ? text
        : themeDim(theme, clip(text, 60)),
    !expanded
      ? themeDim(theme, resolveExpandHint('to expand', context))
      : undefined,
  ].filter(Boolean) as string[];
  return boxedComponent(lines, {
    title: `${themeFg(theme, 'accent', ARCH_ICON)} ${themeTitle(theme, `subagent reply · ${status}`)}`,
    theme,
    ...renderState,
    wrapped: true,
  });
}
