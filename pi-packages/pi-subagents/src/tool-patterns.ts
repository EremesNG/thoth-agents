import type { SubagentToolOverlay } from './types.js';

/** Compose project patterns before orchestrator injection and permission filtering. */
export function composeToolSelection(
  patterns: readonly string[],
  registeredToolNames?: readonly string[],
  overlay?: SubagentToolOverlay,
): string[] {
  const expanded = expandToolPatterns(
    [...patterns, ...(overlay?.add ?? [])],
    registeredToolNames,
  );
  const removals = overlay?.remove ?? [];
  return expanded.filter(
    (name) => !removals.some((pattern) => matchesToolPattern(name, pattern)),
  );
}

/** Resolve child permissions, including controls injected after overlay removal. */
export function resolveEffectiveToolSelection(
  patterns: readonly string[],
  registeredToolNames: readonly string[] | undefined,
  disallowedTools: readonly string[],
  enableAskOrchestrator: boolean,
  enableNotifyOrchestrator: boolean,
  overlay?: SubagentToolOverlay,
): string[] {
  const expanded = composeToolSelection(patterns, registeredToolNames, overlay);
  if (enableAskOrchestrator) expanded.push('ask_orchestrator');
  if (enableNotifyOrchestrator) expanded.push('notify_orchestrator');
  const denied = new Set(disallowedTools);
  return [...new Set(expanded)].filter(
    (name) =>
      (enableAskOrchestrator || name !== 'ask_orchestrator') &&
      (enableNotifyOrchestrator || name !== 'notify_orchestrator') &&
      !denied.has(name) &&
      !name.startsWith('subagent_'),
  );
}

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
