import {
  registerRenderKit,
  resolveIcon,
  type WorkPanelRow,
  type WorkPanelSegment,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import {
  createWorkPanelColumnPlan,
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
} from '@thoth-agents/pi-core/panel';
import { expect, it } from 'vitest';
import { createRenderKit } from './render-kit/index.ts';
import type { IconMode } from './shared/config.ts';

type Status =
  | 'running'
  | 'completed'
  | 'failed'
  | 'timedOut'
  | 'cancelled'
  | 'resolved'
  | 'expectedExit';
const STATUSES: Status[] = [
  'running',
  'completed',
  'failed',
  'timedOut',
  'cancelled',
  'resolved',
  'expectedExit',
];
const TERMINAL = new Set<Status>([
  'completed',
  'failed',
  'timedOut',
  'cancelled',
  'resolved',
  'expectedExit',
]);

/** Exact theme role of the status glyph and, from it, of the elapsed column. */
const GLYPH_ROLE: Record<Status, string> = {
  running: 'accent',
  completed: 'success',
  failed: 'error',
  timedOut: 'warning',
  cancelled: 'muted',
  resolved: 'muted',
  expectedExit: 'dim',
};
const ELAPSED_ROLE: Record<Status, string> = {
  ...GLYPH_ROLE,
  completed: 'dim',
};

/** Provider-shaped row: structured token direction segments, keyed metric groups. */
function row(status: Status, withMetrics: boolean): WorkPanelRow {
  const meta = (text: string): WorkPanelSegment => ({ text, role: 'meta' });
  const metrics = withMetrics
    ? [
        {
          key: 'model' as const,
          columnsOnly: true,
          segments: [meta('sonnet·hi')],
        },
        {
          key: 'tokens' as const,
          segments: [
            { ...meta(resolveIcon('tokensIn')), direction: 'in' as const },
            { ...meta('20k'), direction: 'in' as const },
            meta(' '),
            { ...meta(resolveIcon('tokensOut')), direction: 'out' as const },
            { ...meta('10k'), direction: 'out' as const },
          ],
        },
        { key: 'cost' as const, segments: [meta('$'), meta('0.42')] },
        {
          key: 'elapsed' as const,
          segments: [meta('elapsed '), meta('1m 00s')],
        },
      ]
    : [];
  return {
    id: status,
    primary: 'inspect',
    name: 'worker',
    status,
    statusGlyph: status,
    state:
      status === 'running'
        ? 'running'
        : status === 'completed'
          ? 'done'
          : 'failed',
    ...(status === 'running' ? {} : { endedAt: Date.now() }),
    identity: [
      { text: 'worker', role: 'primary' },
      { text: ` ${resolveIcon('separator')} `, role: 'meta' },
      { text: 'inspect', role: 'secondary' },
    ],
    metrics,
  };
}

const ROLES = [
  'accent',
  'success',
  'error',
  'warning',
  'muted',
  'dim',
  'text',
  'toolTitle',
];
// SGR-shaped tags keep width measurement identical to a real themed terminal.
const ESC = String.fromCharCode(27);
const tag = (role: string, text: string) =>
  `${ESC}[${ROLES.indexOf(role) + 30}m${text}${ESC}[0m`;

/** Innermost role wins for each text run; nested wrappers are flattened. */
function parseRoles(line: string): Array<readonly [string, string]> {
  const spans: Array<readonly [string, string]> = [];
  const stack: string[] = [];
  // Every chunk after an ESC starts with "[<code>m" followed by its text.
  const [head, ...chunks] = line.split(ESC);
  if (head) spans.push(['none', head]);
  for (const chunk of chunks) {
    const code = chunk.slice(1, chunk.indexOf('m'));
    const text = chunk.slice(chunk.indexOf('m') + 1);
    if (code === '0') stack.pop();
    else stack.push(ROLES[Number(code) - 30]);
    if (text) spans.push([stack.at(-1) ?? 'none', text]);
  }
  return spans;
}

const modes: IconMode[] = ['unicode', 'nerd', 'ascii'];

it.each(
  modes,
)('applies every AC-6 role with the real kit (%s icons)', (mode) => {
  const token = registerRenderKit(createRenderKit({}, undefined, mode), {});
  try {
    for (const status of STATUSES) {
      for (const withMetrics of [true, false]) {
        const item = row(status, withMetrics);
        const [line] = renderWorkPanelRow(item, {
          metricGrid: createWorkPanelColumnPlan([item], 100, panelVisibleWidth),
          width: 100,
          now: Date.now(),
          theme: { fg: tag },
          clip: truncatePanelText,
          measure: panelVisibleWidth,
          metricLayout: 'columns',
        });
        const spans = parseRoles(line);
        const has = (role: string, part: string) =>
          spans.some(([r, t]) => r === role && t.includes(part));
        const ctx = `${mode}/${status}/${withMetrics}`;
        // Glyph span: two spans before the name (a plain gap sits between them).
        const nameAt = spans.findIndex(
          ([r, t]) => r === 'toolTitle' && t === 'worker',
        );
        expect(spans[nameAt - 1], ctx).toEqual(['none', ' ']);
        expect(spans[nameAt - 2][0], ctx).toBe(GLYPH_ROLE[status]);
        expect(spans[nameAt - 2][1], ctx).not.toBe('');
        expect(has('toolTitle', 'worker'), ctx).toBe(true);
        // Active summary is normal text; terminal summaries are muted.
        expect(
          has(TERMINAL.has(status) ? 'muted' : 'text', 'inspect'),
          ctx,
        ).toBe(true);
        expect(has('dim', ` ${resolveIcon('separator')} `), ctx).toBe(true);
        if (!withMetrics) continue;
        expect(has(ELAPSED_ROLE[status], '1m 00s'), ctx).toBe(true);
        expect(has('warning', '0.42'), ctx).toBe(true);
        expect(has('muted', 'sonnet'), ctx).toBe(true);
        const inGlyph = resolveIcon('tokensIn');
        const outGlyph = resolveIcon('tokensOut');
        expect(has('accent', '20k') && has('accent', inGlyph.trim()), ctx).toBe(
          true,
        );
        expect(
          has('success', '10k') && has('success', outGlyph.trim()),
          ctx,
        ).toBe(true);
        expect(has('accent', '10k'), ctx).toBe(false);
        expect(has('success', '20k'), ctx).toBe(false);
      }
    }
  } finally {
    withdrawRenderKit(token);
  }
});
