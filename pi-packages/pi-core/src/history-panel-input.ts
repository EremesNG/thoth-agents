export {
  type PanelMouseEvent as HistoryPanelMouseEvent,
  panelMouseClick as historyPanelMouseClick,
  panelMouseWheelDelta as historyPanelMouseWheelDelta,
} from './panel-input.js';

const RAW_KEYS: Record<string, readonly string[]> = {
  escape: ['\u001b'],
  'ctrl+c': ['\u0003'],
  'ctrl+o': ['\u000f'],
  'ctrl+t': ['\u0014'],
  'ctrl+w': ['\u0017'],
  q: ['q', 'Q'],
  up: ['\u001b[A'],
  down: ['\u001b[B'],
  right: ['\u001b[C'],
  left: ['\u001b[D'],
  pageUp: ['\u001b[5~'],
  pageDown: ['\u001b[6~'],
  home: ['\u001b[H', '\u001b[1~', '\u001bOH'],
  end: ['\u001b[F', '\u001b[4~', '\u001bOF'],
};

const KEYBINDINGS: Record<string, readonly string[]> = {
  escape: ['app.interrupt', 'tui.select.cancel'],
  'ctrl+c': ['tui.select.cancel'],
  up: ['tui.select.up', 'tui.editor.cursorUp'],
  down: ['tui.select.down', 'tui.editor.cursorDown'],
  right: ['tui.editor.cursorRight'],
  left: ['tui.editor.cursorLeft'],
  pageUp: ['tui.select.pageUp', 'tui.editor.pageUp'],
  pageDown: ['tui.select.pageDown', 'tui.editor.pageDown'],
  home: ['tui.editor.cursorLineStart'],
  end: ['tui.editor.cursorLineEnd'],
};

/** SDK action bindings plus raw terminal fallback; extra bindings support adapter-owned keys. */
export function createHistoryPanelKeyMatcher(
  keybindings?: { matches?: (data: string, keybinding: string) => boolean },
  extraBindings: Record<string, readonly string[]> = {},
): (data: string, key: string) => boolean {
  return (data, key) =>
    (extraBindings[key] ?? KEYBINDINGS[key])?.some((binding) =>
      keybindings?.matches?.(data, binding),
    ) === true ||
    (RAW_KEYS[key]?.includes(data) ?? data === key);
}
