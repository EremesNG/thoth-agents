import { stripVTControlCharacters } from 'node:util';

/** OSC 52 is best-effort: terminals may silently reject clipboard access. */
export function copyToClipboardOsc52(
  write: ((data: string) => void) | undefined,
  text: string,
  options: { maxBytes?: number } = {},
): 'ok' | 'unsupported' | 'too-large' {
  if (!write) return 'unsupported';
  const encoded = Buffer.from(stripVTControlCharacters(text), 'utf8').toString(
    'base64',
  );
  if (encoded.length > (options.maxBytes ?? 100_000)) return 'too-large';
  write(`\x1b]52;c;${encoded}\x07`);
  return 'ok';
}
