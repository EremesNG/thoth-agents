import { matchesKey as matchesNativeKey } from '@earendil-works/pi-tui';

import {
  matchesPanelKey as matchPanelKey,
  type PanelKey,
  panelKeySequences,
} from './panel-key.js';

export type { PanelKey } from './panel-key.js';

/** Native key matching without list-editor aliases (e.g. Ctrl-C as Escape). */
export function matchesPanelKey(data: string, key: PanelKey): boolean {
  return matchPanelKey(data, key, matchesNativeKey);
}

export interface PanelMouseEvent {
  type?: string;
  button?: string;
  row?: number;
  y?: number;
  col?: number;
  x?: number;
  wheelDelta?: number;
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

export function panelMouseWheelDelta(data: string): -1 | 1 | undefined {
  const mouse = rawMouse(data);
  if (!mouse || (mouse.button & 64) === 0) return undefined;
  return (mouse.button & 1) === 0 ? -1 : 1;
}

export function panelMouseClick(data: string): PanelMouseEvent | undefined {
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

/** Preserve ordinary input and case for adapter actions and typed filters. */
export function normalizePanelKey(
  data: string,
  matchesKey?: (data: string, key: PanelKey) => boolean,
): string {
  if (matchesNativeKey(data, 'ctrl+c')) return 'escape';
  const keys = Object.keys(panelKeySequences) as PanelKey[];
  const raw = keys.find((key) => panelKeySequences[key].includes(data));
  return (
    raw ??
    keys.find((key) => matchesKey?.(data, key) || matchesPanelKey(data, key)) ??
    data
  );
}
