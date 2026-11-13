import type { EntryRenderer } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';

/** Display only: never part of an assistant message or executable toolUse. */
export interface NativeToolActivity {
  /** Local per-turn telemetry, carried by the same display-only entry sink. */
  usageLine?: string;
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
  if (event.usageLine) return event.usageLine;
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

/** Retain updates through completion; persist one merged entry at turn end. */
export class NativeActivityFolder {
  private pending = new Map<string, NativeToolActivity>();
  constructor(private emit: (event: NativeToolActivity) => void) {}
  add(event: NativeToolActivity): void {
    if (!event.toolCallId) {
      this.emit(event);
      return;
    }
    const merged = { ...this.pending.get(event.toolCallId), ...event };
    // ACP updates omit most fields; absent content must not erase prior detail.
    if (event.content === undefined)
      merged.content = this.pending.get(event.toolCallId)?.content;
    this.pending.set(event.toolCallId, merged);
  }
  flush(): void {
    for (const event of this.pending.values()) this.emit(event);
    this.pending.clear();
  }
}

export const renderNativeEvent: EntryRenderer<NativeToolActivity> = (
  entry,
  { expanded },
) =>
  new Text(
    expanded
      ? renderNativeActivity(entry.data ?? {}).slice(0, 16000)
      : renderNativeActivity({
          usageLine: entry.data?.usageLine,
          title: entry.data?.title,
          kind: entry.data?.kind,
          status: entry.data?.status,
        }),
    0,
    0,
  );
