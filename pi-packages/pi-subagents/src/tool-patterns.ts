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
  allToolNames?: readonly string[],
): string[] {
  const active = activeToolNames ? [...new Set(activeToolNames)] : undefined;
  const all = allToolNames ? [...new Set(allToolNames)] : undefined;
  const expanded: string[] = [];
  const add = (name: string) => {
    if (
      name.startsWith('subagent_') ||
      name === 'ask_user_question' ||
      name === 'todo' ||
      expanded.includes(name)
    )
      return;
    expanded.push(name);
  };

  if (patterns.length === 1 && patterns[0] === '*') {
    for (const toolName of all ?? []) add(toolName);
    return expanded;
  }
  if (patterns.length === 1 && patterns[0] === '@active') {
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
