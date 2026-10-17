import { expect, it } from 'vitest';
import type { WorkPanelRow } from '../src/index.js';
import {
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
} from '../src/panel.js';

/** Background provider shape: HEAD's flat segments plus the sidebar's identity/metrics. */
function row(name: string, withColumns: boolean): WorkPanelRow {
  const status = 'process running';
  return {
    id: 'bg',
    name,
    primary: status,
    status: 'running',
    state: 'running',
    elapsed: '1m 00s',
    segments: [
      { text: name, role: 'primary' },
      { text: ` · ${status}`, role: 'secondary' },
      { text: ' · 1m 00s', role: 'meta' },
    ],
    ...(withColumns
      ? {
          identity: [
            { text: name, role: 'primary' as const },
            { text: ' · ', role: 'meta' as const },
            { text: status, role: 'secondary' as const },
          ],
          metrics: [
            {
              key: 'elapsed' as const,
              segments: [{ text: '1m 00s', role: 'meta' as const }],
            },
          ],
        }
      : {}),
  };
}

const render = (r: WorkPanelRow, width: number, layout: 'greedy' | 'grid') =>
  renderWorkPanelRow(r, {
    width,
    now: 0,
    theme: { fg: (_role: string, text: string) => text },
    clip: truncatePanelText,
    measure: panelVisibleWidth,
    metricLayout: layout,
  });

it.each([
  'greedy',
  'grid',
] as const)('above-editor host renders sidebar-enabled flat rows exactly as before (%s)', (layout) => {
  for (const name of ['start integration server', 'build']) {
    for (const width of [36, 50, 80]) {
      const current = render(row(name, true), width, layout);
      expect(current, `${name}/${width}`).toHaveLength(1);
      expect(current).toEqual(render(row(name, false), width, layout));
    }
  }
});
