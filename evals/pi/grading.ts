import type { EvaluationResult, ToolCall } from './harness';

export function hasToolCall(
  result: EvaluationResult,
  name: string,
  predicate: (call: ToolCall) => boolean = () => true,
): boolean {
  return result.tools.some((call) => call.name === name && predicate(call));
}
export function hasSubagentTask(
  result: EvaluationResult,
  agent: string,
  task?: RegExp,
): boolean {
  return hasToolCall(
    result,
    'subagent_run',
    (call) =>
      call.args.agent === agent &&
      (!task || matches(task, String(call.args.task))),
  );
}
function matches(pattern: RegExp, text: string): boolean {
  // Stateful g/y regexes must not make grades depend on call order.
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).test(
    text,
  );
}
export function writesPath(
  result: EvaluationResult,
  path: string | RegExp,
): boolean {
  return result.writtenPaths.some((written) =>
    typeof path === 'string' ? written === path : matches(path, written),
  );
}
/** Order is recorder observation order, not inferred wall-clock filesystem mtime. */
export function ordered(
  before: number | undefined,
  after: number | undefined,
): boolean {
  return before !== undefined && after !== undefined && before < after;
}
export function requireProgress(result: EvaluationResult): string[] {
  return result.changes.length ||
    result.questions.length ||
    result.tools.some((call) => call.end !== undefined && !call.isError)
    ? []
    : ['No positive progress recorded'];
}
export function completedTaskBeforeWrite(
  result: EvaluationResult,
  agent: string,
  path: string | RegExp,
): boolean {
  const writes = result.changes.filter((change) =>
    typeof path === 'string'
      ? change.path === path
      : matches(path, change.path),
  );
  return (
    writes.length > 0 &&
    writes.every((write) =>
      result.tasks.some(
        ({ at, task }) =>
          task.agent === agent &&
          task.status === 'completed' &&
          ordered(at, write.at),
      ),
    )
  );
}
