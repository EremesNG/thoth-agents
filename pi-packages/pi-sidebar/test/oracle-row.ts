import type { WorkPanelMetricKey } from '@thoth-agents/pi-core';

export type Mode = 'native' | 'kit';

export const SUMMARY = 'reviewing the migration plan';
export const sep = ' · ';

/**
 * Mirrors the subagents provider `taskRow` for a `thoth-oracle` task: label text per render
 * mode, the `thoth-` prefix supplied as compact name text, and the identity warning.
 */
export function oracleRow(
  mode: Mode,
  status: 'running' | 'completed' | 'failed',
  elapsed: string,
  warnings: readonly string[] = [],
) {
  const kit = mode === 'kit';
  const label = (icon: string, text: string) => (kit ? icon : text);
  const add = (key: WorkPanelMetricKey, prefix: string, value: string) => ({
    key,
    segments: [
      { text: prefix, role: 'meta' as const },
      { text: value, role: 'meta' as const },
    ],
  });
  const tokens = [
    ['in ', '↑', '12k', 'in'],
    ['out ', '↓', '3.4k', 'out'],
  ] as const;
  const live = status === 'running';
  return {
    id: `${status}-oracle`,
    name: 'thoth-oracle',
    primary: SUMMARY,
    status,
    state: live ? ('running' as const) : ('done' as const),
    ...(live ? {} : { endedAt: Date.now() }),
    sortStartedAt: 1,
    statusGlyph: status as never,
    identity: [
      { text: 'thoth-oracle', compact: 'oracle', role: 'primary' as const },
      { text: sep, role: 'meta' as const },
      { text: SUMMARY, role: 'secondary' as const },
      ...warnings.flatMap((text) => [
        { text: sep, role: 'meta' as const },
        { text, role: 'warning' as const },
      ]),
    ],
    metrics: [
      {
        key: 'model' as const,
        columnsOnly: true,
        segments: [{ text: 'gpt-5·hi', role: 'meta' as const }],
      },
      add('tools', `${label('*', 'tools')} `, '7'),
      {
        key: 'tokens' as const,
        segments: tokens.flatMap(([word, arrow, value, direction], index) => [
          ...(index ? [{ text: ' ', role: 'meta' as const }] : []),
          {
            text: kit ? arrow : word,
            role: 'meta' as const,
            direction: direction as 'in' | 'out',
          },
          {
            text: value,
            role: 'meta' as const,
            direction: direction as 'in' | 'out',
          },
        ]),
      },
      add('context', 'ctx ', '41.0%'),
      kit
        ? add('speed', 'tok/s ', '88')
        : {
            key: 'speed' as const,
            segments: [{ text: '88 tok/s', role: 'meta' as const }],
          },
      add('cost', '$', '0.42'),
      add('elapsed', `${label('◷', 'elapsed')} `, elapsed),
    ],
  };
}
