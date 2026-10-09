export type PanelKey =
  | 'up'
  | 'down'
  | 'right'
  | 'left'
  | 'home'
  | 'end'
  | 'pageUp'
  | 'pageDown'
  | 'enter'
  | 'escape'
  | 'backspace'
  | 'space'
  | 'ctrl+u';

export const panelKeySequences: Record<PanelKey, readonly string[]> = {
  up: ['\u001b[A', '\u001bOA'],
  down: ['\u001b[B', '\u001bOB'],
  right: ['\u001b[C', '\u001bOC'],
  left: ['\u001b[D', '\u001bOD'],
  home: ['\u001b[H', '\u001b[1~', '\u001bOH', '\u001b[7~'],
  end: ['\u001b[F', '\u001b[4~', '\u001bOF', '\u001b[8~'],
  pageUp: ['\u001b[5~'],
  pageDown: ['\u001b[6~'],
  enter: ['\r', '\n', '\u001bOM'],
  escape: ['\u001b', '\u0003'],
  backspace: ['\u007f', '\b'],
  space: [' '],
  'ctrl+u': ['\u0015'],
};

/** Peer-free matching preserves the Work host's canonical-key fallback. */
export function matchesPanelKey(
  data: string,
  key: PanelKey,
  nativeMatcher?: (data: string, key: PanelKey) => boolean,
): boolean {
  return nativeMatcher?.(data, key) ?? data === panelKeySequences[key][0];
}
