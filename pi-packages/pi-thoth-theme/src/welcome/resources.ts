import type {
  ExtensionAPI,
  ExtensionContext,
  SourceInfo,
  ToolInfo,
} from '@earendil-works/pi-coding-agent';
import {
  VERSION as PI_VERSION,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import { formatAge } from './age.ts';

export interface WelcomeProvider {
  readonly name: string;
  readonly detail: string;
}

export interface WelcomeSession {
  readonly name: string;
  readonly timeAgo: string;
}

export interface WelcomeResourceCounts {
  readonly tools?: number | undefined;
  readonly skills?: number | undefined;
  readonly extensions?: number | undefined;
}

export interface WelcomeData {
  readonly version: string;
  readonly model?: string | undefined;
  readonly provider?: string | undefined;
  readonly resources: WelcomeResourceCounts;
  readonly providers: readonly WelcomeProvider[];
  readonly sessions: readonly WelcomeSession[];
}

export interface ResourceLoaderLike {
  getSkills?(): { skills: unknown[] };
  getExtensions?(): { extensions: unknown[] };
}

export interface StartupResourceOptions {
  sessionLister?: (cwd: string) => Promise<WelcomeSession[]>;
  skillCountLister?: (cwd: string) => number;
  extensionCountLister?: (cwd: string) => number;
  resourceLoader?: ResourceLoaderLike;
}

function toolSourceLabel(sourceInfo: SourceInfo | undefined): string {
  if (!sourceInfo || typeof sourceInfo !== 'object') return 'core';
  const source = typeof sourceInfo.source === 'string' ? sourceInfo.source : '';
  if (source === 'builtin' || source === 'core') return 'core';
  if (source === 'sdk') return 'sdk';
  if (source.startsWith('npm:')) return source.slice('npm:'.length) || source;
  if (source.startsWith('git:')) return source.replace(/\.git(?:#.*)?$/i, '');
  const baseDir =
    typeof sourceInfo.baseDir === 'string' ? sourceInfo.baseDir : '';
  if (baseDir) {
    const parts = baseDir.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || 'extension';
  }
  const path = typeof sourceInfo.path === 'string' ? sourceInfo.path : '';
  if (path) {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    const last = parts[parts.length - 1] || 'extension';
    return last.replace(/\.(?:ts|js|mjs|cjs)$/i, '');
  }
  return source || 'extension';
}

function groupToolDetails(tools: readonly ToolInfo[]): WelcomeProvider[] {
  const groups = new Map<string, string[]>();
  for (const tool of tools) {
    if (!tool || typeof tool.name !== 'string') continue;
    const name = tool.name.trim();
    if (!name) continue;
    const label = toolSourceLabel(tool.sourceInfo);
    let list = groups.get(label);
    if (!list) {
      list = [];
      groups.set(label, list);
    }
    list.push(name);
  }

  const result: WelcomeProvider[] = [];
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'core') return -1;
    if (b === 'core') return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const toolNames = (groups.get(key) || []).sort();
    const sample = toolNames.slice(0, 3).join('  ');
    const remaining = toolNames.length > 3 ? `  +${toolNames.length - 3}` : '';
    result.push({
      name: key,
      detail: `${sample}${remaining}`,
    });
  }

  return result.slice(0, 4);
}

export async function fetchRecentSessions(
  cwd: string,
  limit = 4,
): Promise<WelcomeSession[]> {
  try {
    const sessions = await SessionManager.list(cwd);
    const sorted = [...sessions].sort(
      (a, b) => (b.modified?.getTime?.() ?? 0) - (a.modified?.getTime?.() ?? 0),
    );
    const out: WelcomeSession[] = [];
    for (const session of sorted) {
      if (out.length >= limit) break;
      const rawTitle =
        session.name?.trim() ||
        session.firstMessage?.trim() ||
        'Untitled session';
      const cleanTitle = Array.from(rawTitle)
        .map((c) => {
          const code = c.charCodeAt(0);
          return code < 32 || code === 127 ? ' ' : c;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      const title =
        cleanTitle.length > 45 ? `${cleanTitle.slice(0, 44)}…` : cleanTitle;
      const timeAgo = formatAge(
        session.modified ? session.modified.getTime() : Date.now(),
      );
      out.push({ name: title, timeAgo });
    }
    return out;
  } catch {
    return [];
  }
}

export async function collectStartupResources(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  options?: StartupResourceOptions,
): Promise<WelcomeData> {
  let tools: ToolInfo[] = [];
  let toolsCount: number | undefined;

  if (typeof pi.getAllTools === 'function') {
    try {
      tools = pi.getAllTools() ?? [];
      toolsCount = tools.length;
    } catch {
      // ignore
    }
  } else if (typeof pi.getActiveTools === 'function') {
    try {
      const active = pi.getActiveTools() ?? [];
      toolsCount = active.length;
    } catch {
      // ignore
    }
  }

  const providers = groupToolDetails(tools);

  const loader: ResourceLoaderLike | undefined =
    options?.resourceLoader ??
    (ctx as unknown as { resourceLoader?: ResourceLoaderLike })
      ?.resourceLoader ??
    (pi as unknown as { resourceLoader?: ResourceLoaderLike })
      ?.resourceLoader ??
    (ctx as unknown as { session?: { resourceLoader?: ResourceLoaderLike } })
      ?.session?.resourceLoader;

  // 1. Loaded skills: live public source from options, resourceLoader, or pi.getCommands()
  let skillsCount: number | undefined;
  if (options?.skillCountLister) {
    skillsCount = options.skillCountLister(ctx.cwd);
  } else if (loader?.getSkills) {
    try {
      const skillsRes = loader.getSkills();
      if (skillsRes && Array.isArray(skillsRes.skills)) {
        skillsCount = skillsRes.skills.length;
      }
    } catch {
      // ignore
    }
  } else if (typeof pi.getCommands === 'function') {
    try {
      const commands = pi.getCommands();
      if (Array.isArray(commands)) {
        const skillCommands = commands.filter(
          (c) =>
            c?.source === 'skill' ||
            (typeof c?.name === 'string' && c.name.startsWith('skill:')),
        );
        skillsCount = skillCommands.length;
      }
    } catch {
      // ignore
    }
  }

  // 2. Loaded extensions: live public source from options or resourceLoader
  let extensionsCount: number | undefined;
  if (options?.extensionCountLister) {
    extensionsCount = options.extensionCountLister(ctx.cwd);
  } else if (loader?.getExtensions) {
    try {
      const extRes = loader.getExtensions();
      if (extRes && Array.isArray(extRes.extensions)) {
        extensionsCount = extRes.extensions.length;
      }
    } catch {
      // ignore
    }
  }

  let sessions: WelcomeSession[] = [];
  if (options?.sessionLister) {
    sessions = await options.sessionLister(ctx.cwd);
  } else {
    sessions = await fetchRecentSessions(ctx.cwd, 4);
  }

  const modelName = ctx.model?.name || ctx.model?.id;
  const provider = ctx.model?.provider;

  return {
    version: PI_VERSION,
    model: modelName,
    provider,
    resources: {
      tools: toolsCount,
      skills: skillsCount,
      extensions: extensionsCount,
    },
    providers,
    sessions,
  };
}
