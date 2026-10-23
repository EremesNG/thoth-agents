import { createHash } from 'node:crypto';

/** Hash the exact UTF-8 prefix preceding the first case-sensitive heading. */
export function recordPrefixSha256(text) {
  let offset = 0;
  for (const raw of text.split(/(?<=\n)/)) {
    let line = raw.replace(/\r?\n$/, '');
    if (offset === 0) line = line.replace(/^\uFEFF/, '');
    if (line === '## Authorization') break;
    offset += raw.length;
  }
  return createHash('sha256')
    .update(text.slice(0, offset), 'utf8')
    .digest('hex');
}
