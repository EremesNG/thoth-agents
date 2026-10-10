import { expect, it } from 'vitest';
import {
  registerRenderKit,
  type WorkPanelRow,
  withdrawRenderKit,
} from '../src/index.js';
import {
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
  workPanelRowLineCount,
} from '../src/panel.js';
import { createTestRenderKit } from '../src/testing.js';

it('measures exactly the rendered responsive row height with and without a kit', () => {
  const rows: WorkPanelRow[] = [
    { id: 'plain', primary: 'plain', status: 'running' },
    { id: 'extra', primary: 'plain', extraRows: ['one', ' ', 'two'] },
    {
      id: 'metric',
      primary: 'wide 界 title',
      identity: [{ text: 'wide 界 title', role: 'primary' }],
      metrics: [
        {
          segments: [
            {
              text: 'a very long metric continuation with 界 characters',
              role: 'meta',
            },
          ],
        },
        { segments: [{ text: '12s', role: 'meta' }] },
      ],
    },
  ];
  for (const withKit of [false, true]) {
    const token = withKit
      ? registerRenderKit(createTestRenderKit(), {})
      : undefined;
    try {
      for (const row of rows)
        for (const width of [0, 1, 12, 24, 40, 68]) {
          expect(workPanelRowLineCount(row, width, panelVisibleWidth)).toBe(
            renderWorkPanelRow(row, {
              width,
              now: 1000,
              theme: { fg: (_role, text) => text },
              clip: truncatePanelText,
              measure: panelVisibleWidth,
            }).length,
          );
        }
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
});
