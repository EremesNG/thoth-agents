import { resolve, sep } from 'node:path';
import hostedGitInfo from 'hosted-git-info';

/*! @license
 * Portions ported from @earendil-works/pi-coding-agent 1.0.2
 * (dist/utils/git.js:parseGitUrl and its helpers).
 * Copyright (c) 2025 Mario Zechner. MIT License; see the third-party notice
 * in this package's LICENSE file.
 */

// Keep hosted-git-info at the SDK's exact version; pi-git-source.test.ts
// differentially checks native paths.
interface GitSource {
  type: 'git';
  repo: string;
  host: string;
  path: string;
  ref?: string;
  pinned: boolean;
}

function splitRef(url: string): { repo: string; ref?: string } {
  const scpLikeMatch = url.match(/^git@([^:]+):(.+)$/);
  if (scpLikeMatch) {
    const pathWithMaybeRef = scpLikeMatch[2] ?? '';
    const refSeparator = pathWithMaybeRef.indexOf('@');
    if (refSeparator < 0) return { repo: url };
    const repoPath = pathWithMaybeRef.slice(0, refSeparator);
    const ref = pathWithMaybeRef.slice(refSeparator + 1);
    if (!repoPath || !ref) return { repo: url };
    return { repo: `git@${scpLikeMatch[1] ?? ''}:${repoPath}`, ref };
  }
  if (url.includes('://')) {
    try {
      const parsed = new URL(url);
      const pathWithMaybeRef = parsed.pathname.replace(/^\/+/, '');
      const refSeparator = pathWithMaybeRef.indexOf('@');
      if (refSeparator < 0) return { repo: url };
      const repoPath = pathWithMaybeRef.slice(0, refSeparator);
      const ref = pathWithMaybeRef.slice(refSeparator + 1);
      if (!repoPath || !ref) return { repo: url };
      parsed.pathname = `/${repoPath}`;
      return { repo: parsed.toString().replace(/\/$/, ''), ref };
    } catch {
      return { repo: url };
    }
  }
  const slashIndex = url.indexOf('/');
  if (slashIndex < 0) return { repo: url };
  const host = url.slice(0, slashIndex);
  const pathWithMaybeRef = url.slice(slashIndex + 1);
  const refSeparator = pathWithMaybeRef.indexOf('@');
  if (refSeparator < 0) return { repo: url };
  const repoPath = pathWithMaybeRef.slice(0, refSeparator);
  const ref = pathWithMaybeRef.slice(refSeparator + 1);
  if (!repoPath || !ref) return { repo: url };
  return { repo: `${host}/${repoPath}`, ref };
}

function hasUnsafeGitInstallPart(value: string, allowSlash: boolean): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return true;
  }
  for (const candidate of [value, decoded]) {
    if (
      candidate.includes('\0') ||
      candidate.includes('\\') ||
      candidate.startsWith('/') ||
      (!allowSlash && candidate.includes('/')) ||
      candidate.split('/').includes('..')
    )
      return true;
  }
  return false;
}

function buildGitSource(
  args: Omit<GitSource, 'type' | 'pinned'>,
): GitSource | null {
  if (args.path.startsWith('/')) return null;
  const normalizedPath = args.path.replace(/\.git$/, '').replace(/^\/+/, '');
  if (
    !args.host ||
    !normalizedPath ||
    normalizedPath.split('/').length < 2 ||
    hasUnsafeGitInstallPart(args.host, false) ||
    hasUnsafeGitInstallPart(normalizedPath, true)
  )
    return null;
  return {
    type: 'git',
    repo: args.repo,
    host: args.host,
    path: normalizedPath,
    ref: args.ref,
    pinned: Boolean(args.ref),
  };
}

function parseGenericGitUrl(url: string): GitSource | null {
  const { repo: repoWithoutRef, ref } = splitRef(url);
  let repo = repoWithoutRef;
  let host = '';
  let path = '';
  const scpLikeMatch = repoWithoutRef.match(/^git@([^:]+):(.+)$/);
  if (scpLikeMatch) {
    host = scpLikeMatch[1] ?? '';
    path = scpLikeMatch[2] ?? '';
  } else if (
    repoWithoutRef.startsWith('https://') ||
    repoWithoutRef.startsWith('http://') ||
    repoWithoutRef.startsWith('ssh://') ||
    repoWithoutRef.startsWith('git://')
  ) {
    try {
      const parsed = new URL(repoWithoutRef);
      host = parsed.hostname;
      path = parsed.pathname.replace(/^\/+/, '');
    } catch {
      return null;
    }
  } else {
    const slashIndex = repoWithoutRef.indexOf('/');
    if (slashIndex < 0) return null;
    host = repoWithoutRef.slice(0, slashIndex);
    path = repoWithoutRef.slice(slashIndex + 1);
    if (!host.includes('.') && host !== 'localhost') return null;
    repo = `https://${repoWithoutRef}`;
  }
  return buildGitSource({ repo, host, path, ref });
}

function parseGitUrl(source: string): GitSource | null {
  const trimmed = source.trim();
  const hasGitPrefix = trimmed.startsWith('git:');
  const url = hasGitPrefix ? trimmed.slice(4).trim() : trimmed;
  if (!hasGitPrefix && !/^(https?|ssh|git):\/\//i.test(url)) return null;
  const split = splitRef(url);
  const hostedCandidates = [
    split.ref ? `${split.repo}#${split.ref}` : undefined,
    url,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of hostedCandidates) {
    const info = hostedGitInfo.fromUrl(candidate);
    if (info) {
      if (split.ref && info.project?.includes('@')) continue;
      const useHttpsPrefix =
        !split.repo.startsWith('http://') &&
        !split.repo.startsWith('https://') &&
        !split.repo.startsWith('ssh://') &&
        !split.repo.startsWith('git://') &&
        !split.repo.startsWith('git@');
      return buildGitSource({
        repo: useHttpsPrefix ? `https://${split.repo}` : split.repo,
        host: info.domain || '',
        path: `${info.user}/${info.project}`,
        ref: info.committish || split.ref || undefined,
      });
    }
  }
  const httpsCandidates = [
    split.ref ? `https://${split.repo}#${split.ref}` : undefined,
    `https://${url}`,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of httpsCandidates) {
    const info = hostedGitInfo.fromUrl(candidate);
    if (info) {
      if (split.ref && info.project?.includes('@')) continue;
      return buildGitSource({
        repo: `https://${split.repo}`,
        host: info.domain || '',
        path: `${info.user}/${info.project}`,
        ref: info.committish || split.ref || undefined,
      });
    }
  }
  return parseGenericGitUrl(url);
}

export function projectGitPackagePath(
  source: string,
  projectRoot: string,
): string | undefined {
  // SDK dist/core/package-manager.js:parseSource gives isLocalPath precedence;
  // dist/utils/paths.js:isLocalPath uses these case-sensitive exclusions.
  const trimmed = source.trim();
  if (
    !['npm:', 'git:', 'github:', 'http:', 'https:', 'ssh:', 'builtin:'].some(
      (prefix) => trimmed.startsWith(prefix),
    )
  )
    return undefined;
  const parsed = parseGitUrl(source);
  if (!parsed) return undefined;
  // SDK DefaultPackageManager.getGitInstallPath/resolveManagedPath. Data only:
  // do not call its project trust gate, clone, install, or execute project code.
  const installRoot = resolve(projectRoot, 'git');
  const installedPath = resolve(installRoot, parsed.host, parsed.path);
  if (
    installedPath !== installRoot &&
    !installedPath.startsWith(`${installRoot}${sep}`)
  )
    return undefined;
  return installedPath;
}
