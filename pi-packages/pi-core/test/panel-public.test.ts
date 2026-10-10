import { expect, it, vi } from 'vitest';

vi.mock('@earendil-works/pi-coding-agent', () => {
  throw new Error('optional SDK absent');
});

it('publishes the TUI panel subpath without a runtime coding-agent dependency', async () => {
  const panel = await import('@thoth-agents/pi-core/panel');
  expect(panel.panelVisibleWidth('界')).toBe(2);
  expect(panel.normalizePanelKey('\u0003')).toBe('escape');
  expect(typeof panel.createListEditor).toBe('function');
  expect(typeof panel.openPanelOverlay).toBe('function');
  expect(typeof panel.workPanelRenderStatus).toBe('function');
  expect(typeof panel.workPanelRowLineCount).toBe('function');
  const history = await import('@thoth-agents/pi-core/history-panel');
  expect(history.historyPanelMouseWheelDelta).toBe(panel.panelMouseWheelDelta);
});
