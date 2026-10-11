export interface ChildToolCall {
  taskId: string;
  id: string;
  name: string;
  args: Record<string, unknown>;
  completed: boolean;
  isError?: boolean;
}

/** Native JSONL session messages; toolResult completion alone is read evidence. */
export function childToolCalls(
  taskId: string,
  entries: unknown[],
): ChildToolCall[] {
  const calls = new Map<string, ChildToolCall>();
  for (const entry of entries) {
    const message = (
      entry as {
        message?: {
          role?: string;
          content?: unknown[];
          toolCallId?: string;
          isError?: boolean;
        };
      }
    )?.message;
    if (message?.role === 'assistant') {
      for (const raw of message.content ?? []) {
        const block = raw as {
          type?: string;
          id?: string;
          name?: string;
          arguments?: Record<string, unknown>;
        };
        if (block.type === 'toolCall' && block.id && block.name)
          calls.set(block.id, {
            taskId,
            id: block.id,
            name: block.name,
            args: block.arguments ?? {},
            completed: false,
          });
      }
    } else if (message?.role === 'toolResult' && message.toolCallId) {
      const call = calls.get(message.toolCallId);
      if (call) {
        call.completed = true;
        call.isError = message.isError;
      }
    }
  }
  return [...calls.values()];
}

export function successfulSkillRead(
  calls: ChildToolCall[],
  taskId: string,
  expectedPath: string,
  workspace?: string,
) {
  const normalize = (value: string) =>
    value.replaceAll('\\', '/').replace(/^\.\//, '');
  const expected = normalize(expectedPath);
  return calls.some((call) => {
    const actual = normalize(String(call.args.path ?? ''));
    return (
      call.taskId === taskId &&
      call.name === 'read' &&
      call.completed &&
      call.isError === false &&
      (actual === expected ||
        (!!workspace &&
          actual === `${normalize(workspace).replace(/\/$/, '')}/${expected}`))
    );
  });
}
