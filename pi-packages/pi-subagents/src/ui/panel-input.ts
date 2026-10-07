import {
  createHistoryPanelKeyMatcher,
  historyPanelMouseWheelDelta,
} from '@thoth-agents/pi-core/history-panel';

export { historyPanelMouseWheelDelta as subagentsPanelMouseWheelDelta };

export function createSubagentsPanelKeyMatcher(keybindings?: {
  matches?: (data: string, keybinding: string) => boolean;
}) {
  return createHistoryPanelKeyMatcher(keybindings, {
    'ctrl+o': ['app.tools.expand'],
    'ctrl+t': ['app.thinking.toggle'],
    detailCancel: ['subagents.detail.cancel'],
  });
}

export function classifySubagentsPanelInput(
  data: string,
  matchesPanelKey: (data: string, key: string) => boolean,
): { category: string; action: string } {
  if (
    matchesPanelKey(data, 'escape') ||
    matchesPanelKey(data, 'ctrl+c') ||
    matchesPanelKey(data, 'q')
  )
    return { category: 'lifecycle', action: 'close' };
  if (matchesPanelKey(data, 'ctrl+o') || data === '\u000f')
    return { category: 'display', action: 'toggle_expand' };
  if (matchesPanelKey(data, 'ctrl+t') || data === '\u0014')
    return { category: 'display', action: 'toggle_thinking' };
  if (matchesPanelKey(data, 'detailCancel'))
    return { category: 'task', action: 'cancel_selected' };
  const wheel = historyPanelMouseWheelDelta(data);
  if (wheel === -1) return { category: 'scroll', action: 'up' };
  if (wheel === 1) return { category: 'scroll', action: 'down' };
  if (matchesPanelKey(data, 'right'))
    return { category: 'navigation', action: 'right' };
  if (matchesPanelKey(data, 'left'))
    return { category: 'navigation', action: 'left' };
  if (matchesPanelKey(data, 'down'))
    return { category: 'navigation', action: 'down' };
  if (matchesPanelKey(data, 'up'))
    return { category: 'navigation', action: 'up' };
  if (matchesPanelKey(data, 'pageDown'))
    return { category: 'scroll', action: 'page_down' };
  if (matchesPanelKey(data, 'pageUp'))
    return { category: 'scroll', action: 'page_up' };
  if (matchesPanelKey(data, 'home'))
    return { category: 'scroll', action: 'home' };
  if (matchesPanelKey(data, 'end'))
    return { category: 'scroll', action: 'end' };
  return { category: 'other', action: 'unmatched' };
}
