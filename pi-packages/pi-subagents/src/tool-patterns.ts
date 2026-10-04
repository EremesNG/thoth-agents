// No standalone-only exclusions; native subagent_* prefixes apply to every selector.
export const STANDALONE_STAR_TOOL_EXCLUSIONS: ReadonlySet<string> = new Set();

export function hasToolGlob(pattern: string): boolean {
  return pattern.includes('*');
}

function wildcardToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`);
}

export function matchesToolPattern(toolName: string, pattern: string): boolean {
  return hasToolGlob(pattern)
    ? wildcardToRegExp(pattern).test(toolName)
    : toolName === pattern;
}

export function expandToolPatterns(
  patterns: readonly string[],
  activeToolNames?: readonly string[],
): string[] {
  if (patterns.includes('@active'))
    throw new Error(
      "The '@active' tool selector was removed; use standalone '*' instead.",
    );
  const active = activeToolNames ? [...new Set(activeToolNames)] : undefined;
  const expanded: string[] = [];
  const add = (name: string) => {
    if (name.startsWith('subagent_') || expanded.includes(name)) return;
    expanded.push(name);
  };

  if (patterns.length === 1 && patterns[0] === '*') {
    for (const toolName of active ?? []) add(toolName);
    return expanded;
  }

  for (const pattern of patterns) {
    if (hasToolGlob(pattern)) {
      if (!active) continue;
      for (const toolName of active) {
        if (matchesToolPattern(toolName, pattern)) add(toolName);
      }
      continue;
    }
    add(pattern);
  }
  return expanded;
}
