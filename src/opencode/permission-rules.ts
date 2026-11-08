import type { AgentDefinition } from '../agents';

type Effect = 'allow' | 'deny' | 'ask';
export interface PermissionRule {
  action: string;
  resource: string;
  effect: Effect;
}

// Pinned 2.2.5 core: tool/plugin/{shell:133,edit:329,patch:220,subagent:146},
// {glob:69,grep:88,question:65,todo:64,webfetch:147,skill:52}.ts;
// file-access.ts:117,155 (external_directory/read); tool/mcp.ts:23,59 (exa_*).
// list/codesearch/lsp have no native v2 action; retain their read intent.
const ACTIONS: Record<string, string> = {
  read: 'read',
  glob: 'glob',
  grep: 'grep',
  list: 'read',
  codesearch: 'read',
  lsp: 'read',
  edit: 'edit',
  write: 'edit',
  patch: 'edit',
  bash: 'shell',
  task: 'subagent',
  webfetch: 'webfetch',
  exa: 'exa_*',
  external_directory: 'external_directory',
  skill: 'skill',
  question: 'question',
  todowrite: 'todowrite',
};
const RESTRICTION: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

function specificity(rule: PermissionRule): number {
  return Number(rule.action !== '*') + 2 * Number(rule.resource !== '*');
}

export function translatePermissionRules(
  permission: AgentDefinition['config']['permission'],
): PermissionRule[] {
  if (typeof permission === 'string') {
    return [{ action: '*', resource: '*', effect: permission }];
  }
  const rules: PermissionRule[] = [];
  for (const [key, value] of Object.entries(permission ?? {})) {
    if (!value) continue;
    const action = ACTIONS[key] ?? key;
    const entries =
      typeof value === 'string'
        ? [['*', value] as const]
        : Object.entries(value);
    for (const [resource, effect] of entries) {
      const existing = rules.find(
        (rule) => rule.action === action && rule.resource === resource,
      );
      if (!existing) rules.push({ action, resource, effect });
      else if (RESTRICTION[effect] > RESTRICTION[existing.effect])
        existing.effect = effect;
    }
  }
  // Replace host defaults: unmatched actions ask, and narrow exceptions win.
  return [
    { action: '*', resource: '*', effect: 'ask' },
    ...rules.sort((a, b) => specificity(a) - specificity(b)),
  ];
}
