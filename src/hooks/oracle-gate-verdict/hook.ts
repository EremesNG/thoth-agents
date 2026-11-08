import {
  formatGateVerdict,
  summarizeGateResult,
} from '../../../skills/thoth-sdd/scripts/validate-result.mjs';
import type { DelegationToolEvent } from '../delegate-task-retry/hook';

export function createOracleGateVerdictHook(ctx: { directory: string }) {
  const delivered = new WeakSet<object>();
  return async (event: DelegationToolEvent): Promise<void> => {
    if (event.tool !== 'subagent' || event.status !== 'completed') return;
    if (delivered.has(event.result)) return;
    if (
      !event.input ||
      typeof event.input !== 'object' ||
      !('agent' in event.input) ||
      event.input.agent !== 'oracle'
    )
      return;
    const output: unknown = event.result.output;
    if (
      !output ||
      typeof output !== 'object' ||
      !('status' in output) ||
      output.status !== 'completed'
    )
      return;
    const content = event.result.content;
    if (content === undefined) return;
    const text =
      typeof content === 'string'
        ? content
        : content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('');
    // Trust raw child text only while it is present verbatim in model-visible
    // content; otherwise validate the visible wrapper, including host edits.
    const raw =
      'output' in output &&
      typeof output.output === 'string' &&
      text.includes(output.output)
        ? output.output
        : undefined;
    const message = raw ?? text;
    if (
      !message
        .trim()
        .split(/\r\n|\r|\n/)
        .includes('```thoth-result')
    )
      return;

    // Only an adapter-owned tail (or a newly appended part) is cached.
    const end = text.lastIndexOf('</subagent>');
    const tail = end < 0 ? '' : text.slice(end + '</subagent>'.length);
    if (
      tail
        .split(/\r\n|\r|\n/)
        .some((line) => line.startsWith('thoth-gate-verdict '))
    )
      return;
    if (
      Array.isArray(content) &&
      content.some((part) => {
        if (part.type !== 'text') return false;
        const lines = part.text.split(/\r\n|\r|\n/);
        return (
          lines.length === 3 &&
          lines[0] === '' &&
          lines[1] === '' &&
          lines[2].startsWith('thoth-gate-verdict ')
        );
      })
    )
      return;
    // Raw output must be bare; only fallback content may use native framing.
    const bare = raw === undefined || !raw.trimStart().startsWith('<subagent ');
    const summary = {
      ...summarizeGateResult(bare ? message : '', { cwd: ctx.directory }),
      agent: 'oracle',
    };
    const verdict = formatGateVerdict(summary);
    // A new text part is model-visible without rewriting any native parts.
    event.result = {
      ...event.result,
      content:
        typeof content === 'string'
          ? `${content}\n\n${verdict}`
          : [...content, { type: 'text', text: `\n\n${verdict}` }],
    };
    // Malformed fallback wrappers may have no adapter-owned closing tail.
    delivered.add(event.result);
  };
}
