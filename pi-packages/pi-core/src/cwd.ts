import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Abbreviate paths inside home; preserve outside paths byte-for-byte. */
export function formatCwd(cwd: string, home?: string): string {
  if (!home) return cwd;
  const relativeToHome = relative(resolve(home), resolve(cwd));
  if (
    relativeToHome === '..' ||
    relativeToHome.startsWith(`..${sep}`) ||
    isAbsolute(relativeToHome)
  ) {
    return cwd;
  }
  return relativeToHome === '' ? '~' : `~${sep}${relativeToHome}`;
}
