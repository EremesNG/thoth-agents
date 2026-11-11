import { expect, it, vi } from 'vitest';
import { copyToClipboardOsc52 } from '../src/panel.js';

it('writes exact OSC 52 UTF-8 bytes with ANSI removed', () => {
  const write = vi.fn();
  expect(copyToClipboardOsc52(write, '\x1b[31mHello\x1b[0m\n世界')).toBe('ok');
  expect(write).toHaveBeenCalledExactlyOnceWith(
    '\x1b]52;c;SGVsbG8K5LiW55WM\x07',
  );
});
it('reports unsupported and limits encoded payload before writing', () => {
  const write = vi.fn();
  expect(copyToClipboardOsc52(undefined, 'text')).toBe('unsupported');
  expect(copyToClipboardOsc52(write, 'abc', { maxBytes: 3 })).toBe('too-large');
  expect(write).not.toHaveBeenCalled();
  expect(copyToClipboardOsc52(write, 'abc', { maxBytes: 4 })).toBe('ok');
});
