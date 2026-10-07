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
  registeredToolNames?: readonly string[],
): string[] {
  if (patterns.includes('@active'))
    throw new Error(
      "The '@active' tool selector was removed; use exact tool names. '*' is an ordinary glob over all registered tools (active and inactive).",
    );
  const registered = [...new Set(registeredToolNames ?? [])];
  const expanded: string[] = [];
  const add = (name: string) => {
    if (name.startsWith('subagent_') || expanded.includes(name)) return;
    expanded.push(name);
  };

  for (const pattern of patterns) {
    if (hasToolGlob(pattern)) {
      for (const toolName of registered) {
        if (matchesToolPattern(toolName, pattern)) add(toolName);
      }
      continue;
    }
    add(pattern);
  }
  return expanded;
}
