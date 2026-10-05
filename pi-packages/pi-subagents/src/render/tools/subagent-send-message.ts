import {
  ARCH_ICON,
  themeDim,
  themeError,
  themeFg,
  themeSuccess,
  themeTitle,
} from '../completion-message.js';
import {
  boxedComponent,
  emptyComponent,
  toolRenderState,
} from './components.js';
import { resolveExpandHint } from './expansion-hint.js';
import { clip } from './formatting.js';

export function renderSubagentSendMessageCall(_args?: any, _theme?: any) {
  return emptyComponent();
}

export function renderSubagentSendMessageResult(
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
  const status =
    details?.status ?? (renderState.context.isError ? 'rejected' : 'queued');
  const isRejected =
    status === 'rejected' || Boolean(renderState.context.isError);
  const archPrefix = themeFg(theme, 'accent', ARCH_ICON);
  const statusStyled = isRejected
    ? themeError(theme, status)
    : themeSuccess(theme, status);
  const title = `${archPrefix} ${themeTitle(theme, `subagent send message · ${status}`)}`;

  const taskId = details?.task_id;
  const msgText = details?.message ?? result?.content?.[0]?.text ?? '';

  if (!expanded) {
    const lines = [
      taskId
        ? `task_id: ${taskId} · status: ${statusStyled}`
        : `status: ${statusStyled}`,
      msgText ? themeDim(theme, `message: ${clip(msgText, 60)}`) : undefined,
      themeDim(theme, resolveExpandHint('to expand', context)),
    ].filter(Boolean) as string[];

    return boxedComponent(lines, {
      title,
      theme,
      ...renderState,
      wrapped: true,
    });
  }

  const metaLines = [
    taskId
      ? `task_id: ${taskId} · status: ${statusStyled}`
      : `status: ${statusStyled}`,
    details?.reason ? themeDim(theme, `reason: ${details.reason}`) : undefined,
    details?.pending_message_count !== undefined
      ? themeDim(theme, `pending messages: ${details.pending_message_count}`)
      : undefined,
  ].filter(Boolean) as string[];

  const contentLines = [...metaLines];
  if (msgText) {
    contentLines.push(
      themeTitle(theme, 'Message'),
      ...String(msgText).split('\n'),
    );
  }

  return boxedComponent(contentLines, {
    title,
    theme,
    ...renderState,
    wrapped: true,
  });
}
