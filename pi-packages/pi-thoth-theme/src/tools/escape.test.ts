import { describe, expect, it } from 'vitest';
import { escapeControlCharacters, escapeOutputRow, stripSgr } from './box.ts';

describe('escapeControlCharacters', () => {
  it('escapes DEL as a control picture', () => {
    expect(escapeControlCharacters('a\x7fb')).toBe('a\u2421b');
  });

  it('escapes every C1 control as a visible textual escape', () => {
    for (let code = 0x80; code <= 0x9f; code++) {
      const hex = code.toString(16);
      expect(escapeControlCharacters(`a${String.fromCharCode(code)}b`)).toBe(
        `a\\x${hex}b`,
      );
    }
  });

  it('neutralizes complete C1 CSI and OSC sequences', () => {
    const escaped = escapeControlCharacters('\x9b31mred\x9d0;title\x9c');
    expect(escaped).toBe('\\x9b31mred\\x9d0;title\\x9c');
    expect(/[\x7f-\x9f]/.test(escaped)).toBe(false);
  });

  it('keeps tabs, C0 pictures and printable Unicode intact', () => {
    expect(escapeControlCharacters('\ta\rb\x1bc \u00e9 \u{13080}')).toBe(
      '\ta\u240db\u241bc \u00e9 \u{13080}',
    );
  });
});

describe('stripSgr and escapeOutputRow', () => {
  it('strips standard 7-bit ANSI SGR color and formatting sequences', () => {
    expect(stripSgr('\x1b[32;1mHello\x1b[0m \x1b[33mWorld\x1b[m')).toBe(
      'Hello World',
    );
    expect(
      stripSgr('\x1b[38;2;255;128;64m24bit\x1b[48;5;200m8bit\x1b[0m'),
    ).toBe('24bit8bit');
  });

  it('strips 8-bit C1 CSI SGR sequences', () => {
    expect(stripSgr('\x9b31mRed\x9b0m')).toBe('Red');
  });

  it('preserves non-SGR escape sequences in stripSgr', () => {
    expect(stripSgr('\x1b[2JClear\x1b[?25l')).toBe('\x1b[2JClear\x1b[?25l');
  });

  it('escapeOutputRow strips SGR but escapes other control characters as control pictures', () => {
    // SGR is stripped cleanly, but bell \x07 and null \x00 become Unicode control pictures
    expect(escapeOutputRow('\x1b[32;1mSuccess\x1b[0m\x07 \x00test')).toBe(
      'Success\u2407 \u2400test',
    );
  });

  it('escapeOutputRow escapes non-SGR escape sequences instead of executing them', () => {
    // \x1b[2J has non-m final byte, so it is not SGR and gets escaped to ␛[2J
    expect(escapeOutputRow('\x1b[2JClear screen')).toBe(
      '\u241b[2JClear screen',
    );
  });
});
