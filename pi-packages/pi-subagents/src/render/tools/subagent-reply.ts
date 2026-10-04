import {
  ARCH_ICON,
  CYAN,
  themeDim,
  themeError,
  themeFg,
  themeTitle,
} from '../completion-message.js';
import { boxedComponent, emptyComponent } from './components.js';
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
  const expanded = Boolean(
    typeof options === 'object' && options !== null
      ? options.expanded
      : options,
  );
  const details = result?.details ?? {};
  const rejected = Boolean(result?.isError);
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
    title: `${themeFg(theme, 'accent', ARCH_ICON, CYAN)} ${themeTitle(theme, `subagent reply · ${status}`)}`,
    theme,
    wrapped: true,
  });
}
