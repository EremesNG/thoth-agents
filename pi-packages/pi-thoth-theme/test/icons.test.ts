import { describe, expect, it } from 'vitest';
import { frames, icon, statusIcon } from '../src/shared/icons.ts';

const cp = (value: string) =>
  [...value].map((char) => char.codePointAt(0)?.toString(16)).join(' ');

describe('icon table', () => {
  it.each([
    ['branch', 'e0a0', 'git'],
    ['folder', 'f07c', 'dir'],
    ['model', 'f06a9', '*'],
    ['effort', 'f09d1', 'o'],
    ['context', 'f2db', 'ctx'],
    ['cost', 'f155', '$'],
    ['tokensIn', 'f062', '^'],
    ['tokensOut', 'f063', 'v'],
    ['cache', 'f01bc', 'cache'],
    ['throughput', 'f04c5', 'tok/s'],
    ['agent', 'f08c7', '@'],
    ['file', 'f0214', '[file]'],
    ['tool', 'f0ad', '*'],
    ['bash', 'f489', '$'],
    ['read', 'f06e', '[read]'],
    ['write', 'f0c7', '[write]'],
    ['edit', 'f044', '[edit]'],
    ['search', 'f002', '?'],
    ['powershell', 'e70f', 'PS'],
  ] as const)('%s uses its Nerd codepoint and ASCII label', (name, nerd, ascii) => {
    expect(cp(icon(name, 'nerd'))).toBe(nerd);
    expect(icon(name, 'ascii')).toBe(ascii);
  });

  it.each([
    ['separator', '·', '|'],
    ['ellipsis', '…', '...'],
    ['arrowUp', '↑', '^'],
    ['arrowDown', '↓', 'v'],
    ['arrowLeft', '←', '<'],
    ['arrowRight', '→', '>'],
    ['selection', '›', '>'],
    ['scrollUp', '↑', '^'],
    ['scrollDown', '↓', 'v'],
    ['ready', '▲', '^'],
  ] as const)('%s keeps its Unicode glyph in Nerd mode', (name, nerd, ascii) => {
    expect(icon(name, 'nerd')).toBe(nerd);
    expect(icon(name, 'ascii')).toBe(ascii);
  });

  it('provides animation frames per mode', () => {
    expect(frames('spinnerFrames', 'nerd')).toEqual([
      '⠋',
      '⠙',
      '⠹',
      '⠸',
      '⠼',
      '⠴',
      '⠦',
      '⠧',
      '⠇',
      '⠏',
    ]);
    expect(frames('spinnerFrames', 'ascii')).toEqual(['|', '/', '-', '\\']);
    expect(frames('workingFrames', 'nerd')).toEqual(['△', '◭', '▲', '◮']);
    expect(frames('workingFrames', 'ascii')).toEqual(['.', 'o', 'O', '0']);
  });

  it.each([
    ['pending', 'f10c', '-'],
    ['queued', 'f051f', '~'],
    ['in_progress', '25d0', '*'],
    ['running', '25d0', '*'],
    ['completed', 'f00c', '+'],
    ['failed', 'f00d', 'x'],
    ['cancelled', 'f05e', '/'],
    ['interrupted', 'f05e', '/'],
    ['stopping', 'f05e', '/'],
    ['deleted', 'f05e', '/'],
    ['blocked', 'f05e', '/'],
    ['warning', 'f071', '!'],
    ['unknown', 'f128', '?'],
  ] as const)('status %s resolves per mode', (status, nerd, ascii) => {
    expect(cp(statusIcon(status, 'nerd'))).toBe(nerd);
    expect(statusIcon(status, 'ascii')).toBe(ascii);
  });
});
