/** Text only: never creates a Pi toolCall or executable toolUse. */
export interface NativeToolActivity {
  title?: string;
  kind?: string;
  status?: string;
  toolCallId?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  locations?: { path: string; line?: number }[];
  content?: {
    type: string;
    text?: string;
    content?: { type: string; text?: string };
    path?: string;
    oldText?: string | null;
    newText?: string;
  }[];
}
export function renderNativeActivity(event: NativeToolActivity): string {
  const parts = [
    `[Junie tool: ${event.title ?? event.toolCallId ?? 'native'}${event.kind ? ` (${event.kind})` : ''}${event.status ? ` — ${event.status}` : ''}]`,
  ];
  for (const location of event.locations ?? [])
    parts.push(
      `${location.path}${location.line === undefined ? '' : ':' + location.line}`,
    );
  for (const value of [event.rawInput, event.rawOutput])
    if (value !== undefined)
      parts.push(typeof value === 'string' ? value : JSON.stringify(value));
  for (const block of event.content ?? []) {
    if (block.type === 'diff')
      parts.push(
        `Diff ${block.path ?? ''}\n--- old\n${block.oldText ?? ''}\n+++ new\n${block.newText ?? ''}`,
      );
    else if (block.content?.type === 'text')
      parts.push(block.content.text ?? '');
    else if (block.type === 'text') parts.push(block.text ?? '');
  }
  return parts.join('\n');
}
