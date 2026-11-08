import type { ToolState } from '../../opencode/tool-rpc';

const empty = { present: false, revision: 'r0', overrides: [] };

/** explorer: global deny webfetch + ask github*; designer: project allow bash. */
export function makeToolState(): ToolState {
  const actions = (rows: [string, string, string, string?][]) =>
    rows.map(([action, effect, origin, baseEffect = effect]) => ({
      action,
      effect,
      baseEffect,
      origin,
      locked: action === 'subagent',
    })) as ToolState['roles'][number]['actions'];
  return {
    specialists: ['explorer', 'librarian', 'oracle', 'designer', 'worker'],
    inventory: [
      { action: 'bash', tools: ['bash'], locked: false },
      { action: 'webfetch', tools: ['webfetch'], locked: false },
      {
        action: 'github',
        tools: ['github_search', 'github_issue'],
        locked: false,
      },
      { action: 'subagent', tools: ['subagent_run'], locked: true },
    ],
    roles: (
      ['explorer', 'librarian', 'oracle', 'designer', 'worker'] as const
    ).map((role) => {
      if (role === 'explorer')
        return {
          role,
          effectiveScope: 'global' as const,
          global: {
            present: true,
            revision: 'g1',
            overrides: [
              { action: 'webfetch', effect: 'deny' as const, matchCount: 1 },
              { action: 'github*', effect: 'ask' as const, matchCount: 1 },
              { action: 'mcp_gone_*', effect: 'deny' as const, matchCount: 0 },
            ],
          },
          project: empty,
          actions: actions([
            ['bash', 'allow', 'default'],
            ['webfetch', 'deny', 'global', 'allow'],
            ['github', 'ask', 'global', 'deny'],
            ['subagent', 'deny', 'default'],
          ]),
        };
      if (role === 'designer')
        return {
          role,
          effectiveScope: 'project' as const,
          global: empty,
          project: {
            present: true,
            revision: 'p1',
            overrides: [
              { action: 'bash', effect: 'allow' as const, matchCount: 1 },
            ],
          },
          actions: actions([
            ['bash', 'allow', 'project', 'deny'],
            ['webfetch', 'allow', 'default'],
            ['github', 'deny', 'default'],
            ['subagent', 'deny', 'default'],
          ]),
        };
      return {
        role,
        effectiveScope: 'default' as const,
        global: empty,
        project: empty,
        actions: actions([
          ['bash', 'allow', 'default'],
          ['webfetch', 'allow', 'default'],
          ['github', 'deny', 'default'],
          ['subagent', 'deny', 'default'],
        ]),
      };
    }),
    warnings: [],
  };
}
