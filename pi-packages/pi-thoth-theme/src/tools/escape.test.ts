import { describe, expect, it } from 'vitest';
import { escapeControlCharacters } from './box.ts';

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
