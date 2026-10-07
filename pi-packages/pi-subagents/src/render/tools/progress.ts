import {
  resolveFrames,
  resolveIcon,
  resolveStatusGlyph,
} from '@thoth-agents/pi-core';
import type { SubagentTask } from '../types.js';
import { formatUsage } from './formatting.js';

const RUNNING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function statusGlyph(status: string, frame = 0, ui = true): string {
  if (status === 'running') {
    const frames = ui
      ? resolveFrames('spinnerFrames', RUNNING_FRAMES)
      : RUNNING_FRAMES;
    const index = Number.isFinite(frame) ? Math.floor(frame) : 0;
    return frames[((index % frames.length) + frames.length) % frames.length]!;
  }
  switch (status) {
    case 'completed':
      return ui ? resolveStatusGlyph('completed', '✓') : '✓';
    case 'failed':
      return ui ? resolveStatusGlyph('failed', '✗') : '✗';
    case 'cancelled':
    case 'interrupted':
    case 'stopping':
      return ui ? resolveStatusGlyph(status, '■') : '■';
    case 'queued':
      return ui ? resolveStatusGlyph('queued', '○') : '○';
    default:
      return ui ? resolveStatusGlyph('unknown', '?') : '?';
  }
}

export function progressText(
  tasks: SubagentTask[],
  frame = 0,
  options: {
    backgroundable?: boolean;
    backgroundShortcut?: string;
    runtime?: string;
    /** Opt in only for rendered progress; raw tool updates remain mode-invariant. */
    ui?: boolean;
  } = {},
): string {
  const spinner = statusGlyph('running', frame, options.ui === true);
  const active = tasks.find((task) => task.status === 'running') ?? tasks[0];
  if (!active)
    return `${spinner} Starting subagent${options.ui ? resolveIcon('ellipsis', '…') : '…'}`;
  const usage = [formatUsage(active, options.ui), options.runtime]
    .filter(Boolean)
    .join(` ${options.ui ? resolveIcon('separator', '·') : '·'} `);
  const activityLines = active.live_activity?.trail?.length
    ? active.live_activity.trail.map((entry) => `↳ ${entry.label}`)
    : [`↳ ${active.last_activity ?? active.task ?? active.id}`];
  return [
    `${statusGlyph(active.status, frame, options.ui === true)} agent: ${active.agent} ${options.ui ? resolveIcon('separator', '·') : '·'} status: ${active.status} ${options.ui ? resolveIcon('separator', '·') : '·'} attempt: ${active.attempt ?? 1} ${options.ui ? resolveIcon('separator', '·') : '·'} effort: ${active.effort ?? 'default/current'}`,
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
