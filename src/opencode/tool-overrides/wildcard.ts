/** Mirrors OpenCode 2.2.5 wildcard.ts at 9bbb8ce18c80f099e0e448775f59d965ead40a21. */
export function matchAction(
  input: string,
  pattern: string,
  platform: string = process.platform,
): boolean {
  const normalized = input.replaceAll('\\', '/');
  let escaped = pattern
    .replaceAll('\\', '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  if (escaped.endsWith(' .*')) escaped = `${escaped.slice(0, -3)}( .*)?`;
  return new RegExp(`^${escaped}$`, platform === 'win32' ? 'si' : 's').test(
    normalized,
  );
}

export function countActionMatches(
  pattern: string,
  actions: readonly string[],
  platform: string = process.platform,
): number {
  return actions.filter((action) => matchAction(action, pattern, platform))
    .length;
}
