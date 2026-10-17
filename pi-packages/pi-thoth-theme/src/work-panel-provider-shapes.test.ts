import {
  registerRenderKit,
  resolveIcon,
  type WorkPanelRow,
  type WorkPanelSegment,
  type WorkPanelStatusGlyph,
  type WorkPanelStatusTone,
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

/*
 * Rows mirror the exact shapes the providers emit (this package cannot import them):
 *  - Background: pi-background-tasks/src/navigator-provider.ts rowFromMeta (identity
 *    [name, meta separator, secondary status], one elapsed metric, statusGlyph + statusTone).
 *  - Agents: pi-subagents/src/ui/work-panel-provider.ts taskRow (identity [name, meta sep,
 *    secondary summary, then meta separator + warning per warning], keyed metrics with
 *    structured token segments around a gap).
 */
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
const ESC = String.fromCharCode(27);
const tag = (role: string, text: string) =>
  `${ESC}[${ROLES.indexOf(role) + 30}m${text}${ESC}[0m`;

function parseRoles(line: string): Array<readonly [string, string]> {
  const spans: Array<readonly [string, string]> = [];
  const stack: string[] = [];
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

const meta = (text: string): WorkPanelSegment => ({ text, role: 'meta' });
const sep = () => ` ${resolveIcon('separator', '·')} `;

interface Case {
  name: string;
  row: WorkPanelRow;
  glyph: string;
  elapsed: string;
  /** Expected role of the summary text, when the row shows one. */
  summary: string;
  agent: boolean;
}

function background(
  label: string,
  glyph: WorkPanelStatusGlyph,
  tone: WorkPanelStatusTone,
  state: 'running' | 'done' | 'failed',
  statusText: string,
  glyphRole: string,
  elapsedRole: string,
): Case {
  return {
    name: label,
    glyph: glyphRole,
    elapsed: elapsedRole,
    summary: state === 'running' ? 'text' : 'muted',
    agent: false,
    row: {
      id: label,
      primary: statusText,
      status: label,
      statusGlyph: glyph,
      statusTone: tone,
      state,
      ...(state === 'running' ? {} : { endedAt: Date.now() }),
      identity: [
        { text: 'thoth-worker', role: 'primary' },
        { text: sep(), role: 'meta' },
        { text: statusText, role: 'secondary' },
      ],
      metrics: [{ key: 'elapsed', segments: [meta('1m 00s')] }],
    },
  };
}

function agent(
  label: string,
  status: 'running' | 'completed' | 'failed' | 'timedOut' | 'cancelled',
  glyphRole: string,
  elapsedRole: string,
  warnings: string[],
  directions: Array<'in' | 'out'> = ['in', 'out'],
): Case {
  const live = status === 'running';
  return {
    name: `agent-${label}`,
    glyph: glyphRole,
    elapsed: elapsedRole,
    summary: live ? 'text' : 'muted',
    agent: true,
    row: {
      id: label,
      primary: 'inspect',
      status,
      statusGlyph: status,
      state: live ? 'running' : status === 'completed' ? 'done' : 'failed',
      ...(live ? {} : { endedAt: Date.now() }),
      identity: [
        { text: 'thoth-worker', role: 'primary' },
        { text: sep(), role: 'meta' },
        { text: 'inspect', role: 'secondary' },
        ...warnings.flatMap((text) => [
          { text: sep(), role: 'meta' as const },
          { text, role: 'warning' as const },
        ]),
      ],
      metrics: [
        { key: 'model', columnsOnly: true, segments: [meta('sonnet·hi')] },
        {
          key: 'tokens',
          // Provider shape: each direction's glyph and value carry the marker; the gap does not.
          segments: directions.flatMap((direction, index) => [
            ...(index ? [meta(' ')] : []),
            {
              ...meta(
                resolveIcon(direction === 'in' ? 'tokensIn' : 'tokensOut'),
              ),
              direction,
            },
            { ...meta(direction === 'in' ? '20k' : '10k'), direction },
          ]),
        },
        { key: 'cost', segments: [meta('$'), meta('0.42')] },
        { key: 'elapsed', segments: [meta('elapsed '), meta('1m 00s')] },
      ],
    },
  };
}

function cases(): Case[] {
  return [
    background(
      'running',
      'running',
      'running',
      'running',
      'process running',
      'accent',
      'accent',
    ),
    background(
      'succeeded',
      'completed',
      'success',
      'done',
      'completed',
      'success',
      'dim',
    ),
    background(
      'failed',
      'failed',
      'failed',
      'failed',
      'failed, inspect log',
      'error',
      'error',
    ),
    background(
      'timed_out',
      'timedOut',
      'failed',
      'failed',
      'timed out',
      'warning',
      'warning',
    ),
    background(
      'cancelled',
      'cancelled',
      'muted',
      'failed',
      'cancelled',
      'muted',
      'muted',
    ),
    background(
      'expectedExit',
      'expectedExit',
      'muted',
      'failed',
      'exit 1 expected',
      'dim',
      'dim',
    ),
    background(
      'resolved',
      'resolved',
      'muted',
      'failed',
      'failed, resolved',
      'muted',
      'muted',
    ),
    ...(
      [
        ['running', 'accent', 'accent'],
        ['completed', 'success', 'dim'],
        ['failed', 'error', 'error'],
        ['timedOut', 'warning', 'warning'],
        ['cancelled', 'muted', 'muted'],
      ] as const
    ).flatMap(([status, g, e]) => [
      agent(status, status, g, e, []),
      agent(`${status}-dropped`, status, g, e, [
        `${resolveIcon('warning', '⚠')} 2 dropped`,
      ]),
      agent(`${status}-limit`, status, g, e, [
        'anthropic/five_hour: rate limited · reset 17:30',
      ]),
      agent(`${status}-both`, status, g, e, [
        `${resolveIcon('warning', '⚠')} 2 dropped`,
        'anthropic/five_hour: rate limited · reset 17:30',
      ]),
      agent(`${status}-out-only`, status, g, e, [], ['out']),
      agent(`${status}-in-only`, status, g, e, [], ['in']),
    ]),
  ];
}

it.each([
  'unicode',
  'nerd',
  'ascii',
] as IconMode[])('provider-shaped rows keep every AC-6 role (%s icons)', (mode) => {
  const token = registerRenderKit(createRenderKit({}, undefined, mode), {});
  try {
    for (const c of cases()) {
      for (const width of [36, 50, 72, 140]) {
        const ctx = `${mode}/${c.name}/${width}`;
        const lines = renderWorkPanelRow(c.row, {
          width,
          now: Date.now(),
          theme: { fg: tag },
          clip: truncatePanelText,
          measure: panelVisibleWidth,
          metricLayout: 'columns',
          metricGrid: createWorkPanelColumnPlan(
            [c.row],
            width,
            panelVisibleWidth,
          ),
        });
        expect(lines, ctx).toHaveLength(1);
        const spans = parseRoles(lines[0]);
        const nameAt = spans.findIndex(([role]) => role === 'toolTitle');
        expect(nameAt, `${ctx} name`).toBeGreaterThan(1);
        expect(spans[nameAt][1].startsWith('t'), `${ctx} name text`).toBe(true);
        expect(spans[nameAt - 2][0], `${ctx} glyph`).toBe(c.glyph);
        const elapsed = spans.find(([, text]) => text.includes('1m 00s'));
        expect(elapsed?.[0], `${ctx} elapsed`).toBe(c.elapsed);
        for (const [role, text] of spans) {
          // Every pure separator run is dim, including those before warnings.
          if (text === sep()) expect(role, `${ctx} separator`).toBe('dim');
          if (
            /^(inspect|process|completed|failed|timed|cancel|exit)/u.test(text)
          )
            expect(role, `${ctx} summary`).toBe(c.summary);
          const warned =
            /dropped|rate limited|five_h|anthropic|reset|:dd/u.test(text);
          if (warned) expect(role, `${ctx} warning`).toBe('warning');
          const bare = text.trim();
          if (bare === '20k' || bare === resolveIcon('tokensIn').trim())
            expect(role, `${ctx} tokens in`).toBe('accent');
          if (bare === '10k' || bare === resolveIcon('tokensOut').trim())
            expect(role, `${ctx} tokens out`).toBe('success');
          if (text.includes('0.42'))
            expect(role, `${ctx} cost`).toBe('warning');
          if (text.includes('sonnet'))
            expect(role, `${ctx} model`).toBe('muted');
        }
        if (width === 140 && c.name.endsWith('-both')) {
          const kinds = spans
            .filter(([role]) => role === 'warning')
            .map(([, text]) => text);
          expect(
            kinds.some((t) => t.includes('dropped')),
            ctx,
          ).toBe(true);
          expect(
            kinds.some((t) => t.includes('rate limited')),
            ctx,
          ).toBe(true);
          // A warning never swallows the separator that precedes it.
          for (const t of kinds)
            expect(t.startsWith(sep().trim()), ctx).toBe(false);
        }
        if (width === 140 && c.name.endsWith('-out-only')) {
          const all = spans.map(([, text]) => text).join('');
          expect(all, ctx).toContain('10k');
          expect(all, ctx).not.toContain('20k');
        }
        // At 140 cells the full agent row shows every metric column.
        if (c.agent && width === 140 && c.name.endsWith('running')) {
          const all = spans.map(([, text]) => text).join('');
          expect(all).toContain('0.42');
          expect(all).toContain(resolveIcon('tokensOut'));
        }
      }
    }
  } finally {
    withdrawRenderKit(token);
  }
});
