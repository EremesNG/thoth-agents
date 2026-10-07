export interface HistoryPanelMouseEvent {
  type?: string;
  button?: string;
  row?: number;
  y?: number;
  col?: number;
  x?: number;
  wheelDelta?: number;
}

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

function rawMouse(
  data: string,
): { button: number; col: number; row: number } | undefined {
  if (!data.startsWith('\u001b[')) return undefined;
  const payload = data.slice(2);
  const sgr = payload.match(/^<(\d+);(\d+);(\d+)M$/);
  const urxvt = payload.match(/^(\d+);(\d+);(\d+)M$/);
  const match = sgr ?? urxvt;
  if (match) {
    const rawButton = Number(match[1]);
    return {
      button: urxvt && rawButton >= 32 ? rawButton - 32 : rawButton,
      col: Number(match[2]) - 1,
      row: Number(match[3]) - 1,
    };
  }
  if (data.startsWith('\u001b[M') && data.length >= 6) {
    return {
      button: data.charCodeAt(3) - 32,
      col: data.charCodeAt(4) - 33,
      row: data.charCodeAt(5) - 33,
    };
  }
  return undefined;
}

export function historyPanelMouseWheelDelta(data: string): -1 | 1 | undefined {
  const mouse = rawMouse(data);
  if (!mouse || (mouse.button & 64) === 0) return undefined;
  return (mouse.button & 1) === 0 ? -1 : 1;
}

export function historyPanelMouseClick(
  data: string,
): HistoryPanelMouseEvent | undefined {
  const mouse = rawMouse(data);
  if (!mouse) return undefined;
  const isLeftClick =
    mouse.button === 0 ||
    (data.startsWith('\u001b[M') &&
      (mouse.button & 64) === 0 &&
      (mouse.button & 3) === 0);
  if (!isLeftClick) return undefined;
  return { type: 'click', row: mouse.row, col: mouse.col };
}
