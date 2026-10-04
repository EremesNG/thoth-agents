import type { SubagentTask } from '../types.js';
import { formatUsage } from './formatting.js';

const RUNNING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function statusGlyph(status: string, frame = 0): string {
  switch (status) {
    case 'running':
      return RUNNING_FRAMES[
        ((Math.floor(frame) % RUNNING_FRAMES.length) + RUNNING_FRAMES.length) %
          RUNNING_FRAMES.length
      ]!;
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'cancelled':
    case 'interrupted':
    case 'stopping':
      return '■';
    case 'queued':
      return '○';
    default:
      return '?';
  }
}

export function progressText(
  tasks: SubagentTask[],
  frame = 0,
  options: {
    backgroundable?: boolean;
    backgroundShortcut?: string;
    runtime?: string;
  } = {},
): string {
  const spinner = statusGlyph('running', frame);
  const active = tasks.find((task) => task.status === 'running') ?? tasks[0];
  if (!active) return `${spinner} Starting subagent…`;
  const usage = [formatUsage(active), options.runtime]
    .filter(Boolean)
    .join(' · ');
  const activityLines = active.live_activity?.trail?.length
    ? active.live_activity.trail.map((entry) => `↳ ${entry.label}`)
    : [`↳ ${active.last_activity ?? active.task ?? active.id}`];
  return [
    `${statusGlyph(active.status, frame)} agent: ${active.agent} · status: ${active.status} · attempt: ${active.attempt ?? 1} · effort: ${active.effort ?? 'default/current'}`,
    `↳ model: ${active.model ?? 'starting'}`,
    usage ? `↳ usage: ${usage}` : undefined,
    ...activityLines,
    options.backgroundable
      ? `↳ ${options.backgroundShortcut ?? 'ctrl+h'} to send to background`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}
