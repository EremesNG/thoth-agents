import { describe, expect, it } from 'vitest';
import {
  historyPanelMouseClick,
  historyPanelMouseWheelDelta,
} from '../src/history-panel-input.js';
import {
  matchesPanelKey,
  normalizePanelKey,
  panelMouseClick,
  panelMouseWheelDelta,
} from '../src/panel.js';

describe('panel input', () => {
  it('supports adapter keybindings without overriding literal terminal controls', () => {
    const matches = (data: string, key: string) =>
      data === 'custom-up' && key === 'up';
    expect(normalizePanelKey('custom-up', matches)).toBe('up');
    expect(normalizePanelKey('\u0003', () => true)).toBe('escape');
  });

  it.each([
    '\x1b[99;5u',
    '\x1b[99;5:1u',
  ])('normalizes native Ctrl-C %j before adapter bindings without changing native Escape matching', (data) => {
    expect(normalizePanelKey(data)).toBe('escape');
    expect(normalizePanelKey(data, () => true)).toBe('escape');
    expect(matchesPanelKey(data, 'escape')).toBe(false);
  });

  it('does not collapse modified native keys into unmodified actions', () => {
    for (const data of [
      '\x1b[13;2u',
      '\x1b[1;5A',
      '\x1b[32;3u',
      '\x1b[99;1u',
      '\x1b[99;3u',
      '\x1b[99;6u',
    ])
      expect(normalizePanelKey(data)).toBe(data);
  });

  it.each([
    ['\u001b[13u', 'enter'],
    ['\u001b[13;1u', 'enter'],
    ['\u001b[57414u', 'enter'],
    ['\u001b[27u', 'escape'],
    ['\u001b[57419u', 'up'],
    ['\u001b[57420u', 'down'],
    ['\u001b[57418u', 'right'],
    ['\u001b[57417u', 'left'],
    ['\u001b[1;1A', 'up'],
    ['\u001b[1;1B', 'down'],
    ['\u001b[1;1C', 'right'],
    ['\u001b[1;1D', 'left'],
    ['\u001b[57423u', 'home'],
    ['\u001b[57424u', 'end'],
    ['\u001b[57421u', 'pageUp'],
    ['\u001b[57422u', 'pageDown'],
    ['\u001b[127u', 'backspace'],
    ['\u001b[32u', 'space'],
    ['\u001b[117;5u', 'ctrl+u'],
    ['\u001b[A', 'up'],
    ['\u001bOA', 'up'],
    ['\u001b[B', 'down'],
    ['\u001bOB', 'down'],
    ['\u001b[C', 'right'],
    ['\u001bOC', 'right'],
    ['\u001b[D', 'left'],
    ['\u001bOD', 'left'],
    ['\u001b[H', 'home'],
    ['\u001b[1~', 'home'],
    ['\u001bOH', 'home'],
    ['\u001b[7~', 'home'],
    ['\u001b[F', 'end'],
    ['\u001b[4~', 'end'],
    ['\u001bOF', 'end'],
    ['\u001b[8~', 'end'],
    ['\r', 'enter'],
    ['\n', 'enter'],
    ['\u001bOM', 'enter'],
    ['\u001b', 'escape'],
    ['\u0003', 'escape'],
    ['\u007f', 'backspace'],
    ['\b', 'backspace'],
    ['\u0015', 'ctrl+u'],
    ['\u001b[5~', 'pageUp'],
    ['\u001b[6~', 'pageDown'],
    ['M', 'M'],
  ])('normalizes %j to %s', (data, key) => {
    expect(normalizePanelKey(data)).toBe(key);
  });

  it.each([
    ['\u001b[<64;10;4M', -1],
    ['\u001b[<65;10;4M', 1],
    ['\u001b[96;10;4M', -1],
    ['\u001b[97;10;4M', 1],
    ['\u001b[M`*$', -1],
    ['\u001b[Ma*$', 1],
  ])('parses wheel input and preserves the history API (%j)', (data, delta) => {
    expect(panelMouseWheelDelta(data)).toBe(delta);
    expect(historyPanelMouseWheelDelta(data)).toBe(delta);
    expect(panelMouseClick(data)).toBeUndefined();
  });

  it.each([
    '\u001b[<0;10;4M',
    '\u001b[32;10;4M',
    '\u001b[M *$',
  ])('parses zero-based left clicks (%j)', (data) => {
    expect(panelMouseClick(data)).toEqual({ type: 'click', row: 3, col: 9 });
    expect(historyPanelMouseClick(data)).toEqual({
      type: 'click',
      row: 3,
      col: 9,
    });
    expect(panelMouseWheelDelta(data)).toBeUndefined();
  });

  it.each([
    '\u001b[<0;10;4m',
    '\u001b[<2;10;4M',
    '\u001b[M',
    'x',
    '\u001b[<x;1;1M',
  ])('ignores release, non-left and malformed events (%j)', (data) => {
    expect(panelMouseClick(data)).toBeUndefined();
    expect(panelMouseWheelDelta(data)).toBeUndefined();
  });
});
